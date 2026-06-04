import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { genId } from "@/lib/utils/helpers";

const healthSchema = z.object({
  frequency: z.number().min(0).max(100),
  communion: z.number().min(0).max(100),
  participation: z.number().min(0).max(100),
  growth: z.number().min(0).max(100),
  engagement: z.number().min(0).max(100),
  care: z.number().min(0).max(100),
});

const cellDataSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().default(""),
  cover_color: z.string().default("#FF6B57"),
  leader_ids: z.array(z.string()).default([]),
  co_leader_ids: z.array(z.string()).default([]),
  network_id: z.string().nullable().default(null),
  address: z.string().default(""),
  week_day: z.string().default(""),
  time: z.string().default(""),
  max_members: z.number().int().min(0).default(12),
  audience: z.string().default(""),
  status: z.enum(["active", "paused", "multiplying"]).default("active"),
  health: healthSchema.optional(),
});

const bodySchema = z.object({
  mode: z.enum(["create", "update", "delete"]),
  cellId: z.string().optional(),
  data: cellDataSchema.optional(),
  memberIds: z.array(z.string()).default([]),
});

type Actor = { id: string; role: string; cell_role?: string | null };
type Net = { id: string; supervisor_ids: string[] };
type CellRow = { id: string; network_id: string | null; leader_ids: string[]; co_leader_ids: string[] };

function seesAll(actor: Actor) {
  return actor.role === "admin" || actor.cell_role === "pastor" || actor.cell_role === "coordenacao";
}

function supervisedNetworkIds(actor: Actor, networks: Net[]) {
  return new Set(networks.filter((n) => (n.supervisor_ids || []).includes(actor.id)).map((n) => n.id));
}

function canManageCell(actor: Actor, cell: CellRow, supervisedIds: Set<string>) {
  if (seesAll(actor)) return true;
  if (cell.network_id && supervisedIds.has(cell.network_id)) return true;
  return [...(cell.leader_ids || []), ...(cell.co_leader_ids || [])].includes(actor.id);
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para gerenciar célula." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const { mode, cellId, data, memberIds } = parsed.data;
    const supabase = getFirebaseAdminClient();
    const baseActor = actor as unknown as { id: string; role: string; active: boolean };

    if (!baseActor?.active) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    // cell_role tolerant (column may not exist until the roles migration runs).
    const { data: roleRow } = await supabase.from("users").select("cell_role").eq("id", baseActor.id).maybeSingle();
    const typedActor: Actor = { id: baseActor.id, role: baseActor.role, cell_role: (roleRow as any)?.cell_role ?? null };

    const { data: networksData } = await supabase
      .from("cell_networks")
      .select("id, supervisor_ids")
      .eq("church_id", churchId);
    const networks = (networksData || []) as Net[];
    const supervisedIds = supervisedNetworkIds(typedActor, networks);
    const isSupervisor = supervisedIds.size > 0;

    const memberRows = (cellTargetId: string) => {
      const leaders = [...(data?.leader_ids || []), ...(data?.co_leader_ids || [])];
      const unique = Array.from(new Set([...leaders, ...memberIds]));
      const now = new Date().toISOString();
      return unique.map((uid) => ({ id: genId(), cell_id: cellTargetId, user_id: uid, status: "active", joined_at: now }));
    };

    if (mode === "create") {
      if (!data) return NextResponse.json({ error: "Dados da célula são obrigatórios." }, { status: 400 });
      const canCreate =
        seesAll(typedActor) || (isSupervisor && !!data.network_id && supervisedIds.has(data.network_id));
      if (!canCreate) {
        return NextResponse.json({ error: "Sem permissão para criar célula neste escopo." }, { status: 403 });
      }
      const newId = genId();
      const { error } = await supabase.from("cells").insert({
        id: newId,
        church_id: churchId,
        ...data,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      const rows = memberRows(newId);
      if (rows.length > 0) {
        const { error: cmError } = await supabase.from("cell_members").insert(rows);
        if (cmError) throw cmError;
      }
      return NextResponse.json({ success: true, id: newId });
    }

    if (!cellId) return NextResponse.json({ error: "Célula não informada." }, { status: 400 });

    const { data: cell, error: cellError } = await supabase
      .from("cells")
      .select("id, church_id, network_id, leader_ids, co_leader_ids")
      .eq("id", cellId)
      .eq("church_id", churchId)
      .maybeSingle();
    if (cellError) throw cellError;
    if (!cell) return NextResponse.json({ error: "Célula não encontrada." }, { status: 404 });

    if (mode === "delete") {
      if (!seesAll(typedActor)) {
        return NextResponse.json({ error: "Apenas coordenação/pastor/admin podem excluir células." }, { status: 403 });
      }
      await supabase.from("cell_members").delete().eq("cell_id", cellId);
      await supabase.from("cells").delete().eq("id", cellId).eq("church_id", churchId);
      return NextResponse.json({ success: true });
    }

    // update
    if (!data) return NextResponse.json({ error: "Dados da célula são obrigatórios." }, { status: 400 });
    if (!canManageCell(typedActor, cell as CellRow, supervisedIds)) {
      return NextResponse.json({ error: "Sem permissão para editar esta célula." }, { status: 403 });
    }

    const { error } = await supabase.from("cells").update(data).eq("id", cellId).eq("church_id", churchId);
    if (error) throw error;

    await supabase.from("cell_members").delete().eq("cell_id", cellId);
    const rows = memberRows(cellId);
    if (rows.length > 0) {
      const { error: cmError } = await supabase.from("cell_members").insert(rows);
      if (cmError) throw cmError;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API cells/manage error:", error);
    const raw =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Falha ao gerenciar célula.";
    const message = /leader_ids|co_leader_ids|network_id|cell_networks|schema cache|does not exist/i.test(raw)
      ? "Estrutura de papéis ainda não existe. Rode a migração 20260530150000_cell_roles.sql no Supabase."
      : raw;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
