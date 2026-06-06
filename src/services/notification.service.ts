/**
 * notification.service.ts
 * Camada CENTRAL de notificações. Todo evento do sistema deve passar por aqui.
 * Nenhuma página/rota deve chamar os provedores (push/email/whatsapp) direto.
 *
 * Responsabilidades:
 *  - Carregar usuário e preferências (com defaults).
 *  - Resolver canais respeitando preferências e categoria.
 *  - Deduplicar via dedupeKey.
 *  - Despachar cada canal com retry e tratamento de erro.
 *  - Registrar log em `notifications`.
 */

import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";
import { sendEmail } from "./email.service";
import { sendPushToUser } from "./push.service";
import { sendWhatsapp } from "./whatsapp.service";
import {
  CATEGORY_PREF_KEY,
  CHANNEL_PREF_KEY,
  DEFAULT_PREFERENCES,
  type ChannelDispatchResult,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPreferences,
  type NotifyInput,
  type NotifyResult,
} from "./notification.types";

const ALL_CHANNELS: NotificationChannel[] = ["push", "email", "whatsapp"];

// ── Logs ─────────────────────────────────────────────────────────────────────

function log(scope: string, message: string, extra?: unknown) {
  // Centraliza os logs do módulo (fácil de trocar por um logger estruturado).
  if (extra !== undefined) console.log(`[notifications:${scope}] ${message}`, extra);
  else console.log(`[notifications:${scope}] ${message}`);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      log("retry", `tentativa ${i + 1}/${attempts} falhou`, error instanceof Error ? error.message : error);
    }
  }
  throw lastError;
}

// ── Preferências ──────────────────────────────────────────────────────────────

export async function getPreferences(userId: string, churchId: string): Promise<NotificationPreferences> {
  const supabase = getFirebaseAdminClient();
  const now = new Date().toISOString();
  try {
    const { data } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (data) return { ...DEFAULT_PREFERENCES(userId, churchId, now), ...(data as object) };
  } catch (error) {
    log("prefs", "falha ao ler preferências, usando defaults", error);
  }
  return DEFAULT_PREFERENCES(userId, churchId, now);
}

export async function savePreferences(
  userId: string,
  churchId: string,
  patch: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const supabase = getFirebaseAdminClient();
  const current = await getPreferences(userId, churchId);
  const next: NotificationPreferences = {
    ...current,
    ...patch,
    id: userId, // garante o id do documento
    user_id: userId,
    church_id: churchId,
    updated_at: new Date().toISOString(),
  } as NotificationPreferences & { id: string };
  await supabase.from("notification_preferences").upsert(next, { onConflict: "id" });
  return next;
}

// ── Tokens de dispositivo ─────────────────────────────────────────────────────

export async function registerDeviceToken(input: {
  userId: string;
  churchId: string;
  token: string;
  platform?: string;
}): Promise<void> {
  const supabase = getFirebaseAdminClient();
  // Evita duplicar o mesmo token.
  const { data: existing } = await supabase
    .from("device_tokens")
    .select("id")
    .eq("token", input.token)
    .maybeSingle();
  if (existing) return;
  await supabase.from("device_tokens").insert({
    id: genId(),
    user_id: input.userId,
    church_id: input.churchId,
    token: input.token,
    platform: input.platform || "web",
    created_at: new Date().toISOString(),
  });
}

// ── Núcleo ────────────────────────────────────────────────────────────────────

async function recordLog(entry: {
  churchId: string;
  userId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  title: string;
  message: string;
  status: ChannelDispatchResult["status"];
  error?: string | null;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = getFirebaseAdminClient();
    const now = new Date().toISOString();
    await supabase.from("notifications").insert({
      id: genId(),
      church_id: entry.churchId,
      user_id: entry.userId,
      channel: entry.channel,
      category: entry.category,
      title: entry.title,
      message: entry.message,
      status: entry.status,
      error: entry.error ?? null,
      dedupe_key: entry.dedupeKey ?? null,
      metadata: entry.metadata ?? {},
      sent_at: entry.status === "sent" ? now : null,
      created_at: now,
    });
  } catch (error) {
    log("log", "falha ao registrar notificação", error);
  }
}

