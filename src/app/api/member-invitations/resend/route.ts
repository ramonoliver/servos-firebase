import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import type { User } from "@/types";
import { createPasswordResetToken, hashPasswordResetToken } from "@/lib/auth/password-reset";
import { getAppBaseUrl } from "@/lib/invitations";
import { sendInviteEmail } from "@/lib/email/send";
import { genId } from "@/lib/utils/helpers";

type ResendInviteBody = {
  userId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ResendInviteBody;
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required." },
        { status: 400 }
      );
    }

    const { actor, session, errorResponse } = await requireApiActor(req, {
      select: "id, role, cell_role, church_id, active",
    });
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const invitedByUserId = session!.user_id;
    const supabase = getFirebaseAdminClient();
    
    const { data: member, error: memberError } = await supabase
      .from("users")
      .select("id, name, email, phone, role, cell_id, active, church_id")
      .eq("id", userId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (memberError) throw memberError;

    if (!member) {
      return NextResponse.json({ error: "Membro nao encontrado." }, { status: 404 });
    }

    // Check permission using the matrix:
    const isSystemAdmin = actor.role === "admin";
    const isPastor = actor.cell_role === "pastor";
    let hasInvitePermission = isSystemAdmin || isPastor;

    if (!hasInvitePermission && actor.role === "leader") {
      if (member.role !== "admin") {
        // 1. Cell leader check
        if (member.cell_id) {
          const { data: targetCell } = await supabase
            .from("cells")
            .select("id, leader_ids, co_leader_ids, network_id")
            .eq("id", member.cell_id)
            .maybeSingle();

          if (targetCell) {
            const cellLeaders = [...(targetCell.leader_ids || []), ...(targetCell.co_leader_ids || [])];
            if (cellLeaders.includes(actor.id)) {
              hasInvitePermission = true;
            }

            // 2. Supervision check
            if (!hasInvitePermission && targetCell.network_id) {
              const { data: targetNetwork } = await supabase
                .from("cell_networks")
                .select("id, supervisor_ids")
                .eq("id", targetCell.network_id)
                .maybeSingle();

              if (targetNetwork && (targetNetwork.supervisor_ids || []).includes(actor.id)) {
                hasInvitePermission = true;
              }
            }
          }
        }

        // 3. Ministry leader check
        if (!hasInvitePermission) {
          const { data: allDepts } = await supabase
            .from("departments")
            .select("id, leader_ids, co_leader_ids")
            .eq("church_id", churchId);

          const ledDeptIds = (allDepts || [])
            .filter((d) => [...(d.leader_ids || []), ...(d.co_leader_ids || [])].includes(actor.id))
            .map((d) => d.id);

          const { data: targetDeptMembers } = await supabase
            .from("department_members")
            .select("department_id")
            .eq("user_id", userId);

          const targetDeptIds = (targetDeptMembers || []).map((dm) => dm.department_id);
          const hasDeptOverlap = targetDeptIds.some((id) => ledDeptIds.includes(id));

          if (hasDeptOverlap) {
            hasInvitePermission = true;
          }
        }
      }
    }

    if (!actor?.active || !hasInvitePermission) {
      return NextResponse.json({ error: "Sem permissao para reenviar convite para este membro." }, { status: 403 });
    }

    const { data: church, error: churchError } = await supabase
      .from("churches")
      .select("id, name")
      .eq("id", churchId)
      .maybeSingle();

    if (churchError) throw churchError;
    if (!church) {
      return NextResponse.json({ error: "Church not found." }, { status: 404 });
    }

    const typedMember = member as User;

    // Generate token for password definition (reset)
    const rawToken = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 dias

    // Clean up old tokens first
    await supabase.from("password_reset_tokens").delete().eq("user_id", typedMember.id);

    const { error: tokenInsertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        id: crypto.randomUUID(),
        user_id: typedMember.id,
        church_id: churchId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (tokenInsertError) throw tokenInsertError;

    // Update member field
    await supabase
      .from("users")
      .update({
        must_change_password: true,
      })
      .eq("id", typedMember.id);

    const inviteUrl = `${getAppBaseUrl()}/concluir-cadastro?token=${rawToken}`;
    let emailStatus: "sent" | "failed" = "sent";
    let emailError: string | null = null;

    try {
      await sendInviteEmail({
        to: typedMember.email,
        memberName: typedMember.name,
        inviteUrl,
        churchName: church.name,
      });
    } catch (emailErr) {
      emailStatus = "failed";
      emailError = emailErr instanceof Error ? emailErr.message : "Falha ao enviar email";
      console.error("Erro ao reenviar email de convite:", emailErr);
    }

    // Create tracking entry in member_invitations
    const invitationId = genId();
    try {
      await supabase.from("member_invitations").insert({
        id: invitationId,
        church_id: churchId,
        user_id: typedMember.id,
        invited_by_user_id: invitedByUserId,
        email: typedMember.email,
        phone: typedMember.phone || null,
        tracking_token: rawToken,
        email_status: emailStatus,
        email_error: emailError,
        sms_status: "skipped",
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Erro ao registrar no historico de convites:", err);
    }

    return NextResponse.json({
      success: emailStatus === "sent",
      invitationId,
      email: {
        status: emailStatus,
        error: emailError,
      }
    });
  } catch (error) {
    console.error("API resend member invitation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resend invite" },
      { status: 500 }
    );
  }
}
