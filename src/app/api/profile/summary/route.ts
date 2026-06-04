import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { actor, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;
    if (!actor) {
      return NextResponse.json({ error: "Usuario nao autenticado." }, { status: 401 });
    }

    const supabase = getFirebaseAdminClient();
    const month = new Date().toISOString().slice(0, 7);
    const monthStart = `${month}-01`;
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = nextMonth.toISOString().split("T")[0];

    const [pointsResult, badgesResult, tokenResult] = await Promise.all([
      supabase
        .from("points_history")
        .select("points")
        .eq("church_id", actor.church_id)
        .eq("user_id", actor.id)
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd),
      supabase
        .from("user_badges")
        .select(`badge_id, unlocked_at, badges(name, description, icon)`)
        .eq("church_id", actor.church_id)
        .eq("user_id", actor.id),
      supabase
        .from("push_tokens")
        .select("id", { count: "exact", head: true })
        .eq("church_id", actor.church_id)
        .eq("user_id", actor.id)
        .eq("active", true),
    ]);

    if (pointsResult.error) throw pointsResult.error;
    if (badgesResult.error) throw badgesResult.error;
    if (tokenResult.error) throw tokenResult.error;

    const monthPoints = ((pointsResult.data || []) as Array<{ points: number }>).reduce(
      (sum, item) => sum + (item.points || 0),
      0
    );

    const badges = ((badgesResult.data || []) as Array<any>).map((row) => ({
      id: row.badge_id,
      name: row.badges?.name || "",
      description: row.badges?.description || "",
      icon: row.badges?.icon || "star",
      unlockedAt: row.unlocked_at,
    }));

    return NextResponse.json({
      success: true,
      profile: {
        monthPoints,
        badges,
        pushEnabled: (tokenResult.count || 0) > 0,
      },
    });
  } catch (error) {
    console.error("API profile/summary error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao buscar resumo do perfil." },
      { status: 500 }
    );
  }
}