async function alreadySent(userId: string, dedupeKey: string): Promise<boolean> {
  try {
    const supabase = getFirebaseAdminClient();
    const { data } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("dedupe_key", dedupeKey)
      .eq("status", "sent")
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

function resolveChannels(
  requested: NotificationChannel[] | undefined,
  category: NotificationCategory,
  prefs: NotificationPreferences
): NotificationChannel[] {
  const base = requested && requested.length ? requested : ALL_CHANNELS;
  const categoryKey = CATEGORY_PREF_KEY[category];
  const categoryAllowed = categoryKey ? Boolean(prefs[categoryKey]) : true;
  if (!categoryAllowed) return [];
  return base.filter((channel) => Boolean(prefs[CHANNEL_PREF_KEY[channel]]));
}

/** Notifica um único usuário pelos canais resolvidos. */
export async function notifyUser(input: NotifyInput): Promise<NotifyResult> {
  const category = input.category || "system";
  const results: ChannelDispatchResult[] = [];

  const supabase = getFirebaseAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, name, email, phone, church_id")
    .eq("id", input.userId)
    .maybeSingle();

  if (!user) {
    return { userId: input.userId, delivered: false, results: [] };
  }

  const prefs = await getPreferences(input.userId, input.churchId);
  const channels = resolveChannels(input.channels, category, prefs);

  if (channels.length === 0) {
    return { userId: input.userId, delivered: false, results: [] };
  }

  // Deduplicação.
  if (input.dedupeKey && (await alreadySent(input.userId, input.dedupeKey))) {
    log("dedupe", `ignorando envio duplicado (${input.dedupeKey}) para ${input.userId}`);
    return { userId: input.userId, delivered: false, results: [] };
  }

  for (const channel of channels) {
    let status: ChannelDispatchResult["status"] = "pending";
    let error: string | null = null;
    let attempts = 0;

    try {
      await withRetry(async () => {
        attempts += 1;
        if (channel === "email") {
          if (!user.email) {
            status = "skipped";
            error = "Usuário sem e-mail.";
            return;
          }
          await sendEmail({
            to: user.email,
            subject: input.content?.emailSubject || input.title,
            html: input.content?.emailHtml || `<p>${input.message}</p>`,
            text: input.message,
          });
          status = "sent";
        } else if (channel === "push") {
          const r = await sendPushToUser(input.userId, {
            title: input.title,
            body: input.message,
            data: input.content?.pushData,
            clickUrl: input.content?.clickUrl,
          });
          status = r.status === "sent" ? "sent" : r.status === "skipped" ? "skipped" : "failed";
          error = r.error || null;
        } else if (channel === "whatsapp") {
          if (!user.phone) {
            status = "skipped";
            error = "Usuário sem telefone.";
            return;
          }
          const r = await sendWhatsapp(user.phone, input.content?.whatsappText || input.message);
          status = r.status;
          error = r.error || null;
          if (status === "failed") throw new Error(error || "Falha no WhatsApp");
        }
      });
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message : "Falha no envio.";
    }

    results.push({ channel, status, error, attempts });
    await recordLog({
      churchId: input.churchId,
      userId: input.userId,
      channel,
      category,
      title: input.title,
      message: input.message,
      status,
      error,
      dedupeKey: input.dedupeKey,
      metadata: input.metadata,
    });
  }

  return {
    userId: input.userId,
    delivered: results.some((r) => r.status === "sent"),
    results,
  };
}

/** Notifica vários usuários (concorrência controlada). */
export async function notifyUsers(
  userIds: string[],
  input: Omit<NotifyInput, "userId">
): Promise<NotifyResult[]> {
  const unique = Array.from(new Set(userIds));
  const out: NotifyResult[] = [];
  const CONCURRENCY = 8;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map((userId) =>
        notifyUser({ ...input, userId }).catch((error) => {
          log("notifyUsers", `falha para ${userId}`, error);
          return { userId, delivered: false, results: [] } as NotifyResult;
        })
      )
    );
    out.push(...settled);
  }
  return out;
}

/** Notifica todos os usuários ativos de uma igreja. */
export async function notifyChurch(
  churchId: string,
  input: Omit<NotifyInput, "userId" | "churchId">
): Promise<NotifyResult[]> {
  const supabase = getFirebaseAdminClient();
  const { data } = await supabase.from("users").select("id, active").eq("church_id", churchId);
  const userIds = ((data || []) as any[]).filter((u) => u.active !== false).map((u) => u.id);
  return notifyUsers(userIds, { ...input, churchId });
}
