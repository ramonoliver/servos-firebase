"use client";

import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { Avatar, ConfirmDialog, Modal, PageShell, PageHeader } from "@/components/ui";
import { fetchCells } from "@/lib/cells/client";
import type { Cell, CellNetwork } from "@/lib/cells/types";
import type { User } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────
type LevelType = "pastor" | "coordenacao" | "supervisao" | "celula" | "custom";

interface StructureNode {
  id: string;
  name: string;
  type: LevelType;
  description: string;
  responsavelIds: string[];
  status: "ativo" | "inativo";
  parentId: string | null;
  order: number;
  networkId?: string;
  cellId?: string;
}

type ModalState =
  | null
  | { type: "form"; node?: StructureNode; defaultParentId?: string | null }
  | { type: "delete"; node: StructureNode };

// ─── SVG icons ────────────────────────────────────────────────────────────────
function Icon({ name, size = 15 }: { name: string; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const p: Record<string, React.ReactNode> = {
    gitbranch: <><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 01-9 9" /></>,
    plus:       <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    edit:       <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    trash:      <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></>,
    chevdown:   <polyline points="6 9 12 15 18 9" />,
    chevright:  <polyline points="9 18 15 12 9 6" />,
    users:      <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>,
    church:     <><path d="M12 2L2 7v13h20V7L12 2z" /><path d="M12 2v5" /><path d="M9 7h6" /><rect x="9" y="13" width="6" height="7" /></>,
    star:       <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />,
    layers:     <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
    morevert:   <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
    x:          <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    grip:       <><line x1="9" y1="5" x2="9" y2="19" /><line x1="15" y1="5" x2="15" y2="19" /></>,
    eye:        <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  };
  return <svg {...s}>{p[name] ?? null}</svg>;
}

// ─── Level type config ────────────────────────────────────────────────────────
const LEVEL_CONFIGS: Record<LevelType, { label: string; color: string; bg: string; icon: string }> = {
  pastor:      { label: "Pastor",        color: "#FF6B57", bg: "#fff3f1", icon: "star" },
  coordenacao: { label: "Coordenação",   color: "#9B8CFB", bg: "#f4ecff", icon: "layers" },
  supervisao:  { label: "Supervisão",    color: "#4F9EF8", bg: "#eff6ff", icon: "users" },
  celula:      { label: "Célula",        color: "#22C55E", bg: "#f0fdf4", icon: "church" },
  custom:      { label: "Personalizado", color: "#F59E0B", bg: "#fffbeb", icon: "gitbranch" },
};

// Natural parent type for each level
const NATURAL_PARENT: Partial<Record<LevelType, LevelType>> = {
  coordenacao: "pastor",
  supervisao:  "coordenacao",
  celula:      "supervisao",
};

function LevelBadge({ type }: { type: LevelType }) {
  const cfg = LEVEL_CONFIGS[type];
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

// ─── Context menu (fixed-position to avoid z-index clipping) ─────────────────
function ContextMenu({
  pos, open, onClose, items,
}: {
  pos: { top: number; left: number };
  open: boolean;
  onClose: () => void;
  items: { label: string; icon: string; danger?: boolean; onClick: () => void }[];
}) {
  if (!open || typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <>
      <div className="fixed inset-0 z-[200]" onClick={onClose} />
      <div
        className="fixed z-[201] min-w-[192px] rounded-[12px] border border-border-soft bg-white shadow-lift"
        style={{ top: pos.top, left: pos.left }}
      >
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => { onClose(); item.onClick(); }}
            className={[
              "flex w-full items-center gap-2 px-4 py-2.5 text-[13px] transition hover:bg-surface-alt",
              item.danger ? "text-danger hover:bg-danger-light" : "text-ink",
              i === 0 ? "rounded-t-[12px]" : "",
              i === items.length - 1 ? "rounded-b-[12px]" : "",
            ].join(" ")}
          >
            <Icon name={item.icon} size={13} /> {item.label}
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}

// ─── Node Card (with drag-and-drop) ──────────────────────────────────────────
function NodeCard({
  node, depth, members, networks, cells, children, canManage,
  draggedId, onDragStart, onDrop,
  onAdd, onEdit, onDelete,
}: {
  node: StructureNode;
  depth: number;
  members: Map<string, User>;
  networks: Map<string, CellNetwork>;
  cells: Map<string, Cell>;
  children?: React.ReactNode;
  canManage: boolean;
  draggedId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string) => void;
  onAdd: (parentId: string) => void;
  onEdit: (node: StructureNode) => void;
  onDelete: (node: StructureNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const cfg = LEVEL_CONFIGS[node.type];
  const responsaveis = node.responsavelIds.map((id) => members.get(id)).filter(Boolean) as User[];
  const hasChildren = !!children;
  const linkedNetwork = node.networkId ? networks.get(node.networkId) : null;
  const linkedCell = node.cellId ? cells.get(node.cellId) : null;
  const isDragging = draggedId === node.id;

  return (
    <div className="relative">
      {depth > 0 && (
        <div className="absolute left-[-20px] top-0 h-full w-px bg-border-soft" />
      )}

      {/* Drop zone highlight */}
      <div
        className={`rounded-[16px] transition-all ${isDragOver && draggedId !== node.id ? "ring-2 ring-brand" : ""}`}
        onDragOver={(e) => {
          if (draggedId && draggedId !== node.id) { e.preventDefault(); setIsDragOver(true); }
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop(node.id); }}
      >
        <div
          draggable={canManage}
          onDragStart={() => onDragStart(node.id)}
          className={[
            "group relative rounded-[16px] border border-border-soft bg-white/80 p-4 shadow-soft backdrop-blur transition-all",
            isDragging ? "opacity-40 scale-[0.99]" : "hover:shadow-lift",
            isDragOver && draggedId !== node.id ? "bg-brand-light/40" : "",
          ].join(" ")}
          style={{ borderLeftWidth: 3, borderLeftColor: cfg.color }}
        >
          <div className="flex items-start gap-3">
            {/* Drag handle */}
            {canManage && (
              <div className="mt-0.5 flex-shrink-0 cursor-grab text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity active:cursor-grabbing">
                <Icon name="grip" size={14} />
              </div>
            )}

            {/* Level icon */}
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
              <Icon name={cfg.icon} size={16} />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {linkedCell ? (
                      <Link
                        href={`/celulas/${linkedCell.id}`}
                        className="font-display text-[15px] font-bold text-ink leading-tight hover:text-brand transition-colors"
                      >
                        {node.name}
                      </Link>
                    ) : (
                      <span className="font-display text-[15px] font-bold text-ink leading-tight">{node.name}</span>
                    )}
                    <LevelBadge type={node.type} />
                    {node.status === "inativo" && (
                      <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] font-semibold text-ink-faint">Inativo</span>
                    )}
                  </div>
                  {node.description && (
                    <p className="mt-0.5 text-[12px] text-ink-muted">{node.description}</p>
                  )}
                </div>

                {/* Actions button */}
                {canManage && (
                  <div className="flex-shrink-0">
                    <button
                      onClick={(e) => {
                        if (menuPos) { setMenuPos(null); return; }
                        const rect = e.currentTarget.getBoundingClientRect();
                        const menuWidth = 192;
                        const left = rect.right - menuWidth > 0 ? rect.right - menuWidth : rect.left;
                        setMenuPos({ top: rect.bottom + 4, left });
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-alt hover:text-ink"
                    >
                      <Icon name="morevert" size={14} />
                    </button>
                    <ContextMenu
                      pos={menuPos ?? { top: 0, left: 0 }}
                      open={!!menuPos}
                      onClose={() => setMenuPos(null)}
                      items={[
                        ...(linkedCell ? [{ label: "Visualizar", icon: "eye", onClick: () => { window.location.assign(`/celulas/${linkedCell.id}`); } }] : []),
                        { label: "Editar",               icon: "edit",    onClick: () => onEdit(node) },
                        { label: "Adicionar nível abaixo", icon: "plus",  onClick: () => onAdd(node.id) },
                        { label: "Excluir",               icon: "trash",  danger: true, onClick: () => onDelete(node) },
                      ]}
                    />
                  </div>
                )}
              </div>

              {/* Responsáveis */}
              {responsaveis.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {responsaveis.map((r, i) => (
                    <div key={r.id} className="flex items-center gap-1.5">
                      <Avatar name={r.name} color={r.avatar_color} photoUrl={r.photo_url} size={24} />
                      <span className="text-[12px] font-semibold text-ink">{r.name.split(" ").slice(0, 2).join(" ")}</span>
                      {i < responsaveis.length - 1 && <span className="text-ink-faint text-[11px]">&</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expand/collapse */}
            {hasChildren && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-alt"
              >
                <Icon name={expanded ? "chevdown" : "chevright"} size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="mt-2 ml-6 space-y-2 pl-[14px]">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Level Form Modal ─────────────────────────────────────────────────────────
function LevelForm({
  node, defaultParentId, allNodes, members, networks, onSave, onClose,
}: {
  node?: StructureNode;
  defaultParentId?: string | null;
  allNodes: StructureNode[];
  members: User[];
  networks: CellNetwork[];
  onSave: (data: Omit<StructureNode, "id" | "order">) => void;
  onClose: () => void;
}) {
  const isEdit = !!node;
  const [name, setName] = useState(node?.name || "");
  const [type, setType] = useState<LevelType>(node?.type || "supervisao");
  const [description, setDescription] = useState(node?.description || "");
  const [status, setStatus] = useState<"ativo" | "inativo">(node?.status || "ativo");
  const [resp1, setResp1] = useState(node?.responsavelIds[0] || "");
  const [resp2, setResp2] = useState(node?.responsavelIds[1] || "");
  const [parentId, setParentId] = useState<string | null>(
    node?.parentId !== undefined ? node.parentId : (defaultParentId ?? null)
  );
  const [networkId, setNetworkId] = useState(node?.networkId || "");
  const [error, setError] = useState("");

  // When type changes, try to auto-select a parent of the natural type
  useEffect(() => {
    const naturalParentType = NATURAL_PARENT[type];
    if (!naturalParentType) { setParentId(null); return; }
    // If current parentId is already a valid parent type, keep it
    const currentParent = allNodes.find((n) => n.id === parentId);
    if (currentParent && currentParent.type === naturalParentType) return;
    // Otherwise pick first node of natural parent type
    const firstMatch = allNodes.find((n) => n.type === naturalParentType);
    setParentId(firstMatch?.id ?? null);
  }, [type]);

  // Parent nodes filtered by natural parent type
  const naturalParentType = NATURAL_PARENT[type];
  const parentOptions = naturalParentType
    ? allNodes.filter((n) => n.type === naturalParentType)
    : allNodes.filter((n) => n.id !== node?.id); // custom — any node except self

  // Label for the parent field
  const parentFieldLabel: Partial<Record<LevelType, string>> = {
    coordenacao: "Vincular ao Pastor / Nível pai",
    supervisao:  "Vincular à Coordenação",
    celula:      "Vincular à Supervisão",
    custom:      "Nível pai (opcional)",
  };

  const supervisaoParentNodeLabel = "Associar à rede existente (opcional)";

  function submit() {
    if (!name.trim()) { setError("Informe o nome do nível."); return; }
    const responsavelIds = [resp1, resp2].filter(Boolean);
    onSave({
      name: name.trim(), type, description, status, responsavelIds,
      parentId: parentId ?? null,
      networkId: type === "supervisao" ? networkId || undefined : undefined,
    });
  }

  return (
    <Modal
      title={isEdit ? "Editar nível" : "Adicionar nível"}
      close={onClose}
      width={520}
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary">Cancelar</button>
          <button onClick={submit} className="btn btn-primary">{isEdit ? "Salvar" : "Adicionar"}</button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-[10px] bg-danger-light px-3 py-2 text-[13px] text-danger">{error}</p>}

        <div>
          <label className="input-label">Nome do nível *</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Supervisão Norte, Coordenação Jovens…" autoFocus />
        </div>

        <div>
          <label className="input-label">Tipo do nível *</label>
          <select className="input-field" value={type} onChange={(e) => setType(e.target.value as LevelType)}>
            <option value="pastor">Pastor</option>
            <option value="coordenacao">Coordenação</option>
            <option value="supervisao">Supervisão</option>
            <option value="celula">Célula</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>

        {/* Parent select — context-aware based on type */}
        {type !== "pastor" && (
          <div>
            <label className="input-label">{parentFieldLabel[type] ?? "Nível pai"}</label>
            {parentOptions.length === 0 ? (
              <p className="rounded-[10px] bg-amber-light px-3 py-2 text-[12px] text-amber">
                Nenhum nível{naturalParentType ? ` do tipo "${LEVEL_CONFIGS[naturalParentType].label}"` : ""} cadastrado ainda. Crie um primeiro.
              </p>
            ) : (
              <select className="input-field" value={parentId ?? ""} onChange={(e) => setParentId(e.target.value || null)}>
                <option value="">— Sem nível pai (raiz)</option>
                {parentOptions.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">Responsável principal</label>
            <select className="input-field" value={resp1} onChange={(e) => setResp1(e.target.value)}>
              <option value="">Nenhum</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">Segundo responsável (casal)</label>
            <select className="input-field" value={resp2} onChange={(e) => setResp2(e.target.value)}>
              <option value="">Nenhum</option>
              {members.filter((m) => m.id !== resp1).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        {/* Link to real data (optional) */}
        {type === "supervisao" && networks.length > 0 && (
          <div>
            <label className="input-label">{supervisaoParentNodeLabel}</label>
            <select className="input-field" value={networkId} onChange={(e) => setNetworkId(e.target.value)}>
              <option value="">Nenhuma</option>
              {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="input-label">Descrição (opcional)</label>
          <textarea className="input-field min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrição deste nível…" />
        </div>

        <div>
          <label className="input-label">Status</label>
          <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value as "ativo" | "inativo")}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}

// ─── Recursive tree renderer ──────────────────────────────────────────────────
function TreeLevel({
  nodes, parentId, depth, members, networks, cells, canManage,
  draggedId, onDragStart, onDrop,
  onAdd, onEdit, onDelete,
}: {
  nodes: StructureNode[];
  parentId: string | null;
  depth: number;
  members: Map<string, User>;
  networks: Map<string, CellNetwork>;
  cells: Map<string, Cell>;
  canManage: boolean;
  draggedId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string) => void;
  onAdd: (parentId: string) => void;
  onEdit: (node: StructureNode) => void;
  onDelete: (node: StructureNode) => void;
}) {
  const children = nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order);
  if (!children.length) return null;
  return (
    <>
      {children.map((node) => (
        <NodeCard
          key={node.id}
          node={node}
          depth={depth}
          members={members}
          networks={networks}
          cells={cells}
          canManage={canManage}
          draggedId={draggedId}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
        >
          <TreeLevel
            nodes={nodes}
            parentId={node.id}
            depth={depth + 1}
            members={members}
            networks={networks}
            cells={cells}
            canManage={canManage}
            draggedId={draggedId}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onAdd={onAdd}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </NodeCard>
      ))}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
let _uid = 1;
function uid() { return `node_${Date.now()}_${_uid++}`; }

export default function EstruturaPage() {
  const { user, toast } = useApp();
  const canManage = user.role === "admin" || user.cell_role === "pastor" || user.cell_role === "coordenacao";

  const [members, setMembers] = useState<User[]>([]);
  const [networks, setNetworks] = useState<CellNetwork[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [nodes, setNodes] = useState<StructureNode[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: usersData }, cellsData] = await Promise.all([
        supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
        fetchCells(),
      ]);
      const allUsers = (usersData || []) as User[];
      setMembers(allUsers);
      setNetworks(cellsData.networks);
      setCells(cellsData.cells);

      if (!initialized) {
        const tree: StructureNode[] = [];
        let order = 0;

        const pastores = allUsers.filter((u) => u.cell_role === "pastor");
        const pastorNodeId = uid();
        tree.push({ id: pastorNodeId, name: "Pastores", type: "pastor", description: "Liderança pastoral da estrutura de células.", responsavelIds: pastores.slice(0, 2).map((u) => u.id), status: "ativo", parentId: null, order: order++ });

        const coordenadores = allUsers.filter((u) => u.cell_role === "coordenacao");
        const coordNodeId = uid();
        tree.push({ id: coordNodeId, name: "Coordenação de Células", type: "coordenacao", description: "Responsável por coordenar todas as supervisões.", responsavelIds: coordenadores.slice(0, 2).map((u) => u.id), status: "ativo", parentId: pastorNodeId, order: order++ });

        if (cellsData.networks.length > 0) {
          cellsData.networks.forEach((net) => {
            const supervisaoNodeId = uid();
            tree.push({ id: supervisaoNodeId, name: net.name, type: "supervisao", description: net.description || "", responsavelIds: (net.supervisor_ids || []).slice(0, 2), status: "ativo", parentId: coordNodeId, order: order++, networkId: net.id });
            cellsData.cells.filter((c) => c.network_id === net.id).forEach((cell) => {
              tree.push({ id: uid(), name: cell.name, type: "celula", description: [cell.audience, cell.week_day, cell.time].filter(Boolean).join(" · "), responsavelIds: (cell.leader_ids || []).slice(0, 2), status: cell.status === "active" ? "ativo" : "inativo", parentId: supervisaoNodeId, order: order++, cellId: cell.id });
            });
          });
        } else {
          cellsData.cells.forEach((cell) => {
            tree.push({ id: uid(), name: cell.name, type: "celula", description: [cell.audience, cell.week_day, cell.time].filter(Boolean).join(" · "), responsavelIds: (cell.leader_ids || []).slice(0, 2), status: cell.status === "active" ? "ativo" : "inativo", parentId: coordNodeId, order: order++, cellId: cell.id });
          });
        }

        setNodes(tree);
        setInitialized(true);
      }
    } catch (error) {
      console.warn("Falha ao carregar estrutura:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [user.church_id]);

  const memberById = useMemo(() => { const m = new Map<string, User>(); members.forEach((u) => m.set(u.id, u)); return m; }, [members]);
  const networkById = useMemo(() => { const m = new Map<string, CellNetwork>(); networks.forEach((n) => m.set(n.id, n)); return m; }, [networks]);
  const cellById = useMemo(() => { const m = new Map<string, Cell>(); cells.forEach((c) => m.set(c.id, c)); return m; }, [cells]);

  function handleSaveNode(data: Omit<StructureNode, "id" | "order">) {
    if (modal?.type !== "form") return;
    if (modal.node) {
      setNodes((prev) => prev.map((n) => n.id === modal.node!.id ? { ...n, ...data } : n));
      toast("Nível atualizado.");
    } else {
      const maxOrder = nodes.length > 0 ? Math.max(...nodes.map((n) => n.order)) + 1 : 0;
      setNodes((prev) => [...prev, { id: uid(), order: maxOrder, ...data }]);
      toast("Nível adicionado.");
    }
    setModal(null);
  }

  function handleDeleteNode(node: StructureNode) {
    const toDelete = new Set<string>();
    function collect(id: string) { toDelete.add(id); nodes.filter((n) => n.parentId === id).forEach((n) => collect(n.id)); }
    collect(node.id);
    setNodes((prev) => prev.filter((n) => !toDelete.has(n.id)));
    toast(`${node.name} removido.`);
    setModal(null);
  }

  // Drag-and-drop: detect cycles before allowing reparent
  function isDescendant(potentialChildId: string, ancestorId: string): boolean {
    let current = nodes.find((n) => n.id === potentialChildId);
    while (current) {
      if (current.parentId === ancestorId) return true;
      current = current.parentId ? nodes.find((n) => n.id === current!.parentId) : undefined;
    }
    return false;
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); return; }
    // Prevent dropping onto own descendants
    if (isDescendant(targetId, draggedId)) {
      toast("Não é possível mover um nível para dentro de si mesmo.");
      setDraggedId(null);
      return;
    }
    setNodes((prev) => prev.map((n) => n.id === draggedId ? { ...n, parentId: targetId } : n));
    const moved = nodes.find((n) => n.id === draggedId);
    const target = nodes.find((n) => n.id === targetId);
    if (moved && target) toast(`"${moved.name}" movido para "${target.name}".`);
    setDraggedId(null);
  }

  const totalNodes = nodes.length;
  const supervisoes = nodes.filter((n) => n.type === "supervisao").length;
  const totalCelulas = nodes.filter((n) => n.type === "celula").length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Pessoas & Cuidado"
        title="Estrutura das Células"
        subtitle="Organize os níveis de liderança, coordenações, supervisões e células da igreja."
        backHref="/celulas"
        backLabel="Células"
        actions={
          canManage ? (
            <button onClick={() => setModal({ type: "form", defaultParentId: null })} className="btn btn-primary btn-sm flex items-center gap-1.5">
              <Icon name="plus" size={14} /> Adicionar nível
            </button>
          ) : null
        }
      />

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-surface-alt px-3 py-1.5 text-[12px] font-semibold text-ink-muted">
          <Icon name="layers" size={13} />
          <span className="font-display text-[15px] font-bold text-ink">{totalNodes}</span>
          níveis no total
        </div>
        {supervisoes > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full bg-info-light px-3 py-1.5 text-[12px] font-semibold text-info">
            <Icon name="users" size={13} />
            <span className="font-display text-[15px] font-bold">{supervisoes}</span>
            supervisões
          </div>
        )}
        {totalCelulas > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full bg-success-light px-3 py-1.5 text-[12px] font-semibold text-success">
            <Icon name="church" size={13} />
            <span className="font-display text-[15px] font-bold">{totalCelulas}</span>
            células
          </div>
        )}
      </div>

      {/* Legend + drag hint */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(Object.entries(LEVEL_CONFIGS) as [LevelType, typeof LEVEL_CONFIGS[LevelType]][]).map(([type, cfg]) => (
            <div key={type} className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-white/60 px-2.5 py-1 text-[11px] font-semibold" style={{ color: cfg.color }}>
              <span className="h-2 w-2 rounded-full" style={{ background: cfg.color }} />
              {cfg.label}
            </div>
          ))}
        </div>
        {canManage && nodes.length > 1 && (
          <p className="text-[11px] text-ink-faint flex items-center gap-1">
            <Icon name="grip" size={12} /> Arraste os cards para reorganizar
          </p>
        )}
      </div>

      {/* Tree */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[72px] rounded-[16px] bg-surface-alt animate-pulse" style={{ marginLeft: i * 24 }} />
          ))}
        </div>
      ) : nodes.length === 0 ? (
        <div className="rounded-[20px] border border-border-soft bg-white/70 px-6 py-16 text-center backdrop-blur">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-ink-faint">
            <Icon name="gitbranch" size={26} />
          </div>
          <p className="font-display text-[17px] font-bold text-ink">Nenhuma estrutura cadastrada</p>
          <p className="mx-auto mt-1.5 max-w-[360px] text-sm text-ink-muted">
            Comece criando o primeiro nível da estrutura hierárquica das células da sua igreja.
          </p>
          {canManage && (
            <button onClick={() => setModal({ type: "form", defaultParentId: null })} className="mt-5 btn btn-primary btn-sm flex items-center gap-1.5 mx-auto">
              <Icon name="plus" size={14} /> Adicionar primeiro nível
            </button>
          )}
        </div>
      ) : (
        <div
          className="space-y-3"
          onDragEnd={() => setDraggedId(null)}
        >
          <TreeLevel
            nodes={nodes}
            parentId={null}
            depth={0}
            members={memberById}
            networks={networkById}
            cells={cellById}
            canManage={canManage}
            draggedId={draggedId}
            onDragStart={setDraggedId}
            onDrop={handleDrop}
            onAdd={(parentId) => setModal({ type: "form", defaultParentId: parentId })}
            onEdit={(node) => setModal({ type: "form", node })}
            onDelete={(node) => setModal({ type: "delete", node })}
          />
        </div>
      )}

      {/* Modals */}
      {modal?.type === "form" && (
        <LevelForm
          node={modal.node}
          defaultParentId={modal.node ? undefined : modal.defaultParentId}
          allNodes={nodes}
          members={members}
          networks={networks}
          onSave={handleSaveNode}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === "delete" && (
        <ConfirmDialog
          title="Excluir nível"
          message={`Você está prestes a excluir <strong>${modal.node.name}</strong> e todos os seus sub-níveis. Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          onCancel={() => setModal(null)}
          onConfirm={() => handleDeleteNode(modal.node)}
        />
      )}
    </PageShell>
  );
}
