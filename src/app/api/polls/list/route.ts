import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

// Servos 2.0 — Enquetes: lista enquetes da igreja + apuração + voto do usuário.
export async function POST(req: Request) {
  try {
    const { session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const userId = session!.user_id;
    const supabase = getFirebaseAdminClient();

    const { data: pollsData, error } = await supabase
      .from("polls")
      .select("*")
      .eq("church_id", churchId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const polls = (pollsData || []) as Array<{ id: string; options: string[] }>;
    const pollIds = polls.map((p) => p.id);

    const { data: votesData } = pollIds.length
      ? await supabase.from("poll_votes").select("poll_id, user_id, option_index").in("poll_id", pollIds)
      : { data: [] as Array<{ poll_id: string; user_id: string; option_index: number }> };
    const votes = (votesData || []) as Array<{ poll_id: string; user_id: string; option_index: number }>;

    const tallies: Record<string, number[]> = {};
    const myVotes: Record<string, number> = {};
    polls.forEach((p) => {
      tallies[p.id] = new Array((p.options || []).length).fill(0);
    });
    votes.forEach((v) => {
      if (tallies[v.poll_id] && typeof v.option_index === "number" && v.option_index < tallies[v.poll_id].length) {
        tallies[v.poll_id][v.option_index] += 1;
      }
      if (v.user_id === userId) myVotes[v.poll_id] = v.option_index;
    });

    return NextResponse.json({ polls, tallies, myVotes });
  } catch (error) {
    console.error("API polls/list error:", error);
    return NextResponse.json({ error: "Falha ao carregar enquetes." }, { status: 500 });
  }
}
