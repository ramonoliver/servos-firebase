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
    if (drawerEvents.length === 0) {
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("church_id", user.church_id)
        .eq("active", true);
      const evts = (data || []) as Event[];
      setDrawerEvents(evts);
      if (evts.length > 0 && !newEventId) setNewEventId(evts[0].id);
    }
    if (!newDeptId && departments.length > 0) setNewDeptId(departments[0].id);
    setDrawerOpen(true);
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
      <div className="px-4 py-3 border-b border-white/50 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="font-display text-[15px] font-bold text-ink">Escalas</h1>
          <p className="text-[11px] text-ink-faint">{schedules.length} no total</p>
        </div>
        {canDo("schedule.create") && (
          <button
            onClick={openCreationDrawer}
            className="w-7 h-7 rounded-lg bg-brand text-white flex items-center justify-center hover:opacity-90 transition-opacity text-lg leading-none"
            title="Nova Escala"
            aria-label="Nova Escala"
          >
            +
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="px-3 py-2 border-b border-white/50 flex gap-0.5 flex-shrink-0">
        {(["all", "active", "draft"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
              filter === f ? "bg-white/60 text-ink shadow-sm" : "text-ink-muted hover:bg-white/40 hover:text-ink"
            }`}
          >
            {f === "all" ? "Todas" : f === "active" ? "Ativas" : "Rascunhos"}
          </button>
        ))}
      </div>

      {/* Schedule list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-ink-faint">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
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
                className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-white/40 transition-colors group ${
                  isSelected ? "bg-white/40" : "hover:bg-white/30"
                }`}
              >
                <div className="w-9 h-[38px] rounded-lg bg-white/50 border border-white/60 flex flex-col items-center justify-center flex-shrink-0 backdrop-blur-sm">
                  <span className="text-[7px] font-bold uppercase text-ink-faint">{getDayName(s.date)}</span>
                  <span className="font-display text-[14px] text-ink leading-none">{s.date.split("-")[2]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-ink truncate">{ev?.name || "Escala"}</div>
                  <div className="text-[11px] text-ink-faint truncate">{dept?.name} · {s.time}</div>
                  {s.status === "draft" && (
                    <span className="inline-block mt-0.5 text-[9px] font-semibold text-info bg-info/10 px-1.5 py-0.5 rounded-full">
                      Rascunho
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {sm.length > 0 && (
                    <span className={`text-[10px] font-semibold ${confirmed === sm.length ? "text-success" : "text-amber"}`}>
                      {confirmed}/{sm.length}
                    </span>
                  )}
                  {canDo("schedule.delete") && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setScheduleToDelete(s.id); }}
                      className="text-[10px] text-danger opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                      title="Excluir"
                    >
                      excluir
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
      <div>
        <p className="text-4xl mb-3 opacity-20">📅</p>
        <p className="text-sm text-ink-faint">Selecione uma escala para ver os detalhes</p>
        {canDo("schedule.create") && (
          <button onClick={openCreationDrawer} className="mt-3 text-sm font-semibold text-brand hover:underline">
            + Nova Escala
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <SplitView list={listPanel} detail={detailPanel} listWidth={280} placeholder={placeholder} />

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
