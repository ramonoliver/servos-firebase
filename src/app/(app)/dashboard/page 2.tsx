"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { getVerseOfDay } from "@/lib/ai/engine";
import { getGreeting, getDayName } from "@/lib/utils/helpers";
import Link from "next/link";
import type { Schedule, ScheduleMember, Event, User, Notification } from "@/types";

export default function DashboardPage() {
  const { user, departments, canDo } = useApp();
  const verse = getVerseOfDay();
  const isMember = user.role === "member";
  const visibleDepartmentIds = useMemo(() => departments.map((d) => d.id), [departments]);

  const [members, setMembers] = useState<User[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [allSM, setAllSM] = useState<ScheduleMember[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const todayLabel = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  async function loadData() {
    setLoading(true);
    const [
      { data: membersData, error: membersError },
      { data: schedulesData, error: schedulesError },
      { data: eventsData, error: eventsError },
      { data: notificationsData, error: notificationsError },
      { data: departmentMembersData, error: departmentMembersError },
    ] = await Promise.all([
      supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
      supabase.from("schedules").select("*").eq("church_id", user.church_id).neq("status", "cancelled"),
      supabase.from("events").select("*").eq("church_id", user.church_id),
      supabase.from("notifications").select("*").eq("user_id", user.id).eq("read", false),
      departments.length
        ? supabase.from("department_members").select("*").in("department_id", visibleDepartmentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (membersError || schedulesError || eventsError || notificationsError || departmentMembersError) {
      console.error({ membersError, schedulesError, eventsError, notificationsError, departmentMembersError });
      setLoading(false);
      return;
    }

    const scheduleIds = ((schedulesData || []) as Schedule[]).map((s) => s.id);
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
        : ((schedulesData || []) as Schedule[]).filter((s) => visibleDepartmentIds.includes(s.department_id));
    const scopedScheduleIds = new Set(scopedSchedules.map((s) => s.id));
    const scopedDepartmentIds = new Set(visibleDepartmentIds);
    const scopedMembers =
      user.role === "admin"
        ? ((membersData || []) as User[])
        : ((membersData || []) as User[]).filter((m) =>
            ((departmentMembersData || []) as Array<{ user_id: string; department_id: string }>).some(
              (dm) => dm.user_id === m.id && scopedDepartmentIds.has(dm.department_id)
            )
          );

    setMembers(scopedMembers);
    setSchedules(scopedSchedules);
    setAllSM(((smData || []) as ScheduleMember[]).filter((sm) => scopedScheduleIds.has(sm.schedule_id)));
    setEvents((eventsData || []) as Event[]);
    setNotifications((notificationsData || []) as Notification[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [user.church_id, user.id]);

  const upcoming = useMemo(() => {
    return schedules
      .filter((s) => s.status === "active" && s.published)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [schedules]);

  const pendingTotal = useMemo(() => {
    return allSM.filter(
      (sm) => schedules.some((s) => s.id === sm.schedule_id && s.status === "active") && sm.status === "pending"
    ).length;
  }, [allSM, schedules]);

  const mySchedules = useMemo(() => {
    return allSM.filter(
      (sm) => sm.user_id === user.id && schedules.some((s) => s.id === sm.schedule_id && s.status === "active")
    );
  }, [allSM, schedules, user.id]);

  const myPending = useMemo(() => mySchedules.filter((sm) => sm.status === "pending"), [mySchedules]);

  const upcomingSchedule = useMemo((): Schedule | null => {
    if (isMember) {
      const firstSM = mySchedules[0];
      if (!firstSM) return null;
      return schedules.find((s) => s.id === firstSM.schedule_id) ?? null;
    }
    return upcoming[0] ?? null;
  }, [isMember, mySchedules, upcoming, schedules]);

  const nextSchedSm = upcomingSchedule ? allSM.filter((sm) => sm.schedule_id === upcomingSchedule.id) : [];
  const nextSchedConfirmed = nextSchedSm.filter((sm) => sm.status === "confirmed").length;
  const nextSchedEvent = upcomingSchedule ? events.find((e) => e.id === upcomingSchedule.event_id) : null;
  const nextSchedDept = upcomingSchedule ? departments.find((d) => d.id === upcomingSchedule.department_id) : null;

  const upcomingList = isMember
    ? mySchedules.slice(1, 5).map((sm) => ({
        sm,
        sched: schedules.find((s) => s.id === sm.schedule_id),
      })).filter((x) => x.sched)
    : upcoming.slice(1, 5).map((sched) => ({ sm: null as ScheduleMember | null, sched }));

  if (loading) {
    return (
      <div className="max-w-[680px] mx-auto pt-8 text-center text-sm text-ink-faint">Carregando...</div>
    );
  }

  return (
    <div className="max-w-[680px] mx-auto space-y-5">
      {/* Greeting */}
      <div>
        <p className="text-[12px] font-semibold text-ink-faint capitalize mb-1">{todayLabel}</p>
        <h1 className="font-display text-2xl font-bold text-ink">
          {getGreeting()}, {user.name.split(" ")[0]}
        </h1>
      </div>

      {/* Next schedule focus card */}
      {upcomingSchedule ? (
        <Link
          href={isMember ? "/minhas-escalas" : `/escalas?id=${upcomingSchedule.id}`}
          className="block bg-brand-light border border-brand/20 rounded-xl p-5 hover:bg-brand-light/70 transition-colors"
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-brand mb-3">
            Próxima escala
          </div>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-brand/10 flex flex-col items-center justify-center flex-shrink-0">
              <span className="text-[8px] font-bold uppercase text-brand leading-none">
                {getDayName(upcomingSchedule.date)}
              </span>
              <span className="font-display text-[26px] text-brand leading-none mt-0.5">
                {upcomingSchedule.date.split("-")[2]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink truncate">
                {nextSchedEvent?.name || "Escala"}
              </div>
              <div className="text-[12px] text-ink-muted mt-0.5">
                {upcomingSchedule.time} · {nextSchedDept?.name}
              </div>
              {!isMember && (
                <div className="text-[11px] text-brand/70 mt-1 font-medium">
                  {nextSchedConfirmed}/{nextSchedSm.length} confirmados
                </div>
              )}
            </div>
            <svg
              width={16}
              height={16}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              viewBox="0 0 24 24"
              className="text-brand/60 flex-shrink-0"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </Link>
      ) : (
        <div className="bg-surface-alt border border-border-soft rounded-xl p-5 text-center">
          <p className="text-sm text-ink-faint">Nenhuma escala próxima.</p>
          {!isMember && canDo("schedule.create") && (
            <Link href="/escalas" className="text-sm font-semibold text-brand hover:underline mt-1 inline-block">
              Criar escala →
            </Link>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {isMember ? (
          <>
            <StatV2 value={mySchedules.length} label="Minhas escalas" />
            <StatV2 value={myPending.length} label="Pendentes" highlight={myPending.length > 0} />
          </>
        ) : (
          <>
            <StatV2 value={upcoming.length} label="Escalas ativas" />
            <StatV2 value={pendingTotal} label="Pendentes" highlight={pendingTotal > 0} />
          </>
        )}
      </div>

      {/* Pending alert */}
      {isMember && myPending.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-light rounded-xl border border-amber/10">
          <span className="text-base">⚠️</span>
          <span className="text-[13px] text-ink-soft flex-1">
            <strong>{myPending.length} {myPending.length === 1 ? "escala" : "escalas"}</strong> aguardando confirmação.
          </span>
          <Link href="/minhas-escalas" className="text-xs font-semibold text-brand hover:underline">
            Ver →
          </Link>
        </div>
      )}

      {!isMember && pendingTotal > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-light rounded-xl border border-amber/10">
          <span className="text-base">⚠️</span>
          <span className="text-[13px] text-ink-soft flex-1">
            <strong>{pendingTotal} {pendingTotal === 1 ? "membro" : "membros"}</strong> sem confirmação.
          </span>
          <Link href="/escalas" className="text-xs font-semibold text-brand hover:underline">
            Ver escalas →
          </Link>
        </div>
      )}

      {/* Upcoming list */}
      {upcomingList.length > 0 && (
        <div className="bg-white border border-border-soft rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border-soft">
            <span className="text-[11px] font-bold text-ink-faint uppercase tracking-wider">
              {isMember ? "Minhas próximas escalas" : "Próximas escalas"}
            </span>
          </div>
          {upcomingList.map(({ sm, sched }, i) => {
            if (!sched) return null;
            const ev = events.find((e) => e.id === sched.event_id);
            const dept = departments.find((d) => d.id === sched.department_id);
            return (
              <Link
                key={sched.id + "-" + i}
                href={isMember ? "/minhas-escalas" : `/escalas?id=${sched.id}`}
                className="flex items-center gap-3 px-4 py-3 border-t border-border-soft hover:bg-surface-alt transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-surface-alt flex flex-col items-center justify-center flex-shrink-0 border border-border-soft">
                  <span className="text-[7px] font-bold uppercase text-ink-faint">{getDayName(sched.date)}</span>
                  <span className="font-display text-[14px] text-ink leading-none">{sched.date.split("-")[2]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-ink truncate">{ev?.name || "Escala"}</div>
                  <div className="text-[11px] text-ink-faint">{sched.time} · {dept?.name}</div>
                </div>
                {sm && (
                  <span className={`badge shrink-0 ${sm.status === "confirmed" ? "badge-green" : sm.status === "pending" ? "badge-amber" : "badge-red"}`}>
                    {sm.status === "confirmed" ? "Confirmado" : sm.status === "pending" ? "Pendente" : "Recusado"}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Verse */}
      <div className="bg-brand-glow border border-brand/10 rounded-xl p-5">
        <p className="font-display italic text-sm text-ink-soft leading-relaxed mb-1.5">
          &ldquo;{verse.text}&rdquo;
        </p>
        <p className="text-[11px] text-brand font-semibold">{verse.ref}</p>
      </div>
    </div>
  );
}

function StatV2({ value, label, highlight = false }: { value: number | string; label: string; highlight?: boolean }) {
  return (
    <div className="bg-white border border-border-soft rounded-xl px-4 py-4">
      <div className={`font-display text-[28px] tracking-tight leading-none ${highlight ? "text-amber" : "text-ink"}`}>
        {value}
      </div>
      <div className="text-[11px] text-ink-faint font-medium mt-1">{label}</div>
    </div>
  );
}
