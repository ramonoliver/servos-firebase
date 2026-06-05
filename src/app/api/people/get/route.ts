import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { z } from "zod";

const bodySchema = z.object({
  personId: z.string().min(1),
});

export async function POST(req: Request) {
  const { actor, session, errorResponse } = await requireApiActor(req, { select: "*" });
  if (errorResponse) return errorResponse;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "personId é obrigatório." }, { status: 400 });
  }

  const { personId } = parsed.data;
  const churchId = session!.church_id;
  const supabase = getFirebaseAdminClient();

  const [
    { data: person, error: personError },
    { data: notes, error: notesError },
  ] = await Promise.all([
    supabase.from("users").select("*").eq("id", personId).eq("church_id", churchId).maybeSingle(),
    supabase.from("pastoral_notes").select("*").eq("person_id", personId).order("date", { ascending: false }),
  ]);

  if (personError) {
    console.error("Erro ao buscar pessoa:", personError);
    return NextResponse.json({ error: "Erro ao buscar pessoa." }, { status: 500 });
  }

  if (!person) {
    return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ person, notes: notes || [] });
}
