import { Resend } from "resend";

// Domínio verificado no Resend. SÓ é possível enviar a partir dele.
const VERIFIED_DOMAIN = "servosapp.com";
const DEFAULT_SENDER = `Servos <noreply@${VERIFIED_DOMAIN}>`;

/**
 * Resolve o remetente garantindo que SEMPRE usamos o domínio verificado.
 * Em produção o EMAIL_FROM chegou com aspas literais (erro 422 "Invalid from")
 * e/ou apontando para um domínio não verificado como gmail.com (erro 403
 * "domain is not verified") — ambos faziam o Resend recusar o envio. Aqui:
 *  1) removemos aspas/espaços externos;
 *  2) se o domínio do endereço não for o verificado, usamos o remetente padrão.
 * Assim nenhuma configuração equivocada de ambiente derruba o envio.
 */
export function normalizeEmailFrom(raw?: string): string {
  const cleaned = (raw ?? "").trim().replace(/^['"]+|['"]+$/g, "").trim();
  if (!cleaned) return DEFAULT_SENDER;
  const match = cleaned.match(/<([^>]+)>/);
  const address = (match ? match[1] : cleaned).trim().toLowerCase();
  const domain = address.split("@")[1] || "";
  if (domain !== VERIFIED_DOMAIN) return DEFAULT_SENDER;
  return cleaned;
}

// Instanciação preguiçosa: a RESEND_API_KEY só existe em RUNTIME (não no build).
// Criar o client no topo do módulo quebra o `next build` ("Missing API key").
let resendClient: Resend | null = null;

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurada. Não é possível enviar e-mails.");
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

// ── Tipos ──────────────────────────────────────────────────────────────────

type WelcomeEmailInput = {
  to: string;
  memberName: string;
  churchName: string;
  tempPassword: string;
  trackingPixelUrl?: string;
};

type PasswordResetInput = {
  to: string;
  memberName: string;
  resetUrl: string;
  churchName?: string;
};

type InviteEmailInput = {
  to: string;
  memberName: string;
  inviteUrl: string;
  churchName?: string;
};

type ScheduleReminderInput = {
  to: string;
  memberName: string;
  eventName: string;
  date: string;
  time: string;
  departmentName: string;
};

type SupportEmailInput = {
  to: string;
  userName: string;
  churchName: string;
  userEmail: string;
  subject: string;
  message: string;
};

// ── Utilitários ────────────────────────────────────────────────────────────

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Template base da Servos ──────────────────────────────────────────────────

/** Botão de ação (CTA) compatível com clientes de e-mail (tabela + inline). */
function ctaButton(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px auto 0;">
      <tr><td style="border-radius:14px;background:#2f241c;">
        <a href="${url}" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#fff7ef;text-decoration:none;border-radius:14px;">${label}</a>
      </td></tr>
    </table>`;
}

/** Layout base com a identidade visual da Servos. */
function renderServosEmail(params: {
  preheader?: string;
  eyebrow?: string;
  title: string;
  intro: string;
  contentHtml?: string;
  footnote?: string;
  trackingPixelUrl?: string;
}): string {
  const {
    preheader = "",
    eyebrow = "Servos",
    title,
    intro,
    contentHtml = "",
    footnote = "",
    trackingPixelUrl,
  } = params;
  const pixel = trackingPixelUrl
    ? `<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none;" />`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4efe7;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4efe7;">${preheader}</span>
  <div style="margin:0;padding:24px;background:#f4efe7;font-family:Georgia,'Times New Roman',serif;color:#24170f;">
    <div style="max-width:600px;margin:0 auto;background:#fffdf8;border:1px solid #eadfcd;border-radius:28px;overflow:hidden;box-shadow:0 20px 50px rgba(67,41,19,.08);">
      <div style="padding:36px 36px 28px;background:linear-gradient(135deg,#f4e4c9 0%,#f7efe3 55%,#fffdf8 100%);border-bottom:1px solid #eadfcd;">
        <div style="font-size:12px;letter-spacing:.30em;text-transform:uppercase;color:#8a6441;font-family:Arial,Helvetica,sans-serif;font-weight:700;">${eyebrow}</div>
        <h1 style="margin:14px 0 12px;font-size:30px;line-height:1.12;font-weight:700;color:#24170f;">${title}</h1>
        <p style="margin:0;font-size:16px;line-height:1.7;color:#5e4632;">${intro}</p>
      </div>
      ${contentHtml ? `<div style="padding:30px 36px 10px;">${contentHtml}</div>` : ""}
      <div style="padding:20px 36px 32px;border-top:1px solid #eadfcd;background:#fffcf6;">
        ${footnote ? `<p style="margin:0 0 10px;font-size:13px;line-height:1.7;color:#8a6441;font-family:Arial,Helvetica,sans-serif;">${footnote}</p>` : ""}
        <p style="margin:0;font-size:13px;line-height:1.7;color:#8a6441;font-family:Arial,Helvetica,sans-serif;">Que Deus abençoe o seu servir. — Equipe <strong>Servos</strong></p>
      </div>
    </div>
    ${pixel}
  </div>
</body>
</html>`;
}

// ── Envio via Resend ───────────────────────────────────────────────────────

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const { data, error } = await getResend().emails.send({
    from: normalizeEmailFrom(process.env.EMAIL_FROM),
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }

  return data;
}

// ── E-mails de boas-vindas ─────────────────────────────────────────────────

export async function sendWelcomeEmail({
  to,
  memberName,
  churchName,
  tempPassword,
  trackingPixelUrl,
}: WelcomeEmailInput) {
  const safeMemberName = escapeHtml(memberName);
  const safeChurchName = escapeHtml(churchName);
  const safeEmail = escapeHtml(to);
  const safePassword = escapeHtml(tempPassword);

  const contentHtml = `
    <div style="background:#2f241c;border-radius:22px;padding:24px;color:#fff7ef;">
      <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;opacity:.72;font-family:Arial,Helvetica,sans-serif;font-weight:700;">Acesso inicial</div>
      <div style="margin-top:16px;font-size:12px;opacity:.72;font-family:Arial,Helvetica,sans-serif;">E-mail</div>
      <div style="margin-top:4px;font-size:17px;font-weight:700;line-height:1.4;">${safeEmail}</div>
      <div style="margin-top:18px;font-size:12px;opacity:.72;font-family:Arial,Helvetica,sans-serif;">Senha temporária</div>
      <div style="display:inline-block;margin-top:6px;background:#fff7ef;color:#2f241c;padding:10px 16px;border-radius:12px;font-size:22px;font-weight:700;letter-spacing:.08em;font-family:'Courier New',monospace;">${safePassword}</div>
    </div>
    <p style="margin:22px 0 0;font-size:15px;line-height:1.8;color:#4d3a2b;font-family:Georgia,serif;">No primeiro acesso, troque sua senha para manter a sua conta segura.</p>`;

  const html = renderServosEmail({
    preheader: `Seu acesso ao Servos em ${churchName}`,
    eyebrow: "Servos · Convite",
    title: "Seu convite chegou",
    intro: `${safeMemberName}, você foi convidado(a) para entrar no Servos e servir com <strong>${safeChurchName}</strong>.`,
    contentHtml,
    footnote: "Se você recebeu este e-mail por engano, basta ignorar a mensagem.",
    trackingPixelUrl,
  });

  return sendEmail({
    to,
    subject: `Seu acesso ao ${churchName} no Servos`,
    html,
    text: [
      `Olá, ${memberName}!`,
      `Você foi convidado(a) para acessar o Servos em ${churchName}.`,
      `Email: ${to}`,
      `Senha temporária: ${tempPassword}`,
      "No primeiro acesso, altere sua senha.",
    ].join("\n"),
  });
}

// ── Redefinição de senha ───────────────────────────────────────────────────

export async function sendPasswordResetEmail({
  to,
  memberName,
  resetUrl,
  churchName,
}: PasswordResetInput) {
  const safeMemberName = escapeHtml(memberName);
  const safeChurchName = churchName ? escapeHtml(churchName) : "sua igreja";
  const safeResetUrl = resetUrl; // URLs não devem ser escapadas em hrefs

  const contentHtml = `
    <div style="text-align:center;">
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4d3a2b;font-family:Georgia,serif;">Use o botão abaixo para criar uma nova senha com segurança.</p>
      ${ctaButton("Redefinir senha", safeResetUrl)}
    </div>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#8a6441;font-family:Arial,Helvetica,sans-serif;">Se o botão não funcionar, copie e cole este link no navegador:</p>
    <p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:#8a6441;word-break:break-all;font-family:Arial,Helvetica,sans-serif;">${safeResetUrl}</p>`;

  const html = renderServosEmail({
    preheader: "Redefina sua senha de acesso ao Servos",
    eyebrow: "Servos · Segurança",
    title: "Redefina sua senha",
    intro: `${safeMemberName}, recebemos um pedido para redefinir o seu acesso em <strong>${safeChurchName}</strong>.`,
    contentHtml,
    footnote: "Este link expira em 7 dias. Se você não solicitou a alteração, ignore este e-mail.",
  });

  return sendEmail({
    to,
    subject: "Redefinição de senha — Servos",
    html,
    text: [
      `Olá, ${memberName}!`,
      `Recebemos um pedido para redefinir seu acesso em ${churchName || "sua igreja"}.`,
      `Abra este link para redefinir sua senha: ${resetUrl}`,
      "Se você não solicitou a alteração, ignore esta mensagem.",
    ].join("\n"),
  });
}

// ── Convite de cadastro ────────────────────────────────────────────────────

export async function sendInviteEmail({
  to,
  memberName,
  inviteUrl,
  churchName,
}: InviteEmailInput) {
  const safeMemberName = escapeHtml(memberName);
  const safeChurchName = churchName ? escapeHtml(churchName) : "sua igreja";

  const contentHtml = `
    <div style="text-align:center;">
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4d3a2b;font-family:Georgia,serif;">Clique no botão abaixo para concluir seu cadastro e escolher a sua senha de acesso.</p>
      ${ctaButton("Concluir cadastro", inviteUrl)}
    </div>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#8a6441;font-family:Arial,Helvetica,sans-serif;">Se o botão não funcionar, copie e cole este link no navegador:</p>
    <p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:#8a6441;word-break:break-all;font-family:Arial,Helvetica,sans-serif;">${inviteUrl}</p>`;

  const html = renderServosEmail({
    preheader: `Conclua seu cadastro no Servos para servir com ${churchName || "sua igreja"}`,
    eyebrow: "Servos · Convite",
    title: "Seu cadastro está pronto",
    intro: `${safeMemberName}, você foi convidado(a) a se cadastrar no Servos para servir com a equipe de <strong>${safeChurchName}</strong>.`,
    contentHtml,
    footnote: "Este link de cadastro expira em 7 dias. Se você não esperava este convite, desconsidere esta mensagem.",
  });

  return sendEmail({
    to,
    subject: `Convite para se cadastrar no Servos — ${churchName || "sua igreja"}`,
    html,
    text: [
      `Olá, ${memberName}!`,
      `Você foi convidado(a) a se cadastrar no Servos para servir com a equipe de ${churchName || "sua igreja"}.`,
      `Clique no link abaixo para concluir o seu cadastro e definir sua senha de acesso:`,
      `${inviteUrl}`,
      `Se você não solicitou este acesso, ignore esta mensagem.`,
    ].join("\n"),
  });
}

// ── Lembrete de escala ─────────────────────────────────────────────────────

export async function sendScheduleReminderEmail({
  to,
  memberName,
  eventName,
  date,
  time,
  departmentName,
}: ScheduleReminderInput) {
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2>Lembrete de Escala</h2>
      <p>Olá, <strong>${memberName}</strong>!</p>
      <p>Você está escalado para servir:</p>
      <div style="background:#f3f4f6;padding:16px;border-radius:12px;">
        <p style="margin:0 0 8px;"><strong>Evento:</strong> ${eventName}</p>
        <p style="margin:0 0 8px;"><strong>Data:</strong> ${date}</p>
        <p style="margin:0 0 8px;"><strong>Horário:</strong> ${time}</p>
        <p style="margin:0;"><strong>Ministério:</strong> ${departmentName}</p>
      </div>
      <p style="margin-top:16px;">Confirme sua presença no app 🙏</p>
      <p>Que Deus abençoe seu servir!</p>
    </div>
  `;

  return sendEmail({ to, subject: "Lembrete de escala — Servos", html });
}

// ── E-mail de suporte ──────────────────────────────────────────────────────

export async function sendSupportEmail({
  to,
  userName,
  churchName,
  userEmail,
  subject,
  message,
}: SupportEmailInput) {
  const safeUserName = escapeHtml(userName);
  const safeChurchName = escapeHtml(churchName);
  const safeUserEmail = escapeHtml(userEmail);
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message);

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2>Nova mensagem de suporte — Servos</h2>
      <p><strong>Usuário:</strong> ${safeUserName}</p>
      <p><strong>Email:</strong> ${safeUserEmail}</p>
      <p><strong>Igreja:</strong> ${safeChurchName}</p>
      <p><strong>Assunto:</strong> ${safeSubject}</p>
      <div style="background:#f3f4f6;padding:16px;border-radius:12px;margin:16px 0;">
        <p style="margin:0;"><strong>Mensagem:</strong></p>
        <p style="margin:8px 0 0;white-space:pre-wrap;">${safeMessage}</p>
      </div>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Suporte — ${subject} — ${userName} (${churchName})`,
    html,
  });
}

