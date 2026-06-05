import type { Role } from "@/types";

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

const ADMIN_ALL = true;

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

export function can(role: Role, action: Action, ctx?: PermContext): boolean {
  if (role === "admin") return ADMIN_ALL;

  if (role === "leader") {
    if (!LEADER_ACTIONS.includes(action)) return false;
    // Check department isolation for write actions
    if (ctx?.departmentId && ctx?.userDepartmentIds) {
      const writeActions: Action[] = ["schedule.create", "schedule.edit", "member.invite", "member.edit"];
      if (writeActions.includes(action)) {
        return ctx.userDepartmentIds.includes(ctx.departmentId);
      }
    }
    return true;
  }

  if (role === "member") {
    return MEMBER_ACTIONS.includes(action);
  }

  return false;
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

