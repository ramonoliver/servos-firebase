import { getFirebaseAdminClient } from "@/lib/firebase-admin";

type ReminderProfile = "engaged" | "intermediate" | "at_risk";

type ScheduleMemberHistory = {
  status: string;
};

export async function getUserReminderProfile(userId: string, churchId: string): Promise<ReminderProfile> {
  // Análise de comportamento é um "nice to have": se qualquer query falhar
  // (ex.: índice composto ausente no Firestore), retornamos o perfil padrão
  // em vez de derrubar o fluxo que chama isso (envio de lembretes).
  try {
    const supabase = getFirebaseAdminClient();
    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - 3);
    const fromDate = threshold.toISOString().split("T")[0];

    const { data: schedules, error: scheduleError } = await supabase
      .from("schedules")
      .select("id")
      .eq("church_id", churchId)
      .gte("date", fromDate);

    if (scheduleError) throw scheduleError;

    const scheduleIds = (schedules || []).map((item: any) => item.id).filter(Boolean);
    if (scheduleIds.length === 0) {
      return "intermediate";
    }

    const { data: history, error: historyError } = await supabase
      .from("schedule_members")
      .select("status")
      .eq("user_id", userId)
      .in("schedule_id", scheduleIds)
      .not("status", "is", "pending");

    if (historyError) throw historyError;

    const rows = (history || []) as ScheduleMemberHistory[];
    if (rows.length === 0) {
      return "intermediate";
    }

    const confirmed = rows.filter((item) => item.status === "confirmed").length;
    const declined = rows.filter((item) => item.status === "declined").length;
    const total = rows.length;
    const rate = total > 0 ? (confirmed / total) * 100 : 0;

    if (declined === 0 && rate >= 90 && confirmed >= 3) {
      return "engaged";
    }

    if (declined >= 2 || rate < 70) {
      return "at_risk";
    }

    return "intermediate";
  } catch (error) {
    console.warn("getUserReminderProfile falhou, usando perfil padrão:", error);
    return "intermediate";
  }
}

export type ReminderStage = "day_before" | "same_day";

export function buildScheduleReminderText(params: {
  profile: ReminderProfile;
  stage: ReminderStage;
  status: "pending" | "confirmed" | "declined";
  departmentName: string;
  time: string;
}) {
  const { profile, stage, status, departmentName, time } = params;
  const eventLabel = `Departamento: ${departmentName}\nHorário: ${time}`;
  const isRisk = profile === "at_risk";

  if (stage === "day_before") {
    if (status === "pending") {
      return {
        title: "Confirma sua presença 👀",
        body: `Precisamos saber se você poderá servir amanhã. ${eventLabel}` + (isRisk ? "\nSua resposta ajuda a equipe a se preparar melhor." : ""),
        type: "reminder" as const,
      };
    }

    return {
      title: "Você está escalado amanhã 🙌",
      body: `Estamos contando com você! ${eventLabel}`,
      type: "reminder" as const,
    };
  }

  return {
    title: "Hoje é dia de servir 🎯",
    body: `Falta pouco! Sua escala começa às ${time}. ${eventLabel}` + (status === "pending" ? "\nAinda não recebemos sua confirmação." : ""),
    type: "reminder" as const,
  };
}
