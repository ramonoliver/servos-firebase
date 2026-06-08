"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { Avatar, PageShell, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/firebase";
import { careCases, pastoralCells, prayerRequests } from "@/lib/pastoral/mock-data";
import { getHealthAverage, registerPeopleInCache, registerCellsInCache } from "@/lib/pastoral/selectors";
import type { DepartmentMember, Event, Schedule, ScheduleMember, ScheduleSlot, User } from "@/types";

type IconName = "calendar" | "chart" | "check" | "heart" | "home" | "target" | "users";

function formatShortDate(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return value
    .toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })
    .replace(".", "");
}

export default function RelatoriosPage() {
  const { user, departments, roles } = useApp();
  const visibleDepartmentIds = useMemo(() => departments.map((department) => department.id), [departments]);
  // Visão church-wide: admin, pastor, coordenação e supervisor. Líderes de
  // ministério/célula veem apenas o próprio escopo (departamentos).
  const seesAllReports = useMemo(
    () => ["admin", "pastor", "coordenacao", "supervisor"].some((r) => roles.businessRoles.includes(r as never)),
    [roles]
  );

  const [members, setMembers] = useState<User[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [allSM, setAllSM] = useState<ScheduleMember[]>([]);
  const [allSlots, setAllSlots] = useState<ScheduleSlot[]>([]);
  const [dbCells, setDbCells] = useState<any[]>([]);
  const [dbNotes, setDbNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        const [
          { data: usersData, error: usersError },
          { data: schedulesData, error: schedulesError },
          { data: departmentMembersData, error: departmentMembersError },
          { data: cellsData, error: cellsError },
          { data: notesData, error: notesError },
        ] = await Promise.all([
          supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
          supabase.from("schedules").select("*").eq("church_id", user.church_id),
          departments.length
            ? supabase.from("department_members").select("*").in("department_id", visibleDepartmentIds)
            : Promise.resolve({ data: [], error: null }),
          supabase.from("cells").select("*").eq("church_id", user.church_id),
          supabase.from("pastoral_notes").select("*").eq("church_id", user.church_id),
        ]);

        if (usersError) console.error("usersError:", usersError);
        if (schedulesError) console.error("schedulesError:", schedulesError);
        if (departmentMembersError) console.error("departmentMembersError:", departmentMembersError);
        if (cellsError) console.error("cellsError:", cellsError);
        if (notesError) console.error("notesError:", notesError);

        setDbCells(cellsData || []);
        setDbNotes(notesData || []);

        registerPeopleInCache(usersData || []);
        registerCellsInCache(cellsData || []);

        const allSchedules = (schedulesData || []) as Schedule[];
        const scopedDepartmentIds = new Set(visibleDepartmentIds);
        const scopedSchedules =
          seesAllReports
            ? allSchedules
            : allSchedules.filter((schedule) => scopedDepartmentIds.has(schedule.department_id));
        const scopedScheduleIds = scopedSchedules.map((schedule) => schedule.id);
        const scopedEventIds = [...new Set(scopedSchedules.map((schedule) => schedule.event_id))];
        const scopedMembers =
          seesAllReports
            ? ((usersData || []) as User[])
            : ((usersData || []) as User[]).filter((member) =>
                ((departmentMembersData || []) as DepartmentMember[]).some(
                  (link) => link.user_id === member.id && scopedDepartmentIds.has(link.department_id)
                )
              );

        const [
          { data: smData, error: smError },
          { data: slotsData, error: slotsError },
          { data: eventsData, error: eventsError },
        ] = scopedScheduleIds.length
          ? await Promise.all([
              supabase.from("schedule_members").select("*").in("schedule_id", scopedScheduleIds),
              supabase.from("schedule_slots").select("*").in("schedule_id", scopedScheduleIds),
              scopedEventIds.length
                ? supabase.from("events").select("*").in("id", scopedEventIds)
                : Promise.resolve({ data: [], error: null }),
            ])
          : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

        if (smError) console.error("smError:", smError);
        if (slotsError) console.error("slotsError:", slotsError);
        if (eventsError) console.error("eventsError:", eventsError);

        setMembers(scopedMembers);
        setSchedules(scopedSchedules);
        setEvents((eventsData || []) as Event[]);
        setAllSM((smData || []) as ScheduleMember[]);
        setAllSlots((slotsData || []) as ScheduleSlot[]);
      } catch (err) {
        console.error("Critical error inside reports loadData:", err);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [user.church_id, seesAllReports, departments.length, visibleDepartmentIds]);

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const next7 = new Date(today);
  next7.setDate(next7.getDate() + 7);
  const next7Iso = next7.toISOString().slice(0, 10);
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyDaysAgoIso = sixtyDaysAgo.toISOString().slice(0, 10);
  const weekDay = today.toLocaleDateString("pt-BR", { weekday: "long" }).toLowerCase();

  const departmentsById = useMemo(
    () => new Map(departments.map((department) => [department.id, department.name])),
    [departments]
  );
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event.name])), [events]);

  // "Serviu X vezes" = confirmações reais em escalas que já aconteceram.
  // O contador member.total_schedules não é mantido (ficava sempre 0).
  const servedByUser = useMemo(() => {
    const pastScheduleIds = new Set(
      schedules.filter((s) => s.date <= todayIso).map((s) => s.id)
    );
    const map = new Map<string, number>();
    allSM.forEach((sm) => {
      if (sm.status === "confirmed" && pastScheduleIds.has(sm.schedule_id)) {
        map.set(sm.user_id, (map.get(sm.user_id) || 0) + 1);
      }
    });
    return map;
  }, [allSM, schedules, todayIso]);

  const topServing = useMemo(
    () =>
      [...members]
        .map((member) => ({ member, served: servedByUser.get(member.id) || 0 }))
        .filter((row) => row.served > 0)
        .sort((a, b) => b.served - a.served)
        .slice(0, 5),
    [members, servedByUser]
  );

  const lowConfirm = useMemo(
    () =>
      [...members]
        .filter((member) => member.total_schedules > 2)
        .sort((a, b) => a.confirm_rate - b.confirm_rate)
        .slice(0, 5),
    [members]
  );

  const totalConfirmed = useMemo(() => allSM.filter((sm) => sm.status === "confirmed").length, [allSM]);
  const pendingConfirmations = useMemo(() => allSM.filter((sm) => sm.status === "pending").length, [allSM]);
  const totalAll = allSM.length;
  const confirmRate = totalAll ? Math.round((totalConfirmed / totalAll) * 100) : 0;

  const upcomingSchedules = useMemo(
    () =>
      schedules
        .filter((schedule) => schedule.status === "active" && schedule.published && schedule.date >= todayIso)
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [schedules, todayIso]
  );
  const upcoming7Days = useMemo(
    () => upcomingSchedules.filter((schedule) => schedule.date <= next7Iso),
    [upcomingSchedules, next7Iso]
  );

  const totalPlannedSlots = useMemo(
    () => allSlots.reduce((sum, slot) => sum + slot.quantity, 0),
    [allSlots]
  );
  const totalFilledSlots = useMemo(
    () => allSlots.reduce((sum, slot) => sum + slot.filled, 0),
    [allSlots]
  );
  const totalCoverageRate = totalPlannedSlots
    ? Math.round((Math.min(totalFilledSlots, totalPlannedSlots) / totalPlannedSlots) * 100)
    : 0;

  const uncoveredFunctions = useMemo(() => {
    const schedulesById = new Map(schedules.map((schedule) => [schedule.id, schedule]));
    const map = new Map<string, { key: string; departmentName: string; functionName: string; missing: number }>();

    for (const slot of allSlots) {
      const missing = Math.max(0, slot.quantity - slot.filled);
      if (missing <= 0) continue;

      const schedule = schedulesById.get(slot.schedule_id);
      const departmentName = departmentsById.get(schedule?.department_id || "") || "Ministério";
      const key = `${schedule?.department_id || "unknown"}::${slot.function_name}`;
      const current = map.get(key);

      map.set(key, {
        key,
        departmentName,
        functionName: slot.function_name,
        missing: (current?.missing || 0) + missing,
      });
    }

    return [...map.values()].sort((a, b) => b.missing - a.missing).slice(0, 6);
  }, [allSlots, schedules, departmentsById]);

  const departmentLoad = useMemo(() => {
    const counts = new Map<string, number>();
    for (const schedule of schedules) {
      counts.set(schedule.department_id, (counts.get(schedule.department_id) || 0) + 1);
    }

    return [...counts.entries()]
      .map(([departmentId, total]) => ({
        departmentId,
        departmentName: departmentsById.get(departmentId) || "Ministério",
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [schedules, departmentsById]);

  const schedulePendingById = useMemo(() => {
    const map = new Map<string, number>();
    for (const sm of allSM) {
      if (sm.status !== "pending") continue;
      map.set(sm.schedule_id, (map.get(sm.schedule_id) || 0) + 1);
    }
    return map;
  }, [allSM]);

  const membersWithoutRecentScale = useMemo(
    () =>
      members.filter(
        (member) => !member.last_served_at || member.last_served_at.slice(0, 10) < sixtyDaysAgoIso
      ).length,
    [members, sixtyDaysAgoIso]
  );

  const peopleInCare = useMemo(() => {
    return dbNotes.filter((n) => n.type === "care_case").length;
  }, [dbNotes]);

  const openPrayers = useMemo(() => {
    return dbNotes.filter((n) => n.type === "prayer_request").length;
  }, [dbNotes]);

  const cellsToday = useMemo(() => {
    return dbCells.filter((cell) => {
      const dayName = String(cell.week_day || "").toLowerCase();
      return weekDay.startsWith(dayName.slice(0, 3));
    });
  }, [dbCells, weekDay]);

  const cellHealth = useMemo(
    () =>
      dbCells.map((cell) => {
        let healthObj = { frequency: 70, communion: 70, participation: 70, growth: 70, engagement: 70, care: 70 };
        try {
          if (typeof cell.health === "object" && cell.health !== null) {
            healthObj = { ...healthObj, ...cell.health };
          } else if (typeof cell.health === "string") {
            healthObj = { ...healthObj, ...JSON.parse(cell.health) };
          }
        } catch (e) {
          console.error("Erro ao fazer parse do health da celula:", e);
        }
        return {
          id: cell.id,
          name: cell.name,
          score: getHealthAverage(healthObj),
        };
      }),
    [dbCells]
  );

  const cellsNeedCare = useMemo(
    () => cellHealth.filter((cell) => cell.score < 70).length,
    [cellHealth]
  );

  return (
    <PageShell className="[font-family:'Inter','Plus_Jakarta_Sans',system-ui,sans-serif]">
      <PageHeader
        eyebrow="Análise"
        title="Relatórios"
        subtitle="Visão consolidada de Pessoas, Agenda, Células e Ministérios para apoiar decisões semanais."
      />

      <section className="relative overflow-hidden rounded-[34px] border border-white bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF0EC_48%,#FAFAF8_100%)] p-6 shadow-[0_28px_80px_-54px_rgba(244,83,42,0.34)] md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Inteligência da semana
            </div>
            <h2 className="max-w-[720px] text-[30px] font-bold leading-tight tracking-[-0.045em] text-ink md:text-[38px]">
              Uma leitura rápida da operação pastoral e ministerial.
            </h2>
            <p className="mt-3 max-w-[660px] text-[14px] leading-6 text-ink-muted">
              Confirmações, cobertura das escalas, cuidado pastoral e saúde das células reunidos para orientar as próximas decisões.
            </p>
          </div>
          <div className="rounded-[26px] border border-white/80 bg-white/78 p-5 shadow-[0_18px_48px_-36px_rgba(27,23,38,0.35)] backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Confirmação geral</div>
                <div className="mt-2 text-[38px] font-bold leading-none tracking-[-0.055em] text-ink">{loading ? "..." : `${confirmRate}%`}</div>
              </div>
              <DonutChart value={loading ? 0 : confirmRate} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <MetricPill label="Confirmados" value={totalConfirmed} />
              <MetricPill label="Pendentes" value={pendingConfirmations} tone="amber" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStat loading={loading} value={peopleInCare} label="Pessoas em cuidado" icon="heart" tone="coral" />
        <ReportStat loading={loading} value={upcoming7Days.length} label="Agenda nos próximos 7 dias" icon="calendar" tone="cell" />
        <ReportStat loading={loading} value={cellsToday.length} label="Células hoje" icon="home" tone="visitor" />
        <ReportStat loading={loading} value={departments.length} label="Ministérios ativos" icon="target" tone="care" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ReportPanel
          eyebrow="Pessoas"
          title="Cuidado e confirmação"
          href="/pessoas"
          action="Abrir Pessoas"
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricBox label="Membros ativos" value={members.length} />
            <MetricBox label="Sem servir 60d" value={membersWithoutRecentScale} />
            <MetricBox label="Em cuidado" value={peopleInCare} tone="coral" />
            <MetricBox label="Pedidos oração" value={openPrayers} tone="care" />
          </div>
          <div className="mt-5">
            <SectionLabel title="Atenção na confirmação" />
            {loading ? (
              <EmptyReportLine />
            ) : lowConfirm.length === 0 ? (
              <EmptyReportLine text="Sem alertas de confirmação no momento." />
            ) : (
              <div className="space-y-2">
                {lowConfirm.map((member) => (
                  <PersonRateRow key={member.id} member={member} />
                ))}
              </div>
            )}
          </div>
        </ReportPanel>

        <ReportPanel
          eyebrow="Agenda"
          title="Confirmações e próximos serviços"
          href="/calendario"
          action="Abrir Agenda"
        >
          <div className="grid gap-3 sm:grid-cols-[170px_1fr]">
            <div className="rounded-[24px] border border-border-soft bg-white p-4">
              <DonutChart value={loading ? 0 : confirmRate} size={132} />
              <div className="mt-3 text-center text-[12px] font-semibold text-ink-muted">Taxa de confirmação</div>
            </div>
            <div className="grid gap-3">
              <MetricBox label="Escalas 7 dias" value={upcoming7Days.length} />
              <MetricBox label="Pendências" value={pendingConfirmations} tone="care" />
            </div>
          </div>
          <div className="mt-5">
            <SectionLabel title="Próximas escalas publicadas" />
            {loading ? (
              <EmptyReportLine />
            ) : upcomingSchedules.length === 0 ? (
              <EmptyReportLine text="Sem escalas futuras publicadas." />
            ) : (
              <div className="space-y-2">
                {upcomingSchedules.slice(0, 5).map((schedule) => (
                  <ScheduleReportRow
                    key={schedule.id}
                    schedule={schedule}
                    title={eventsById.get(schedule.event_id) || "Escala"}
                    department={departmentsById.get(schedule.department_id) || "Ministério"}
                    pending={schedulePendingById.get(schedule.id) || 0}
                  />
                ))}
              </div>
            )}
          </div>
        </ReportPanel>

        <ReportPanel
          eyebrow="Células"
          title="Saúde comunitária"
          href="/celulas"
          action="Abrir Células"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricBox label="Ativas" value={dbCells.length} />
            <MetricBox label="Hoje" value={cellsToday.length} tone="visitor" />
            <MetricBox label="Precisam cuidado" value={cellsNeedCare} tone="coral" />
          </div>
          <div className="mt-5 space-y-3">
            <SectionLabel title="Saúde geral das células" />
            {cellHealth.map((cell) => (
              <HealthRow key={cell.id} name={cell.name} score={cell.score} />
            ))}
          </div>
        </ReportPanel>

        <ReportPanel
          eyebrow="Ministérios"
          title="Cobertura e lacunas"
          href="/ministerios"
          action="Abrir Ministérios"
        >
          <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
            <div className="rounded-[24px] border border-border-soft bg-white p-4">
              <DonutChart value={loading ? 0 : totalCoverageRate} size={142} tone="success" />
              <div className="mt-2 text-center text-[12px] font-semibold text-ink-muted">Cobertura das funções</div>
            </div>
            <div className="space-y-3">
              <MetricBox label="No escopo" value={departments.length} />
              <MetricBox label="Lacunas" value={uncoveredFunctions.length} tone="care" />
            </div>
          </div>

          <div className="mt-5">
            <SectionLabel title="Distribuição de escalas por ministério" />
            <BarChart items={departmentLoad.map((item) => ({ label: item.departmentName, value: item.total }))} />
          </div>

          <div className="mt-5">
            <SectionLabel title="Funções com lacuna" />
            {loading ? (
              <EmptyReportLine />
            ) : uncoveredFunctions.length === 0 ? (
              <EmptyReportLine text="Nenhuma lacuna de cobertura nas funções planejadas." />
            ) : (
              <div className="space-y-2">
                {uncoveredFunctions.slice(0, 4).map((item) => (
                  <GapRow key={item.key} item={item} />
                ))}
              </div>
            )}
          </div>
        </ReportPanel>
      </div>

      <ReportPanel eyebrow="Engajamento" title="Pessoas que mais serviram">
        {loading ? (
          <EmptyReportLine />
        ) : topServing.length === 0 ? (
          <EmptyReportLine text="Nenhum dado de engajamento disponível." />
        ) : (
          <div className="grid gap-3 md:grid-cols-5">
            {topServing.map((row, index) => (
              <EngagementCard key={row.member.id} member={row.member} served={row.served} rank={index + 1} />
            ))}
          </div>
        )}
      </ReportPanel>
    </PageShell>
  );
}

function ReportIcon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  const s = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
    shapeRendering: "geometricPrecision" as const,
    className,
  };
  const icons: Record<IconName, React.ReactNode> = {
    calendar: <><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h17" /><path d="m8 15 4-5 3 3 5-7" /></>,
    check: <><path d="M20 6 9 17l-5-5" /><path d="M21 12a9 9 0 1 1-4.8-8" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8Z" />,
    home: <><path d="M3 10 12 3l9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10Z" /><path d="M9 22V12h6v10" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.8" /></>,
  };
  return <svg {...s}>{icons[name]}</svg>;
}

function ReportPanel({
  eyebrow,
  title,
  href,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  href?: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[28px] border border-border-soft bg-white p-6 shadow-[0_18px_50px_-38px_rgba(27,23,38,0.32)]">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">{eyebrow}</div>
          <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-ink md:text-[24px]">{title}</h2>
        </div>
        {href && action && (
          <Link href={href} className="flex-shrink-0 rounded-full border border-border-soft bg-white px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-surface-alt hover:text-ink">
            {action}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function ReportStat({
  value,
  label,
  icon,
  tone,
  loading,
}: {
  value: number | string;
  label: string;
  icon: IconName;
  tone: "coral" | "care" | "cell" | "visitor";
  loading?: boolean;
}) {
  const toneClass = {
    coral: "bg-[#FFF0EC] text-[#D94420]",
    care: "bg-[#FFF8ED] text-[#C07B1A]",
    cell: "bg-[#F5F0FF] text-[#6D5DF0]",
    visitor: "bg-[#EEF9F1] text-[#1F8044]",
  }[tone];

  return (
    <div className="rounded-[26px] border border-white/70 bg-white p-5 shadow-[0_18px_50px_-38px_rgba(27,23,38,0.26)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[34px] font-bold leading-none tracking-[-0.055em] text-ink">{loading ? "..." : value}</div>
          <div className="mt-2 text-[13px] font-semibold leading-snug text-ink-muted">{label}</div>
        </div>
        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[18px] ${toneClass}`}>
          <ReportIcon name={icon} size={21} />
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value, tone = "brand" }: { label: string; value: string | number; tone?: "brand" | "amber" }) {
  return (
    <div className={`rounded-2xl px-3 py-2 ${tone === "amber" ? "bg-[#FFF8ED] text-[#C07B1A]" : "bg-[#FFF0EC] text-[#D94420]"}`}>
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] opacity-75">{label}</div>
    </div>
  );
}

function MetricBox({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "coral" | "care" | "visitor" }) {
  const cls = {
    neutral: "bg-[#FAFAF8] text-ink",
    coral: "bg-[#FFF0EC] text-[#D94420]",
    care: "bg-[#FFF8ED] text-[#C07B1A]",
    visitor: "bg-[#EEF9F1] text-[#1F8044]",
  }[tone];
  return (
    <div className={`rounded-[18px] px-4 py-3 ${cls}`}>
      <div className="text-[24px] font-bold leading-none tracking-[-0.04em]">{value}</div>
      <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] opacity-70">{label}</div>
    </div>
  );
}

function SectionLabel({ title }: { title: string }) {
  return <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{title}</div>;
}

function EmptyReportLine({ text = "Carregando..." }: { text?: string }) {
  return <div className="rounded-[18px] bg-surface-alt px-4 py-5 text-center text-sm text-ink-faint">{text}</div>;
}

function DonutChart({ value, size = 118, tone = "brand" }: { value: number; size?: number; tone?: "brand" | "success" }) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;
  const color = tone === "success" ? "#22B892" : "#F4532A";

  return (
    <div className="relative mx-auto flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F0EFEB" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-[24px] font-bold tracking-[-0.04em] text-ink">{value}%</div>
    </div>
  );
}

function ProgressBar({ value, tone = "brand" }: { value: number; tone?: "brand" | "success" | "danger" }) {
  const color = tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-brand";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[#F0EFEB]">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function PersonRateRow({ member }: { member: User }) {
  const tone = member.confirm_rate < 80 ? "danger" : "brand";
  return (
    <div className="rounded-[18px] border border-border-soft bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} color={member.avatar_color} photoUrl={member.photo_url} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{member.name}</div>
          <div className="text-[11px] text-ink-faint">{member.total_schedules} escalas no histórico</div>
        </div>
        <span className={`text-sm font-bold ${member.confirm_rate < 80 ? "text-danger" : "text-brand"}`}>{member.confirm_rate}%</span>
      </div>
      <div className="mt-3">
        <ProgressBar value={member.confirm_rate} tone={tone} />
      </div>
    </div>
  );
}

function ScheduleReportRow({
  schedule,
  title,
  department,
  pending,
}: {
  schedule: Schedule;
  title: string;
  department: string;
  pending: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-border-soft bg-white px-4 py-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-[#FFF0EC] text-[#D94420]">
        <ReportIcon name="calendar" size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{title}</div>
        <div className="truncate text-[12px] text-ink-faint">{formatShortDate(schedule.date)} · {schedule.time} · {department}</div>
      </div>
      <span className="rounded-full bg-[#FFF8ED] px-2.5 py-1 text-[11px] font-semibold text-[#C07B1A]">{pending} pend.</span>
    </div>
  );
}

function HealthRow({ name, score }: { name: string; score: number }) {
  const danger = score < 70;
  return (
    <div className="rounded-[18px] border border-border-soft bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="truncate text-sm font-semibold text-ink">{name}</div>
        <span className={`text-sm font-bold ${danger ? "text-danger" : "text-success"}`}>{score}%</span>
      </div>
      <ProgressBar value={score} tone={danger ? "danger" : "success"} />
    </div>
  );
}

function BarChart({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  if (!items.length) return <EmptyReportLine text="Sem distribuição suficiente para exibir." />;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
            <span className="truncate font-semibold text-ink-muted">{item.label}</span>
            <span className="font-bold text-ink">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#F0EFEB]">
            <div className="h-full rounded-full bg-brand" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function GapRow({ item }: { item: { key: string; departmentName: string; functionName: string; missing: number } }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[18px] border border-border-soft bg-white px-4 py-3">
      <div className="min-w-0">
        <div className="break-words text-sm font-semibold text-ink">{item.functionName}</div>
        <div className="break-words text-[12px] text-ink-faint">{item.departmentName}</div>
      </div>
      <span className="shrink-0 rounded-full bg-[#FFF8ED] px-2.5 py-1 text-xs font-bold text-[#C07B1A]">-{item.missing}</span>
    </div>
  );
}

function EngagementCard({ member, served, rank }: { member: User; served: number; rank: number }) {
  return (
    <div className="rounded-[22px] border border-border-soft bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <Avatar name={member.name} color={member.avatar_color} photoUrl={member.photo_url} size={38} />
        <span className="rounded-full bg-brand-light px-2.5 py-1 text-[11px] font-bold text-brand">#{rank}</span>
      </div>
      <div className="mt-4 truncate text-sm font-semibold text-ink">{member.name}</div>
      <div className="mt-1 text-[12px] text-ink-faint">serviu {served} {served === 1 ? "vez" : "vezes"}</div>
    </div>
  );
}
