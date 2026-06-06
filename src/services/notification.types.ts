/**
 * notification.types.ts
 * Tipos centrais do sistema de notificações multicanal.
 * Server-side. Não importar provedores em componentes de cliente.
 */

export type NotificationChannel = "push" | "email" | "whatsapp";

export type NotificationStatus = "pending" | "sent" | "failed" | "skipped";

/** Categorias usadas para respeitar as preferências do usuário. */
export type NotificationCategory =
  | "schedule"
  | "event"
  | "message"
  | "prayer"
  | "birthday"
  | "system";

/** Documento persistido na coleção `notifications`. */
export interface NotificationRecord {
  id: string;
  church_id: string;
  user_id: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  title: string;
  message: string;
  status: NotificationStatus;
  error?: string | null;
  dedupe_key?: string | null;
  metadata?: Record<string, unknown>;
  sent_at?: string | null;
  created_at: string;
}

/** Documento da coleção `notificationPreferences` (id = userId). */
export interface NotificationPreferences {
  user_id: string;
  church_id: string;

  pushEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;

  scheduleNotifications: boolean;
  eventNotifications: boolean;
  messageNotifications: boolean;
  prayerNotifications: boolean;
  birthdayNotifications: boolean;

  updated_at: string;
}

/** Documento da coleção `deviceTokens`. */
export interface DeviceToken {
  id: string;
  user_id: string;
  church_id: string;
  token: string;
  platform: string;
  created_at: string;
}

/** Conteúdo opcional específico por canal. */
export interface ChannelContent {
  /** HTML para e-mail (se ausente, usa `message`). */
  emailHtml?: string;
  /** Assunto do e-mail (se ausente, usa `title`). */
  emailSubject?: string;
  /** Texto do WhatsApp (se ausente, usa `message`). */
  whatsappText?: string;
  /** Dados extras enviados no payload do push (data message). */
  pushData?: Record<string, string>;
  /** URL para abrir ao clicar no push. */
  clickUrl?: string;
}

export interface NotifyInput {
  userId: string;
  churchId: string;
  title: string;
  message: string;
  /** Canais desejados. Se omitido, usa todos os habilitados nas preferências. */
  channels?: NotificationChannel[];
  /** Categoria para checagem de preferência. Default: "system" (sempre enviado). */
  category?: NotificationCategory;
  /** Conteúdo específico por canal. */
  content?: ChannelContent;
  /** Metadados livres salvos no log. */
  metadata?: Record<string, unknown>;
  /** Chave de deduplicação: não reenvia se já houve envio com a mesma chave. */
  dedupeKey?: string;
}

export interface ChannelDispatchResult {
  channel: NotificationChannel;
  status: NotificationStatus;
  error?: string | null;
  attempts: number;
}

export interface NotifyResult {
  userId: string;
  delivered: boolean;
  results: ChannelDispatchResult[];
}

export const DEFAULT_PREFERENCES = (
  userId: string,
  churchId: string,
  now: string
): NotificationPreferences => ({
  user_id: userId,
  church_id: churchId,
  pushEnabled: true,
  emailEnabled: true,
  whatsappEnabled: true,
  scheduleNotifications: true,
  eventNotifications: true,
  messageNotifications: true,
  prayerNotifications: true,
  birthdayNotifications: true,
  updated_at: now,
});

/** Mapeia categoria -> flag de preferência. `system` nunca é bloqueada. */
export const CATEGORY_PREF_KEY: Record<
  NotificationCategory,
  keyof NotificationPreferences | null
> = {
  schedule: "scheduleNotifications",
  event: "eventNotifications",
  message: "messageNotifications",
  prayer: "prayerNotifications",
  birthday: "birthdayNotifications",
  system: null,
};

/** Mapeia canal -> flag de preferência. */
export const CHANNEL_PREF_KEY: Record<NotificationChannel, keyof NotificationPreferences> = {
  push: "pushEnabled",
  email: "emailEnabled",
  whatsapp: "whatsappEnabled",
};
