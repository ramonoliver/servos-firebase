import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

// Servos 2.0 — Enquetes: registrar/atualizar o voto do usuário (1 por enquete).
const bodySchema = z.object({
  pollId: z.string().min(1),
  optionIndex: z.number().int().min(0).max(7),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Voto inválido." }, { status: 400 });
    }
    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;
    if (!actor?.active) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const churchId = session!.church_id;
    const userId = session!.user_id;
    const { pollId, optionIndex } = parsed.data;
    const supabase = getFirebaseAdminClient();

    const { data: poll } = await supabase
      .from("polls")
      .select("status, options")
      .eq("id", pollId)
      .eq("church_id", churchId)
      .maybeSingle();
    if (!poll) return NextResponse.json({ error: "Enquete não encontrada." }, { status: 404 });
    if ((poll as { status?: string }).status !== "open") {
      return NextResponse.json({ error: "Esta enquete está encerrada." }, { status: 400 });
    }
    const options = ((poll as { options?: string[] }).options || []) as string[];
    if (optionIndex >= options.length) {
      return NextResponse.json({ error: "Opção inválida." }, { status: 400 });
    }

    // 1 voto por usuário por enquete: id determinístico → upsert sobrescreve.
    const { error } = await supabase.from("poll_votes").upsert(
      {
        id: `${pollId}__${userId}`,
        poll_id: pollId,
        user_id: userId,
        option_index: optionIndex,
        created_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API polls/vote error:", error);
    return NextResponse.json({ error: "Falha ao registrar voto." }, { status: 500 });
  }
}