// ── SMS (Twilio) ───────────────────────────────────────────────────────────

import { buildSmsInvitePreview, normalizePhoneForSms } from "@/lib/invitations";

type SmsInviteInput = {
  to: string;
  memberName: string;
  churchName: string;
  tempPassword: string;
  email: string;
};

type SmsScheduleInput = {
  to: string;
  memberName: string;
  eventName: string;
  date: string;
  time: string;
  departmentName: string;
};

async function sendSmsMessage(params: { to: string; body: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_SMS_FROM;
  const normalizedPhone = normalizePhoneForSms(params.to);

  if (!normalizedPhone) {
    return { status: "skipped" as const, error: "Membro sem telefone para SMS." };
  }

  if (!accountSid || !authToken || !fromNumber) {
    return {
      status: "skipped" as const,
      error: "SMS não configurado. Defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_SMS_FROM.",
    };
  }

  const body = new URLSearchParams({
    To: `+${normalizedPhone}`,
    From: fromNumber,
    Body: params.body,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    return { status: "failed" as const, error: errorText || "Falha ao enviar SMS." };
  }

  return { status: "sent" as const, error: null };
}

export async function sendSmsInvite({
  to,
  memberName,
  churchName,
  tempPassword,
  email,
}: SmsInviteInput): Promise<{ status: "sent" | "failed" | "skipped"; error: string | null }> {
  return sendSmsMessage({
    to,
    body: buildSmsInvitePreview({ memberName, churchName, email, tempPassword }),
  });
}

export async function sendSmsScheduleAssignment({
  to,
  memberName,
  eventName,
  date,
  time,
  departmentName,
}: SmsScheduleInput): Promise<{ status: "sent" | "failed" | "skipped"; error: string | null }> {
  return sendSmsMessage({
    to,
    body: [
      `Servos: ${memberName}, nova escala em ${eventName}.`,
      `${date} às ${time}.`,
      `Ministério: ${departmentName}.`,
      "Abra o app e confirme.",
    ].join("\n"),
  });
}

export async function sendSmsScheduleReminder({
  to,
  memberName,
  eventName,
  date,
  time,
  departmentName,
}: SmsScheduleInput): Promise<{ status: "sent" | "failed" | "skipped"; error: string | null }> {
  return sendSmsMessage({
    to,
    body: [
      `Servos: lembrete para ${memberName}.`,
      `${eventName} em ${date} às ${time}.`,
      `Ministério: ${departmentName}.`,
      "Se ainda não respondeu, confirme no app.",
    ].join("\n"),
  });
}
