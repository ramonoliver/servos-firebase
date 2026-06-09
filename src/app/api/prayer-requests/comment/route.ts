import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { sendUsersNotification } from "@/lib/server/notification-service";
import { genId } from "@/lib/utils/helpers";

// Servos 2.0 — comentário em um pedido de oração. Qualquer pessoa ativa pode
// comentar; o autor do pedido é notificado.
const bodySchema = z.object({
  prayerId: z.string().min(1),
  content: z.string().min(1).max(1000),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Escreva o comentário." }, { status: 400 });
    }
    const { actor, session, errorResponse } = await requireApiActor(req, {
      select: "id, name, church_id, active",
    });
    if (errorResponse) return errorResponse;
    if (!actor?.active) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const churchId = session!.church_id;
    const userId = session!.user_id;
    const supabase = getFirebaseAdminClient();
    const now = new Date().toISOString();

    // Confere que o pedido existe nesta igreja.
    const { data: prayer } = await supabase
      .from("pastoral_notes")
      .select("id, person_id")
      .eq("id", parsed.data.prayerId)
      .eq("church_id", churchId)
      .maybeSingle();
    if (!prayer) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

    const id = genId();
    const { error } = await supabase.from("prayer_comments").insert({
      id,
      prayer_id: parsed.data.prayerId,
      church_id: churchId,
      user_id: userId,
      content: parsed.data.content,
      created_at: now,
    });
    if (error) throw error;

    // Notifica o autor do pedido (se não for ele mesmo comentando).
    const authorId = (prayer as { person_id?: string }).person_id;
    const name = (actor as { name?: string }).name || "Alguém";
    if (authorId && authorId !== userId) {
      await sendUsersNotification({
        userIds: [authorId],
        churchId,
        title: "Comentário no seu pedido 🙏",
        body: `${name} comentou no seu pedido de oração.`,
        actionUrl: "/pedidos-oracao",
        type: "info",
      });
    }

    return NextResponse.json({
      success: true,
      comment: { id, prayer_id: parsed.data.prayerId, user_id: userId, content: parsed.data.content, created_at: now },
    });
  } catch (error) {
    console.error("API prayer-requests/comment error:", error);
    return NextResponse.json({ error: "Falha ao comentar." }, { status: 500 });
  }
}
