import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";
import { computeFrequency } from "@/lib/cells/types";

const attendanceSchema = z.object({
  user_id: z.string().min(1),
  status: z.enum(["present", "absent", "visitor", "first_visit"]),
});

const meetingDataSchema = z.object({
  date: z.string().min(1),
  time: z.string().default(""),
  theme: z.string().default(""),
  word: z.string().default(""),
  notes: z.string().default(""),
  feeling: z.string().default("normal"),
  feedback: z.string().default(""),
});

const bodySchema = z.object({
  mode: z.enum(["create", "update", "delete"]),
  cellId: z.string().min(1),
  meetingId: z.string().optional(),
  data: meetingDataSchema.optional(),
  attendance: z.array(attendanceSchema).default([]),
});

// Recompute the cell's "frequency" health metric from its meetings/attendance.
async function recomputeHealth(
  supabase: ReturnType<typeof getFirebaseAdminClient>,
  cellId: string,
  churchId: string
) {
  const [{ data: meetings }, { data: attendance }, { data: cell }] = await Promise.all([
    supabase.from("cell_meetings").select("id").eq("cell_id", cellId),
    supabase.from("cell_attendance").select("meeting_id, status").eq("cell_id", cellId),
    supabase.from("cells").select("health").eq("id", cellId).maybeSingle(),
  ]);

  const frequency = computeFrequency(meetings || [], attendance || []);
  const currentHealth = (cell?.health as Record<string, number> | undefined) || {};
  const nextHealth = { ...currentHealth, frequency };

  await supabase.from("cells").update({ health: nextHealth }).eq("id", cellId).eq("church_id", churchId);
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para a reunião." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const { mode, cellId, meetingId, data, attendance } = parsed.data;
    const supabase = getFirebaseAdminClient();

    if (!actor?.active) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    if (actor.role === "member") {
      return NextResponse.json({ error: "Sem permissão para gerenciar reuniões." }, { status: 403 });
    }

    // confirm cell belongs to church
    const { data: cell, error: cellError } = await supabase
      .from("cells")
      .select("id")
      .eq("id", cellId)
      .eq("church_id", churchId)
      .maybeSingle();
    if (cellError) throw cellError;
    if (!cell) {
      return NextResponse.json({ error: "Célula não encontrada." }, { status: 404 });
    }

    if (mode === "delete") {
      if (!meetingId) {
        return NextResponse.json({ error: "Reunião não informada." }, { status: 400 });
      }
      await supabase.from("cell_attendance").delete().eq("meeting_id", meetingId);
      await supabase.from("cell_meetings").delete().eq("id", meetingId).eq("church_id", churchId);
      await recomputeHealth(supabase, cellId, churchId);
      return NextResponse.json({ success: true });
    }

    if (!data) {
      return NextResponse.json({ error: "Dados da reunião são obrigatórios." }, { status: 400 });
    }

    let targetMeetingId = meetingId;

    if (mode === "create") {
      targetMeetingId = genId();
      const { error } = await supabase.from("cell_meetings").insert({
        id: targetMeetingId,
        cell_id: cellId,
        church_id: churchId,
        ...data,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
    } else {
      if (!meetingId) {
        return NextResponse.json({ error: "Reunião não informada." }, { status: 400 });
      }
      const { error } = await supabase
        .from("cell_meetings")
        .update(data)
        .eq("id", meetingId)
        .eq("church_id", churchId);
      if (error) throw error;
    }

    // replace attendance for this meeting
    await supabase.from("cell_attendance").delete().eq("meeting_id", targetMeetingId!);
    if (attendance.length > 0) {
      const rows = attendance.map((a) => ({
        id: genId(),
        meeting_id: targetMeetingId!,
        cell_id: cellId,
        user_id: a.user_id,
        status: a.status,
      }));
      const { error: attError } = await supabase.from("cell_attendance").insert(rows);
      if (attError) throw attError;
    }

    await recomputeHealth(supabase, cellId, churchId);
    return NextResponse.json({ success: true, id: targetMeetingId });
  } catch (error) {
    console.error("API cells/meetings/manage error:", error);
    const raw =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Falha ao salvar reunião.";
    const message = /cell_meetings|cell_attendance|schema cache|does not exist/i.test(raw)
      ? "As tabelas de reuniões ainda não existem. Rode a migração 20260530130000_cell_meetings.sql no Supabase."
      : raw;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
