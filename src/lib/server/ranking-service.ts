import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

type RankingRow = {
  user_id: string;
  points: number;
  services: number;
  absences: number;
};

type RankingItem = RankingRow & {
  rank: number;
  name: string;
  avatar_color: string;
  photo_url: string | null;
  movement: number | null;
};

type RankingStoredRow = {
  user_id: string;
  points: number;
  services: number;
  absences: number;
  rank: number;
};

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 1);
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

async function gatherRankingData(churchId: string, month: string, departmentId?: string) {
  const supabase = getFirebaseAdminClient();
  const { start, end } = monthRange(month);

  const scheduleQuery = supabase.from("schedules").select("id").eq("church_id", churchId).gte("date", start).lt("date", end);
  if (departmentId) scheduleQuery.eq("department_id", departmentId);
  const { data: schedules, error: scheduleError } = await scheduleQuery;
  if (scheduleError) throw scheduleError;

  const scheduleIds = ((schedules || []) as Array<{ id: string }>).map((item) => item.id);

  // Get points data (may not exist)
  let pointRows: Array<{ user_id: string; points: number }> = [];
  try {
    const { data, error } = await supabase
      .from("points_history")
      .select("user_id, points")
      .eq("church_id", churchId)
      .gte("created_at", start)
      .lt("created_at", end);
    if (!error) {
      pointRows = data || [];
    }
  } catch (error: any) {
    // Table may not exist, continue with empty points
    console.log("Tabela points_history não disponível:", error.message);
  }

  // Get member status data
  const { data: memberData, error: membersError } = scheduleIds.length
    ? await supabase
        .from("schedule_members")
        .select("user_id, status")
        .in("schedule_id", scheduleIds)
    : { data: [], error: null };

  if (membersError) throw membersError;
  const memberRows = (memberData || []) as Array<{ user_id: string; status: string }>;

  const map = new Map<string, RankingRow>();
  pointRows.forEach((item) => {
    const current = map.get(item.user_id) || { user_id: item.user_id, points: 0, services: 0, absences: 0 };
    current.points += item.points || 0;
    map.set(item.user_id, current);
  });

  memberRows.forEach((item) => {
    const current = map.get(item.user_id) || { user_id: item.user_id, points: 0, services: 0, absences: 0 };
    if (item.status === "confirmed") {
      current.services += 1;
    }
    if (item.status === "declined") {
      current.absences += 1;
    }
    map.set(item.user_id, current);
  });

  return Array.from(map.values());
}

async function buildRanking(churchId: string, month: string, departmentId?: string) {
  const supabase = getFirebaseAdminClient();
  const rows = await gatherRankingData(churchId, month, departmentId);
  const userIds = rows.map((item) => item.user_id);
  if (userIds.length === 0) {
    return [] as RankingItem[];
  }

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, name, avatar_color, photo_url")
    .in("id", userIds);
  if (usersError) throw usersError;

  const userMap = new Map<string, any>((users || []).map((user: any) => [user.id, user]));

  const sorted = rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.services !== a.services) return b.services - a.services;
    return a.absences - b.absences;
  });

  return sorted.map((item, index) => {
    const user = userMap.get(item.user_id) || { name: "Usuário", avatar_color: "#777", photo_url: null };
    return {
      ...item,
      rank: index + 1,
      movement: null,
      name: user.name,
      avatar_color: user.avatar_color,
      photo_url: user.photo_url,
    };
  });
}

async function readStoredRanking(churchId: string, month: string) {
  const supabase = getFirebaseAdminClient();
  const { data, error } = await supabase
    .from("monthly_rankings")
    .select("user_id, points, services, absences, rank")
    .eq("church_id", churchId)
    .eq("month", month)
    .order("rank", { ascending: true });

  // If table doesn't exist, return empty array to trigger live calculation
  if (error && error.code === 'PGRST205' && error.message.includes("Could not find the table")) {
    console.log("Tabela monthly_rankings não existe ainda, calculando ranking ao vivo");
    return [] as RankingStoredRow[];
  }

  if (error) throw error;
  return (data || []) as RankingStoredRow[];
}

async function attachUserProfile(rows: RankingStoredRow[]) {
  if (rows.length === 0) return [] as RankingItem[];
  const supabase = getFirebaseAdminClient();
  const userIds = rows.map((item) => item.user_id);
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, name, avatar_color, photo_url")
    .in("id", userIds);
  if (usersError) throw usersError;
  const userMap = new Map<string, any>((users || []).map((user: any) => [user.id, user]));
  return rows.map((item) => {
    const user = userMap.get(item.user_id) || { name: "Usuário", avatar_color: "#777", photo_url: null };
    return {
      ...item,
      name: user.name,
      avatar_color: user.avatar_color,
      photo_url: user.photo_url,
      movement: null,
    };
  });
}

export async function getMonthlyRanking(churchId: string, month: string, departmentId?: string) {
  const current =
    departmentId
      ? await buildRanking(churchId, month, departmentId)
      : await (async () => {
          const stored = await readStoredRanking(churchId, month);
          if (stored.length > 0) return attachUserProfile(stored);
          return buildRanking(churchId, month);
        })();
  const previousDate = new Date(month + "-01");
  previousDate.setMonth(previousDate.getMonth() - 1);
  const previousMonth = `${previousDate.getFullYear().toString().padStart(4, "0")}-${(previousDate.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;

  const previous =
    departmentId
      ? await buildRanking(churchId, previousMonth, departmentId)
      : await (async () => {
          const stored = await readStoredRanking(churchId, previousMonth);
          if (stored.length > 0) return attachUserProfile(stored);
          return buildRanking(churchId, previousMonth);
        })();
  const previousRank = new Map(previous.map((item) => [item.user_id, item.rank]));

  return current.map((item) => ({
    ...item,
    movement: previousRank.has(item.user_id) ? previousRank.get(item.user_id)! - item.rank : null,
  }));
}

export async function refreshMonthlyRanking(churchId: string, month: string, departmentId?: string) {
  const supabase = getFirebaseAdminClient();
  const rows = await getMonthlyRanking(churchId, month, departmentId);
  if (rows.length === 0) {
    try {
      await supabase.from("monthly_rankings").delete().eq("church_id", churchId).eq("month", month);
    } catch (error: any) {
      // If table doesn't exist, just skip caching
      if (error.code === 'PGRST205' && error.message.includes("Could not find the table")) {
        console.log("Tabela monthly_rankings não existe, pulando cache");
        return rows;
      }
      throw error;
    }
    return rows;
  }

  try {
    await supabase.from("monthly_rankings").delete().eq("church_id", churchId).eq("month", month);
    const now = new Date().toISOString();
    const inserts = rows.map((item) => ({
      id: genId(),
      church_id: churchId,
      month,
      user_id: item.user_id,
      points: item.points,
      services: item.services,
      absences: item.absences,
      rank: item.rank,
      created_at: now,
    }));

    const { error } = await supabase.from("monthly_rankings").insert(inserts);
    if (error) throw error;
  } catch (error: any) {
    // If table doesn't exist, just skip caching
    if (error.code === 'PGRST205' && error.message.includes("Could not find the table")) {
      console.log("Tabela monthly_rankings não existe, pulando cache");
      return rows;
    }
    throw error;
  }
  return rows;
}
