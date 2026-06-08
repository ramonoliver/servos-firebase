import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiActor } from "@/lib/auth/api-session";
import { can } from "@/lib/auth/permissions";
import { getFirebaseAdminClient } from "@/lib/firebase-admin";
import { sendUsersNotification } from "@/lib/server/notification-service";

// Servos 2.0 — Comunicação real (Comunicados). Resolve um segmento de público
// no servidor e dispara notificação in-app + push (respeitando preferências)
// via o serviço de notificações existente.

const bodySchema = z.object({
  audience: z.enum(["church", "ministry", "cell", "birthdays", "no_cell", "no_ministry"]),
  departmentId: z.string().optional(),
  cellId: z.string().optional(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
});

function birthdayWithin(birthDate: string | null | undefined, days: number): boolean {
  if (!birthDate || birthDate.length < 10) return false;
  const [, mm, dd] = birthDate.split("-").map(Number);
  if (!mm || !dd) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), mm - 1, dd);
  if (next < today) next = new Date(now.getFullYear() + 1, mm - 1, dd);
  const diff = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  return diff >= 0 && diff <= days;
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para o comunicado." }, { status: 400 });
    }

    const { actor, session, errorResponse } = await requireApiActor(req);
    if (errorResponse) return errorResponse;
    if (!actor?.active) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    if (!can(actor, "message.send")) {
      return NextResponse.json({ error: "Sem permissão para enviar comunicados." }, { status: 403 });
    }

    const { audience, departmentId, cellId, title, body } = parsed.data;
    const churchId = session!.church_id;
    const supabase = getFirebaseAdminClient();

    const isPastorAdmin =
      actor.role === "admin" || actor.cell_role === "pastor" || actor.cell_role === "coordenacao";

    // ── Autorização por segmento ───────────────────────────────────────────
    const churchWide = audience === "church" || audience === "birthdays" || audience === "no_cell" || audience === "no_ministry";
    if (churchWide && !isPastorAdmin) {
      return NextResponse.json({ error: "Apenas admin/pastor podem enviar para a igreja toda." }, { status: 403 });
    }

    if (audience === "ministry") {
      if (!departmentId) return NextResponse.json({ error: "Ministério não informado." }, { status: 400 });
      if (!isPastorAdmin) {
        const { data: dept } = await supabase
          .from("departments")
          .select("leader_ids, co_leader_ids")
          .eq("id", departmentId)
          .eq("church_id", churchId)
          .maybeSingle();
        const leaders = [...((dept?.leader_ids as string[]) || []), ...((dept?.co_leader_ids as string[]) || [])];
        if (!leaders.includes(actor.id)) {
          return NextResponse.json({ error: "Você não lidera este ministério." }, { status: 403 });
        }
      }
    }

    if (audience === "cell") {
      if (!cellId) return NextResponse.json({ error: "Célula não informada." }, { status: 400 });
      if (!isPastorAdmin) {
        const { data: cell } = await supabase
          .from("cells")
          .select("leader_ids, co_leader_ids")
          .eq("id", cellId)
          .eq("church_id", churchId)
          .maybeSingle();
        const leaders = [...((cell?.leader_ids as string[]) || []), ...((cell?.co_leader_ids as string[]) || [])];
        if (!leaders.includes(actor.id)) {
          return NextResponse.json({ error: "Você não lidera esta célula." }, { status: 403 });
        }
      }
    }

    // ── Resolução do público → user_ids ────────────────────────────────────
    const { data: usersData } = await supabase
      .from("users")
      .select("id, role, cell_id, birth_date")
      .eq("church_id", churchId)
      .eq("active", true);
    const users = (usersData || []) as Array<{ id: string; role: string; cell_id?: string | null; birth_date?: string | null }>;

    let userIds: string[] = [];
    let actionUrl = "/notificacoes";

    if (audience === "church") {
      userIds = users.map((u) => u.id);
    } else if (audience === "birthdays") {
      userIds = users.filter((u) => birthdayWithin(u.birth_date, 7)).map((u) => u.id);
    } else if (audience === "ministry") {
      const { data: dm } = await supabase
        .from("department_members")
        .select("user_id")
        .eq("department_id", departmentId);
      userIds = ((dm || []) as Array<{ user_id: string }>).map((d) => d.user_id);
      actionUrl = `/ministerios/${departmentId}`;
    } else if (audience === "cell") {
      const { data: cm } = await supabase.from("cell_members").select("user_id").eq("cell_id", cellId);
      userIds = ((cm || []) as Array<{ user_id: string }>).map((c) => c.user_id);
      actionUrl = `/celulas/${cellId}`;
    } else if (audience === "no_cell" || audience === "no_ministry") {
      // Conjuntos auxiliares a partir das células/ministérios da igreja.
      const { data: cellsData } = await supabase.from("cells").select("id").eq("church_id", churchId);
      const cellIds = ((cellsData || []) as Array<{ id: string }>).map((c) => c.id);
      const { data: deptsData } = await supabase.from("departments").select("id").eq("church_id", churchId);
      const deptIds = ((deptsData || []) as Array<{ id: string }>).map((d) => d.id);

      const withCell = new Set<string>();
      if (cellIds.length) {
        const { data: cm } = await supabase.from("cell_members").select("user_id, cell_id").in("cell_id", cellIds);
        ((cm || []) as Array<{ user_id: string }>).forEach((c) => withCell.add(c.user_id));
      }
      const withMinistry = new Set<string>();
      if (deptIds.length) {
        const { data: dm } = await supabase.from("department_members").select("user_id, department_id").in("department_id", deptIds);
        ((dm || []) as Array<{ user_id: string }>).forEach((d) => withMinistry.add(d.user_id));
      }

      const base = users.filter((u) => u.role === "member");
      if (audience === "no_cell") {
        userIds = base.filter((u) => !u.cell_id && !withCell.has(u.id)).map((u) => u.id);
      } else {
        userIds = base.filter((u) => !withMinistry.has(u.id)).map((u) => u.id);
      }
    }

    userIds = Array.from(new Set(userIds));
    if (userIds.length === 0) {
      return NextResponse.json({ sent: 0, warning: "Nenhuma pessoa neste segmento." });
    }

    const result = await sendUsersNotification({
      userIds,
      churchId,
      title,
      body,
      actionUrl,
      type: "info",
    });

    return NextResponse.json({ sent: userIds.length, push: result.pushSent });
  } catch (error) {
    console.error("API communications/send error:", error);
    const message =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message)
        : "Falha ao enviar comunicado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
