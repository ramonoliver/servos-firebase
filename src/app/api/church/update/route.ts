import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

const bodySchema = z.object({
  name: z.string().trim().min(1),
  city: z.string().trim().default(""),
  state: z.string().trim().default(""),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos para atualizar a igreja." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const { name, city, state } = parsed.data;
    const supabase = getFirebaseAdminClient();
    if (!actor?.active || !can(actor, "settings.edit")) {
      return NextResponse.json({ error: "Sem permissao para atualizar configuracoes." }, { status: 403 });
    }

    const { error } = await supabase
      .from("churches")
      .update({
        name,
        city,
        state,
      })
      .eq("id", churchId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API church/update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar a igreja." },
      { status: 500 }
    );
  }
}
