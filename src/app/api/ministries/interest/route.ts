import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { sendUsersNotification } from "@/lib/server/notification-service";

// Servos 2.0 — "Tenho interesse": um membro sinaliza interesse em um ministério.
// Notifica os líderes/co-líderes do ministério (in-app + push).
const bodySchema = z.object({ departmentId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Ministério não informado." }, { status: 400 });
    }
    const { actor, session, errorResponse } = await requireApiActor(req, {
      select: "id, name, role, church_id, active",
    });
    if (errorResponse) return errorResponse;
    if (!actor?.active) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const churchId = session!.church_id;
    const supabase = getFirebaseAdminClient();

    const { data: dept } = await supabase
      .from("departments")
      .select("id, name, leader_ids, co_leader_ids, church_id")
      .eq("id", parsed.data.departmentId)
      .eq("church_id", churchId)
      .maybeSingle();
    if (!dept) return NextResponse.json({ error: "Ministério não encontrado." }, { status: 404 });

    const d = dept as { name?: string; leader_ids?: string[]; co_leader_ids?: string[] };
    const leaders = Array.from(new Set([...(d.leader_ids || []), ...(d.co_leader_ids || [])]));
    const interestedName = (actor as { name?: string }).name || "Alguém";

    if (leaders.length === 0) {
      // Sem líder definido — sinaliza sucesso, mas sem destinatário.
      return NextResponse.json({ sent: 0, warning: "Este ministério ainda não tem líder definido." });
    }

    await sendUsersNotification({
      userIds: leaders,
      churchId,
      title: "Interesse em servir 🙋",
      body: `${interestedName} tem interesse em participar do ministério ${d.name || ""}.`.trim(),
      actionUrl: `/ministerios/${parsed.data.departmentId}`,
      type: "info",
    });

    return NextResponse.json({ sent: leaders.length });
  } catch (error) {
    console.error("API ministries/interest error:", error);
    return NextResponse.json({ error: "Falha ao registrar interesse." }, { status: 500 });
  }
}
