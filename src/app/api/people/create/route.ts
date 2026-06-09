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
  ministryId: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  address: z.string().trim().default(""),
  addressCep: z.string().trim().default(""),
  addressStreet: z.string().trim().default(""),
  addressNumber: z.string().trim().default(""),
  addressComplement: z.string().trim().default(""),
  addressNeighborhood: z.string().trim().default(""),
  addressCity: z.string().trim().default(""),
  addressState: z.string().trim().max(2).default(""),
  instagram: z.string().trim().default(""),
  notes: z.string().default(""),
  // Quando true, ignora o aviso de possível duplicado e cria assim mesmo.
  force: z.boolean().optional().default(false),
});

function randomEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@people.local`;
}

/** Normaliza nome para comparação (sem acentos, minúsculas, espaços únicos). */
function normalizeName(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildAddressText(input: {
  address?: string;
  addressCep?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
}) {
  const structured = [
    input.addressStreet,
    input.addressNumber,
    input.addressComplement,
    input.addressNeighborhood,
    input.addressCity,
    input.addressState,
    input.addressCep,
  ]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(", ");

  return structured || (input.address || "").trim();
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

    const isAuthorized = actor.role === "admin" || can(actor, "member.edit");
    if (!isAuthorized) {
      return NextResponse.json({ error: "Sem permissão para criar pessoas." }, { status: 403 });
    }

    const churchId = session!.church_id;
    const invitedByUserId = session!.user_id;
    const {
      name,
      email,
      phone,
      birthDate,
      gender,
      kind,
      cellId,
      ministryId,
      photoUrl,
      address,
      addressCep,
      addressStreet,
      addressNumber,
      addressComplement,
      addressNeighborhood,
      addressCity,
      addressState,
      instagram,
      notes,
    } = parsed.data;
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

    // Detecção de possíveis duplicados (nome igual normalizado ou mesmo
    // telefone). Soft-block: o cliente pode reenviar com force=true.
    if (!parsed.data.force) {
      const nameNorm = normalizeName(name);
      const phoneDigits = phone.replace(/\D/g, "");
      const { data: churchUsers } = await supabase
        .from("users")
        .select("id, name, phone, email")
        .eq("church_id", churchId);

      const duplicates = ((churchUsers || []) as Array<{ id: string; name: string; phone?: string; email?: string }>)
        .map((u) => {
          const sameName = nameNorm.length > 0 && normalizeName(u.name) === nameNorm;
          const samePhone = phoneDigits.length >= 8 && (u.phone || "").replace(/\D/g, "") === phoneDigits;
          if (!sameName && !samePhone) return null;
          return {
            id: u.id,
            name: u.name,
            phone: u.phone || "",
            reason: sameName && samePhone ? "mesmo nome e telefone" : sameName ? "mesmo nome" : "mesmo telefone",
          };
        })
        .filter(Boolean)
        .slice(0, 5);

      if (duplicates.length > 0) {
        return NextResponse.json(
          { needsConfirmation: true, duplicates, error: "Possível pessoa duplicada encontrada." },
          { status: 409 }
        );
      }
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
      photo_url: photoUrl || null,
      birth_date: birthDate || null,
      gender,
      cell_id: cellId || null,
      ministry_ids: ministryId ? [ministryId] : [],
      address: buildAddressText({
        address,
        addressCep,
        addressStreet,
        addressNumber,
        addressComplement,
        addressNeighborhood,
        addressCity,
        addressState,
      }),
      address_cep: addressCep,
      address_street: addressStreet,
      address_number: addressNumber,
      address_complement: addressComplement,
      address_neighborhood: addressNeighborhood,
      address_city: addressCity,
      address_state: addressState,
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

    if (ministryId) {
      const { data: department } = await supabase
        .from("departments")
        .select("id, function_names")
        .eq("id", ministryId)
        .eq("church_id", churchId)
        .maybeSingle();

      if (department) {
        const primaryFunction = (department.function_names || [])[0] || "";
        const { error: departmentMemberError } = await supabase.from("department_members").insert({
          id: genId(),
          department_id: ministryId,
          user_id: id,
          function_name: primaryFunction,
          function_names: primaryFunction ? [primaryFunction] : [],
          joined_at: now,
        });
        if (departmentMemberError) {
          console.error("Erro ao vincular pessoa ao ministério:", departmentMemberError);
        }
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
        const invitationId = genId();
        try {
          await supabase.from("member_invitations").insert({
            id: invitationId,
            church_id: churchId,
            user_id: id,
            invited_by_user_id: invitedByUserId,
            email: normalizedEmail,
            phone: phone.trim() || null,
            tracking_token: rawToken,
            email_status: "pending",
            sms_status: "skipped",
            sent_at: now,
            created_at: now,
          });
        } catch (inviteErr) {
          console.error("Erro ao registrar convite da pessoa:", inviteErr);
        }

        const inviteUrl = `${getAppBaseUrl()}/concluir-cadastro?token=${rawToken}`;
        let emailStatus: "sent" | "failed" = "sent";
        let emailError: string | null = null;
        try {
          await sendInviteEmail({
            to: normalizedEmail,
            memberName: name.trim(),
            inviteUrl,
            churchName: church?.name,
          });
        } catch (emailErr) {
          emailStatus = "failed";
          emailError = emailErr instanceof Error ? emailErr.message : "Falha ao enviar email";
          console.error("Erro ao enviar email de convite:", emailErr);
        }

        try {
          await supabase
            .from("member_invitations")
            .update({ email_status: emailStatus, email_error: emailError })
            .eq("id", invitationId);
        } catch (inviteUpdateErr) {
          console.error("Erro ao atualizar entrega do convite:", inviteUpdateErr);
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
