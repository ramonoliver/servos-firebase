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
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para enviar convite." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;
    if (!actor?.active) return NextResponse.json({ error: "Usuário inativo." }, { status: 403 });

    const isAuthorized = actor.role === "admin" || can(actor.role, "member.invite");
    if (!isAuthorized) {
      return NextResponse.json({ error: "Sem permissão para convidar pessoas." }, { status: 403 });
    }

    const churchId = session!.church_id;
    const invitedByUserId = session!.user_id;
    const { name, email, phone } = parsed.data;
    const supabase = getFirebaseAdminClient();
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: "E-mail já está sendo utilizado por outro cadastro." }, { status: 409 });
    }

    const { data: church } = await supabase
      .from("churches")
      .select("name")
      .eq("id", churchId)
      .maybeSingle();

    if (!church) {
      return NextResponse.json({ error: "Igreja não encontrada." }, { status: 404 });
    }

    const tempPassword = generateTempPassword();
    let id = "";
    let authUserCreated = false;

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
        return NextResponse.json({ error: "E-mail já cadastrado no sistema." }, { status: 409 });
      }
      throw authError;
    }

    const now = new Date().toISOString();

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
      password_hash: hashPassword(tempPassword),
      name: name.trim(),
      slug,
      phone: phone.trim(),
      role: "member",
      status: "active",
      avatar_color: `hsl(${Math.floor(Math.random() * 360)}, 40%, 55%)`,
      photo_url: null,
      birth_date: null,
      gender: "nao_informado",
      spouse_id: null,
      availability: [true, true, true, true, true, true, true],
      total_schedules: 0,
      confirm_rate: 100,
      must_change_password: true,
      last_served_at: null,
      notes: "Convidado por email",
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

    // Generate token for password reset (definition)
    const rawToken = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 dias

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
    }

    // Create tracking entry in member_invitations
    const invitationId = genId();
    try {
      await supabase.from("member_invitations").insert({
        id: invitationId,
        church_id: churchId,
        user_id: id,
        invited_by_user_id: invitedByUserId,
        email: normalizedEmail,
        phone: phone.trim(),
        tracking_token: rawToken,
        email_status: "pending",
        sms_status: "pending",
        sent_at: now,
        created_at: now,
      });
    } catch (err) {
      console.error("Erro ao registrar member_invitations:", err);
    }

    const inviteUrl = `${getAppBaseUrl()}/concluir-cadastro?token=${rawToken}`;
    let emailStatus: "sent" | "failed" = "sent";
    let emailError: string | null = null;

    try {
      await sendInviteEmail({
        to: normalizedEmail,
        memberName: name.trim(),
        inviteUrl,
        churchName: church.name,
      });
    } catch (emailErr) {
      emailStatus = "failed";
      emailError = emailErr instanceof Error ? emailErr.message : "Falha ao enviar email";
      console.error("Erro ao enviar email de convite:", emailErr);
    }

    // Update invitation status
    try {
      await supabase
        .from("member_invitations")
        .update({
          email_status: emailStatus,
          email_error: emailError,
          sms_status: "skipped",
        })
        .eq("id", invitationId);
    } catch (err) {
      console.error("Erro ao atualizar member_invitations:", err);
    }

    return NextResponse.json({ success: true, invitationId });
  } catch (error) {
    console.error("API people/invite error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar convite." },
      { status: 500 }
    );
  }
}
