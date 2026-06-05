import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM || "Servos App <noreply@servosapp.com>";

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

// ── Envio via Resend ───────────────────────────────────────────────────────

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const { data, error } = await getResend().emails.send({
    from: FROM,
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
  const trackingPixel = trackingPixelUrl
    ? `<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none;" />`
    : "";

  const html = `
    <div style="margin:0;padding:24px;background:#f4efe7;font-family:Georgia,'Times New Roman',serif;color:#24170f;">
      <div style="max-width:640px;margin:0 auto;background:#fffdf8;border:1px solid #eadfcd;border-radius:28px;overflow:hidden;box-shadow:0 20px 50px rgba(67,41,19,.08);">
        <div style="padding:32px 32px 24px;background:linear-gradient(135deg,#f4e4c9 0%,#f7efe3 55%,#fffdf8 100%);border-bottom:1px solid #eadfcd;">
          <div style="font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:#8a6441;font-family:Arial,sans-serif;font-weight:700;">Servos</div>
          <h1 style="margin:14px 0 10px;font-size:34px;line-height:1.05;font-weight:700;color:#24170f;">Seu convite chegou</h1>
          <p style="margin:0;font-size:16px;line-height:1.7;color:#5e4632;">${safeMemberName}, você foi convidado(a) para entrar no Servos e servir com <strong>${safeChurchName}</strong>.</p>
        </div>

        <div style="padding:28px 32px 10px;">
          <div style="background:#2f241c;border-radius:24px;padding:24px 24px 20px;color:#fff7ef;">
            <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;opacity:.72;font-family:Arial,sans-serif;font-weight:700;">Acesso inicial</div>
            <div style="margin-top:16px;">
              <div style="font-size:12px;opacity:.72;margin-bottom:6px;font-family:Arial,sans-serif;">Email</div>
              <div style="font-size:18px;font-weight:700;line-height:1.4;">${safeEmail}</div>
            </div>
            <div style="margin-top:18px;">
              <div style="font-size:12px;opacity:.72;margin-bottom:6px;font-family:Arial,sans-serif;">Senha temporária</div>
              <div style="display:inline-block;background:#fff7ef;color:#2f241c;padding:10px 14px;border-radius:14px;font-size:24px;font-weight:700;letter-spacing:.08em;">${safePassword}</div>
            </div>
          </div>

          <div style="padding:22px 2px 4px;">
            <p style="margin:0 0 10px;font-size:15px;line-height:1.8;color:#4d3a2b;">No primeiro acesso, troque sua senha para manter a conta segura.</p>
            <p style="margin:0;font-size:15px;line-height:1.8;color:#4d3a2b;">Se você recebeu este email por engano, basta ignorar a mensagem.</p>
          </div>
        </div>

        <div style="padding:18px 32px 28px;border-top:1px solid #eadfcd;background:#fffcf6;">
          <p style="margin:0;font-size:13px;line-height:1.7;color:#8a6441;font-family:Arial,sans-serif;">Que Deus abençoe seu servir. Nos vemos no app.</p>
        </div>
      </div>
      ${trackingPixel}
    </div>
  `;

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

  const html = `
    <div style="margin:0;padding:24px;background:#f4efe7;font-family:Georgia,'Times New Roman',serif;color:#24170f;">
      <div style="max-width:640px;margin:0 auto;background:#fffdf8;border:1px solid #eadfcd;border-radius:28px;overflow:hidden;box-shadow:0 20px 50px rgba(67,41,19,.08);">
        <div style="padding:32px;background:linear-gradient(135deg,#f4e4c9 0%,#f7efe3 55%,#fffdf8 100%);border-bottom:1px solid #eadfcd;">
          <div style="font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:#8a6441;font-family:Arial,sans-serif;font-weight:700;">Servos</div>
          <h1 style="margin:14px 0 10px;font-size:34px;line-height:1.05;font-weight:700;color:#24170f;">Redefina sua senha</h1>
          <p style="margin:0;font-size:16px;line-height:1.7;color:#5e4632;">${safeMemberName}, recebemos um pedido para redefinir o seu acesso em <strong>${safeChurchName}</strong>.</p>
        </div>
        <div style="padding:28px 32px;">
          <div style="background:#2f241c;border-radius:24px;padding:24px;color:#fff7ef;">
            <div style="font-size:12px;opacity:.72;margin-bottom:10px;font-family:Arial,sans-serif;">Use o botão abaixo para criar uma nova senha com segurança.</div>
            <a href="${safeResetUrl}" style="display:inline-block;background:#fff7ef;color:#2f241c;padding:12px 18px;border-radius:14px;font-size:15px;font-weight:700;text-decoration:none;">Redefinir senha</a>
          </div>
          <p style="margin:18px 0 0;font-size:15px;line-height:1.8;color:#4d3a2b;">Se o botão não funcionar, copie este link no navegador:</p>
          <p style="margin:8px 0 0;font-size:14px;line-height:1.7;color:#8a6441;word-break:break-all;">${safeResetUrl}</p>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.8;color:#4d3a2b;">Esse link expira em 7 dias. Se você não solicitou a alteração, ignore este email.</p>
        </div>
      </div>
    </div>
  `;

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

  const html = `
    <div style="margin:0;padding:24px;background:#f4efe7;font-family:Georgia,'Times New Roman',serif;color:#24170f;">
      <div style="max-width:640px;margin:0 auto;background:#fffdf8;border:1px solid #eadfcd;border-radius:28px;overflow:hidden;box-shadow:0 20px 50px rgba(67,41,19,.08);">
        <div style="padding:32px;background:linear-gradient(135deg,#f4e4c9 0%,#f7efe3 55%,#fffdf8 100%);border-bottom:1px solid #eadfcd;">
          <div style="font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:#8a6441;font-family:Arial,sans-serif;font-weight:700;">Servos</div>
          <h1 style="margin:14px 0 10px;font-size:34px;line-height:1.05;font-weight:700;color:#24170f;">Seu cadastro está pronto</h1>
          <p style="margin:0;font-size:16px;line-height:1.7;color:#5e4632;">${safeMemberName}, você foi convidado(a) a se cadastrar no Servos para servir com a equipe de <strong>${safeChurchName}</strong>.</p>
        </div>
        <div style="padding:28px 32px;">
          <div style="background:#2f241c;border-radius:24px;padding:24px;color:#fff7ef;text-align:center;">
            <div style="font-size:14px;opacity:.85;margin-bottom:18px;font-family:Arial,sans-serif;line-height:1.5;">Clique no botão abaixo para concluir seu cadastro e escolher a sua senha de acesso.</div>
            <a href="${inviteUrl}" style="display:inline-block;background:#fff7ef;color:#2f241c;padding:14px 28px;border-radius:14px;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif;">Concluir Cadastro</a>
          </div>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.8;color:#4d3a2b;">Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
          <p style="margin:8px 0 0;font-size:13px;line-height:1.7;color:#8a6441;word-break:break-all;">${inviteUrl}</p>
          <p style="margin:20px 0 0;font-size:13px;line-height:1.8;color:#8a6441;font-family:Arial,sans-serif;opacity:.8;">Este link de cadastro expira em 7 dias. Se você não esperava este convite, desconsidere esta mensagem.</p>
        </div>
      </div>
    </div>
  `;

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
