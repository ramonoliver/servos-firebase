/**
 * email.service.ts
 * Canal de e-mail. Usa o transporte já verificado do app (Resend, domínio
 * servosapp.com). Para trocar por Brevo SMTP, basta substituir a chamada a
 * `sendRawEmail` por um transporte nodemailer/Brevo aqui — o restante do
 * sistema não muda.
 */

import {
  sendRawEmail,
  renderServosEmail,
  ctaButton,
  sendInviteEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
} from "@/lib/email/send";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Envio de e-mail cru (HTML pronto). */
export async function sendEmail(params: SendEmailParams) {
  return sendRawEmail(params);
}

// ── Templates ────────────────────────────────────────────────────────────────

export type EmailTemplate =
  | "schedule_created"
  | "schedule_updated"
  | "invite"
  | "event_created"
  | "password_reset"
  | "welcome";

function escapeHtml(value: string): string {
  return String(value).replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c)
  );
}

/**
 * Envia um e-mail a partir de um template nomeado.
 * Reusa os templates Servos existentes (convite/boas-vindas/redefinição) e
 * adiciona escala/evento usando o mesmo layout visual.
 */
export async function sendTemplateEmail(
  template: EmailTemplate,
  to: string,
  data: Record<string, any>
) {
  switch (template) {
    case "invite":
      return sendInviteEmail({
        to,
        memberName: data.memberName || "",
        inviteUrl: data.inviteUrl,
        churchName: data.churchName,
      });

    case "welcome":
      return sendWelcomeEmail({
        to,
        memberName: data.memberName || "",
        churchName: data.churchName || "sua igreja",
        tempPassword: data.tempPassword || "",
        trackingPixelUrl: data.trackingPixelUrl,
      });

    case "password_reset":
      return sendPasswordResetEmail({
        to,
        memberName: data.memberName || "",
        resetUrl: data.resetUrl,
        churchName: data.churchName,
      });

    case "schedule_created": {
      const html = renderServosEmail({
        preheader: "Você foi escalado para servir",
        eyebrow: "Escala",
        title: "Você foi escalado!",
        intro: `${escapeHtml(data.memberName || "Olá")}, você foi escalado(a) para servir em <strong>${escapeHtml(data.ministryName || "um ministério")}</strong>.`,
        contentHtml: `
          <div style="background:#FFF1EE;border:1px solid #FFE0D9;border-radius:18px;padding:20px 22px;">
            <p style="margin:0;font-size:14px;color:#736D82;"><strong style="color:#1B1726;">Evento:</strong> ${escapeHtml(data.eventName || "-")}</p>
            <p style="margin:8px 0 0;font-size:14px;color:#736D82;"><strong style="color:#1B1726;">Data:</strong> ${escapeHtml(data.date || "-")}${data.time ? " às " + escapeHtml(data.time) : ""}</p>
            <p style="margin:8px 0 0;font-size:14px;color:#736D82;"><strong style="color:#1B1726;">Ministério:</strong> ${escapeHtml(data.ministryName || "-")}</p>
          </div>
          ${data.url ? `<div style="text-align:center;margin-top:22px;">${ctaButton("Ver no app", data.url)}</div>` : ""}`,
        footnote: "Confirme sua presença pelo app. Que Deus abençoe o seu servir!",
      });
      return sendRawEmail({ to, subject: `Nova escala — ${data.ministryName || "Servos"}`, html });
    }

    case "schedule_updated": {
      const html = renderServosEmail({
        preheader: "Sua escala foi atualizada",
        eyebrow: "Escala",
        title: "Sua escala foi atualizada",
        intro: `${escapeHtml(data.memberName || "Olá")}, houve uma alteração na sua escala de <strong>${escapeHtml(data.ministryName || "serviço")}</strong>.`,
        contentHtml: data.url ? `<div style="text-align:center;">${ctaButton("Ver alteração", data.url)}</div>` : "",
        footnote: "Abra o app para conferir os detalhes atualizados.",
      });
      return sendRawEmail({ to, subject: "Sua escala foi atualizada — Servos", html });
    }

    case "event_created": {
      const html = renderServosEmail({
        preheader: "Novo evento disponível",
        eyebrow: "Evento",
        title: "Novo evento disponível",
        intro: `Um novo evento foi criado em <strong>${escapeHtml(data.churchName || "sua igreja")}</strong>: <strong>${escapeHtml(data.eventName || "")}</strong>.`,
        contentHtml: `
          ${data.date ? `<p style="margin:0;font-size:15px;color:#736D82;"><strong style="color:#1B1726;">Quando:</strong> ${escapeHtml(data.date)}${data.time ? " às " + escapeHtml(data.time) : ""}</p>` : ""}
          ${data.url ? `<div style="text-align:center;margin-top:20px;">${ctaButton("Ver evento", data.url)}</div>` : ""}`,
        footnote: "Veja todos os detalhes no app.",
      });
      return sendRawEmail({ to, subject: `Novo evento — ${data.eventName || "Servos"}`, html });
    }

    default:
      throw new Error(`Template de e-mail desconhecido: ${template}`);
  }
}
