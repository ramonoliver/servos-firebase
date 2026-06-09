import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { sendUsersNotification } from "@/lib/server/notification-service";
import { genId } from "@/lib/utils/helpers";

// Servos 2.0 — Pedido de oração do PRÓPRIO usuário. Diferente de /api/care/manage
// (que é cuidado registrado pela liderança e bloqueia membros), aqui qualquer
// pessoa ativa pode registrar um pedido para si — e os líderes da sua célula
// são notificados.
const bodySchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Escreva o seu pedido de oração." }, { status: 400 });
    }
    const { actor, session, errorResponse } = await requireApiActor(req, {
      select: "id, name, cell_id, church_id, active",
    });
    if (errorResponse) return errorResponse;
    if (!actor?.active) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const churchId = session!.church_id;
    const userId = session!.user_id;
    const supabase = getFirebaseAdminClient();
    const now = new Date().toISOString();

    const id = genId();
    const { error } = await supabase.from("pastoral_notes").insert({
      id,
      church_id: churchId,
      person_id: userId,
      author_id: userId,
      type: "prayer",
      title: parsed.data.title,
      description: parsed.data.description || "",
      date: now.slice(0, 10),
      status: "todo",
      created_at: now,
    });
    if (error) throw error;

    // Notifica os líderes da célula do solicitante (se houver).
    const cellId = (actor as { cell_id?: string | null }).cell_id;
    const name = (actor as { name?: string }).name || "Alguém";
    if (cellId) {
      const { data: cell } = await supabase
        .from("cells")
        .select("leader_ids, co_leader_ids")
        .eq("id", cellId)
        .eq("church_id", churchId)
        .maybeSingle();
      const c = cell as { leader_ids?: string[]; co_leader_ids?: string[] } | null;
      const leaders = Array.from(new Set([...(c?.leader_ids || []), ...(c?.co_leader_ids || [])])).filter(
        (lid) => lid !== userId
      );
      if (leaders.length > 0) {
        await sendUsersNotification({
          userIds: leaders,
          churchId,
          title: "Novo pedido de oração 🙏",
          body: `${name} compartilhou um pedido de oração.`,
          actionUrl: "/pedidos-oracao",
          type: "info",
        });
      }
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("API prayer-requests/create error:", error);
    return NextResponse.json({ error: "Falha ao registrar o pedido de oração." }, { status: 500 });
  }
}
