import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

// Servos 2.0 — Enquetes. Criar/fechar/reabrir/excluir uma enquete (church-wide).
const bodySchema = z.object({
  mode: z.enum(["create", "close", "reopen", "delete"]),
  pollId: z.string().optional(),
  question: z.string().min(1).max(200).optional(),
  options: z.array(z.string().min(1).max(120)).min(2).max(8).optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para a enquete." }, { status: 400 });
    }
    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;
    if (!actor?.active) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const churchId = session!.church_id;
    const supabase = getFirebaseAdminClient();
    const { mode, pollId, question, options } = parsed.data;

    if (mode === "create") {
      if (!can(actor, "message.send")) {
        return NextResponse.json({ error: "Sem permissão para criar enquetes." }, { status: 403 });
      }
      if (!question || !options || options.length < 2) {
        return NextResponse.json({ error: "Informe a pergunta e ao menos 2 opções." }, { status: 400 });
      }
      const id = genId();
      const { error } = await supabase.from("polls").insert({
        id,
        church_id: churchId,
        author_id: session!.user_id,
        question,
        options,
        status: "open",
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      return NextResponse.json({ success: true, id });
    }

    if (!pollId) return NextResponse.json({ error: "Enquete não informada." }, { status: 400 });
    const { data: poll } = await supabase
      .from("polls")
      .select("author_id")
      .eq("id", pollId)
      .eq("church_id", churchId)
      .maybeSingle();
    if (!poll) return NextResponse.json({ error: "Enquete não encontrada." }, { status: 404 });

    const isOwnerOrAdmin =
      (poll as { author_id?: string }).author_id === session!.user_id ||
      actor.role === "admin" ||
      actor.cell_role === "pastor" ||
      actor.cell_role === "coordenacao";
    if (!isOwnerOrAdmin) {
      return NextResponse.json({ error: "Sem permissão para alterar esta enquete." }, { status: 403 });
    }

    if (mode === "delete") {
      await supabase.from("poll_votes").delete().eq("poll_id", pollId);
      const { error } = await supabase.from("polls").delete().eq("id", pollId).eq("church_id", churchId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase
      .from("polls")
      .update({ status: mode === "close" ? "closed" : "open" })
      .eq("id", pollId)
      .eq("church_id", churchId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API polls/manage error:", error);
    const message =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Falha ao salvar enquete.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
