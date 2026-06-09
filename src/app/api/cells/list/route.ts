import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-session";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";

type Actor = { id: string; role: string; cell_role?: string | null };
type Net = { id: string; name: string; description: string; supervisor_ids: string[]; color: string; church_id: string; created_at: string };

function seesAll(actor: Actor) {
  return actor.role === "admin" || actor.cell_role === "pastor" || actor.cell_role === "coordenacao";
}

export async function POST(req: Request) {
  try {
    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;

    const churchId = session!.church_id;
    const baseActor = actor as unknown as { id: string; role: string };
    const me = baseActor.id;
    const supabase = getFirebaseAdminClient();

    // cell_role is tolerant: column may not exist until the roles migration runs.
    const { data: roleRow } = await supabase.from("users").select("cell_role").eq("id", me).maybeSingle();
    const typedActor: Actor = { id: me, role: baseActor.role, cell_role: (roleRow as any)?.cell_role ?? null };

    const [{ data: cellsRaw, error: cellsError }, { data: cmRaw, error: cmError }, { data: netsRaw }] =
      await Promise.all([
        supabase.from("cells").select("*").eq("church_id", churchId).order("created_at", { ascending: false }),
        supabase.from("cell_members").select("*"),
        supabase.from("cell_networks").select("*").eq("church_id", churchId),
      ]);
    if (cellsError) throw cellsError;
    if (cmError) throw cmError;

    const allCells = (cellsRaw || []) as any[];
    const cellMembers = (cmRaw || []) as { cell_id: string; user_id: string }[];
    const networks = (netsRaw || []) as Net[];
    const supervisedIds = new Set(
      networks.filter((n) => (n.supervisor_ids || []).includes(me)).map((n) => n.id)
    );
    const myMemberCellIds = new Set(cellMembers.filter((cm) => cm.user_id === me).map((cm) => cm.cell_id));

    function leadsCell(c: any) {
      return [...(c.leader_ids || []), ...(c.co_leader_ids || [])].includes(me);
    }
    function canManage(c: any) {
      if (seesAll(typedActor)) return true;
      if (c.network_id && supervisedIds.has(c.network_id)) return true;
      return leadsCell(c);
    }
    function canSee(c: any) {
      if (seesAll(typedActor)) return true;
      if (c.network_id && supervisedIds.has(c.network_id)) return true;
      if (leadsCell(c) || myMemberCellIds.has(c.id)) return true;
      // Membros podem DESCOBRIR células ativas (jornada "encontrar uma célula").
      // Continuam sem poder gerenciar (canManage permanece restrito).
      return c.status === "active";
    }

    const visible = allCells.filter(canSee);
    const visibleIds = new Set(visible.map((c) => c.id));
    const manageableIds = visible.filter(canManage).map((c) => c.id);

    return NextResponse.json({
      cells: visible,
      cellMembers: cellMembers.filter((cm) => visibleIds.has(cm.cell_id)),
      networks,
      manageableIds,
    });
  } catch (error) {
    console.error("API cells/list error:", error);
    const message = error instanceof Error ? error.message : "Falha ao carregar células.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
