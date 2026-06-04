"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { Avatar, ConfirmDialog, PageShell, PageHeader } from "@/components/ui";
import { SoftCard } from "@/components/pastoral/pastoral-ui";
import { CellForm } from "@/components/shared/cell-form";
import { fetchCells, saveCell } from "@/lib/cells/client";
import {
  cellHealthAverage,
  cellHealthStatus,
  HEALTH_STATUS_STYLES,
  CELL_TYPES,
  WEEK_DAYS,
  type Cell,
  type CellMemberRow,
  type CellNetwork,
} from "@/lib/cells/types";
import type { User } from "@/types";

type ModalState = null | { type: "form"; cell?: Cell } | { type: "delete"; cell: Cell };

function Icon({ name, size = 15 }: { name: string; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    eye: <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></>,
    edit: <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></>,
    users: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>,
    gitbranch: <><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 01-9 9" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  };
  return <svg {...s}>{paths[name] ?? null}</svg>;
}

function StatChip({ value, label, color }: { value: number; label: string; color?: "success" | "amber" | "info" | "purple" }) {
  const cls = color === "success" ? "bg-success-light text-success" : color === "amber" ? "bg-amber-light text-amber" : color === "info" ? "bg-info-light text-info" : color === "purple" ? "bg-[#f4ecff] text-[#8B5BD6]" : "bg-surface-alt text-ink-muted";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${cls}`}>
      <span className="font-display text-[15px] font-bold">{value}</span>
      {label}
    </div>
  );
}


export default function CelulasPage() {
  const { user, toast } = useApp();
  const canCreate = user.role === "admin" || user.cell_role === "pastor" || user.cell_role === "coordenacao";

  const [cells, setCells] = useState<Cell[]>([]);
  const [cellMembers, setCellMembers] = useState<CellMemberRow[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [networks, setNetworks] = useState<CellNetwork[]>([]);
  const [manageableIds, setManageableIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [dayFilter, setDayFilter] = useState("Todos");
  const [networkFilter, setNetworkFilter] = useState("all");
  const [modal, setModal] = useState<ModalState>(null);
  const manageable = useMemo(() => new Set(manageableIds), [manageableIds]);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: usersData }, cellsData] = await Promise.all([
        supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
        fetchCells(),
      ]);
      setMembers((usersData || []) as User[]);
      setCells(cellsData.cells);
      setCellMembers(cellsData.cellMembers);
      setNetworks(cellsData.networks);
      setManageableIds(cellsData.manageableIds);
    } catch (error) {
      console.warn("Falha ao carregar células:", error);
      setCells([]); setCellMembers([]); setManageableIds([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [user.church_id]);

  const memberById = useMemo(() => {
    const map = new Map<string, User>();
    members.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  function countMembers(cellId: string) { return cellMembers.filter((cm) => cm.cell_id === cellId).length; }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cells.filter((cell) => {
      const leader = cell.leader_ids?.[0] ? memberById.get(cell.leader_ids[0]) : null;
      const network = cell.network_id ? networks.find((n) => n.id === cell.network_id) : null;
      const matchesSearch = !term || cell.name.toLowerCase().includes(term) || cell.audience.toLowerCase().includes(term) || cell.address.toLowerCase().includes(term) || (leader?.name ?? "").toLowerCase().includes(term) || (network?.name ?? "").toLowerCase().includes(term);
      const matchesType = typeFilter === "Todos" || cell.audience.toLowerCase().includes(typeFilter.toLowerCase());
      const matchesDay = dayFilter === "Todos" || cell.week_day === dayFilter;
      const matchesNetwork = networkFilter === "all" || (networkFilter === "none" ? !cell.network_id : cell.network_id === networkFilter);
      return matchesSearch && matchesType && matchesDay && matchesNetwork;
    });
  }, [cells, search, typeFilter, dayFilter, networkFilter, memberById, networks]);

  const statsByStatus = useMemo(() => {
    const counts = { "Saudável": 0, "Em crescimento": 0, "Atenção": 0, "Crítica": 0, "Nova": 0 };
    cells.forEach((c) => { const s = cellHealthStatus(c.health, c.created_at); counts[s]++; });
    return counts;
  }, [cells]);

  const hasFilters = !!(search || typeFilter !== "Todos" || dayFilter !== "Todos" || networkFilter !== "all");

  async function deleteCell(cell: Cell) {
    try {
      await saveCell({ mode: "delete", cellId: cell.id });
      toast(`${cell.name} excluída.`); setModal(null); await loadData();
    } catch (error) { toast(error instanceof Error ? error.message : "Erro ao excluir célula."); }
  }

  function clearFilters() { setSearch(""); setTypeFilter("Todos"); setDayFilter("Todos"); setNetworkFilter("all"); }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Pessoas & Cuidado"
        title="Células"
        subtitle="Gerencie as células, supervisões e estrutura de acompanhamento da igreja."
        actions={
          <div className="flex gap-2">
            <Link href="/celulas/estrutura" className="btn btn-secondary btn-sm flex items-center gap-1.5">
              <Icon name="gitbranch" size={14} /> Estrutura
            </Link>
            {canCreate && (
              <button onClick={() => setModal({ type: "form" })} className="btn btn-primary btn-sm flex items-center gap-1.5">
                <Icon name="plus" size={14} /> Nova célula
              </button>
            )}
          </div>
        }
      />

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        <StatChip value={cells.length} label="células" />
        {statsByStatus["Saudável"] > 0 && <StatChip value={statsByStatus["Saudável"]} label="Saudáveis" color="success" />}
        {statsByStatus["Em crescimento"] > 0 && <StatChip value={statsByStatus["Em crescimento"]} label="Em crescimento" color="info" />}
        {statsByStatus["Atenção"] > 0 && <StatChip value={statsByStatus["Atenção"]} label="Atenção" color="amber" />}
        {statsByStatus["Crítica"] > 0 && <StatChip value={statsByStatus["Crítica"]} label="Críticas" />}
        {statsByStatus["Nova"] > 0 && <StatChip value={statsByStatus["Nova"]} label="Novas" color="purple" />}
      </div>

      {/* Search + Filters */}
      <SoftCard className="mb-0 p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_160px_160px_180px]">
          <input
            className="input-field"
            placeholder="Buscar por nome, líder, bairro ou tipo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input-field" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="Todos">Todos os tipos</option>
            {CELL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="input-field" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
            <option value="Todos">Todos os dias</option>
            {WEEK_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="input-field" value={networkFilter} onChange={(e) => setNetworkFilter(e.target.value)}>
            <option value="all">Todas as supervisões</option>
            <option value="none">Sem supervisão</option>
            {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      </SoftCard>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-ink-faint">
          {loading ? "Carregando…" : `${filtered.length} ${filtered.length === 1 ? "célula encontrada" : "células encontradas"}`}
        </span>
        {hasFilters && (
          <button className="btn btn-ghost btn-sm flex items-center gap-1 text-ink-faint" onClick={clearFilters}>
            <Icon name="x" size={13} /> Limpar filtros
          </button>
        )}
      </div>

      {/* Cells grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[200px] rounded-[18px] bg-surface-alt animate-pulse" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((cell) => {
            const leader = cell.leader_ids?.[0] ? memberById.get(cell.leader_ids[0]) : null;
            const extraLeaders = Math.max((cell.leader_ids?.length || 0) - 1, 0);
            const canManageThis = manageable.has(cell.id);
            const average = cellHealthAverage(cell.health);
            const status = cellHealthStatus(cell.health, cell.created_at);
            const statusCls = HEALTH_STATUS_STYLES[status];
            const barCls = status === "Saudável" ? "bg-success" : status === "Em crescimento" ? "bg-info" : status === "Atenção" ? "bg-amber" : status === "Nova" ? "bg-[#8B5BD6]" : "bg-danger";
            const network = cell.network_id ? networks.find((n) => n.id === cell.network_id) : null;
            const memberCount = countMembers(cell.id);
            return (
              <div key={cell.id} className="group flex flex-col rounded-[18px] border border-border-soft bg-white/70 p-4 shadow-soft backdrop-blur transition-all hover:border-white hover:bg-white/85 hover:shadow-lift">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/celulas/${cell.id}`} className="block truncate font-display text-[16px] font-bold text-ink transition-colors hover:text-brand-deep">
                      {cell.name}
                    </Link>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      {[cell.audience, cell.week_day, cell.time].filter(Boolean).join(" · ") || "Sem horário definido"}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusCls}`}>{status}</span>
                </div>

                {cell.description && (
                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">{cell.description}</p>
                )}

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-alt">
                  <div className={`h-1.5 rounded-full transition-all ${barCls}`} style={{ width: `${average}%` }} />
                </div>

                {network && (
                  <div className="mt-2">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: (network.color || "#9B8CFB") + "22", color: network.color || "#9B8CFB" }}>
                      {network.name}
                    </span>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between gap-3">
                  {leader ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={leader.name} color={leader.avatar_color} photoUrl={leader.photo_url} size={28} />
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold text-ink">
                          {leader.name.split(" ")[0]}{extraLeaders > 0 ? ` +${extraLeaders}` : ""}
                        </div>
                        <div className="text-[10px] text-ink-faint">{cell.leader_ids.length > 1 ? "Líderes" : "Líder"}</div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[12px] text-ink-faint">Sem líder</span>
                  )}
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-ink-faint">
                    <Icon name="users" size={12} />
                    {memberCount}/{cell.max_members}
                  </div>
                </div>

                <div className="mt-3 flex gap-2 border-t border-border-soft pt-3">
                  <Link href={`/celulas/${cell.id}`} className="btn btn-primary btn-sm flex flex-1 items-center justify-center gap-1.5">
                    <Icon name="eye" size={13} /> Ver detalhes
                  </Link>
                  {canManageThis && (
                    <button onClick={() => setModal({ type: "form", cell })} className="btn btn-secondary btn-sm flex items-center gap-1">
                      <Icon name="edit" size={13} />
                    </button>
                  )}
                  {canCreate && (
                    <button onClick={() => setModal({ type: "delete", cell })} className="btn btn-danger btn-sm flex items-center gap-1">
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[20px] border border-border-soft bg-white/70 px-6 py-16 text-center backdrop-blur">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-ink-faint">
            <Icon name="users" size={26} />
          </div>
          <p className="font-display text-[17px] font-bold text-ink">
            {hasFilters ? "Nenhuma célula encontrada" : "Nenhuma célula cadastrada ainda"}
          </p>
          <p className="mx-auto mt-1.5 max-w-[340px] text-sm text-ink-muted">
            {hasFilters ? "Tente ajustar os filtros de busca." : "Comece criando a primeira célula da sua igreja e organize melhor o acompanhamento dos membros."}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            {hasFilters && <button onClick={clearFilters} className="btn btn-secondary btn-sm">Limpar filtros</button>}
            {!hasFilters && canCreate && (
              <button onClick={() => setModal({ type: "form" })} className="btn btn-primary btn-sm flex items-center gap-1.5">
                <Icon name="plus" size={14} /> Criar primeira célula
              </button>
            )}
          </div>
        </div>
      )}

      {modal?.type === "form" && (
        <CellForm
          cell={modal.cell}
          members={members}
          cellMembers={cellMembers}
          networks={networks}
          toast={toast}
          close={() => setModal(null)}
          onSaved={async () => { setModal(null); await loadData(); }}
        />
      )}

      {modal?.type === "delete" && (
        <ConfirmDialog
          title="Excluir célula"
          message={`Você está prestes a excluir <strong>${modal.cell.name}</strong>. Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          onCancel={() => setModal(null)}
          onConfirm={() => void deleteCell(modal.cell)}
        />
      )}
    </PageShell>
  );
}
