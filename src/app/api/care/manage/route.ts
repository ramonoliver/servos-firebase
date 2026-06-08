import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const noteDataSchema = z.object({
  type: z.string().default("note"),
  title: z.string().default(""),
  description: z.string().default(""),
  date: z.string().min(1),
  status: z.string().optional(),
  feedback: z.string().optional(),
});

const bodySchema = z.object({
  mode: z.enum(["create", "update", "delete"]),
  personId: z.string().min(1),
  noteId: z.string().optional(),
  data: noteDataSchema.optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para o registro de cuidado." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const { mode, personId, noteId, data } = parsed.data;
    const supabase = getFirebaseAdminClient();

    if (!actor?.active) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    if (actor.role === "member") {
      return NextResponse.json({ error: "Sem permissão para registrar cuidado pastoral." }, { status: 403 });
    }

    if (mode === "delete") {
      if (!noteId) {
        return NextResponse.json({ error: "Registro não informado." }, { status: 400 });
      }
      const { error } = await supabase
        .from("pastoral_notes")
        .delete()
        .eq("id", noteId)
        .eq("church_id", churchId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (mode === "update") {
      if (!noteId) {
        return NextResponse.json({ error: "Registro não informado." }, { status: 400 });
      }
      if (!data) {
        return NextResponse.json({ error: "Dados do registro são obrigatórios." }, { status: 400 });
      }
      const { error } = await supabase
        .from("pastoral_notes")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", noteId)
        .eq("church_id", churchId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (!data) {
      return NextResponse.json({ error: "Dados do registro são obrigatórios." }, { status: 400 });
    }

    const id = genId();
    const { error } = await supabase.from("pastoral_notes").insert({
      id,
      church_id: churchId,
      person_id: personId,
      author_id: session!.user_id,
      ...data,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("API care/manage error:", error);
    const raw =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Falha ao salvar cuidado.";
    const message = /pastoral_notes|schema cache|does not exist/i.test(raw)
      ? "A tabela de cuidado pastoral ainda não existe. Rode a migração 20260530140000_pastoral_notes.sql no Supabase."
      : raw;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
