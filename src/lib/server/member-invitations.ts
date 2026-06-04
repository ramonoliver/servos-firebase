import { sendSmsInvite, sendWelcomeEmail } from "@/lib/email/send";
import {
  buildSmsInvitePreview,
  createInviteTrackingToken,
  getInviteOpenTrackingUrl,
} from "@/lib/invitations";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

type DeliveryInput = {
  to: string;
  phone?: string | null;
  memberName: string;
  churchName: string;
  tempPassword: string;
  userId?: string;
  churchId?: string;
  invitedByUserId?: string | null;
};

export async function deliverMemberInvitation(input: DeliveryInput) {
  const { to, phone, memberName, churchName, tempPassword, userId, churchId, invitedByUserId } = input;
  const now = new Date().toISOString();
  const trackingToken = createInviteTrackingToken();
  let trackingEnabled = Boolean(userId && churchId);
  let invitationId: string | null = null;

  if (trackingEnabled) {
    try {
      const supabase = getFirebaseAdminClient();
      invitationId = genId();

      const { error } = await supabase.from("member_invitations").insert({
        id: invitationId,
        church_id: churchId,
        user_id: userId,
        invited_by_user_id: invitedByUserId || null,
        email: to,
        phone: phone || null,
        tracking_token: trackingToken,
        email_status: "pending",
        sms_status: phone ? "pending" : "skipped",
        sent_at: now,
        created_at: now,
      });

      if (error) {
        trackingEnabled = false;
        invitationId = null;
        console.error("Erro ao registrar convite:", error);
      }
    } catch (error) {
      trackingEnabled = false;
      invitationId = null;
      console.error("Erro ao preparar tracking do convite:", error);
    }
  }

  let emailStatus: "sent" | "failed" = "sent";
  let emailError: string | null = null;

  try {
    await sendWelcomeEmail({
      to,
      memberName,
      churchName,
      tempPassword,
      trackingPixelUrl: trackingEnabled
        ? getInviteOpenTrackingUrl(trackingToken)
        : undefined,
    });
  } catch (error) {
    emailStatus = "failed";
    emailError = error instanceof Error ? error.message : "Falha ao enviar email";
  }

  const sms = await sendSmsInvite({
    to: phone || "",
    memberName,
    churchName,
    tempPassword,
    email: to,
  });

  if (trackingEnabled && invitationId) {
    const supabase = getFirebaseAdminClient();
    await supabase
      .from("member_invitations")
      .update({
        email_status: emailStatus,
        email_error: emailError,
        sms_status: sms.status,
        sms_error: sms.error,
      })
      .eq("id", invitationId);
  }

  return {
    success: emailStatus === "sent" || sms.status === "sent",
    invitationId,
    trackingEnabled,
    email: {
      status: emailStatus,
      error: emailError,
    },
    sms: {
      ...sms,
      preview:
        sms.status === "skipped"
          ? buildSmsInvitePreview({
              memberName,
              churchName,
              tempPassword,
              email: to,
            })
          : null,
    },
  };
}
