import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

const bodySchema = z.object({ personId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Pessoa não informada." }, { status: 400 });
    }

    const { session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const supabase = getFirebaseAdminClient();

    const { data: notes, error } = await supabase
      .from("pastoral_notes")
      .select("*")
      .eq("church_id", churchId)
      .eq("person_id", parsed.data.personId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ notes: notes || [] });
  } catch (error) {
    console.error("API care/list error:", error);
    const raw =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Falha ao carregar cuidado.";
    const message = /pastoral_notes|schema cache|does not exist/i.test(raw)
      ? "A tabela de cuidado pastoral ainda não existe. Rode a migração 20260530140000_pastoral_notes.sql no Supabase."
      : raw;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
