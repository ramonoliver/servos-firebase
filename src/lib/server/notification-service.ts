import { getMessaging } from "firebase-admin/messaging";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";
import { getPreferences } from "@/services/notification.service";
import type { NotificationType } from "@/types";

type NotificationPayload = {
  title: string;
  body: string;
  actionUrl: string;
  type: NotificationType;
};

type PushTokenRecord = {
  id: string;
  token: string;
  active: boolean;
};

function mapNotificationIcon(type: NotificationType) {
  switch (type) {
    case "confirmation":
      return "check-circle";
    case "reminder":
      return "bell";
    case "badge":
      return "award";
    case "points":
      return "star";
    case "alert":
      return "alert-circle";
    case "welcome":
      return "smile";
    case "substitution":
      return "refresh-cw";
    default:
      return "message-circle";
  }
}

async function sendFirebasePush(tokens: string[], payload: NotificationPayload) {
  if (tokens.length === 0) {
    return { sent: 0, failedTokens: [] as Array<{ token: string; reason: string }> };
  }

  // FCM moderno via firebase-admin (usa a conta de serviço do App Hosting).
  // A API HTTP legada (fcm.googleapis.com/fcm/send) foi desativada pelo Google.
  const batch = tokens.slice(0, 500);
  try {
    const response = await getMessaging().sendEachForMulticast({
      tokens: batch,
      notification: { title: payload.title, body: payload.body },
      data: {
        click_action: payload.actionUrl,
        url: payload.actionUrl,
        type: String(payload.type),
        title: payload.title,
        body: payload.body,
      },
      webpush: { fcmOptions: { link: payload.actionUrl } },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    });

    const failedTokens: Array<{ token: string; reason: string }> = [];
    response.responses.forEach((item, index) => {
      if (!item.success) {
        failedTokens.push({ token: batch[index], reason: item.error?.code || "send_error" });
      }
    });

    return { sent: response.successCount, failedTokens };
  } catch (error) {
    console.error("Falha ao enviar push (firebase-admin):", error);
    return {
      sent: 0,
      failedTokens: batch.map((token) => ({ token, reason: "send_error" })),
    };
  }
}

export async function registerPushToken(params: {
  userId: string;
  churchId: string;
  token: string;
  platform: string;
  deviceName?: string | null;
}) {
  const { userId, churchId, token, platform, deviceName } = params;
  const supabase = getFirebaseAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from("push_tokens").upsert(
    {
      id: genId(),
      user_id: userId,
      church_id: churchId,
      token,
      platform,
      device_name: deviceName || null,
      active: true,
      updated_at: now,
      created_at: now,
    },
    { onConflict: "token" }
  );

  if (error) throw error;
}

export async function sendUserNotification(params: {
  userId: string;
  churchId: string;
  title: string;
  body: string;
  actionUrl: string;
  type: NotificationType;
}) {
  const { userId, churchId, title, body, actionUrl, type } = params;
  const supabase = getFirebaseAdminClient();
  const now = new Date().toISOString();

  const { error: notificationError } = await supabase.from("notifications").insert({
    id: genId(),
    user_id: userId,
    church_id: churchId,
    title,
    body,
    icon: mapNotificationIcon(type),
    type,
    read: false,
    action_url: actionUrl,
    created_at: now,
  });

  if (notificationError) throw notificationError;

  // Respeita a preferência de push do usuário (central de notificações).
  // O aviso in-app (sininho) acima é sempre gravado; só o push é opcional.
  try {
    const prefs = await getPreferences(userId, churchId);
    if (!prefs.pushEnabled) {
      return { pushSent: 0, pushFailed: 0 };
    }
  } catch {
    // Se não conseguir ler preferências, segue enviando o push (default).
  }

  const { data: tokens, error: tokenError } = await supabase
    .from("push_tokens")
    .select("token, active")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("church_id", churchId)
    .limit(100);

  if (tokenError) throw tokenError;
  const activeTokens = ((tokens || []) as Array<PushTokenRecord>).map((token) => token.token);
  if (activeTokens.length === 0) {
    return { pushSent: 0, pushFailed: 0 };
  }

  const { sent, failedTokens } = await sendFirebasePush(activeTokens, { title, body, actionUrl, type });

  if (failedTokens.length > 0) {
    const tokensToDisable = failedTokens
      .filter((item) =>
        /registration-token-not-registered|invalid-registration-token|invalid-argument|InvalidRegistration|NotRegistered|MismatchSenderId/i.test(
          item.reason
        )
      )
      .map((item) => item.token);
    if (tokensToDisable.length > 0) {
    await supabase
      .from("push_tokens")
      .update({ active: false, updated_at: now })
      .in("token", tokensToDisable);
    }
  }

  return { pushSent: sent, pushFailed: failedTokens.length };
}

export async function sendUsersNotification(params: {
  userIds: string[];
  churchId: string;
  title: string;
  body: string;
  actionUrl: string;
  type: NotificationType;
}) {
  const { userIds, churchId, title, body, actionUrl, type } = params;
  const results = await Promise.all(
    userIds.map((userId) =>
      sendUserNotification({
        userId,
        churchId,
        title,
        body,
        actionUrl,
        type,
      }).catch((error) => {
        console.error("sendUsersNotification error", error);
        return { pushSent: 0, pushFailed: 0 };
      })
    )
  );

  return results.reduce(
    (acc, item) => ({
      pushSent: acc.pushSent + item.pushSent,
      pushFailed: acc.pushFailed + item.pushFailed,
    }),
    { pushSent: 0, pushFailed: 0 }
  );
}
