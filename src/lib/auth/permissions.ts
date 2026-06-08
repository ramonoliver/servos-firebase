import type { Role } from "@/types";
import type { BusinessRole, PersonRolesResult } from "@/lib/auth/person-roles";

export type Action =
  | "schedule.create" | "schedule.edit" | "schedule.delete" | "schedule.view"
  | "member.invite" | "member.edit" | "member.remove" | "member.view"
  | "department.create" | "department.edit" | "department.delete" | "department.view"
  | "event.create" | "event.edit" | "event.delete" | "event.view"
  | "message.send" | "report.view" | "settings.edit"
  | "confirm.own" | "profile.edit";

interface PermContext {
  departmentId?: string;
  userDepartmentIds?: string[];
}

/** Actor mínimo aceito pelo can() (servidor). cell_role eleva pastor/coordenação. */
type Actor = { role: Role | string; cell_role?: string | null };

const LEADER_ACTIONS: Action[] = [
  "schedule.create", "schedule.edit", "schedule.view",
  "member.invite", "member.edit", "member.view",
  "department.view",
  "event.create", "event.edit", "event.view",
  "message.send",
  "confirm.own", "profile.edit",
];

const MEMBER_ACTIONS: Action[] = [
  "schedule.view", "member.view",
  "department.view", "event.view",
  "confirm.own", "profile.edit",
];

// Pastor/Coordenação: tudo, exceto configurações da igreja (admin-only).
const PASTORAL_ACTIONS: Action[] = [
  "schedule.create", "schedule.edit", "schedule.delete", "schedule.view",
  "member.invite", "member.edit", "member.remove", "member.view",
  "department.create", "department.edit", "department.delete", "department.view",
  "event.create", "event.edit", "event.delete", "event.view",
  "message.send", "report.view",
  "confirm.own", "profile.edit",
];

const SCOPED_WRITES: Action[] = ["schedule.create", "schedule.edit", "member.invite", "member.edit"];

/**
 * Verificação de permissão de SERVIDOR. Aceita um `role` (string, legado) ou um
 * actor `{ role, cell_role }`. Quando recebe o actor, eleva pastor/coordenação
 * de forma consistente com o cliente (getPersonRoles → hasPermission).
 */
export function can(actorOrRole: Actor | Role | string, action: Action, ctx?: PermContext): boolean {
  const role = typeof actorOrRole === "string" ? actorOrRole : actorOrRole.role;
  const cellRole = typeof actorOrRole === "string" ? undefined : actorOrRole.cell_role;

  if (role === "admin") return true;

  // Pastor/Coordenação são church-wide (sem isolamento por departamento).
  if (cellRole === "pastor" || cellRole === "coordenacao") {
    return PASTORAL_ACTIONS.includes(action);
  }

  if (role === "leader") {
    if (!LEADER_ACTIONS.includes(action)) return false;
    // Isolamento por departamento para ações de escrita.
    if (ctx?.departmentId && ctx?.userDepartmentIds && SCOPED_WRITES.includes(action)) {
      return ctx.userDepartmentIds.includes(ctx.departmentId);
    }
    return true;
  }

  if (role === "member") {
    return MEMBER_ACTIONS.includes(action);
  }

  return false;
}

// ── Camada de CLIENTE: permissão por papéis canônicos (getPersonRoles) ───────
// Consistente com can() acima: pastor↔PASTORAL, líder de ministério↔LEADER.
// report.view não tem enforcement de servidor (páginas de relatório só leem),
// então é seguro concedê-lo aos papéis de liderança para visibilidade de menu.

