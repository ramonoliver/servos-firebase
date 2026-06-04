import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

const bodySchema = z.object({
  scheduleId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para excluir escala." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const { scheduleId } = parsed.data;
    const supabase = getFirebaseAdminClient();

    const { data: schedule, error: scheduleError } = await supabase
        .from("schedules")
        .select("id, church_id")
        .eq("id", scheduleId)
        .eq("church_id", churchId)
        .maybeSingle();
    if (scheduleError) throw scheduleError;

    if (!actor?.active || !can(actor.role, "schedule.delete")) {
      return NextResponse.json({ error: "Sem permissao para excluir escalas." }, { status: 403 });
    }

    if (!schedule) {
      return NextResponse.json({ error: "Escala nao encontrada." }, { status: 404 });
    }

    const { error: deleteMembersError } = await supabase
      .from("schedule_members")
      .delete()
      .eq("schedule_id", scheduleId);

    if (deleteMembersError) throw deleteMembersError;

    const { error: deleteSlotsError } = await supabase
      .from("schedule_slots")
      .delete()
      .eq("schedule_id", scheduleId);

    if (deleteSlotsError) throw deleteSlotsError;

    const { error: deleteChatError } = await supabase
      .from("schedule_chats")
      .delete()
      .eq("schedule_id", scheduleId);

    if (deleteChatError) {
      console.error("Erro ao excluir chat da escala:", deleteChatError);
    }

    const { error: deleteScheduleError } = await supabase
      .from("schedules")
      .delete()
      .eq("id", scheduleId)
      .eq("church_id", churchId);

    if (deleteScheduleError) throw deleteScheduleError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API schedules/delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao excluir escala." },
      { status: 500 }
    );
  }
}
