/**
 * send-notification.ts
 * Central orchestrator for all outbound notifications.
 * Server-side only — never import in client components.
 *
 * Flow:
 *  1. Fetch user (unless overrideTo is provided)
 *  2. Merge notification preferences
 *  3. Check type is allowed
 *  4. Filter channels by user preferences
 *  5. Build templates
 *  6. Dispatch channels concurrently
 *  7. Persist log
 *  8. Return structured result
 */

import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { sendSms } from "./sms-provider";
import { sendEmail } from "./email-provider";
import { buildSmsTemplate, buildEmailTemplate } from "./templates";
import { mergePreferences, isTypeAllowed, filterAllowedChannels } from "./preferences";
import { sanitizePayload } from "./validators";
import type {
  SendNotificationInput,
  SendNotificationResult,
  ChannelResult,
  NotificationLogRow,
} from "./notification-types";

// ─── Main function ────────────────────────────────────────────────────────────

export async function sendNotification(
  input: SendNotificationInput
): Promise<SendNotificationResult> {
  const result: SendNotificationResult = { success: false, errors: [] };

  try {
    const supabase = getFirebaseAdminClient();
    const safePayload = sanitizePayload(input.payload as unknown as Record<string, unknown>);

    // ── 1. Resolve recipient ──────────────────────────────────────────────────
    let recipientPhone: string | null = input.overrideTo?.phone ?? null;
    let recipientEmail: string | null = input.overrideTo?.email ?? null;
    let recipientName: string | undefined = input.overrideTo?.name;
    let prefs = mergePreferences(null);

    if (!input.overrideTo) {
      const { data: user, error } = await supabase
        .from("users")
        .select("id, name, phone, email, notification_preferences")
        .eq("id", input.userId)
        .maybeSingle();

      if (error || !user) {
        result.errors.push(`User not found: ${input.userId}`);
        return result;
      }

      recipientPhone = (user as any).phone ?? null;
      recipientEmail = (user as any).email ?? null;
      recipientName = (user as any).name ?? undefined;
      prefs = mergePreferences((user as any).notification_preferences ?? null);
    }

    // ── 2. Check type-level preference ────────────────────────────────────────
    if (!isTypeAllowed(prefs, input.type)) {
      return { success: true, errors: [], ...skippedAll(input.channels) };
    }

    // ── 3. Filter channels ────────────────────────────────────────────────────
    const allowedChannels = filterAllowedChannels(input.channels, prefs);
    if (!allowedChannels.length) {
      return { success: true, errors: [], ...skippedAll(input.channels) };
    }

    // ── 4. Dispatch channels concurrently ─────────────────────────────────────
    const tasks: Promise<void>[] = [];

    if (allowedChannels.includes("sms")) {
      const template = buildSmsTemplate(input.type, input.payload);
      if (template && recipientPhone) {
        tasks.push(
          sendSms({ to: recipientPhone, body: template.body }).then((r) => {
            result.sms = r;
          })
        );
      } else {
        result.sms = {
          status: "skipped",
          error: template ? "No phone number available." : "No SMS template for this type.",
        };
      }
    }

    if (allowedChannels.includes("email")) {
      const template = buildEmailTemplate(input.type, input.payload, recipientName);
      if (template && recipientEmail) {
        tasks.push(
          sendEmail({
            to: recipientEmail,
            subject: template.subject,
            html: template.html,
          }).then((r) => {
            result.email = r;
          })
        );
      } else {
        result.email = {
          status: "skipped",
          error: template ? "No email address available." : "No email template for this type.",
        };
      }
    }

    // Future channels — stubbed for forward compatibility
    if (allowedChannels.includes("whatsapp")) {
      result.whatsapp = { status: "skipped", error: "WhatsApp not yet implemented." };
    }
    if (allowedChannels.includes("push")) {
      result.push = { status: "skipped", error: "Push not yet implemented." };
    }

    await Promise.all(tasks);

    // ── 5. Determine overall success ──────────────────────────────────────────
    const dispatched = [result.sms, result.email, result.whatsapp, result.push].filter(Boolean) as ChannelResult[];
    const hasSent = dispatched.some((r) => r.status === "sent");
    const hasFailed = dispatched.some((r) => r.status === "failed");
    result.success = hasSent || (!hasFailed && dispatched.every((r) => r.status === "skipped"));

    // ── 6. Persist log ────────────────────────────────────────────────────────
    await persistLog({
      user_id: input.userId,
      type: input.type,
      channels: allowedChannels,
      sms_status: result.sms?.status,
      email_status: result.email?.status,
      sms_error: result.sms?.error,
      email_error: result.email?.error,
      payload: safePayload,
      sent_at: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-notification] unexpected error:", msg);
    result.errors.push(msg);
    result.success = false;
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function skippedAll(
  channels: SendNotificationInput["channels"]
): Partial<SendNotificationResult> {
  return Object.fromEntries(
    channels.map((ch) => [ch, { status: "skipped" as const, error: "Disabled by user preferences." }])
  );
}

async function persistLog(row: NotificationLogRow): Promise<void> {
  try {
    const supabase = getFirebaseAdminClient();
    await supabase.from("notifications_log").insert(row);
  } catch (err) {
    // Log persistence must never break the main flow
    console.warn("[send-notification] log persistence failed:", err instanceof Error ? err.message : err);
  }
}
