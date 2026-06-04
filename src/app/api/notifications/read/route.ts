import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

const bodySchema = z.object({
  notificationIds: z.array(z.string()).min(1),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para marcar notificacoes." }, { status: 400 });
    }

    const { actor, errorResponse } = await requireApiActor(req, { select: "id, church_id, active" });
    if (errorResponse) return errorResponse;

    const { notificationIds } = parsed.data;
    const supabase = getFirebaseAdminClient();
    if (!actor?.active) {
      return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    }

    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", actor.id)
      .in("id", notificationIds);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API notifications/read error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao marcar notificacoes." },
      { status: 500 }
    );
  }
}
