"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { getDayName } from "@/lib/utils/helpers";
import { ConfirmDialog, DateField } from "@/components/ui";
import { ActionDrawer } from "@/components/ui/action-drawer";
import { SplitView } from "@/components/ui/split-view";
import { EscalaDetailPanel } from "@/components/escalas/escala-detail-panel";
import type { Schedule, ScheduleMember, Event } from "@/types";

function EscalasPageInner() {
  const { user, canDo, toast, departments } = useApp();
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedId = searchParams.get("id");

  const [filter, setFilter] = useState<"all" | "active" | "draft">("all");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [allSM, setAllSM] = useState<ScheduleMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEvents, setDrawerEvents] = useState<Event[]>([]);
  const [creating, setCreating] = useState(false);
  const [newEventId, setNewEventId] = useState("");
  const [newDeptId, setNewDeptId] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("18:00");

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

    setSchedules(scopedSchedules);
    setEvents((eventsData || []) as Event[]);
    setAllSM(
      ((smData || []) as ScheduleMember[]).filter((sm) => scopedScheduleIds.has(sm.schedule_id))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [user.church_id, departments.length]);

  async function openCreationDrawer() {
    router.push("/escalas/nova");
  }

  async function createSchedule() {
    if (!newEventId || !newDeptId || !newDate) {
      toast("Preencha todos os campos.");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/schedules/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: newEventId,
          departmentId: newDeptId,
          date: newDate,
          time: newTime,
          arrivalTime: "",
          instructions: "",
          publish: false,
          selectedIds: [],
          functionTargets: {},
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        toast(data?.error || "Erro ao criar escala.");
        return;
      }
      toast("Rascunho criado!");
      setDrawerOpen(false);
      setNewDate("");
      await loadData();
      router.push(`/escalas?id=${data.scheduleId}`);
    } catch {
      toast("Erro ao criar escala.");
    } finally {
      setCreating(false);
    }
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
      if (selectedId === id) router.push("/escalas");
      await loadData();
    } catch {
      toast("Erro ao excluir escala.");
    } finally {
      setScheduleToDelete(null);
    }
  }

  const filtered = useMemo(() => {
    return schedules
      .filter((s) => filter === "all" || s.status === filter)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [schedules, filter]);

  const listPanel = (
    <div className="flex flex-col h-full">
      {/* List header */}
      <div className="px-5 py-4 border-b border-white/50 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="font-display text-[20px] font-bold text-ink">Escalas</h1>
          <p className="text-[12px] text-ink-faint">{schedules.length} escala{schedules.length === 1 ? "" : "s"} no total</p>
        </div>
        {canDo("schedule.create") && (
          <button
            onClick={openCreationDrawer}
            className="btn btn-primary btn-sm"
            title="Nova Escala"
            aria-label="Nova Escala"
          >
            Nova escala
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="px-4 py-3 border-b border-white/50 flex gap-1 flex-shrink-0">
        {(["all", "active", "draft"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
              filter === f ? "bg-white/60 text-ink shadow-sm" : "text-ink-muted hover:bg-white/40 hover:text-ink"
            }`}
          >
            {f === "all" ? "Todas" : f === "active" ? "Ativas" : "Rascunhos"}
          </button>
        ))}
      </div>

      {/* Schedule list */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-[18px] bg-white/55" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-border-soft bg-white/55 px-4 py-8 text-center">
            <p className="text-sm text-ink-faint mb-2">Nenhuma escala</p>
            {canDo("schedule.create") && (
              <button onClick={openCreationDrawer} className="text-sm font-semibold text-brand hover:underline">
                + Criar
              </button>
            )}
          </div>
        ) : (
          filtered.map((s) => {
            const ev = events.find((e) => e.id === s.event_id);
            const dept = departments.find((d) => d.id === s.department_id);
            const sm = allSM.filter((m) => m.schedule_id === s.id);
            const confirmed = sm.filter((m) => m.status === "confirmed").length;
            const isSelected = selectedId === s.id;

            return (
              <button
                key={s.id}
                onClick={() => router.push(`/escalas?id=${s.id}`)}
                className={`group mb-3 w-full rounded-[18px] border p-3.5 text-left transition-all ${
                  isSelected ? "border-brand/30 bg-brand-glow shadow-sm" : "border-white/60 bg-white/62 hover:border-brand/20 hover:bg-white/85"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-12 flex-shrink-0 flex-col items-center justify-center rounded-[14px] border border-white/70 bg-white/70 backdrop-blur-sm">
                    <span className="text-[8px] font-bold uppercase text-ink-faint">{getDayName(s.date)}</span>
                    <span className="font-display text-[18px] leading-none text-ink">{s.date.split("-")[2]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold text-ink">{ev?.name || "Escala"}</div>
                    <div className="mt-1 truncate text-[12px] text-ink-faint">{dept?.name || "Ministério"} · {s.time}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className={`badge ${s.status === "active" ? "badge-green" : "badge-info"}`}>
                        {s.status === "active" ? "Publicada" : "Rascunho"}
                      </span>
                      {sm.length > 0 && (
                        <span className={`badge ${confirmed === sm.length ? "badge-green" : "badge-amber"}`}>
                          {confirmed}/{sm.length} confirmados
                        </span>
                      )}
                    </div>
                  </div>
                  {canDo("schedule.delete") && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setScheduleToDelete(s.id); }}
                      className="rounded-full px-2 py-1 text-[11px] font-semibold text-danger opacity-0 transition-opacity hover:bg-danger-light group-hover:opacity-100"
                      title="Excluir"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const detailPanel = selectedId ? (
    <EscalaDetailPanel
      key={selectedId}
      scheduleId={selectedId}
      onRefreshList={loadData}
    />
  ) : null;

  const placeholder = (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div className="max-w-[320px]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand-light text-brand">
          <span className="text-2xl">▣</span>
        </div>
        <p className="font-display text-lg text-ink">Selecione uma escala</p>
        <p className="mt-1 text-sm text-ink-faint">Veja participantes, confirmações, anexos e chat em um só painel.</p>
        {canDo("schedule.create") && (
          <button onClick={openCreationDrawer} className="btn btn-primary btn-sm mt-4">
            Nova escala
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <SplitView list={listPanel} detail={detailPanel} listWidth={360} placeholder={placeholder} />

      {/* Creation drawer */}
      <ActionDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Nova Escala"
        width={360}
      >
        <div className="space-y-4">
          <div>
            <label className="input-label">Evento</label>
            <select
              className="input-field"
              value={newEventId}
              onChange={(e) => setNewEventId(e.target.value)}
            >
              {drawerEvents.length === 0 && <option value="">Nenhum evento ativo</option>}
              {drawerEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="input-label">Ministério</label>
            <select
              className="input-field"
              value={newDeptId}
              onChange={(e) => setNewDeptId(e.target.value)}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Data</label>
              <DateField value={newDate} onChange={setNewDate} />
            </div>
            <div>
              <label className="input-label">Horário</label>
              <input
                type="time"
                className="input-field"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
            </div>
          </div>

          <p className="text-[12px] text-ink-faint">
            A escala será criada como rascunho. Adicione membros e publique no painel de detalhes.
          </p>

          <button
            onClick={createSchedule}
            disabled={creating || !newEventId || !newDeptId || !newDate}
            className="btn btn-primary w-full"
          >
            {creating ? "Criando..." : "Criar rascunho"}
          </button>
        </div>
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
    </>
  );
}

export default function EscalasPage() {
  return (
    <Suspense>
      <EscalasPageInner />
    </Suspense>
  );
}
