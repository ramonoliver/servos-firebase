import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";
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

const FCM_API_URL = "https://fcm.googleapis.com/fcm/send";
const FCM_KEY = process.env.FCM_SERVER_KEY;

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
  if (!FCM_KEY || tokens.length === 0) {
    return { sent: 0, failedTokens: [] as Array<{ token: string; reason: string }> };
  }

  const batch = tokens.slice(0, 100);
  const body = {
    registration_ids: batch,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      click_action: payload.actionUrl,
      type: payload.type,
      title: payload.title,
      body: payload.body,
    },
    webpush: {
      fcm_options: {
        link: payload.actionUrl,
      },
    },
    android: {
      priority: "high",
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  };

  try {
    const response = await fetch(FCM_API_URL, {
      method: "POST",
      headers: {
        Authorization: `key=${FCM_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return {
        sent: 0,
        failedTokens: batch.map((token) => ({ token, reason: "request_failed" })),
      };
    }

    const result = (await response.json()) as any;
    const failedTokens: Array<{ token: string; reason: string }> = [];
    if (Array.isArray(result.results)) {
      result.results.forEach((item: any, index: number) => {
        if (item?.error) {
          const candidate = batch[index];
          if (candidate) {
            failedTokens.push({ token: candidate, reason: item.error });
          }
        }
      });
    }

    return { sent: batch.length - failedTokens.length, failedTokens };
  } catch (error) {
    return {
      sent: 0,
      failedTokens: batch.map((token) => ({ token, reason: "network_error" })),
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
    const permanentErrorCodes = new Set([
      "InvalidRegistration",
      "NotRegistered",
      "MismatchSenderId",
      "registration-token-not-registered",
      "invalid-registration-token",
    ]);
    const tokensToDisable = failedTokens
      .filter((item) => permanentErrorCodes.has(item.reason))
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
