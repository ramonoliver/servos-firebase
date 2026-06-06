/**
 * templates.ts
 * SMS and Email templates for every NotificationType.
 * Pure functions — no side effects, no provider imports.
 */

import { NotificationType } from "./notification-types";
import type {
  NotificationPayload,
  ScheduleAssignedPayload,
  ScheduleReminderPayload,
  ScheduleUpdatedPayload,
  ScheduleCancelledPayload,
  MinistryInvitePayload,
  MinistryAnnouncementPayload,
  CellAnnouncementPayload,
  GeneralAnnouncementPayload,
  AvailabilityRequestPayload,
  WelcomePayload,
  PasswordResetPayload,
} from "./notification-types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmsTemplate {
  body: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
}

// ─── SMS Templates ────────────────────────────────────────────────────────────

export function buildSmsTemplate(
  type: NotificationType,
  payload: NotificationPayload
): SmsTemplate | null {
  switch (type) {
    case NotificationType.SCHEDULE_ASSIGNED: {
      const p = payload as ScheduleAssignedPayload;
      return {
        body: `Servos: você foi escalado para servir em ${p.ministryName} no dia ${p.date} às ${p.time}.${p.location ? ` Local: ${p.location}.` : ""}`,
      };
    }
    case NotificationType.SCHEDULE_REMINDER: {
      const p = payload as ScheduleReminderPayload;
      return {
        body: `Servos: lembrete da sua escala amanhã às ${p.time} em ${p.ministryName}.`,
      };
    }
    case NotificationType.SCHEDULE_UPDATED: {
      const p = payload as ScheduleUpdatedPayload;
      return {
        body: `Servos: sua escala em ${p.ministryName} foi alterada.${p.changeDescription ? ` ${p.changeDescription}` : " Acesse o app para conferir."}`,
      };
    }
    case NotificationType.SCHEDULE_CANCELLED: {
      const p = payload as ScheduleCancelledPayload;
      return {
        body: `Servos: sua escala de ${p.date} em ${p.ministryName} foi cancelada.${p.reason ? ` Motivo: ${p.reason}.` : ""}`,
      };
    }
    case NotificationType.MINISTRY_INVITE: {
      const p = payload as MinistryInvitePayload;
      return {
        body: `Servos: ${p.inviterName} convidou você para o ministério ${p.ministryName} em ${p.churchName}. Acesse o app para aceitar.`,
      };
    }
    case NotificationType.MINISTRY_ANNOUNCEMENT: {
      const p = payload as MinistryAnnouncementPayload;
      return {
        body: `Servos [${p.ministryName}]: ${p.title}. Acesse o app para mais detalhes.`,
      };
    }
    case NotificationType.CELL_ANNOUNCEMENT: {
      const p = payload as CellAnnouncementPayload;
      return {
        body: `Servos: novo aviso da célula ${p.cellName}: "${p.title}". Confira no app.`,
      };
    }
    case NotificationType.GENERAL_ANNOUNCEMENT: {
      const p = payload as GeneralAnnouncementPayload;
      return {
        body: `Servos${p.churchName ? ` [${p.churchName}]` : ""}: ${p.title}. Acesse o app para ler o aviso completo.`,
      };
    }
    case NotificationType.AVAILABILITY_REQUEST: {
      const p = payload as AvailabilityRequestPayload;
      return {
        body: `Servos: nova solicitação de disponibilidade para ${p.period}.${p.deadline ? ` Responda até ${p.deadline}.` : ""} Acesse o app.`,
      };
    }
    // Welcome and Password Reset are email-only by default
    default:
      return null;
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

export function buildEmailTemplate(
  type: NotificationType,
  payload: NotificationPayload,
  recipientName?: string
): EmailTemplate | null {
  const name = recipientName ?? "Servo(a)";

  switch (type) {
    case NotificationType.SCHEDULE_ASSIGNED: {
      const p = payload as ScheduleAssignedPayload;
      return {
        subject: `Você foi escalado — ${p.ministryName} · ${p.date}`,
        html: baseEmailLayout({
          title: "Nova escala confirmada",
          preheader: `Você serve em ${p.ministryName} no dia ${p.date}`,
          body: `
            <p>Olá, <strong>${name}</strong>!</p>
            <p>Você foi escalado para servir no ministério <strong>${p.ministryName}</strong>.</p>
            ${detailTable([
              ["Data", p.date],
              ["Horário", p.time],
              ...(p.eventName ? [["Evento", p.eventName] as [string, string]] : []),
              ...(p.location  ? [["Local",  p.location]  as [string, string]] : []),
            ])}
            <p>Abra o app para confirmar sua presença.</p>
          `,
          ctaLabel: "Ver minha escala",
          ctaHref: "https://app.servosapp.com/minhas-escalas",
        }),
      };
    }
    case NotificationType.SCHEDULE_REMINDER: {
      const p = payload as ScheduleReminderPayload;
      return {
        subject: `Lembrete: você serve amanhã — ${p.ministryName}`,
        html: baseEmailLayout({
          title: "Lembrete de escala",
          preheader: `Você serve amanhã às ${p.time} em ${p.ministryName}`,
          body: `
            <p>Olá, <strong>${name}</strong>!</p>
            <p>Lembrando que você está escalado para <strong>${p.ministryName}</strong> amanhã.</p>
            ${detailTable([
              ["Horário", p.time],
              ...(p.eventName ? [["Evento", p.eventName] as [string, string]] : []),
            ])}
          `,
          ctaLabel: "Ver minha escala",
          ctaHref: "https://app.servosapp.com/minhas-escalas",
        }),
      };
    }
    case NotificationType.SCHEDULE_UPDATED: {
      const p = payload as ScheduleUpdatedPayload;
      return {
        subject: `Sua escala foi alterada — ${p.ministryName}`,
        html: baseEmailLayout({
          title: "Escala atualizada",
          preheader: `Houve uma alteração na sua escala de ${p.ministryName}`,
          body: `
            <p>Olá, <strong>${name}</strong>!</p>
            <p>Sua escala no ministério <strong>${p.ministryName}</strong> foi atualizada.</p>
            ${p.changeDescription ? `<p>${p.changeDescription}</p>` : ""}
            ${p.date || p.time ? detailTable([
              ...(p.date ? [["Nova data", p.date] as [string, string]] : []),
              ...(p.time ? [["Novo horário", p.time] as [string, string]] : []),
            ]) : ""}
          `,
          ctaLabel: "Ver minha escala",
          ctaHref: "https://app.servosapp.com/minhas-escalas",
        }),
      };
    }
    case NotificationType.SCHEDULE_CANCELLED: {
      const p = payload as ScheduleCancelledPayload;
      return {
        subject: `Escala cancelada — ${p.ministryName} · ${p.date}`,
        html: baseEmailLayout({
          title: "Escala cancelada",
          preheader: `Sua escala de ${p.date} em ${p.ministryName} foi cancelada`,
          body: `
            <p>Olá, <strong>${name}</strong>!</p>
            <p>Informamos que sua escala no ministério <strong>${p.ministryName}</strong> do dia <strong>${p.date}</strong> foi <strong>cancelada</strong>.</p>
            ${p.reason ? `<p><strong>Motivo:</strong> ${p.reason}</p>` : ""}
          `,
          ctaLabel: "Ver escalas",
          ctaHref: "https://app.servosapp.com/minhas-escalas",
          accentColor: "#dc2626",
        }),
      };
    }
    case NotificationType.MINISTRY_INVITE: {
      const p = payload as MinistryInvitePayload;
      return {
        subject: `Convite para o ministério ${p.ministryName}`,
        html: baseEmailLayout({
          title: "Você foi convidado!",
          preheader: `${p.inviterName} convidou você para o ministério ${p.ministryName}`,
          body: `
            <p>Olá, <strong>${name}</strong>!</p>
            <p><strong>${p.inviterName}</strong> convidou você para fazer parte do ministério <strong>${p.ministryName}</strong> em <strong>${p.churchName}</strong>.</p>
            <p>Acesse o app para aceitar ou recusar o convite.</p>
          `,
          ctaLabel: "Ver convite",
          ctaHref: "https://app.servosapp.com/ministerios",
        }),
      };
    }
    case NotificationType.MINISTRY_ANNOUNCEMENT: {
      const p = payload as MinistryAnnouncementPayload;
      return {
        subject: `[${p.ministryName}] ${p.title}`,
        html: baseEmailLayout({
          title: p.title,
          preheader: `Novo aviso do ministério ${p.ministryName}`,
          body: `
            <p>Olá, <strong>${name}</strong>!</p>
            <p>Novo aviso do ministério <strong>${p.ministryName}</strong>:</p>
            <blockquote style="border:1px solid #FFE0D9;margin:16px 0;padding:14px 16px;background:#FFF1EE;color:#1B1726;border-radius:16px;">
              ${p.body}
            </blockquote>
          `,
          ctaLabel: "Ver no app",
          ctaHref: "https://app.servosapp.com/ministerios",
        }),
      };
    }
    case NotificationType.CELL_ANNOUNCEMENT: {
      const p = payload as CellAnnouncementPayload;
      return {
        subject: `[${p.cellName}] ${p.title}`,
        html: baseEmailLayout({
          title: p.title,
          preheader: `Novo aviso da célula ${p.cellName}`,
          body: `
            <p>Olá, <strong>${name}</strong>!</p>
            <p>Novo aviso da célula <strong>${p.cellName}</strong>:</p>
            <blockquote style="border:1px solid #FFE0D9;margin:16px 0;padding:14px 16px;background:#FFF1EE;color:#1B1726;border-radius:16px;">
              ${p.body}
            </blockquote>
          `,
          ctaLabel: "Ver no app",
          ctaHref: "https://app.servosapp.com/celulas",
        }),
      };
    }
    case NotificationType.GENERAL_ANNOUNCEMENT: {
      const p = payload as GeneralAnnouncementPayload;
      return {
        subject: p.title,
        html: baseEmailLayout({
          title: p.title,
          preheader: `${p.churchName ? `[${p.churchName}] ` : ""}${p.title}`,
          body: `
            <p>Olá, <strong>${name}</strong>!</p>
            ${p.churchName ? `<p><em>${p.churchName}</em></p>` : ""}
            <p>${p.body}</p>
          `,
          ctaLabel: "Abrir app",
          ctaHref: "https://app.servosapp.com",
        }),
      };
    }
    case NotificationType.AVAILABILITY_REQUEST: {
      const p = payload as AvailabilityRequestPayload;
      return {
        subject: `Solicitação de disponibilidade — ${p.period}`,
        html: baseEmailLayout({
          title: "Informe sua disponibilidade",
          preheader: `Solicitação para o período ${p.period}`,
          body: `
            <p>Olá, <strong>${name}</strong>!</p>
            <p>Uma nova solicitação de disponibilidade foi enviada para o período <strong>${p.period}</strong>.</p>
            ${p.deadline ? `<p>Responda até <strong>${p.deadline}</strong>.</p>` : ""}
          `,
          ctaLabel: "Responder agora",
          ctaHref: "https://app.servosapp.com/indisponibilidade",
        }),
      };
    }
    case NotificationType.WELCOME: {
      const p = payload as WelcomePayload;
      return {
        subject: `Bem-vindo ao Servos — ${p.churchName}`,
        html: baseEmailLayout({
          title: `Bem-vindo, ${p.memberName}!`,
          preheader: `Sua conta no Servos App está pronta`,
          body: `
            <p>Olá, <strong>${p.memberName}</strong>!</p>
            <p>Sua conta no <strong>Servos App</strong> da igreja <strong>${p.churchName}</strong> foi criada com sucesso.</p>
            <p>Acesse o app para começar a servir.</p>
          `,
          ctaLabel: "Acessar o app",
          ctaHref: p.loginUrl ?? "https://app.servosapp.com/login",
        }),
      };
    }
    case NotificationType.PASSWORD_RESET: {
      const p = payload as PasswordResetPayload;
      return {
        subject: "Redefinição de senha — Servos App",
        html: baseEmailLayout({
          title: "Redefina sua senha",
          preheader: "Você solicitou a redefinição de senha",
          body: `
            <p>Olá, <strong>${p.memberName}</strong>!</p>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta no Servos App${p.churchName ? ` (${p.churchName})` : ""}.</p>
            <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
            <p style="font-size:12px;color:#888;">Se você não solicitou essa redefinição, ignore este e-mail.</p>
          `,
          ctaLabel: "Redefinir senha",
          ctaHref: p.resetUrl,
          accentColor: "#dc2626",
        }),
      };
    }
    default:
      return null;
  }
}

// ─── Base layout ──────────────────────────────────────────────────────────────

interface BaseLayoutOptions {
  title: string;
  preheader: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  accentColor?: string;
}

function baseEmailLayout(opts: BaseLayoutOptions): string {
  const accent = opts.accentColor ?? "#FF6B57";
  const year = new Date().getFullYear();

  return /* html */ `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${opts.title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    body { margin: 0; padding: 0; background: #f3eee6; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    .wrapper { width: 100%; background: #f3eee6; padding: 28px 16px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #eadfce; border-radius: 30px; overflow: hidden; box-shadow: 0 34px 90px rgba(92,64,37,.16); }
    .header { padding: 36px 40px 8px; text-align: left; }
    .logo { color: #1B1726; font-size: 19px; font-weight: 800; letter-spacing: .01em; }
    .logo-mark { display: inline-block; width: 44px; height: 44px; margin-right: 12px; border-radius: 14px; background: ${accent}; color: #ffffff; text-align: center; line-height: 44px; font-size: 24px; vertical-align: middle; }
    .content { padding: 14px 40px 24px; color: #736D82; font-size: 15px; line-height: 1.7; }
    .content h1 { font-size: 30px; line-height: 1.1; font-weight: 800; color: #1B1726; margin: 0 0 18px; }
    .content p { margin: 0 0 14px; }
    .content strong { color: #1B1726; }
    .cta-wrap { text-align: center; padding: 0 40px 28px; }
    .cta { display: inline-block; background: ${accent}; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 999px; font-size: 15px; font-weight: 800; }
    .divider { border: none; border-top: 1px solid #F0EEF8; margin: 24px 0; }
    .footer { padding: 20px 40px 34px; text-align: left; font-size: 12px; line-height: 1.65; color: #A39DAE; border-top: 1px solid #F0EEF8; }
    .footer a { color: #736D82; text-decoration: underline; }
    @media (max-width: 600px) {
      .content, .header, .footer { padding-left: 24px !important; padding-right: 24px !important; }
      .content h1 { font-size: 26px !important; }
    }
  </style>
</head>
<body>
  <!-- preheader (hidden, appears in email clients preview) -->
  <div style="display:none;max-height:0;overflow:hidden;color:#f3eee6;">${opts.preheader} &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  <div class="wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <div class="logo"><span class="logo-mark">S</span>Servos</div>
      </div>

      <!-- Content -->
      <div class="content">
        <h1>${opts.title}</h1>
        ${opts.body}
      </div>

      <!-- CTA -->
      ${opts.ctaLabel && opts.ctaHref ? `
      <div class="cta-wrap">
        <a class="cta" href="${opts.ctaHref}" target="_blank" rel="noopener noreferrer">${opts.ctaLabel}</a>
      </div>
      ` : ""}

      <!-- Footer -->
      <div class="footer">
        <p style="margin:0 0 6px;">© ${year} Servos App. Todos os direitos reservados.</p>
        <p style="margin:0;">Você recebeu este e-mail por ser parte de uma igreja que usa o Servos App.</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();
}

// ─── Detail table helper ──────────────────────────────────────────────────────

function detailTable(rows: [string, string][]): string {
  if (!rows.length) return "";
  const cells = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#888;white-space:nowrap;border-bottom:1px solid #f0f0f0;">${label}</td>
          <td style="padding:8px 12px;font-size:13px;color:#1B1726;font-weight:700;border-bottom:1px solid #F0EEF8;">${value}</td>
        </tr>`
    )
    .join("");
  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #FFE0D9;border-radius:16px;overflow:hidden;background:#FFF1EE;">
      <tbody>${cells}</tbody>
    </table>`;
}
