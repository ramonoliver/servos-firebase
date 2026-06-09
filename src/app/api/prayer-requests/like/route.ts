import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

// Servos 2.0 — curtir/descurtir um pedido de oração ou um comentário.
// Toggle idempotente: uma curtida por (usuário, alvo). Coleção `prayer_likes`:
//   { id, church_id, user_id, target_type: "prayer" | "comment", target_id, created_at }
const bodySchema = z.object({
  targetType: z.enum(["prayer", "comment"]),
  targetId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }
    const { actor, session, errorResponse } = await requireApiActor(req, { select: "id, church_id, active" });
    if (errorResponse) return errorResponse;
    if (!actor?.active) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const churchId = session!.church_id;
    const userId = session!.user_id;
    const { targetType, targetId } = parsed.data;
    const supabase = getFirebaseAdminClient();

    // Confere que o alvo existe nesta igreja.
    const targetTable = targetType === "prayer" ? "pastoral_notes" : "prayer_comments";
    const { data: target } = await supabase
      .from(targetTable)
      .select("id")
      .eq("id", targetId)
      .eq("church_id", churchId)
      .maybeSingle();
    if (!target) {
      return NextResponse.json({ error: targetType === "prayer" ? "Pedido não encontrado." : "Comentário não encontrado." }, { status: 404 });
    }

    // Curtida existente? Faz toggle.
    const { data: existing } = await supabase
      .from("prayer_likes")
      .select("id")
      .eq("church_id", churchId)
      .eq("user_id", userId)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from("prayer_likes").delete().eq("id", existing.id).eq("church_id", churchId);
      return NextResponse.json({ success: true, liked: false });
    }

    const id = genId();
    const now = new Date().toISOString();
    const like = { id, church_id: churchId, user_id: userId, target_type: targetType, target_id: targetId, created_at: now };
    const { error } = await supabase.from("prayer_likes").insert(like);
    if (error) throw error;
    return NextResponse.json({ success: true, liked: true, like });
  } catch (error) {
    console.error("API prayer-requests/like error:", error);
    return NextResponse.json({ error: "Falha ao curtir." }, { status: 500 });
  }
}
