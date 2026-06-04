import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const networkDataSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().default(""),
  color: z.string().default("#9B8CFB"),
  supervisor_ids: z.array(z.string()).default([]),
});

const bodySchema = z.object({
  mode: z.enum(["create", "update", "delete"]),
  networkId: z.string().optional(),
  data: networkDataSchema.optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para gerenciar rede." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const base = actor as unknown as { id: string; role: string; active: boolean };
    const supabase = getFirebaseAdminClient();
    if (!base?.active) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const { data: roleRow } = await supabase.from("users").select("cell_role").eq("id", base.id).maybeSingle();
    const cellRole = (roleRow as any)?.cell_role ?? null;
    const seesAll = base.role === "admin" || cellRole === "pastor" || cellRole === "coordenacao";
    if (!seesAll) {
      return NextResponse.json({ error: "Apenas admin/pastor/coordenação gerenciam redes." }, { status: 403 });
    }

    const { mode, networkId, data } = parsed.data;

    if (mode === "create") {
      if (!data) return NextResponse.json({ error: "Dados da rede são obrigatórios." }, { status: 400 });
      const id = genId();
      const { error } = await supabase.from("cell_networks").insert({
        id,
        church_id: churchId,
        ...data,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      return NextResponse.json({ success: true, id });
    }

    if (!networkId) return NextResponse.json({ error: "Rede não informada." }, { status: 400 });

    if (mode === "update") {
      if (!data) return NextResponse.json({ error: "Dados da rede são obrigatórios." }, { status: 400 });
      const { error } = await supabase
        .from("cell_networks")
        .update(data)
        .eq("id", networkId)
        .eq("church_id", churchId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // delete — desvincula células antes
    await supabase.from("cells").update({ network_id: null }).eq("network_id", networkId).eq("church_id", churchId);
    const { error } = await supabase.from("cell_networks").delete().eq("id", networkId).eq("church_id", churchId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API cells/networks/manage error:", error);
    const raw =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Falha ao gerenciar rede.";
    const message = /cell_networks|schema cache|does not exist/i.test(raw)
      ? "A estrutura de redes ainda não existe. Rode a migração 20260530150000_cell_roles.sql no Supabase."
      : raw;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
