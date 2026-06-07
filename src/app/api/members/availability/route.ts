import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

/**
 * Atualiza SOMENTE a disponibilidade semanal de um membro.
 * Endpoint dedicado para evitar os efeitos colaterais destrutivos do
 * members/update (que ressincroniza ministérios/cônjuge a partir do payload).
 */
const bodySchema = z.object({
  memberId: z.string().min(1),
  availability: z.array(z.boolean()).length(7),
});

export async function POST(req: Request) {
  try {
    const { actor, session, errorResponse } = await requireApiActor(req, {
      select: "id, role, cell_role, church_id, active",
    });
    if (errorResponse) return errorResponse;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Disponibilidade inválida." }, { status: 400 });
    }

    const { memberId, availability } = parsed.data;
    const churchId = session!.church_id;
    const actorId = session!.user_id;

    const canManage =
      actor.role === "admin" ||
      actor.role === "leader" ||
      actor.cell_role === "pastor" ||
      actor.cell_role === "coordenacao";

    if (!canManage && actorId !== memberId) {
      return NextResponse.json({ error: "Sem permissão para alterar a disponibilidade." }, { status: 403 });
    }

    const supabase = getFirebaseAdminClient();
    const { error } = await supabase
      .from("users")
      .update({ availability })
      .eq("id", memberId)
      .eq("church_id", churchId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API members/availability error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar disponibilidade." },
      { status: 500 }
    );
  }
}
