/**
 * push.service.ts
 * Canal de Push (Firebase Cloud Messaging). Server-side.
 * Lê os tokens da coleção `deviceTokens` e envia via firebase-admin.
 * Tokens inválidos são removidos automaticamente.
 */

import { getMessaging } from "firebase-admin/messaging";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  clickUrl?: string;
}

export interface PushResult {
  status: "sent" | "skipped" | "failed";
  successCount: number;
  failureCount: number;
  error?: string | null;
}

async function getTokensForUsers(userIds: string[]): Promise<{ token: string; id: string }[]> {
  if (userIds.length === 0) return [];
  const supabase = getFirebaseAdminClient();
  const tokens: { token: string; id: string }[] = [];
  // O adaptador limita `in` a 30 itens — particiona.
  for (let i = 0; i < userIds.length; i += 30) {
    const slice = userIds.slice(i, i + 30);
    const { data } = await supabase.from("device_tokens").select("*").in("user_id", slice);
    for (const row of (data || []) as any[]) {
      if (row.token) tokens.push({ token: row.token, id: row.id });
    }
  }
  return tokens;
}

async function dispatch(tokenRows: { token: string; id: string }[], payload: PushPayload): Promise<PushResult> {
  if (tokenRows.length === 0) {
    return { status: "skipped", successCount: 0, failureCount: 0, error: "Sem tokens de dispositivo." };
  }

  const messaging = getMessaging();
  const data: Record<string, string> = { ...(payload.data || {}) };
  if (payload.clickUrl) data.url = payload.clickUrl;

  let successCount = 0;
  let failureCount = 0;
  const invalidTokenIds: string[] = [];

  // sendEachForMulticast aceita até 500 tokens por chamada.
  for (let i = 0; i < tokenRows.length; i += 500) {
    const batch = tokenRows.slice(i, i + 500);
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map((t) => t.token),
      notification: { title: payload.title, body: payload.body },
      data,
      webpush: payload.clickUrl
        ? { fcmOptions: { link: payload.clickUrl } }
        : undefined,
    });
    successCount += response.successCount;
    failureCount += response.failureCount;
    response.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code || "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          invalidTokenIds.push(batch[idx].id);
        }
      }
    });
  }

  // Limpa tokens inválidos.
  if (invalidTokenIds.length > 0) {
    const supabase = getFirebaseAdminClient();
    for (const id of invalidTokenIds) {
      await supabase.from("device_tokens").delete().eq("id", id);
    }
  }

  return {
    status: successCount > 0 ? "sent" : "failed",
    successCount,
    failureCount,
    error: successCount > 0 ? null : "Nenhum push entregue.",
  };
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  const tokens = await getTokensForUsers([userId]);
  return dispatch(tokens, payload);
}

export async function sendPushToManyUsers(userIds: string[], payload: PushPayload): Promise<PushResult> {
  const tokens = await getTokensForUsers(userIds);
  return dispatch(tokens, payload);
}

export async function sendPushToChurch(churchId: string, payload: PushPayload): Promise<PushResult> {
  const supabase = getFirebaseAdminClient();
  const { data } = await supabase.from("device_tokens").select("*").eq("church_id", churchId);
  const tokens = ((data || []) as any[]).filter((r) => r.token).map((r) => ({ token: r.token, id: r.id }));
  return dispatch(tokens, payload);
}
