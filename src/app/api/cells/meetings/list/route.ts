import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

const bodySchema = z.object({ cellId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Célula não informada." }, { status: 400 });
    }

    const { session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const { cellId } = parsed.data;
    const supabase = getFirebaseAdminClient();

    const { data: meetings, error: meetingsError } = await supabase
      .from("cell_meetings")
      .select("*")
      .eq("cell_id", cellId)
      .eq("church_id", churchId)
      .order("date", { ascending: false });
    if (meetingsError) throw meetingsError;

    const { data: attendance, error: attError } = await supabase
      .from("cell_attendance")
      .select("*")
      .eq("cell_id", cellId);
    if (attError) throw attError;

    return NextResponse.json({ meetings: meetings || [], attendance: attendance || [] });
  } catch (error) {
    console.error("API cells/meetings/list error:", error);
    const message = error instanceof Error ? error.message : "Falha ao carregar reuniões.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
