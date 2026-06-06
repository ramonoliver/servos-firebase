"use client";

/**
 * fcm-client.ts
 * Suporte a Push no navegador (Firebase Cloud Messaging).
 * - Solicita permissão
 * - Registra o service worker
 * - Obtém/atualiza o token do dispositivo
 * - Salva o token no Firestore via API
 *
 * Requer NEXT_PUBLIC_FIREBASE_VAPID_KEY (chave VAPID do Web Push, obtida no
 * Console do Firebase → Cloud Messaging → Web configuration).
 */

import "@/lib/firebase"; // garante a inicialização do app cliente
import { getApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";

export type PushPermissionResult = {
  ok: boolean;
  token?: string;
  reason?: "unsupported" | "denied" | "no-vapid" | "error";
  message?: string;
};

export async function isPushSupported(): Promise<boolean> {
  try {
    return typeof window !== "undefined" && (await isSupported());
  } catch {
    return false;
  }
}

/**
 * Solicita permissão, registra o service worker, obtém o token FCM e o
 * persiste no backend. Retorna o resultado de forma tipada (sem lançar).
 */
export async function enablePushNotifications(): Promise<PushPermissionResult> {
  try {
    if (!(await isPushSupported())) {
      return { ok: false, reason: "unsupported" };
    }

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      return { ok: false, reason: "no-vapid", message: "Chave VAPID não configurada." };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "denied" };
    }

    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const registration = await navigator.serviceWorker.ready;
    // O service worker do app inicializa o messaging ao receber FCM_INIT.
    registration.active?.postMessage({
      type: "FCM_INIT",
      config: {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      },
    });

    const messaging = getMessaging(getApp());
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return { ok: false, reason: "error", message: "Não foi possível obter o token." };
    }

    await fetch("/api/notifications/register-token", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform: "web" }),
    });

    return { ok: true, token };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message : "Erro ao ativar notificações.",
    };
  }
}

/** Escuta mensagens recebidas com o app aberto (foreground). */
export async function onForegroundMessage(handler: (payload: any) => void): Promise<() => void> {
  if (!(await isPushSupported())) return () => {};
  const messaging = getMessaging(getApp());
  return onMessage(messaging, handler);
}
