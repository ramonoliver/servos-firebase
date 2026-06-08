// ============================================================================
// Servos 2.0 — Fonte ÚNICA de papéis (canonical roles)
// ----------------------------------------------------------------------------
// Centraliza a derivação de "o que uma pessoa é" no sistema. Substitui as
// derivações espalhadas hoje em `use-app`, `dashboard-v3`, `permissions.ts` e
// `celulas/[id]` (ver docs/SERVOS-2.0-FUNDACAO-FASE1.md — Entregável 1).
//
// PRINCÍPIO: papéis de negócio NÃO são gravados em campo — são DERIVADOS em
// runtime a partir dos dados de relacionamento que já existem.
//
// Função pura, sem React e sem efeitos colaterais (testável e cacheável).
// ============================================================================

export type SystemRole = "admin" | "leader" | "member";

export type BusinessRole =
  | "admin"
  | "pastor"
  | "coordenacao"
  | "supervisor"
  | "lider_celula"
  | "lider_ministerio"
  | "voluntario"
  | "membro"
  | "conexao"
  | "responsavel_kids"
  | "crianca";

/** Modo de Home derivado do papel principal (consumido pela Home por perfil). */
export type ProfileMode = "admin" | "hybrid" | "departmentMember" | "cellMember" | "connect";

// ── Forma mínima das entidades (aceita o shape real do app) ─────────────────

export interface PersonLike {
  id: string;
  role?: SystemRole | string | null;
  cell_role?: "pastor" | "coordenacao" | null | string;
  cell_id?: string | null;
  is_child?: boolean;
  ministry_ids?: string[] | null;
}

interface CellLike {
  id: string;
  leader_ids?: string[];
  co_leader_ids?: string[];
  network_id?: string | null;
}

interface NetworkLike {
  id: string;
  supervisor_ids?: string[];
}

interface DepartmentLike {
  id: string;
  leader_ids?: string[];
  co_leader_ids?: string[];
}

export interface PersonRolesContext {
  cells?: CellLike[];
  networks?: NetworkLike[];
  departments?: DepartmentLike[];
  /** IDs de ministérios em que a pessoa É membro (vínculo, não liderança). */
  memberDepartmentIds?: string[];
  /** IDs de células em que a pessoa É membro. */
  memberCellIds?: string[];
  /** IDs das crianças que esta pessoa é responsável (se conhecido). */
  guardedChildIds?: string[];
}

export interface PersonRolesScopes {
  ledDepartmentIds: string[];
  ledCellIds: string[];
  supervisedNetworkIds: string[];
  guardedChildIds: string[];
}

export interface PersonRolesResult {
  systemRole: SystemRole;
  businessRoles: BusinessRole[];
  primaryRole: BusinessRole;
  scopes: PersonRolesScopes;
}

// ── Precedência (menor = mais alto) e rótulos pt-BR ─────────────────────────

const PRECEDENCE: BusinessRole[] = [
  "admin",
  "pastor",
  "coordenacao",
  "supervisor",
  "lider_celula",
  "lider_ministerio",
  "voluntario",
  "membro",
  "conexao",
];

export const ROLE_LABELS: Record<BusinessRole, string> = {
  admin: "Administrador",
  pastor: "Pastor",
  coordenacao: "Coordenação",
  supervisor: "Supervisor de células",
  lider_celula: "Líder de célula",
  lider_ministerio: "Líder de ministério",
  voluntario: "Voluntário",
  membro: "Membro",
  conexao: "Pessoa em conexão",
  responsavel_kids: "Responsável Kids",
  crianca: "Criança",
};

function includesId(list: string[] | undefined, id: string): boolean {
  return Array.isArray(list) && list.includes(id);
}

/**
 * Deriva todos os papéis (sistema + negócio), o papel principal e os escopos
 * de isolamento de uma pessoa. Fonte única da verdade.
 */
