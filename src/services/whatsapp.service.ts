/**
 * whatsapp.service.ts
 * Canal de WhatsApp via Evolution API. Server-side.
 *
 * Configuração por ambiente:
 *   EVOLUTION_API_URL=  (ex.: https://evo.suaempresa.com)
 *   EVOLUTION_API_KEY=  (apikey global da instância)
 *   EVOLUTION_INSTANCE= (nome da instância conectada)
 *
 * Se as variáveis não estiverem definidas, o envio é "skipped" (sem erro),
 * permitindo que o canal seja ligado/desligado por ambiente.
 */

import { normalizePhoneForSms } from "@/lib/invitations";

export interface WhatsappResult {
  status: "sent" | "skipped" | "failed";
  error?: string | null;
}

function getConfig() {
  const url = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!url || !apiKey || !instance) return null;
  return { url: url.replace(/\/+$/, ""), apiKey, instance };
}

export async function sendWhatsapp(phone: string, message: string): Promise<WhatsappResult> {
  const config = getConfig();
  if (!config) {
    return { status: "skipped", error: "WhatsApp não configurado (EVOLUTION_API_*)." };
  }

  const number = normalizePhoneForSms(phone);
  if (!number) {
    return { status: "skipped", error: "Membro sem telefone para WhatsApp." };
  }

  try {
    const response = await fetch(`${config.url}/message/sendText/${config.instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.apiKey,
      },
      body: JSON.stringify({ number, text: message }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return { status: "failed", error: errorText || `Evolution API ${response.status}` };
    }
    return { status: "sent", error: null };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "Falha no WhatsApp." };
  }
}

export async function sendWhatsappToMany(
  phones: string[],
  message: string
): Promise<{ status: "sent" | "skipped" | "failed"; results: WhatsappResult[] }> {
  if (!getConfig()) {
    return { status: "skipped", results: [] };
  }
  const results: WhatsappResult[] = [];
  for (const phone of phones) {
    results.push(await sendWhatsapp(phone, message));
  }
  const anySent = results.some((r) => r.status === "sent");
  return { status: anySent ? "sent" : "failed", results };
}

// ── Templates de WhatsApp ────────────────────────────────────────────────────

export const whatsappTemplates = {
  scheduleCreated: (ministerio: string, data: string) =>
    `Você foi escalado para servir em ${ministerio} no dia ${data}.`,
  scheduleUpdated: () => "Sua escala foi atualizada.",
  eventCreated: () => "Novo evento disponível.",
  prayerRequest: () => "Você recebeu um novo pedido de oração.",
};
