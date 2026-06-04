import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

type BadgeDefinition = {
  key: string;
  name: string;
  description: string;
  icon: string;
};

const DEFAULT_BADGES: BadgeDefinition[] = [
  {
    key: "first_serve",
    name: "Primeiro Servir",
    description: "Confirmou sua primeira escala e deu o primeiro passo para ajudar.",
    icon: "star",
  },
  {
    key: "constante",
    name: "Constante",
    description: "Confirmou 4 escalas neste mês e mantém a consistência.",
    icon: "repeat",
  },
  {
    key: "disponivel",
    name: "Disponível",
    description: "Aceitou substituir alguém e manteve o time completo.",
    icon: "handshake",
  },
  {
    key: "comprometido",
    name: "Comprometido",
    description: "Três meses sem faltar e mostrando comprometimento real.",
    icon: "shield-check",
  },
];

export async function addPoints(params: {
  userId: string;
  churchId: string;
  scheduleId?: string | null;
  reason: string;
  points: number;
}) {
  const { userId, churchId, scheduleId = null, reason, points } = params;
  const supabase = getFirebaseAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from("points_history").insert({
    id: genId(),
    user_id: userId,
    church_id: churchId,
    schedule_id: scheduleId,
    reason,
    points,
    created_at: now,
  });

  if (error) throw error;
  return points;
}

export async function awardConfirmationPoints(userId: string, churchId: string, scheduleId: string) {
  return addPoints({
    userId,
    churchId,
    scheduleId,
    reason: "confirm_presence",
    points: 5,
  });
}

export async function awardSubstitutionPoints(userId: string, churchId: string, scheduleId: string) {
  return addPoints({
    userId,
    churchId,
    scheduleId,
    reason: "substitution",
    points: 15,
  });
}

export async function awardServicePoints(userId: string, churchId: string, scheduleId: string) {
  return addPoints({
    userId,
    churchId,
    scheduleId,
    reason: "served",
    points: 10,
  });
}

export async function awardNoAbsenceBonus(userId: string, churchId: string, month: string) {
  return addPoints({
    userId,
    churchId,
    scheduleId: null,
    reason: `no_absence_${month}`,
    points: 50,
  });
}

async function ensureBadges(churchId: string) {
  const supabase = getFirebaseAdminClient();
  const { data, error } = await supabase
    .from("badges")
    .select("key")
    .eq("church_id", churchId);

  if (error) throw error;
  const existingKeys = new Set(((data || []) as Array<{ key: string }>).map((item) => item.key));

  const missingBadges = DEFAULT_BADGES.filter((badge) => !existingKeys.has(badge.key));
  if (missingBadges.length === 0) return;

  const now = new Date().toISOString();
  const inserts = missingBadges.map((badge) => ({
    id: genId(),
    church_id: churchId,
    key: badge.key,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    created_at: now,
  }));

  const { error: insertError } = await supabase.from("badges").insert(inserts);
  if (insertError) throw insertError;
}

export async function evaluateBadgesForUser(userId: string, churchId: string) {
  await ensureBadges(churchId);

  const supabase = getFirebaseAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const [currentMonthSchedules, recentScheduleIds, userBadgesResult, badgeListResult] = await Promise.all([
    supabase
      .from("schedules")
      .select("id")
      .eq("church_id", churchId)
      .gte("date", monthStart.toISOString().split("T")[0]),
    supabase
      .from("schedules")
      .select("id")
      .eq("church_id", churchId)
      .gte("date", threeMonthsAgo.toISOString().split("T")[0]),
    supabase
      .from("user_badges")
      .select("badge_id")
      .eq("church_id", churchId)
      .eq("user_id", userId),
    supabase
      .from("badges")
      .select("id, key, name, description, icon")
      .eq("church_id", churchId),
  ]);

  if (currentMonthSchedules.error) throw currentMonthSchedules.error;
  if (recentScheduleIds.error) throw recentScheduleIds.error;
  if (userBadgesResult.error) throw userBadgesResult.error;
  if (badgeListResult.error) throw badgeListResult.error;

  const currentMonthIds = ((currentMonthSchedules.data || []) as Array<{ id: string }>).map((item) => item.id);
  const recentIds = ((recentScheduleIds.data || []) as Array<{ id: string }>).map((item) => item.id);

  const [currentMonthMembers, recentMembers] = await Promise.all([
    currentMonthIds.length
      ? supabase
          .from("schedule_members")
          .select("status, substitute_id")
          .eq("user_id", userId)
          .in("schedule_id", currentMonthIds)
      : { data: [], error: null },
    recentIds.length
      ? supabase
          .from("schedule_members")
          .select("status, substitute_id")
          .eq("user_id", userId)
          .in("schedule_id", recentIds)
      : { data: [], error: null },
  ]);

  if (currentMonthMembers.error) throw currentMonthMembers.error;
  if (recentMembers.error) throw recentMembers.error;

  const currentConfirmed = ((currentMonthMembers.data || []) as Array<{ status: string }>).filter((item) => item.status === "confirmed").length;
  const recentConfirmed = ((recentMembers.data || []) as Array<{ status: string }>).filter((item) => item.status === "confirmed").length;
  const recentDeclined = ((recentMembers.data || []) as Array<{ status: string }>).filter((item) => item.status === "declined").length;
  const substitutionAccepted = ((currentMonthMembers.data || []) as Array<{ substitute_id: string | null }>).filter((item) => item.substitute_id).length;

  const earnedBadgeIds = new Set(((userBadgesResult.data || []) as Array<{ badge_id: string }>).map((item) => item.badge_id));
  const badges = (badgeListResult.data || []) as Array<{ id: string; key: string; name: string; description: string; icon: string }>;

  const unlocked: Array<{ id: string; key: string; name: string; description: string; icon: string }> = [];

  const badgeByKey = Object.fromEntries(badges.map((badge) => [badge.key, badge]));

  const shouldUnlock = (key: string) => {
    const badge = badgeByKey[key];
    return badge && !earnedBadgeIds.has(badge.id);
  };

  if (currentConfirmed >= 1 && shouldUnlock("first_serve") && badgeByKey["first_serve"]) {
    unlocked.push(badgeByKey["first_serve"]);
  }

  if (currentConfirmed >= 4 && shouldUnlock("constante") && badgeByKey["constante"]) {
    unlocked.push(badgeByKey["constante"]);
  }

  if (substitutionAccepted >= 1 && shouldUnlock("disponivel") && badgeByKey["disponivel"]) {
    unlocked.push(badgeByKey["disponivel"]);
  }

  if (recentConfirmed >= 3 && recentDeclined === 0 && shouldUnlock("comprometido") && badgeByKey["comprometido"]) {
    unlocked.push(badgeByKey["comprometido"]);
  }

  if (unlocked.length === 0) {
    return [];
  }

  const nowIso = new Date().toISOString();
  const inserts = unlocked.map((badge) => ({
    id: genId(),
    badge_id: badge.id,
    church_id: churchId,
    user_id: userId,
    unlocked_at: nowIso,
  }));

  const { error: insertError } = await supabase.from("user_badges").insert(inserts);
  if (insertError) throw insertError;

  return unlocked;
}
