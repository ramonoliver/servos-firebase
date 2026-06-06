"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { PageShell, PageHeader } from "@/components/ui";
import { fetchCells } from "@/lib/cells/client";
import { EventFormModal } from "@/components/events/event-form-modal";
import { parseEventCalendarRecurrence } from "@/lib/events/recurrence";
import type { Cell, CellMemberRow } from "@/lib/cells/types";
import Link from "next/link";
import type { Schedule, Event, ScheduleMember } from "@/types";

const WEEKDAY_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
type Birthday = { id: string; name: string; role: string; day: number; month: number; phone: string; color: string };

/** Deriva os aniversários reais dos membros a partir do campo birth_date. */
function buildBirthdays(members: Array<Record<string, any>>): Birthday[] {
  const result: Birthday[] = [];
  for (const m of members) {
    const iso = String(m.birth_date || "").trim();
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) continue;
    const monthIdx = Number(match[2]) - 1;
    const day = Number(match[3]);
    if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) continue;
    const role =
      m.role === "admin" ? "Administrador" : m.role === "leader" ? "Líder" : "Membro";
    result.push({
      id: m.id,
      name: m.name || "Sem nome",
      role,
      day,
      month: monthIdx,
      phone: m.phone || "",
      color: m.avatar_color || "#FF6B57",
    });
  }
  return result;
}

function AgendaEventIcon({ special = false }: { special?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {special ? (
        <>
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
        </>
      ) : (
        <>
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </>
      )}
    </svg>
  );
}

