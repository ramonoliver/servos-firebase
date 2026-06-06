import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient, adminAuth } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { sendInviteEmail } from "@/lib/email/send";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
} from "@/lib/auth/password-reset";
import { getAppBaseUrl } from "@/lib/invitations";
import { firstLastSlug, resolveUniqueSlug } from "@/lib/utils/slug";


const bodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().optional().default(""),
  phone: z.string().trim().default(""),
  birthDate: z.string().optional().default(""),
  gender: z.enum(["feminino", "masculino", "nao_informado"]).default("nao_informado"),
  kind: z.enum(["member", "visitor", "volunteer", "leader", "pastor"]).default("visitor"),
  cellId: z.string().nullable().optional(),
  address: z.string().trim().default(""),
  instagram: z.string().trim().default(""),
  notes: z.string().default(""),
});

function randomEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@people.local`;
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para criar pessoa." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;
    if (!actor?.active) return NextResponse.json({ error: "Usuário inativo." }, { status: 403 });

    const isAuthorized = actor.role === "admin" || can(actor.role, "member.edit");
    if (!isAuthorized) {
      return NextResponse.json({ error: "Sem permissão para criar pessoas." }, { status: 403 });
    }

    const churchId = session!.church_id;
    const { name, email, phone, birthDate, gender, kind, cellId, address, instagram, notes } = parsed.data;
    const supabase = getFirebaseAdminClient();

    const emailProvided = Boolean(email.trim());
    const normalizedEmail = emailProvided
      ? email.trim().toLowerCase()
      : randomEmail(kind === "visitor" ? "visitante" : "membro");

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: "E-mail ja esta sendo utilizado por outro cadastro." }, { status: 409 });
    }

    const { data: church } = await supabase
      .from("churches")
      .select("name")
      .eq("id", churchId)
      .maybeSingle();

    let id = genId();
    let tempPassword = "";
    let authUserCreated = false;

    if (emailProvided) {
      tempPassword = generateTempPassword();
      try {
        const userRecord = await adminAuth.createUser({
          email: normalizedEmail,
          password: tempPassword,
          displayName: name.trim(),
        });
        id = userRecord.uid;
        authUserCreated = true;
      } catch (authError: any) {
        if (authError.code === "auth/email-already-exists") {
          return NextResponse.json({ error: "E-mail ja cadastrado no sistema." }, { status: 409 });
        }
        throw authError;
      }
    }

    const now = new Date().toISOString();
    const role = (kind === "leader" || kind === "pastor") ? "leader" : "member";

    // Generate unique slug
    const baseSlug = firstLastSlug(name.trim());
    const slug = await resolveUniqueSlug(baseSlug, async (candidate) => {
      const { data } = await supabase.from("users").select("id").eq("slug", candidate).eq("church_id", churchId).maybeSingle();
      return Boolean(data);
    });


    const { error: userError } = await supabase.from("users").insert({
      id,
      church_id: churchId,
      email: normalizedEmail,
      password_hash: emailProvided ? hashPassword(tempPassword) : "",
      name: name.trim(),
      slug,
      phone: phone.trim(),
      role,
      status: "active",
      avatar_color: `hsl(${Math.floor(Math.random() * 360)}, 40%, 55%)`,
      photo_url: null,
      birth_date: birthDate || null,
      gender,
      cell_id: cellId || null,
      address: address || "",
      instagram: instagram || "",
      spouse_id: null,
      availability: [true, true, true, true, true, true, true],
      total_schedules: 0,
      confirm_rate: 100,
      must_change_password: emailProvided,
      last_served_at: null,
      notes,
      active: true,
      joined_at: now,
      created_at: now,
    });

    if (userError) {
      if (authUserCreated) {
        await adminAuth.deleteUser(id).catch(console.error);
      }
      throw userError;
    }

    // If cell_id is specified, link in cell_members
    if (cellId) {
      const { error: cellMemberError } = await supabase.from("cell_members").insert({
        id: genId(),
        cell_id: cellId,
        user_id: id,
        status: "active",
        joined_at: now,
      });
      if (cellMemberError) {
        console.error("Erro ao vincular membro à célula:", cellMemberError);
      }
    }

    // If email is provided, generate token and send password reset email
    if (emailProvided) {
      const rawToken = createPasswordResetToken();
      const tokenHash = hashPasswordResetToken(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 dias

      await supabase
        .from("password_reset_tokens")
        .delete()
        .eq("user_id", id);

      const { error: tokenInsertError } = await supabase
        .from("password_reset_tokens")
        .insert({
          id: crypto.randomUUID(),
          user_id: id,
          church_id: churchId,
          token_hash: tokenHash,
          expires_at: expiresAt,
        });

      if (tokenInsertError) {
        console.error("Erro ao salvar token de convite:", tokenInsertError);
      } else {
        const inviteUrl = `${getAppBaseUrl()}/concluir-cadastro?token=${rawToken}`;
        try {
          await sendInviteEmail({
            to: normalizedEmail,
            memberName: name.trim(),
            inviteUrl,
            churchName: church?.name,
          });
        } catch (emailErr) {
          console.error("Erro ao enviar email de convite:", emailErr);
        }
      }
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("API people/create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar pessoa." },
      { status: 500 }
    );
  }
}
