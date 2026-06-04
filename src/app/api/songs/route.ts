import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const songSchema = z.object({
  title: z.string().trim().min(1),
  artist: z.string().default(""),
  key: z.string().min(1),
  bpm: z.number().int().nullable(),
  theme: z.string().min(1),
  lyrics_url: z.string().default(""),
  chords_url: z.string().default(""),
  video_url: z.string().default(""),
  notes: z.string().default(""),
  department_id: z.string().nullable(),
});

const postSchema = z.object({
  song: songSchema,
});

const deleteSchema = z.object({
  songId: z.string().min(1),
});

function canManageSongs(role: string) {
  return role === "admin" || role === "leader";
}

export async function POST(req: Request) {
  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para salvar musica." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const { song } = parsed.data;
    const actorId = session!.user_id;
    const churchId = session!.church_id;
    const supabase = getFirebaseAdminClient();
    if (!actor?.active || !canManageSongs(actor.role)) {
      return NextResponse.json({ error: "Sem permissao para gerenciar repertorio." }, { status: 403 });
    }

    if (song.department_id) {
      const { data: department, error: departmentError } = await supabase
        .from("departments")
        .select("id, church_id")
        .eq("id", song.department_id)
        .eq("church_id", churchId)
        .maybeSingle();

      if (departmentError) throw departmentError;
      if (!department) {
        return NextResponse.json({ error: "Ministerio informado nao foi encontrado." }, { status: 404 });
      }
    }

    const { error } = await supabase.from("songs").insert({
      id: genId(),
      church_id: churchId,
      department_id: song.department_id,
      title: song.title,
      artist: song.artist.trim(),
      key: song.key,
      bpm: song.bpm,
      theme: song.theme,
      lyrics_url: song.lyrics_url.trim(),
      chords_url: song.chords_url.trim(),
      video_url: song.video_url.trim(),
      audio_url: "",
      notes: song.notes.trim(),
      last_used: null,
      times_used: 0,
      created_by: actorId,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API songs POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar musica." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = deleteSchema.safeParse({
      songId: url.searchParams.get("songId"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para remover musica." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const { songId } = parsed.data;
    const supabase = getFirebaseAdminClient();

    const { data: song, error: songError } = await supabase
      .from("songs")
      .select("id, church_id")
      .eq("id", songId)
      .eq("church_id", churchId)
      .maybeSingle();
    if (songError) throw songError;
    if (!actor?.active || !canManageSongs(actor.role)) {
      return NextResponse.json({ error: "Sem permissao para gerenciar repertorio." }, { status: 403 });
    }

    if (!song) {
      return NextResponse.json({ error: "Musica nao encontrada." }, { status: 404 });
    }

    const { error } = await supabase
      .from("songs")
      .delete()
      .eq("id", songId)
      .eq("church_id", churchId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API songs DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao remover musica." },
      { status: 500 }
    );
  }
}
