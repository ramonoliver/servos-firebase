/**
 * email-provider.ts
 * Resend email provider — server-side only.
 * Never import this file in client components.
 */

import { Resend } from "resend";
import type { ChannelResult } from "./notification-types";
import { isValidEmail, normalizeEmail } from "./validators";
import { normalizeEmailFrom } from "@/lib/email/send";

// ─── Singleton ────────────────────────────────────────────────────────────────

let _resend: Resend | null = null;

function getResendClient(): Resend {
  if (_resend) return _resend;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  _resend = new Resend(apiKey);
  return _resend;
}

// ─── Send Email ───────────────────────────────────────────────────────────────

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * Sends a transactional email via Resend.
 */
export async function sendEmail(input: SendEmailInput): Promise<ChannelResult> {
  if (process.env.NOTIFICATIONS_EMAIL_ENABLED !== "true") {
    return { status: "skipped", error: "Email notifications are disabled." };
  }

  const to = normalizeEmail(input.to);
  if (!isValidEmail(to)) {
    return { status: "skipped", error: `Invalid email address: ${input.to}` };
  }

  if (!input.subject.trim() || !input.html.trim()) {
    return { status: "failed", error: "Email subject and html body are required." };
  }

  const from = normalizeEmailFrom(process.env.EMAIL_FROM);

  try {
    const client = getResendClient();
    const result = await client.emails.send({
      from,
      to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });

    if (result.error) {
      console.error("[email-provider] Resend error:", result.error.message);
      return { status: "failed", error: result.error.message };
    }

    return { status: "sent", messageId: result.data?.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[email-provider] send failed:", errorMessage);
    return { status: "failed", error: errorMessage };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strips HTML tags to generate a plain-text fallback. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
