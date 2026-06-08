import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const postSchema = z.object({
  type: z.enum(["single", "range", "vacation"]),
  date: z.string().min(1),
  endDate: z.string().default(""),
  reason: z.string().default(""),
});

const deleteSchema = z.object({
  unavailableDateId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para registrar indisponibilidade." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req, { select: "id, church_id, active" });
    if (errorResponse) return errorResponse;

    const { type, date, endDate, reason } = parsed.data;
    const supabase = getFirebaseAdminClient();
    if (!actor?.active) {
      return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    }

    const { error } = await supabase.from("unavailable_dates").insert({
      id: genId(),
      user_id: actor.id,
      church_id: session!.church_id,
      date,
      end_date: type !== "single" ? endDate || null : null,
      reason: reason.trim(),
      type,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API unavailable-dates POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao registrar indisponibilidade." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = deleteSchema.safeParse({
      unavailableDateId: url.searchParams.get("unavailableDateId"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para remover indisponibilidade." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const actorId = session!.user_id;
    const churchId = session!.church_id;
    const { unavailableDateId } = parsed.data;
    const supabase = getFirebaseAdminClient();

    const { data: unavailableDate, error: unavailableDateError } = await supabase
      .from("unavailable_dates")
      .select("id, user_id, church_id")
      .eq("id", unavailableDateId)
      .maybeSingle();
    if (unavailableDateError) throw unavailableDateError;

    if (!actor?.active) {
      return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    }

    if (!unavailableDate || unavailableDate.church_id !== churchId) {
      return NextResponse.json({ error: "Indisponibilidade nao encontrada." }, { status: 404 });
    }

    const canRemoveOwn = unavailableDate.user_id === actorId;
    const canRemoveAny = can(actor, "member.edit");

    if (!canRemoveOwn && !canRemoveAny) {
      return NextResponse.json({ error: "Sem permissao para remover esta indisponibilidade." }, { status: 403 });
    }

    const { error } = await supabase
      .from("unavailable_dates")
      .delete()
      .eq("id", unavailableDateId)
      .eq("church_id", churchId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API unavailable-dates DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao remover indisponibilidade." },
      { status: 500 }
    );
  }
}
