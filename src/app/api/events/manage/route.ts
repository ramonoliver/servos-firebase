import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const eventDataSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().default(""),
  type: z.enum(["recurring", "special"]),
  icon: z.string().min(1),
  location: z.string().default(""),
  base_time: z.string().default(""),
  instructions: z.string().default(""),
  recurrence: z.string().default("weekly"),
});

const bodySchema = z.object({
  mode: z.enum(["create", "update", "delete"]),
  eventId: z.string().optional(),
  data: eventDataSchema.optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para gerenciar evento." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req, { select: "id, role, cell_role, church_id, active" });
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const { mode, eventId, data } = parsed.data;
    const supabase = getFirebaseAdminClient();
    if (!actor?.active) {
      return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    }

    const requiredAction =
      mode === "create" ? "event.create" : mode === "update" ? "event.edit" : "event.delete";

    const isPastor = (actor as { cell_role?: string | null }).cell_role === "pastor";
    if (!can(actor, requiredAction) && !isPastor) {
      return NextResponse.json({ error: "Sem permissao para gerenciar eventos." }, { status: 403 });
    }

    if (mode === "create") {
      if (!data) {
        return NextResponse.json({ error: "Dados do evento sao obrigatorios." }, { status: 400 });
      }

      const { error } = await supabase.from("events").insert({
        id: genId(),
        church_id: churchId,
        ...data,
        active: true,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (!eventId) {
      return NextResponse.json({ error: "Evento nao informado." }, { status: 400 });
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, church_id")
      .eq("id", eventId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (eventError) throw eventError;
    if (!event) {
      return NextResponse.json({ error: "Evento nao encontrado." }, { status: 404 });
    }

    if (mode === "update") {
      if (!data) {
        return NextResponse.json({ error: "Dados do evento sao obrigatorios." }, { status: 400 });
      }

      const { error } = await supabase
        .from("events")
        .update(data)
        .eq("id", eventId)
        .eq("church_id", churchId);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase
      .from("events")
      .update({ active: false })
      .eq("id", eventId)
      .eq("church_id", churchId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API events/manage error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao gerenciar evento." },
      { status: 500 }
    );
  }
}