export function getPersonRoles(person: PersonLike, ctx: PersonRolesContext = {}): PersonRolesResult {
  const id = person.id;
  const systemRole: SystemRole =
    person.role === "admin" || person.role === "leader" ? person.role : "member";

  const cells = ctx.cells || [];
  const networks = ctx.networks || [];
  const departments = ctx.departments || [];

  // Escopos (o "onde" de cada papel)
  const ledDepartmentIds = departments
    .filter((d) => includesId(d.leader_ids, id) || includesId(d.co_leader_ids, id))
    .map((d) => d.id);
  const ledCellIds = cells
    .filter((c) => includesId(c.leader_ids, id) || includesId(c.co_leader_ids, id))
    .map((c) => c.id);
  const supervisedNetworkIds = networks
    .filter((n) => includesId(n.supervisor_ids, id))
    .map((n) => n.id);
  const guardedChildIds = ctx.guardedChildIds || [];

  // Vínculos (membership)
  const hasMinistry =
    (ctx.memberDepartmentIds?.length ?? 0) > 0 || (person.ministry_ids?.length ?? 0) > 0;
  const hasCell = (ctx.memberCellIds?.length ?? 0) > 0 || Boolean(person.cell_id);

  const businessRoles = new Set<BusinessRole>();

  // Especiais / transversais
  if (person.is_child) businessRoles.add("crianca");
  if (guardedChildIds.length > 0) businessRoles.add("responsavel_kids");

  // Papéis de liderança/pastoral (independentes do systemRole)
  if (systemRole === "admin") businessRoles.add("admin");
  if (person.cell_role === "pastor") businessRoles.add("pastor");
  if (person.cell_role === "coordenacao") businessRoles.add("coordenacao");
  if (supervisedNetworkIds.length > 0) businessRoles.add("supervisor");
  if (ledCellIds.length > 0) businessRoles.add("lider_celula");
  if (ledDepartmentIds.length > 0) businessRoles.add("lider_ministerio");

  // Papéis base (só quando não há papel de liderança/pastoral acima e não é criança)
  const hasElevated =
    businessRoles.has("admin") ||
    businessRoles.has("pastor") ||
    businessRoles.has("coordenacao") ||
    businessRoles.has("supervisor") ||
    businessRoles.has("lider_celula") ||
    businessRoles.has("lider_ministerio");

  if (!hasElevated && !person.is_child) {
    if (hasMinistry) businessRoles.add("voluntario");
    else if (hasCell) businessRoles.add("membro");
    else businessRoles.add("conexao");
  }

  // Garante ao menos um papel base de exibição
  if (businessRoles.size === 0) businessRoles.add("conexao");

  const ordered = PRECEDENCE.filter((r) => businessRoles.has(r));
  const primaryRole: BusinessRole = ordered[0] || Array.from(businessRoles)[0] || "membro";

  return {
    systemRole,
    businessRoles: [
      ...ordered,
      // papéis transversais (não entram na precedência de rótulo)
      ...(businessRoles.has("responsavel_kids") ? (["responsavel_kids"] as BusinessRole[]) : []),
      ...(businessRoles.has("crianca") ? (["crianca"] as BusinessRole[]) : []),
    ],
    primaryRole,
    scopes: { ledDepartmentIds, ledCellIds, supervisedNetworkIds, guardedChildIds },
  };
}

/** Rótulo pt-BR do papel principal (rodapé da sidebar, página de Pessoa). */
export function getPrimaryRoleLabel(person: PersonLike, ctx?: PersonRolesContext): string {
  return ROLE_LABELS[getPersonRoles(person, ctx).primaryRole];
}

/**
 * Mapeia o papel principal para o modo de Home (profileMode).
 * Mantém a paridade com a derivação atual do dashboard-v3.
 */
export function getProfileMode(primaryRole: BusinessRole): ProfileMode {
  switch (primaryRole) {
    case "admin":
    case "pastor":
    case "coordenacao":
    case "supervisor":
      return "admin";
    case "lider_celula":
    case "lider_ministerio":
      return "hybrid";
    case "voluntario":
      return "departmentMember";
    case "membro":
      return "cellMember";
    case "conexao":
    default:
      return "connect";
  }
}
