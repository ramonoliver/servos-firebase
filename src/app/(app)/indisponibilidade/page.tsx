"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { Avatar, PageShell, PageHeader, DateField } from "@/components/ui";
import { supabase } from "@/lib/firebase";
import { formatDate } from "@/lib/utils/helpers";
import type { UnavailableDate, User, Event, Schedule } from "@/types";

const MONTH_LABEL = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

const WEEKDAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];

function toDateKey(date: Date) {
  return date.toISOString().split("T")[0];
}

function parseRecurringWeekday(event: Event) {
  const recurrence = event.recurrence || "";
  if (recurrence.startsWith("weekly:")) {
    const value = Number(recurrence.split(":")[1]);
    return Number.isInteger(value) ? value : null;
  }

  const normalized = `${event.name} ${event.description}`.toLowerCase();
  const weekdays = [
    "domingo",
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
  ];

  const index = weekdays.findIndex((weekday) => normalized.includes(weekday));
  return index >= 0 ? index : null;
}

export default function IndisponibilidadePage() {
  const { user, toast, canDo } = useApp();
  const isMember = user.role === "member";

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"single" | "range" | "vacation">("single");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [filterUser, setFilterUser] = useState("all");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const todayDate = new Date();
    return new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  });

  const [members, setMembers] = useState<User[]>([]);
  const [allUD, setAllUD] = useState<UnavailableDate[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  async function loadData() {
    setLoading(true);

    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("*")
      .eq("church_id", user.church_id)
      .eq("active", true);

    if (usersError) {
      console.error({ usersError });
      toast("Erro ao carregar indisponibilidades.");
      setLoading(false);
      return;
    }

    const memberIds = ((usersData || []) as User[]).map((member) => member.id);
    const [{ data: udData, error: udError }, { data: eventsData, error: eventsError }, { data: schedulesData, error: schedulesError }] = await Promise.all([
      memberIds.length
        ? supabase.from("unavailable_dates").select("*").in("user_id", memberIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("events").select("*").eq("church_id", user.church_id).eq("active", true),
      supabase.from("schedules").select("*").eq("church_id", user.church_id).neq("status", "cancelled"),
    ]);

    if (udError || eventsError || schedulesError) {
      console.error({ udError, eventsError, schedulesError });
      toast("Erro ao carregar indisponibilidades.");
      setLoading(false);
      return;
    }

    setMembers((usersData || []) as User[]);
    setAllUD((udData || []) as UnavailableDate[]);
    setEvents((eventsData || []) as Event[]);
    setSchedules((schedulesData || []) as Schedule[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [user.church_id]);

  const myUD = useMemo(() => {
    if (isMember) {
      return allUD.filter((u) => u.user_id === user.id);
    }

    return allUD.filter((u) => {
      const m = members.find((mem) => mem.id === u.user_id);
      return m?.church_id === user.church_id;
    });
  }, [allUD, isMember, user.id, user.church_id, members]);

  const filtered =
    filterUser === "all" ? myUD : myUD.filter((u) => u.user_id === filterUser);

  const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter((u) => u.date >= today);
  const past = sorted.filter((u) => u.date < today);

  async function save() {
    if (!date) {
      toast("Selecione a data.");
      return;
    }

    if (type === "range" && !endDate) {
      toast("Selecione a data final.");
      return;
    }

    if (type === "range" && endDate < date) {
      toast("Data final deve ser após a inicial.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/unavailable-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          date,
          endDate,
          reason,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("Erro ao registrar indisponibilidade:", data);
        toast(data?.error || "Erro ao registrar indisponibilidade.");
        setSaving(false);
        return;
      }

      toast("Indisponibilidade registrada!");
      setShowForm(false);
      setDate("");
      setEndDate("");
      setReason("");
      setType("single");
      setSaving(false);
      await loadData();
    } catch (error) {
      console.error("Erro ao registrar indisponibilidade:", error);
      toast("Erro ao registrar indisponibilidade.");
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remover esta indisponibilidade?")) return;

    try {
      const params = new URLSearchParams({
        unavailableDateId: id,
      });

      const response = await fetch(`/api/unavailable-dates?${params.toString()}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("Erro ao remover indisponibilidade:", data);
        toast(data?.error || "Erro ao remover indisponibilidade.");
        return;
      }

      toast("Removida.");
      await loadData();
    } catch (error) {
      console.error("Erro ao remover indisponibilidade:", error);
      toast("Erro ao remover indisponibilidade.");
    }
  }

  const typeLabel = (t: string) =>
    t === "single" ? "Data única" : t === "range" ? "Período" : "Férias";

  const typeColor = (t: string) =>
    t === "single" ? "badge-amber" : t === "range" ? "badge-brand" : "badge-red";

  const monthDays = useMemo(() => {
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const start = new Date(firstDay);
    start.setDate(start.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }).map((_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [currentMonth]);

  const highlightedDates = useMemo(() => {
    const map = new Map<string, { labels: string[]; hasSchedule: boolean }>();
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const addHighlight = (dateKey: string, label: string, hasSchedule = false) => {
      const current = map.get(dateKey) || { labels: [], hasSchedule: false };
      if (!current.labels.includes(label)) {
        current.labels.push(label);
      }
      current.hasSchedule = current.hasSchedule || hasSchedule;
      map.set(dateKey, current);
    };

    schedules.forEach((schedule) => {
      if (schedule.date >= toDateKey(monthStart) && schedule.date <= toDateKey(monthEnd)) {
        addHighlight(schedule.date, "Escala", true);
      }
    });

    events.forEach((event) => {
      const weekday = parseRecurringWeekday(event);
      if (weekday === null) return;

      for (let day = 1; day <= monthEnd.getDate(); day += 1) {
        const current = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        if (current.getDay() === weekday) {
          addHighlight(toDateKey(current), `${event.name} · ${event.base_time || ""}`.trim());
        }
      }
    });

    return map;
  }, [currentMonth, events, schedules]);

  const myUnavailableDates = new Set(allUD.filter((item) => item.user_id === user.id).map((item) => item.date));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Disponibilidade"
        title="Indisponibilidade"
        subtitle={
          isMember
            ? "Informe quando não poderá ser escalado"
            : "Veja quando os membros estão indisponíveis"
        }
        actions={
          <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">
            + Registrar
          </button>
        }
      />

      {!isMember && (
        <div className="mb-5">
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="input-field max-w-xs"
          >
            <option value="all">Todos os membros</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {isMember && (
        <div className="card mb-6 overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-border-soft flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-display text-[17px]">Calendário do mês</div>
              <div className="text-sm text-ink-muted">
                Dias de cultos e escalas aparecem destacados. Clique em um dia para registrar indisponibilidade.
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                className="btn btn-secondary btn-sm"
              >
                &larr;
              </button>
              <div className="text-sm font-semibold min-w-[110px] sm:min-w-[140px] text-center capitalize">
                {MONTH_LABEL.format(currentMonth)}
              </div>
              <button
                onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                className="btn btn-secondary btn-sm"
              >
                &rarr;
              </button>
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="grid grid-cols-7 gap-2 mb-2">
              {WEEKDAY_SHORT.map((label) => (
                <div key={label} className="text-center text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {monthDays.map((calendarDay) => {
                const dateKey = toDateKey(calendarDay);
                const isCurrentMonth = calendarDay.getMonth() === currentMonth.getMonth();
                const highlight = highlightedDates.get(dateKey);
                const isUnavailable = myUnavailableDates.has(dateKey);

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => {
                      setDate(dateKey);
                      setType("single");
                      setEndDate("");
                      setShowForm(true);
                    }}
                    className={`min-h-[88px] rounded-2xl border p-2 text-left transition-all ${
                      isCurrentMonth
                        ? "border-border-soft bg-white"
                        : "border-transparent bg-surface-alt/70 text-ink-ghost"
                    } ${
                      highlight
                        ? highlight.hasSchedule
                          ? "ring-2 ring-brand/25 border-brand-light bg-brand-glow"
                          : "border-amber/30 bg-amber-light/60"
                        : ""
                    } ${isUnavailable ? "border-danger/30 bg-danger-light/70" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{calendarDay.getDate()}</span>
                      {isUnavailable && <span className="text-[9px] font-bold text-danger uppercase">Indisp.</span>}
                    </div>

                    {highlight ? (
                      <div className="mt-2 space-y-1">
                        {highlight.labels.slice(0, 2).map((label) => (
                          <div key={label} className="text-[10px] leading-tight text-ink-muted line-clamp-2">
                            {label}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-ink-ghost">Sem evento</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card mb-6">
          <div className="px-5 pt-4 pb-3 border-b border-border-soft">
            <span className="font-display text-[17px]">Nova indisponibilidade</span>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="input-label">Tipo</label>
              <div className="flex gap-2 flex-wrap">
                {(["single", "range", "vacation"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                      type === t
                        ? "bg-brand text-white border-brand"
                        : "border-border text-ink-muted hover:border-ink-ghost"
                    }`}
                  >
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="input-label">
                  {type === "single" ? "Data" : "Data inicial"}
                </label>
                <DateField value={date} onChange={setDate} min={today} />
              </div>

              {type !== "single" && (
                <div>
                  <label className="input-label">Data final</label>
                  <DateField value={endDate} onChange={setEndDate} min={date || today} />
                </div>
              )}
            </div>

            <div>
              <label className="input-label">
                Motivo{" "}
                <span className="text-ink-ghost font-normal">
                  (opcional — visível apenas para líderes)
                </span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="ex: Viagem, consulta médica..."
                className="input-field"
                maxLength={100}
              />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowForm(false)} className="btn btn-ghost">
                Cancelar
              </button>
              <button onClick={save} disabled={saving} className="btn btn-primary">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-5">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border-soft">
          <span className="font-display text-[17px]">Próximas</span>
          <span className="badge badge-amber">{upcoming.length}</span>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-ink-faint">
            Carregando indisponibilidades...
          </div>
        ) : upcoming.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-ink-faint">
            Nenhuma indisponibilidade registrada.
          </div>
        ) : (
          upcoming.map((ud) => {
            const m = members.find((u) => u.id === ud.user_id);
            const canRemove = ud.user_id === user.id || canDo("member.edit");

            return (
              <div
                key={ud.id}
                className="flex items-center gap-3.5 px-5 py-3.5 border-b border-border-soft last:border-b-0"
              >
                {!isMember && m && (
                  <Avatar name={m.name} color={m.avatar_color} photoUrl={m.photo_url} size={32} />
                )}

                <div className="flex-1 min-w-0">
                  {!isMember && m && (
                    <div className="text-sm font-semibold truncate">{m.name}</div>
                  )}

                  <div className="text-[13px] text-ink-soft">
                    {formatDate(ud.date)}
                    {ud.end_date && ` → ${formatDate(ud.end_date)}`}
                  </div>

                  {ud.reason && !isMember && (
                    <div className="text-[11px] text-ink-faint mt-0.5">{ud.reason}</div>
                  )}
                </div>

                <span className={`badge ${typeColor(ud.type)}`}>{typeLabel(ud.type)}</span>

                {canRemove && (
                  <button
                    onClick={() => remove(ud.id)}
                    className="text-ink-ghost hover:text-danger transition-colors ml-1 p-1"
                    title="Remover"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {past.length > 0 && (
        <details className="card">
          <summary className="px-5 py-3 cursor-pointer text-sm font-medium text-ink-muted hover:text-ink transition-colors list-none flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Histórico ({past.length} registros)
          </summary>

          {past.slice(-20).reverse().map((ud) => {
            const m = members.find((u) => u.id === ud.user_id);

            return (
              <div key={ud.id} className="flex items-center gap-3 px-5 py-3 border-t border-border-soft opacity-50">
                {!isMember && m && (
                  <Avatar name={m.name} color={m.avatar_color} photoUrl={m.photo_url} size={28} />
                )}

                <div className="flex-1 min-w-0 text-[12px] text-ink-muted">
                  {!isMember && m && <span className="font-medium">{m.name} · </span>}
                  {formatDate(ud.date)}
                  {ud.end_date && ` → ${formatDate(ud.end_date)}`}
                </div>

                <span className={`badge ${typeColor(ud.type)} opacity-60`}>
                  {typeLabel(ud.type)}
                </span>
              </div>
            );
          })}
        </details>
      )}
    </PageShell>
  );
}
