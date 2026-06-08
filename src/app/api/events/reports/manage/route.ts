import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const nonNegativeInt = z.coerce.number().int().min(0).default(0);

const reportDataSchema = z.object({
  attendance_count: nonNegativeInt,
  volunteers_count: nonNegativeInt,
  new_converts_count: nonNegativeInt,
  reconciliations_count: nonNegativeInt,
  prayer_requests_count: nonNegativeInt,
  people_followed_count: nonNegativeInt,
  visitors_count: nonNegativeInt,
  children_count: nonNegativeInt,
  notes: z.string().default(""),
});

const bodySchema = z.object({
  eventId: z.string().min(1),
  eventDate: z.string().min(1),
  data: reportDataSchema,
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para o pós-evento." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req, { select: "id, role, cell_role, church_id, active" });
    if (errorResponse) return errorResponse;

    if (!actor?.active) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const isPastor = (actor as { cell_role?: string | null }).cell_role === "pastor";
    if (!can(actor, "event.edit") && !isPastor) {
      return NextResponse.json({ error: "Sem permissão para registrar pós-evento." }, { status: 403 });
    }

    const churchId = session!.church_id;
    const { eventId, eventDate, data } = parsed.data;
    const supabase = getFirebaseAdminClient();

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (eventError) throw eventError;
    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("event_reports")
      .select("id")
      .eq("event_id", eventId)
      .eq("event_date", eventDate)
      .eq("church_id", churchId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing?.id) {
      const { error } = await supabase
        .from("event_reports")
        .update({
          ...data,
          reported_by: actor.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("church_id", churchId);

      if (error) throw error;
      return NextResponse.json({ success: true, id: existing.id });
    }

    const id = genId();
    const { error } = await supabase.from("event_reports").insert({
      id,
      church_id: churchId,
      event_id: eventId,
      event_date: eventDate,
      ...data,
      reported_by: actor.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("API events/reports/manage error:", error);
    const raw =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Falha ao salvar pós-evento.";
    const message = /event_reports|schema cache|does not exist/i.test(raw)
      ? "A tabela de pós-evento ainda não existe. Rode a migração 20260602110000_event_reports.sql no Supabase."
      : raw;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