export default function CalendarioPage() {
  const { user, departments, canDo, toast } = useApp();
  const now = new Date();

  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());
  const [showEventForm, setShowEventForm] = useState(false);

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [allSM, setAllSM] = useState<ScheduleMember[]>([]);
  const [cellList, setCellList] = useState<Cell[]>([]);
  const [cellMembers, setCellMembers] = useState<CellMemberRow[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);

  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  async function loadData() {
    setLoading(true);

    // Cells already come scoped by role from the server (admin/pastor/coord
    // see all; supervisor sees their networks; leader/member see their cells).
    try {
      const { cells: visibleCells, cellMembers: cm } = await fetchCells();
      setCellList(visibleCells);
      setCellMembers(cm);
    } catch (cellsError) {
      console.warn("Falha ao carregar células na agenda:", cellsError);
    }

    const visibleDepartmentIds = departments.map((department) => department.id);

    const [
      { data: schedulesData, error: schedulesError },
      { data: eventsData, error: eventsError },
      { data: membersData },
    ] = await Promise.all([
      supabase
        .from("schedules")
        .select("*")
        .eq("church_id", user.church_id)
        .neq("status", "cancelled"),
      supabase.from("events").select("*").eq("church_id", user.church_id).neq("active", false),
      supabase.from("users").select("*").eq("church_id", user.church_id),
    ]);

    setBirthdays(buildBirthdays((membersData || []) as Array<Record<string, any>>));

    if (schedulesError || eventsError) {
      console.error({ schedulesError, eventsError });
      setLoading(false);
      return;
    }

    const scheduleIds = ((schedulesData || []) as Schedule[]).map((schedule) => schedule.id);
    const { data: smData, error: smError } = scheduleIds.length
      ? await supabase.from("schedule_members").select("*").in("schedule_id", scheduleIds)
      : { data: [], error: null };

    if (smError) {
      console.error({ smError });
      setLoading(false);
      return;
    }

    const scopedSchedules =
      user.role === "admin"
        ? ((schedulesData || []) as Schedule[])
        : ((schedulesData || []) as Schedule[]).filter((schedule) =>
            visibleDepartmentIds.includes(schedule.department_id)
          );
    const scopedScheduleIds = new Set(scopedSchedules.map((schedule) => schedule.id));

    setSchedules(scopedSchedules);
    setEvents((eventsData || []) as Event[]);
    setAllSM(((smData || []) as ScheduleMember[]).filter((scheduleMember) => scopedScheduleIds.has(scheduleMember.schedule_id)));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [user.church_id, departments.length]);

  const cells = useMemo(() => {
    const result: Array<number | null> = [];
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    return result;
  }, [firstDay, daysInMonth]);

  const selectedDateStr = selectedDay
    ? `${year}-${String(month + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`
    : null;

  const daySchedules = useMemo(() => {
    if (!selectedDateStr) return [];
    return schedules.filter((s) => s.date === selectedDateStr);
  }, [selectedDateStr, schedules]);

  const myScheduleIds = useMemo(
    () => new Set(allSM.filter((item) => item.user_id === user.id).map((item) => item.schedule_id)),
    [allSM, user.id]
  );

  const myCellIds = useMemo(() => {
    const set = new Set<string>();
    cellList.forEach((c) => {
      if ((c.leader_ids || []).includes(user.id) || (c.co_leader_ids || []).includes(user.id)) set.add(c.id);
    });
    cellMembers.forEach((cm) => {
      if (cm.user_id === user.id) set.add(cm.cell_id);
    });
    return set;
  }, [cellList, cellMembers, user.id]);

  const dayCells = useMemo(
    () => (selectedDay ? getCellsForDay(selectedDay) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedDay, cellList, year, month]
  );

  const dayEvents = useMemo(
    () => (selectedDay ? getEventsForDay(selectedDay) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedDay, events, year, month]
  );

  const dayBirthdays = useMemo(
    () => birthdays.filter((birthday) => birthday.month === month && birthday.day === selectedDay),
    [selectedDay, month, birthdays]
  );

  const monthStats = useMemo(() => {
    let recurringDays = 0;
    let specialDays = 0;
    let myDays = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dailySchedules = getSchedulesForDay(day);
      const dailyEvents = getEventsForDay(day);
      const dailyBirthdays = birthdays.filter((birthday) => birthday.month === month && birthday.day === day);
      if (dailySchedules.length === 0 && dailyEvents.length === 0 && dailyBirthdays.length === 0) continue;

      const hasRecurring = dailySchedules.some((schedule) => {
        const event = events.find((item) => item.id === schedule.event_id);
        return event?.type === "recurring";
      }) || dailyEvents.some((event) => event.type === "recurring");

      const hasSpecial = dailySchedules.some((schedule) => {
        const event = events.find((item) => item.id === schedule.event_id);
        return event?.type === "special";
      }) || dailyEvents.some((event) => event.type === "special");

      const hasMine = dailySchedules.some((schedule) => myScheduleIds.has(schedule.id));

      if (hasRecurring) recurringDays += 1;
      if (hasSpecial) specialDays += 1;
      if (hasMine) myDays += 1;
    }

    return { recurringDays, specialDays, myDays };
  }, [daysInMonth, schedules, events, myScheduleIds, year, month]);

  function getSchedulesForDay(day: number) {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return schedules.filter((s) => s.date === ds);
  }

  function getCellsForDay(day: number) {
    const wd = WEEKDAY_PT[new Date(year, month, day).getDay()];
    return cellList.filter((c) => c.week_day === wd);
  }

  function getEventsForDay(day: number) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(year, month, day).getDay();

    return events.filter((event) => {
      const parsed = parseEventCalendarRecurrence(event);
      if (!parsed) return false;
      if (parsed.type === "weekly") return parsed.weekday === weekday;
      return parsed.date === date;
    });
  }

  return (
    <PageShell className="[font-family:'Inter','Plus_Jakarta_Sans',system-ui,sans-serif]">
      <PageHeader
        eyebrow="Agenda"
        title="Agenda"
        subtitle="Veja cultos, eventos, células e escalas em uma leitura única. Clique em um evento para registrar o pós-evento da ocorrência."
        actions={
          canDo("event.create") && (
            <button
              type="button"
              onClick={() => setShowEventForm(true)}
              className="btn btn-primary btn-sm"
            >
              + Novo evento
            </button>
          )
        }
      />

      <section className="relative overflow-hidden rounded-[34px] border border-white bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF0EC_48%,#FAFAF8_100%)] p-6 shadow-[0_28px_80px_-54px_rgba(244,83,42,0.34)] md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Operação pastoral
            </div>
            <h2 className="max-w-[720px] text-[30px] font-bold leading-tight tracking-[-0.045em] text-ink md:text-[38px]">
              A agenda como centro do cuidado da semana.
            </h2>
            <p className="mt-3 max-w-[640px] text-[14px] leading-6 text-ink-muted">
              Selecione um dia, abra o evento e registre os indicadores pós-evento da ocorrência correta.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-[24px] border border-white/80 bg-white/75 p-3 backdrop-blur">
            <MiniMetric label="Minhas" value={monthStats.myDays} tone="amber" />
            <MiniMetric label="Recorrentes" value={monthStats.recurringDays} tone="green" />
            <MiniMetric label="Especiais" value={monthStats.specialDays} tone="coral" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="rounded-[28px] border border-border-soft bg-white p-4 shadow-[0_18px_50px_-38px_rgba(27,23,38,0.32)] sm:p-5">
          <div className="flex items-center justify-between gap-2 sm:gap-3 mb-4">
            <button onClick={() => setMonthOffset((m) => m - 1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border-soft bg-white text-ink-muted transition hover:bg-surface-alt hover:text-ink" aria-label="Mês anterior">
              <span aria-hidden>&larr;</span>
            </button>
            <span className="text-lg font-semibold capitalize tracking-[-0.02em] text-ink sm:text-xl">{monthName}</span>
            <button onClick={() => setMonthOffset((m) => m + 1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border-soft bg-white text-ink-muted transition hover:bg-surface-alt hover:text-ink" aria-label="Próximo mês">
              <span aria-hidden>&rarr;</span>
            </button>
          </div>
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setMonthOffset(0);
                setSelectedDay(now.getDate());
              }}
            >
              Ir para hoje
            </button>
          </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"].map((d) => (
            <div key={d} className="text-[10px] font-bold text-ink-faint text-center py-1 uppercase">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;

            const dayScheds = getSchedulesForDay(day);
            const dayEventList = getEventsForDay(day);
            const birthdayList = birthdays.filter((birthday) => birthday.month === month && birthday.day === day);
            const eventTypes = dayScheds.map((schedule) =>
              events.find((event) => event.id === schedule.event_id)?.type
            );
            const hasRecurring = eventTypes.includes("recurring") || dayEventList.some((event) => event.type === "recurring");
            const hasSpecial = eventTypes.includes("special") || dayEventList.some((event) => event.type === "special");
            const hasMine = dayScheds.some((schedule) => myScheduleIds.has(schedule.id));
            const dayCellList = getCellsForDay(day);
            const hasCell = dayCellList.length > 0;
            const hasBirthday = birthdayList.length > 0;
            const isToday =
              day === now.getDate() &&
              month === now.getMonth() &&
              year === now.getFullYear();
            const isSelected = day === selectedDay;

            return (
              <button
                key={i}
                onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                className={`relative aspect-square min-h-[76px] rounded-[18px] border text-sm transition-all overflow-hidden ${
                  isSelected
                    ? "bg-brand text-white border-brand shadow-lg shadow-brand/20 scale-[1.02]"
                    : isToday
                    ? "bg-brand-light text-brand border-brand/20 font-bold"
                    : hasMine
                    ? "bg-[#fff4dc] border-[#f1c46a] text-[#7b4c00] hover:bg-[#ffefcc]"
                    : hasSpecial
                    ? "bg-[#ffe8e3] border-[#f2b6a6] text-[#8f3b22] hover:bg-[#ffdcd2]"
                    : hasRecurring
                    ? "bg-[#edf6ef] border-[#b8d8bf] text-[#285e34] hover:bg-[#e4f1e7]"
                    : hasBirthday
                    ? "bg-[#fff1f5] border-[#f7bfd0] text-[#9f244a] hover:bg-[#ffe6ee]"
                    : hasCell
                    ? "bg-[#f0ecff] border-[#cfc2f6] text-[#5b4aa8] hover:bg-[#e9e2ff]"
                    : "bg-white border-border-soft hover:bg-surface-alt"
                }`}
              >
                <div className="absolute inset-x-0 top-0 h-1.5">
                  <div
                    className={`h-full ${
                      isSelected
                        ? "bg-white/35"
                        : hasMine
                        ? "bg-[#f0aa00]"
                        : hasSpecial
                        ? "bg-[#e46b42]"
                        : hasRecurring
                        ? "bg-[#4d9c62]"
                        : hasBirthday
                        ? "bg-[#e94b73]"
                        : hasCell
                        ? "bg-[#9b8cfb]"
                        : "bg-transparent"
                    }`}
                  />
                </div>

                <div className="h-full w-full flex flex-col items-center justify-between px-1.5 py-2">
                  <div className="text-[15px] font-semibold leading-none">{day}</div>

                  <div className="flex flex-wrap items-center justify-center gap-1 min-h-[20px]">
                    {hasMine && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/20 text-white" : "bg-white/80 text-[#7b4c00]"}`}>
                        Minha
                      </span>
                    )}
                    {hasSpecial && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/20 text-white" : "bg-white/80 text-[#8f3b22]"}`}>
                        Especial
                      </span>
                    )}
                    {!hasSpecial && hasRecurring && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/20 text-white" : "bg-white/80 text-[#285e34]"}`}>
                        Recorrente
                      </span>
                    )}
                    {hasCell && (
                      <span
                        title={dayCellList.map((c) => c.name).join(", ")}
                        className={`max-w-[58px] truncate text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/20 text-white" : "bg-white/80 text-[#5b4aa8]"}`}
                      >
                        {dayCellList[0].name}{dayCellList.length > 1 ? ` +${dayCellList.length - 1}` : ""}
                      </span>
                    )}
                    {hasBirthday && (
                      <span
                        title={birthdayList.map((item) => item.name).join(", ")}
                        className={`max-w-[58px] truncate text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? "bg-white/20 text-white" : "bg-white/80 text-[#9f244a]"}`}
                      >
                        Aniv.
                      </span>
                    )}
                  </div>

                  {dayScheds.length + dayEventList.length + dayCellList.length + birthdayList.length > 0 ? (
                    <div className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : hasMine ? "bg-[#f0aa00]" : hasSpecial ? "bg-[#e46b42]" : hasBirthday ? "bg-[#e94b73]" : hasCell ? "bg-[#9b8cfb]" : "bg-brand"}`} />
                      <span className={`text-[10px] ${isSelected ? "text-white/90" : "text-ink-faint"}`}>
                        {dayScheds.length + dayEventList.length + dayCellList.length + birthdayList.length}
                      </span>
                    </div>
                  ) : (
                    <div className="h-[12px]" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
        

          <div className="mt-6 border-t border-border-soft pt-4 flex flex-wrap gap-x-5 gap-y-3 text-[11px] font-semibold text-ink-muted">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f0aa00]" />
              <span>Sua escala</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4d9c62]" />
              <span>Evento recorrente</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#e46b42]" />
              <span>Evento especial</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#9b8cfb]" />
              <span>Sua célula</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#e94b73]" />
              <span>Aniversário</span>
            </div>
          </div>
        </div>


        <aside className="rounded-[32px] border border-white/60 bg-white/40 backdrop-blur-xl shadow-[0_24px_60px_-24px_rgba(244,83,42,0.15)] lg:sticky lg:top-5 lg:max-h-[calc(100vh-40px)] flex flex-col overflow-hidden">
          <div className="relative p-6 sm:p-8 shrink-0 overflow-hidden bg-white/50 border-b border-white/40">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-brand/10 blur-2xl" />
            
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-6 items-center rounded-full bg-white/80 border border-white/50 px-2.5 text-[10px] font-bold uppercase tracking-widest text-brand backdrop-blur-sm">
                  Dia selecionado
                </span>
              </div>
              <h2 className="font-display text-[28px] sm:text-[32px] leading-tight tracking-tight text-ink mb-2">
                {selectedDay ? `${selectedDay} de ${monthName.split(" de ")[0]}` : "Selecione um dia"}
              </h2>
              <p className="text-[13px] text-ink-muted/80 font-medium">
                {selectedDay
                  ? `${daySchedules.length} escalas · ${dayEvents.length} eventos · ${dayCells.length} células · ${dayBirthdays.length} aniversários`
                  : "Clique em uma data do calendário para ver todos os detalhes do que acontece."}
              </p>
            </div>

            {selectedDay && (
              <div className="relative flex flex-wrap gap-2 mt-5">
                {daySchedules.some((schedule) => myScheduleIds.has(schedule.id)) && (
                  <span className="flex items-center gap-1.5 rounded-xl bg-[#fff4dc]/80 border border-[#f1c46a] px-3 py-1.5 text-[11px] font-bold text-[#7b4c00]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f0aa00]" /> Minha escala
                  </span>
                )}
                {dayCells.some((c) => myCellIds.has(c.id)) && (
                  <span className="flex items-center gap-1.5 rounded-xl bg-[#f0ecff]/80 border border-[#cfc2f6] px-3 py-1.5 text-[11px] font-bold text-[#5b4aa8]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#9b8cfb]" /> Minha célula
                  </span>
                )}
                {daySchedules.some((schedule) => events.find((event) => event.id === schedule.event_id)?.type === "special") && (
                  <span className="flex items-center gap-1.5 rounded-xl bg-[#ffe8e3]/80 border border-[#f2b6a6] px-3 py-1.5 text-[11px] font-bold text-[#8f3b22]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#e46b42]" /> Especial
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {!selectedDay ? (
              <div className="text-center text-sm text-ink-faint py-10">
                Selecione uma data no calendário para ver os detalhes.
              </div>
            ) : loading ? (
              <div className="text-center text-sm text-ink-faint py-10">Carregando...</div>
            ) : daySchedules.length === 0 && dayEvents.length === 0 && dayCells.length === 0 && dayBirthdays.length === 0 ? (
              <div className="text-center text-sm text-ink-faint py-10">Nada agendado neste dia.</div>
            ) : (
              <>
                {dayBirthdays.length > 0 && (
                <div className="card">
                  {dayBirthdays.map((birthday) => (
                    <div
                      key={birthday.id}
                      className="flex items-start gap-3 border-t border-border-soft px-5 py-4 first:border-t-0"
                    >
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white"
                        style={{ background: birthday.color }}
                      >
                        {birthday.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-ink">{birthday.name}</div>
                          <span className="rounded-full bg-[#fff1f5] px-2 py-0.5 text-[10px] font-bold text-[#9f244a]">
                            Aniversário
                          </span>
                        </div>
                        <div className="text-[11px] leading-relaxed text-ink-faint">
                          {birthday.role} · {birthday.phone}
                        </div>
                      </div>
                      <button className="rounded-full border border-border-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-surface-alt hover:text-ink">
                        Enviar mensagem
                      </button>
                    </div>
                  ))}
                </div>
              )}
                {dayEvents.length > 0 && (
                <div className="card">
                  {dayEvents.map((ev) => {
                    const hasScheduleForEvent = daySchedules.some((schedule) => schedule.event_id === ev.id);
                    return (
                      <Link
                        key={ev.id}
                        href={`/eventos/${ev.id}?date=${selectedDateStr}`}
                        className="flex items-start sm:items-center gap-3 px-5 py-4 border-t border-border-soft first:border-t-0 transition-colors hover:bg-brand-glow"
                      >
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                            ev.type === "special" ? "bg-[#ffe8e3] text-[#8f3b22]" : "bg-[#edf6ef] text-[#285e34]"
                          }`}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <div className="text-sm font-medium break-words">{ev.name}</div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              ev.type === "special"
                                ? "bg-[#ffe8e3] text-[#8f3b22]"
                                : "bg-[#edf6ef] text-[#285e34]"
                            }`}>
                              {ev.type === "special" ? "Evento especial" : "Evento recorrente"}
                            </span>
                            {hasScheduleForEvent && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fff4dc] text-[#7b4c00]">Com escala</span>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-faint break-words leading-relaxed">
                            {[ev.base_time, ev.location].filter(Boolean).join(" · ") || "Sem horário definido"}
                          </div>
                        </div>
                        <div className="text-brand text-sm font-semibold shrink-0">&rarr;</div>
                      </Link>
                    );
                  })}
                </div>
              )}
                {daySchedules.length > 0 && (
              <div className="card">
              {daySchedules.map((s) => {
                const ev = events.find((e) => e.id === s.event_id);
                const dept = departments.find((d) => d.id === s.department_id);
                const sm = allSM.filter((m) => m.schedule_id === s.id);
                const isMine = myScheduleIds.has(s.id);
                const eventType = ev?.type === "special" ? "Especial" : "Recorrente";

                return (
                  <Link
                    key={s.id}
                    href={`/escalas/${s.id}`}
                    className={`flex items-start sm:items-center gap-3 px-5 py-4 border-t border-border-soft first:border-t-0 transition-colors ${
                      isMine ? "hover:bg-[#fff8ea] bg-[#fffdfa]" : "hover:bg-brand-glow"
                    }`}
                  >
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg shrink-0 ${
                        ev?.type === "special" ? "bg-[#ffe8e3]" : "bg-[#edf6ef]"
                      }`}
                    >
                      <AgendaEventIcon special={ev?.type === "special"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <div className="text-sm font-medium break-words">{ev?.name}</div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          ev?.type === "special"
                            ? "bg-[#ffe8e3] text-[#8f3b22]"
                            : "bg-[#edf6ef] text-[#285e34]"
                        }`}>
                          {eventType}
                        </span>
                        {isMine && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fff4dc] text-[#7b4c00]">
                            Minha escala
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-faint break-words leading-relaxed">
                        {s.time} · {dept?.name} · {sm.length} escalados
                      </div>
                    </div>
                    <div className="text-brand text-sm font-semibold shrink-0">&rarr;</div>
                  </Link>
                );
              })}
              </div>
              )}
                {dayCells.length > 0 && (
                <div className="card">
                  {dayCells.map((c) => {
                    const isMine = myCellIds.has(c.id);
                    return (
                      <Link
                        key={c.id}
                        href={`/celulas/${c.id}`}
                        className="flex items-start sm:items-center gap-3 px-5 py-4 border-t border-border-soft first:border-t-0 transition-colors hover:bg-[#f6f2ff]"
                      >
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-[#f0ecff] text-[#5b4aa8]">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 001 1h12a1 1 0 001-1V9.5" /><path d="M9.5 21v-5a2.5 2.5 0 015 0v5" /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <div className="text-sm font-medium break-words">{c.name}</div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f0ecff] text-[#5b4aa8]">Célula</span>
                            {isMine && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fff4dc] text-[#7b4c00]">Minha célula</span>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-faint break-words leading-relaxed">
                            {[c.time, c.audience, c.address].filter(Boolean).join(" · ") || "Sem horário definido"}
                          </div>
                        </div>
                        <div className="text-brand text-sm font-semibold shrink-0">&rarr;</div>
                      </Link>
                    );
                  })}
                </div>
              )}
              </>
            )}
          </div>
        </aside>
      </div>

      {showEventForm && (
        <EventFormModal
          toast={toast}
          close={() => setShowEventForm(false)}
          onSaved={async () => {
            setShowEventForm(false);
            await loadData();
          }}
        />
      )}
    </PageShell>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: number; tone: "amber" | "green" | "coral" }) {
  const cls = {
    amber: "bg-[#FFF8ED] text-[#C07B1A]",
    green: "bg-[#EEF9F1] text-[#1F8044]",
    coral: "bg-[#FFF0EC] text-[#D94420]",
  }[tone];
  return (
    <div className={`rounded-2xl px-3 py-2 text-center ${cls}`}>
      <div className="text-xl font-bold leading-none tracking-[-0.04em]">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] opacity-70">{label}</div>
    </div>
  );
}