const ROLE_CAPS: Record<BusinessRole, Action[] | "all"> = {
  admin: "all",
  pastor: PASTORAL_ACTIONS,
  coordenacao: PASTORAL_ACTIONS,
  supervisor: ["schedule.view", "member.view", "department.view", "event.view", "report.view", "confirm.own", "profile.edit"],
  lider_celula: ["schedule.view", "member.view", "department.view", "event.view", "report.view", "confirm.own", "profile.edit"],
  lider_ministerio: [...LEADER_ACTIONS, "report.view"],
  voluntario: ["schedule.view", "member.view", "department.view", "event.view", "confirm.own", "profile.edit"],
  membro: ["schedule.view", "member.view", "department.view", "event.view", "confirm.own", "profile.edit"],
  conexao: ["event.view", "confirm.own", "profile.edit"],
  responsavel_kids: [],
  crianca: [],
};

/**
 * Verificação de permissão do CLIENTE a partir dos papéis canônicos. Usada por
 * useApp().canDo. Mantém o isolamento por departamento para escritas escopadas.
 */
export function hasPermission(
  roles: PersonRolesResult,
  action: Action,
  ctx?: { departmentId?: string }
): boolean {
  const caps = roles.businessRoles.map((r) => ROLE_CAPS[r]);
  if (caps.some((c) => c === "all")) return true;

  const allowed = new Set<Action>();
  for (const c of caps) if (Array.isArray(c)) for (const a of c) allowed.add(a as Action);
  if (!allowed.has(action)) return false;

  // Escritas escopadas: pastor/coordenação/admin são church-wide; demais
  // (líder de ministério) só no departamento que lideram.
  if (ctx?.departmentId && SCOPED_WRITES.includes(action)) {
    const elevated =
      roles.businessRoles.includes("admin") ||
      roles.businessRoles.includes("pastor") ||
      roles.businessRoles.includes("coordenacao");
    if (elevated) return true;
    return roles.scopes.ledDepartmentIds.includes(ctx.departmentId);
  }

  return true;
}

export interface ClientPermissionInput {
  actor: {
    id: string;
    role: string;
    cell_role?: string | null;
  };
  target: {
    id: string;
    role: string;
    cellId?: string | null;
    ministryIds?: string[];
  };
  cells: Array<{ id: string; leader_ids?: string[]; co_leader_ids?: string[]; network_id?: string | null }>;
  networks: Array<{ id: string; supervisor_ids?: string[] }>;
  departments: Array<{ id: string; leader_ids?: string[]; co_leader_ids?: string[] }>;
}

export function canEditOrDeleteMemberClient(input: ClientPermissionInput): boolean {
  const { actor, target, cells, networks, departments } = input;

  // Admins and Pastors can edit/delete anyone
  if (actor.role === "admin") return true;
  if (actor.cell_role === "pastor") return true;

  // Non-leaders cannot edit/delete anyone
  if (actor.role !== "leader") return false;

  // A leader cannot edit/delete an Admin
  if (target.role === "admin") return false;

  // 1. Cell leader check: target cell is led/co-led by actor
  if (target.cellId) {
    const targetCell = cells.find(c => c.id === target.cellId);
    if (targetCell) {
      const leaders = [...(targetCell.leader_ids || []), ...(targetCell.co_leader_ids || [])];
      if (leaders.includes(actor.id)) return true;
    }
  }

  // 2. Supervision leader check: target cell's network is supervised by actor
  if (target.cellId) {
    const targetCell = cells.find(c => c.id === target.cellId);
    if (targetCell && targetCell.network_id) {
      const targetNetwork = networks.find(n => n.id === targetCell.network_id);
      if (targetNetwork && (targetNetwork.supervisor_ids || []).includes(actor.id)) {
        return true;
      }
    }
  }

  // 3. Ministry leader check: target belongs to a ministry led/co-led by actor
  if (target.ministryIds && target.ministryIds.length > 0) {
    const ledDepts = departments.filter(d => 
      [...(d.leader_ids || []), ...(d.co_leader_ids || [])].includes(actor.id)
    ).map(d => d.id);
    
    const hasIntersection = target.ministryIds.some(id => ledDepts.includes(id));
    if (hasIntersection) return true;
  }

  return false;
}

