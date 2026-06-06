"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { formatDate, getDayName } from "@/lib/utils/helpers";
import { ActionDrawer, ConfirmDialog, PageHeader, PageShell } from "@/components/ui";
import { SoftCard } from "@/components/pastoral/pastoral-ui";
import { EscalaDetailPanel } from "@/components/escalas/escala-detail-panel";
import type { Schedule, ScheduleMember, Event } from "@/types";

function Icon({ name, size = 15 }: { name: string; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    check: <><path d="M20 6L9 17l-5-5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    eye: <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></>,
    users: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>,
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

function EscalasPageInner() {
  const { user, canDo, toast, departments } = useApp();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft">("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "upcoming" | "past">("all");
  const [search, setSearch] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [allSM, setAllSM] = useState<ScheduleMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const visibleDepartmentIds = departments.map((d) => d.id);

    const [
      { data: schedulesData, error: schedulesError },
      { data: eventsData, error: eventsError },
      { data: smData, error: smError },
    ] = await Promise.all([
      supabase.from("schedules").select("*").eq("church_id", user.church_id),
      supabase.from("events").select("*").eq("church_id", user.church_id),
      supabase.from("schedule_members").select("*"),
    ]);

    if (schedulesError || eventsError || smError) {
      console.error({ schedulesError, eventsError, smError });
      toast("Erro ao carregar escalas.");
      setLoading(false);
      return;
    }

    const scopedSchedules =
      user.role === "admin"
        ? ((schedulesData || []) as Schedule[])
        : ((schedulesData || []) as Schedule[]).filter((s) =>
            visibleDepartmentIds.includes(s.department_id)
          );
    const scopedScheduleIds = new Set(scopedSchedules.map((s) => s.id));

    setSchedules(scopedSchedules.filter((s) => s.status !== "cancelled"));
    setEvents((eventsData || []) as Event[]);
    setAllSM(
      ((smData || []) as ScheduleMember[]).filter((sm) => scopedScheduleIds.has(sm.schedule_id))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [user.church_id, departments.length]);

  useEffect(() => {
    const idFromQuery = searchParams.get("id");
    if (idFromQuery) setSelectedScheduleId(idFromQuery);
  }, [searchParams]);

  function closeDetail() {
    setSelectedScheduleId(null);
    if (searchParams.get("id")) router.replace("/escalas", { scroll: false });
  }

  async function deleteSchedule(id: string) {
    try {
      const response = await fetch("/api/schedules/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast(data?.error || "Erro ao excluir escala.");
        return;
      }
      toast("Escala excluída.");
      if (selectedScheduleId === id) closeDetail();
      await loadData();
    } catch {
      toast("Erro ao excluir escala.");
    } finally {
      setScheduleToDelete(null);
    }
  }

  const scheduleMembersById = useMemo(() => {
    const map = new Map<string, ScheduleMember[]>();
    allSM.forEach((member) => {
      const current = map.get(member.schedule_id) || [];
      current.push(member);
      map.set(member.schedule_id, current);
    });
    return map;
  }, [allSM]);

  const stats = useMemo(() => {
    const published = schedules.filter((s) => s.status === "active").length;
    const draft = schedules.filter((s) => s.status === "draft").length;
    const pending = allSM.filter((m) => m.status !== "confirmed").length;
    return { published, draft, pending };
  }, [schedules, allSM]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    return schedules
      .filter((schedule) => {
        const event = events.find((e) => e.id === schedule.event_id);
        const dept = departments.find((d) => d.id === schedule.department_id);
        const members = scheduleMembersById.get(schedule.id) || [];
        const matchesSearch = !term ||
          (event?.name || "").toLowerCase().includes(term) ||
          (dept?.name || "").toLowerCase().includes(term) ||
          (schedule.instructions || "").toLowerCase().includes(term) ||
          members.some((m) => (m.function_name || "").toLowerCase().includes(term));
        const matchesStatus = statusFilter === "all" || schedule.status === statusFilter;
        const matchesDepartment = departmentFilter === "all" || schedule.department_id === departmentFilter;
        const matchesDate = dateFilter === "all" || (dateFilter === "upcoming" ? schedule.date >= today : schedule.date < today);
        return matchesSearch && matchesStatus && matchesDepartment && matchesDate;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  }, [schedules, events, departments, scheduleMembersById, search, statusFilter, departmentFilter, dateFilter]);

  const hasFilters = Boolean(search || statusFilter !== "all" || departmentFilter !== "all" || dateFilter !== "all");

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setDateFilter("all");
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Operação"
        title="Escalas"
        subtitle="Acompanhe publicações, equipes escaladas e confirmações por ministério."
        actions={
          canDo("schedule.create") ? (
            <Link href="/escalas/nova" className="btn btn-primary btn-sm flex items-center gap-1.5">
              <Icon name="plus" size={14} /> Nova escala
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2">
        <StatChip value={schedules.length} label="escalas" />
        {stats.published > 0 && <StatChip value={stats.published} label="Publicadas" color="success" />}
        {stats.draft > 0 && <StatChip value={stats.draft} label="Rascunhos" color="info" />}
        {stats.pending > 0 && <StatChip value={stats.pending} label="pendências" color="amber" />}
      </div>

      <SoftCard className="mb-0 p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_160px_190px_160px]">
          <input
            className="input-field"
            placeholder="Buscar por evento, ministério ou função..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">Todos os status</option>
            <option value="active">Publicadas</option>
            <option value="draft">Rascunhos</option>
          </select>
          <select className="input-field" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
            <option value="all">Todos os ministérios</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
          <select className="input-field" value={dateFilter} onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}>
            <option value="all">Todas as datas</option>
            <option value="upcoming">Próximas</option>
            <option value="past">Anteriores</option>
          </select>
        </div>
      </SoftCard>

      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-ink-faint">
          {loading ? "Carregando..." : `${filtered.length} ${filtered.length === 1 ? "escala encontrada" : "escalas encontradas"}`}
        </span>
        {hasFilters && (
          <button className="btn btn-ghost btn-sm flex items-center gap-1 text-ink-faint" onClick={clearFilters}>
            <Icon name="x" size={13} /> Limpar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[210px] rounded-[18px] bg-surface-alt animate-pulse" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((schedule) => {
            const event = events.find((e) => e.id === schedule.event_id);
            const department = departments.find((d) => d.id === schedule.department_id);
            const members = scheduleMembersById.get(schedule.id) || [];
            const confirmed = members.filter((m) => m.status === "confirmed").length;
            const progress = members.length ? Math.round((confirmed / members.length) * 100) : 0;
            const statusCls = schedule.status === "active" ? "bg-success-light text-success" : "bg-info-light text-info";
            const progressCls = members.length === 0 ? "bg-ink-ghost" : progress === 100 ? "bg-success" : progress >= 50 ? "bg-info" : "bg-amber";

            return (
              <div key={schedule.id} className="group flex flex-col rounded-[18px] border border-border-soft bg-white/70 p-4 shadow-soft backdrop-blur transition-all hover:border-white hover:bg-white/85 hover:shadow-lift">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex h-14 w-12 flex-shrink-0 flex-col items-center justify-center rounded-[14px] border border-white/70 bg-white/70 backdrop-blur-sm">
                      <span className="text-[8px] font-bold uppercase text-ink-faint">{getDayName(schedule.date)}</span>
                      <span className="font-display text-[18px] leading-none text-ink">{schedule.date.split("-")[2]}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setSelectedScheduleId(schedule.id)}
                        className="block max-w-full truncate text-left font-display text-[16px] font-bold text-ink transition-colors hover:text-brand-deep"
                      >
                        {event?.name || "Escala"}
                      </button>
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {[department?.name || "Ministério", formatDate(schedule.date), schedule.time].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusCls}`}>
                    {schedule.status === "active" ? "Publicada" : "Rascunho"}
                  </span>
                </div>

                <p className="mt-3 line-clamp-2 min-h-[34px] text-[12px] leading-relaxed text-ink-muted">
                  {schedule.instructions || "Sem observações cadastradas para esta escala."}
                </p>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-alt">
                  <div className={`h-1.5 rounded-full transition-all ${progressCls}`} style={{ width: `${members.length ? progress : 100}%` }} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2 py-1 text-[10px] font-bold text-ink-faint">
                    <Icon name="users" size={11} /> {members.length} pessoa{members.length === 1 ? "" : "s"}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${progress === 100 && members.length > 0 ? "bg-success-light text-success" : "bg-amber-light text-amber"}`}>
                    <Icon name="check" size={11} /> {confirmed}/{members.length} confirmados
                  </span>
                  {schedule.arrival_time && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2 py-1 text-[10px] font-bold text-ink-faint">
                      <Icon name="clock" size={11} /> Chegada {schedule.arrival_time}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex gap-2 border-t border-border-soft pt-3">
                  <button onClick={() => setSelectedScheduleId(schedule.id)} className="btn btn-primary btn-sm flex flex-1 items-center justify-center gap-1.5">
                    <Icon name="eye" size={13} /> Ver detalhes
                  </button>
                  {canDo("schedule.delete") && (
                    <button onClick={() => setScheduleToDelete(schedule.id)} className="btn btn-danger btn-sm flex items-center gap-1" aria-label="Excluir escala">
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
            <Icon name="calendar" size={26} />
          </div>
          <p className="font-display text-[17px] font-bold text-ink">
            {hasFilters ? "Nenhuma escala encontrada" : "Nenhuma escala cadastrada ainda"}
          </p>
          <p className="mx-auto mt-1.5 max-w-[340px] text-sm text-ink-muted">
            {hasFilters ? "Tente ajustar os filtros de busca." : "Crie a primeira escala para organizar equipes, funções e confirmações em um só lugar."}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            {hasFilters && <button onClick={clearFilters} className="btn btn-secondary btn-sm">Limpar filtros</button>}
            {!hasFilters && canDo("schedule.create") && (
              <Link href="/escalas/nova" className="btn btn-primary btn-sm flex items-center gap-1.5">
                <Icon name="plus" size={14} /> Criar primeira escala
              </Link>
            )}
          </div>
        </div>
      )}

      <ActionDrawer
        open={Boolean(selectedScheduleId)}
        onClose={closeDetail}
        title="Visualizar escala"
        width={920}
      >
        {selectedScheduleId && (
          <div className="min-h-[70dvh]">
            <EscalaDetailPanel
              key={selectedScheduleId}
              scheduleId={selectedScheduleId}
              onRefreshList={loadData}
            />
          </div>
        )}
      </ActionDrawer>

      {scheduleToDelete && (
        <ConfirmDialog
          title="Excluir escala"
          message="Esta ação remove a escala e não pode ser desfeita."
          confirmLabel="Excluir"
          onCancel={() => setScheduleToDelete(null)}
          onConfirm={() => void deleteSchedule(scheduleToDelete)}
        />
      )}
    </PageShell>
  );
}

export default function EscalasPage() {
  return (
    <Suspense>
      <EscalasPageInner />
    </Suspense>
  );
}
