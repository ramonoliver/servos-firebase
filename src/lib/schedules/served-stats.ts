// Servos 2.0 — fonte única para "quanto/quando a pessoa serviu".
// Os contadores denormalizados (users.total_schedules / last_served_at) nunca
// foram mantidos (ficavam zerados). Em vez de confiar neles, computamos a
// partir das confirmações reais em escalas que JÁ aconteceram.

type ScheduleLike = { id: string; date: string };
type ScheduleMemberLike = { user_id: string; schedule_id: string; status: string };

export interface ServedStats {
  /** user_id → nº de vezes que serviu (confirmado em escala passada). */
  count: Map<string, number>;
  /** user_id → data (YYYY-MM-DD) da última vez que serviu. */
  last: Map<string, string>;
}

export function computeServedStats(
  scheduleMembers: ScheduleMemberLike[],
  schedules: ScheduleLike[],
  todayIso: string
): ServedStats {
  const dateById = new Map(schedules.map((s) => [s.id, s.date]));
  const count = new Map<string, number>();
  const last = new Map<string, string>();

  for (const sm of scheduleMembers) {
    if (sm.status !== "confirmed") continue;
    const date = dateById.get(sm.schedule_id);
    if (!date || date > todayIso) continue; // só conta o que já aconteceu
    count.set(sm.user_id, (count.get(sm.user_id) || 0) + 1);
    const current = last.get(sm.user_id);
    if (!current || date > current) last.set(sm.user_id, date);
  }

  return { count, last };
}

/** Conveniência para uma única pessoa (página de perfil). */
export function servedStatsForUser(
  userId: string,
  scheduleMembers: ScheduleMemberLike[],
  schedules: ScheduleLike[],
  todayIso: string
): { count: number; last: string | null } {
  const stats = computeServedStats(
    scheduleMembers.filter((sm) => sm.user_id === userId),
    schedules,
    todayIso
  );
  return { count: stats.count.get(userId) || 0, last: stats.last.get(userId) || null };
}
