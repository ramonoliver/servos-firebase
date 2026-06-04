"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { getGreeting } from "@/lib/utils/helpers";
import { getPerson } from "@/lib/pastoral/selectors";
import {
  careCases,
  pastoralCells,
  prayerRequests,
  timelineEvents,
} from "@/lib/pastoral/mock-data";
import {
  DashboardV3Home,
  type CarePerson,
  type CellSummary,
  type DashboardV3Data,
  type Insight,
  type PrayerRequestCardData,
  type PriorityCard,
  type PriorityListItem,
  type QuickActionItem,
  type TimelineItem,
  type UpcomingEventItem,
} from "@/components/dashboard/home-v3-ui";
import type { Cell, CellMemberRow } from "@/lib/cells/types";
import type { Department, Event, Notification, Schedule, ScheduleMember, User } from "@/types";

function formatShortDate(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return value.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");
}

function formatRelative(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const hours = Math.max(1, Math.round(diff / 36e5));
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.round(hours / 24)}d`;
}

function formatEventAgendaTime(event: Event) {
  const time = event.base_time || "Horário a confirmar";
  if (event.recurrence?.startsWith("once:")) {
    const date = event.recurrence.split(":")[1] || "";
    return `${date ? formatShortDate(date) : "Evento"} · ${time}`;
  }
  if (event.recurrence?.startsWith("weekly:")) {
    const day = Number(event.recurrence.split(":")[1]);
    const labels = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    return `${labels[day] || "Semanal"} · ${time}`;
  }
  return `Evento · ${time}`;
}

function timelineTone(tone: string): TimelineItem["tone"] {
  if (tone === "success") return "visitor";
  if (tone === "amber") return "care";
  if (tone === "info") return "cell";
  if (tone === "danger") return "coral";
  return "coral";
}

function DashboardV3Skeleton() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] p-6">
      <div className="mx-auto max-w-[1240px] space-y-6">
        <div className="h-12 rounded-full bg-white" />
        <div className="h-72 rounded-[36px] bg-white" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-56 rounded-[30px] bg-white" />)}
        </div>
      </div>
    </div>
  );
}

export default function DashboardV3Page() {
  const { user, church, departments, unreadNotifications } = useApp();
  const [members, setMembers] = useState<User[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleMembers, setScheduleMembers] = useState<ScheduleMember[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [cellMembers, setCellMembers] = useState<CellMemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const visibleDepartmentIds = useMemo(() => departments.map((department) => department.id), [departments]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      const [
        { data: membersData },
        { data: schedulesData },
        { data: eventsData },
        { data: notificationsData },
        { data: departmentMembersData },
        cellsResponse,
      ] = await Promise.all([
        supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
        supabase.from("schedules").select("*").eq("church_id", user.church_id).neq("status", "cancelled"),
        supabase.from("events").select("*").eq("church_id", user.church_id),
        supabase.from("notifications").select("*").eq("user_id", user.id).eq("read", false).limit(8),
        departments.length
          ? supabase.from("department_members").select("*").in("department_id", visibleDepartmentIds)
          : Promise.resolve({ data: [], error: null }),
        fetch("/api/cells/list", { method: "POST", credentials: "include" }).catch(() => null),
      ]);

      const allSchedules = (schedulesData || []) as Schedule[];
      const scheduleIds = allSchedules.map((schedule) => schedule.id);
      const { data: smData } = scheduleIds.length
        ? await supabase.from("schedule_members").select("*").in("schedule_id", scheduleIds)
        : { data: [] };

      if (cancelled) return;

      const scopedDepartmentIds = new Set(visibleDepartmentIds);
      const scopedSchedules =
        user.role === "admin"
          ? allSchedules
          : allSchedules.filter((schedule) => scopedDepartmentIds.has(schedule.department_id));
      const scopedScheduleIds = new Set(scopedSchedules.map((schedule) => schedule.id));
      const scopedMembers =
        user.role === "admin"
          ? ((membersData || []) as User[])
          : ((membersData || []) as User[]).filter((member) =>
              ((departmentMembersData || []) as Array<{ user_id: string; department_id: string }>).some(
                (link) => link.user_id === member.id && scopedDepartmentIds.has(link.department_id)
              )
            );

      setMembers(scopedMembers);
      setSchedules(scopedSchedules);
      setScheduleMembers(((smData || []) as ScheduleMember[]).filter((sm) => scopedScheduleIds.has(sm.schedule_id)));
      setEvents((eventsData || []) as Event[]);
      setNotifications((notificationsData || []) as Notification[]);
      const cellsPayload = cellsResponse ? await cellsResponse.json().catch(() => null) : null;
      setCells((cellsPayload?.cells || []) as Cell[]);
      setCellMembers((cellsPayload?.cellMembers || []) as CellMemberRow[]);
      setLoading(false);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [departments.length, user.church_id, user.id, user.role, visibleDepartmentIds]);

  const data = useMemo<DashboardV3Data>(() => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const greeting = getGreeting();
    const firstName = user.name.split(" ")[0] || user.name;
    const isAdminLike = user.role === "admin" || user.role === "leader" || user.cell_role === "pastor" || user.cell_role === "coordenacao";
    const isCommonMember = !isAdminLike;
    const myCellIds = new Set(cellMembers.filter((member) => member.user_id === user.id).map((member) => member.cell_id));
    const myCell = cells.find((cellItem) => myCellIds.has(cellItem.id));
    const hasMinistry = departments.length > 0;
    const hasCell = Boolean(myCell);
    const profileMode: DashboardV3Data["profileMode"] = isAdminLike
      ? user.role === "leader"
        ? "hybrid"
        : "admin"
      : hasMinistry
      ? "departmentMember"
      : hasCell
      ? "cellMember"
      : "connect";

    const activeSchedules = schedules.filter((schedule) => schedule.status === "active" && schedule.published);
    const upcomingSchedules = activeSchedules
      .filter((schedule) => schedule.date >= todayIso)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    const pendingConfirmations = scheduleMembers.filter((sm) =>
      activeSchedules.some((schedule) => schedule.id === sm.schedule_id) && sm.status === "pending"
    ).length;
    const myPending = scheduleMembers.filter((sm) => sm.user_id === user.id && sm.status === "pending").length;
    const myUpcoming = scheduleMembers
      .filter((sm) => sm.user_id === user.id)
      .map((sm) => upcomingSchedules.find((schedule) => schedule.id === sm.schedule_id))
      .filter(Boolean) as Schedule[];
    const nextMemberSchedule = myUpcoming[0] || upcomingSchedules[0];
    const todaysCells = pastoralCells.filter((cell) => {
      const weekday = today.toLocaleDateString("pt-BR", { weekday: "long" }).toLowerCase();
      return weekday.startsWith(cell.weekDay.slice(0, 3).toLowerCase());
    });
    const activePrayerRequests = prayerRequests.filter((request) => request.status === "open");
    const visitorsWithoutCare = 1;
    const openCareCount = careCases.filter((care) => care.status !== "finished").length;

    const heroTitle =
      profileMode === "connect"
        ? `Bem-vindo ao Servos, ${firstName}. Vamos ajudar você a se conectar.`
        : profileMode === "cellMember"
        ? `${greeting}, ${firstName}. Sua comunidade está organizada para hoje.`
        : `${greeting}, ${firstName}. Aqui está o que precisa da sua atenção hoje.`;

    const heroSummary =
      profileMode === "connect"
        ? "Comece encontrando uma célula, conhecendo ministérios e completando seu cadastro para receber os próximos convites."
        : isAdminLike
        ? `Hoje você possui ${pendingConfirmations} confirmações pendentes e ${openCareCount} pessoas precisando de cuidado.`
        : nextMemberSchedule
        ? `Sua próxima escala acontece em ${formatShortDate(nextMemberSchedule.date)} às ${nextMemberSchedule.time}.`
        : hasCell
        ? `Sua próxima célula acontece ${myCell?.week_day.toLowerCase() || "esta semana"} às ${myCell?.time || "20:00"}.`
        : "Veja sua agenda, seus avisos e caminhos para se conectar em uma célula.";
    const heroFocus =
      profileMode === "connect"
        ? "Complete seu cadastro, encontre uma célula e conheça ministérios para servir."
        : isAdminLike
        ? `Hoje você possui ${pendingConfirmations} confirmações pendentes e ${openCareCount} pessoas precisando de cuidado.`
        : heroSummary;

    const priorities: PriorityCard[] = isAdminLike
      ? [
          {
            label: "Confirmações pendentes",
            value: pendingConfirmations,
            description: "voluntários ainda precisam responder às escalas.",
            href: "/escalas",
            action: "Revisar confirmações",
            icon: "check",
            tone: "coral",
          },
          {
            label: "Pessoas em cuidado",
            value: openCareCount,
            description: "acompanhamentos pastorais em aberto.",
            href: "/acompanhamentos",
            action: "Abrir cuidado",
            icon: "heart",
            tone: "care",
          },
          {
            label: "Células acontecendo",
            value: Math.max(todaysCells.length, 2),
            description: "encontros ativos ou próximos nesta semana.",
            href: "/celulas",
            action: "Ver células",
            icon: "calendar",
            tone: "cell",
          },
          {
            label: "Visitantes sem acompanhamento",
            value: visitorsWithoutCare,
            description: "pessoas novas aguardando conexão.",
            href: "/pessoas",
            action: "Conectar visitantes",
            icon: "users",
            tone: "visitor",
          },
        ]
      : [
          {
            label: "Minhas confirmações",
            value: myPending,
            description: "respostas pendentes nas suas escalas.",
            href: "/minhas-escalas",
            action: "Responder agora",
            icon: "check",
            tone: "coral",
          },
          {
            label: "Próxima escala",
            value: nextMemberSchedule ? nextMemberSchedule.time : "Livre",
            description: nextMemberSchedule ? formatShortDate(nextMemberSchedule.date) : "nenhuma escala publicada.",
            href: "/minhas-escalas",
            action: "Ver detalhes",
            icon: "calendar",
            tone: "care",
          },
          {
            label: "Minha célula",
            value: pastoralCells[0]?.time || "20:00",
            description: pastoralCells[0]?.name || "encontro da semana.",
            href: "/celulas",
            action: "Abrir célula",
            icon: "home",
            tone: "cell",
          },
          {
            label: "Pedidos de oração",
            value: activePrayerRequests.length,
            description: "motivos compartilhados para intercessão.",
            href: "/pedidos-oracao",
            action: "Orar agora",
            icon: "heart",
            tone: "visitor",
          },
        ];

    const priorityItems: PriorityListItem[] = [
      {
        title: "Confirmar escala do Louvor",
        meta: "Ainda faltam respostas para domingo",
        badge: "Escalas",
        href: "/escalas",
        icon: "check",
      },
      {
        title: "Entrar em contato com Elisa",
        meta: "Visitante recorrente sem célula",
        badge: "Cuidado",
        href: "/pessoas",
        icon: "heart",
      },
      {
        title: "Aprovar visitantes",
        meta: "Novas pessoas aguardando acolhimento",
        badge: "Pessoas",
        href: "/pessoas",
        icon: "users",
      },
      {
        title: "Revisar célula Jovens Norte",
        meta: "Encontro com novos participantes",
        badge: "Células",
        href: "/celulas",
        icon: "calendar",
      },
      {
        title: "Fechar escala de produção",
        meta: "Publicação pendente para os voluntários",
        badge: "Hoje",
        href: "/escalas",
        icon: "settings",
      },
    ];

    const timeline: TimelineItem[] = [
      ...timelineEvents.slice(0, 4).map((event) => {
        const person = getPerson(event.personId);
        return {
          title: person ? `${person.fullName.split(" ")[0]}: ${event.title.toLowerCase()}` : event.title,
          meta: event.description,
          time: formatRelative(event.date),
          tone: timelineTone(event.tone),
          icon: event.type === "schedule_confirmed" ? "check" : event.type === "visit" ? "users" : event.type === "absence" ? "heart" : "spark",
        } satisfies TimelineItem;
      }),
      ...notifications.slice(0, 1).map((notification) => ({
        title: notification.title,
        meta: notification.body,
        time: formatRelative(notification.created_at),
        tone: "neutral" as const,
        icon: "bell" as const,
      })),
    ].slice(0, 5);

    const memberScheduleIds = new Set(scheduleMembers.filter((sm) => sm.user_id === user.id).map((sm) => sm.schedule_id));
    const scheduleAgendaSource = isCommonMember
      ? [
          ...myUpcoming,
          ...upcomingSchedules.filter((schedule) => !memberScheduleIds.has(schedule.id)),
        ]
      : upcomingSchedules;

    const upcomingFromSchedules: UpcomingEventItem[] = scheduleAgendaSource.slice(0, 3).map((schedule) => {
      const event = events.find((item) => item.id === schedule.event_id);
      const department = departments.find((item) => item.id === schedule.department_id);
      const myStatus = scheduleMembers.find((sm) => sm.schedule_id === schedule.id && sm.user_id === user.id)?.status;
      return {
        title: event?.name || "Escala",
        meta: department?.name || "Ministério",
        time: `${formatShortDate(schedule.date)} · ${schedule.time}`,
        location: event?.location || "Igreja",
        badge: myStatus === "pending" ? "Confirmar" : myStatus === "confirmed" ? "Confirmado" : "Ministério",
        href: `/escalas?id=${schedule.id}`,
        icon: "calendar",
      };
    });
    const upcomingFromCells: UpcomingEventItem[] = isCommonMember
      ? myCell
        ? [{
            title: myCell.name,
            meta: myCell.audience || "Minha célula",
            time: `${myCell.week_day} · ${myCell.time}`,
            location: myCell.address || "Local a confirmar",
            badge: "Célula",
            href: `/celulas/${myCell.id}`,
            icon: "home" as const,
          }]
        : []
      : pastoralCells.slice(0, Math.max(0, 3 - upcomingFromSchedules.length)).map((cell) => ({
          title: cell.name,
          meta: cell.audience,
          time: `${cell.weekDay} · ${cell.time}`,
          location: cell.address,
          badge: "Célula",
          href: `/celulas/${cell.id}`,
          icon: "home" as const,
        }));

    const upcomingFromEvents: UpcomingEventItem[] = events
      .filter((event) => event.active !== false)
      .slice(0, Math.max(0, 4 - upcomingFromSchedules.length - upcomingFromCells.length))
      .map((event) => ({
        title: event.name,
        meta: event.type === "recurring" ? "Culto recorrente" : "Evento especial",
        time: formatEventAgendaTime(event),
        location: event.location || "Igreja",
        badge: event.type === "recurring" ? "Culto" : "Evento",
        href: `/eventos/${event.id}`,
        icon: event.type === "recurring" ? "spark" as const : "calendar" as const,
      }));

    const upcoming: UpcomingEventItem[] = [
      ...upcomingFromSchedules,
      ...upcomingFromCells,
      ...upcomingFromEvents,
    ].slice(0, 6);

    const carePeople: CarePerson[] = careCases.map((care) => {
      const person = getPerson(care.personId);
      const badgeMap: Record<string, string> = {
        "care-ana": "Participação baixa",
        "care-elisa": "Atenção pastoral",
        "care-joao": "3 faltas seguidas",
      };
      const lastPresenceMap: Record<string, string> = {
        "care-ana": "há 18 dias",
        "care-elisa": "25/05/2025",
        "care-joao": "18/05/2025",
      };
      return {
        id: care.id,
        name: person?.fullName || care.title,
        reason: care.reason,
        lastPresence: lastPresenceMap[care.id] ?? (person?.lastContactAt ? formatShortDate(person.lastContactAt) : "sem contato recente"),
        badge: badgeMap[care.id] ?? (care.priority === "high" ? "Atenção pastoral" : "Participação baixa"),
        avatarColor: person?.avatarColor || "#F4532A",
        photoUrl: person?.photoUrl || null,
      };
    });

    const insights: Insight[] = [
      { value: "+18%", label: "Crescimento geral", description: "vs. semana passada", trend: [3, 5, 4, 6, 7, 8, 9, 11], icon: "spark" },
      { value: "7", label: "Novos visitantes", description: "esta semana", trend: [2, 4, 3, 5, 4, 6, 5, 7], icon: "users" },
      { value: "4", label: "Pessoas reconectadas", description: "esta semana", trend: [1, 1, 2, 1, 3, 2, 3, 4], icon: "heart" },
      { value: "92%", label: "Presença média", description: "geral", trend: [87, 89, 88, 91, 90, 92, 91, 92], icon: "clock" },
    ];

    const cellLeaderId = myCell?.leader_ids?.[0] || myCell?.leader_id || "";
    const cellLeader = cellLeaderId ? members.find((member) => member.id === cellLeaderId) : null;

    const cellLeaderIds = myCell
      ? [
          ...(myCell.leader_ids || []).map((id) => ({ id, role: "Líder" })),
          ...(myCell.co_leader_ids || []).map((id) => ({ id, role: "Co-líder" })),
        ].slice(0, 3)
      : [];
    const cellLeaders = cellLeaderIds
      .map(({ id, role }) => {
        const member = members.find((m) => m.id === id);
        return member ? { name: member.name, role } : null;
      })
      .filter(Boolean) as Array<{ name: string; role: string }>;

    const userIsLeader = myCell
      ? [...(myCell.leader_ids || []), ...(myCell.co_leader_ids || [])].includes(user.id)
      : false;

    const cell: CellSummary | undefined = myCell
      ? {
          name: myCell.name,
          nextMeeting: `${myCell.week_day} às ${myCell.time} · ${myCell.address || "Local a confirmar"}`,
          notice: "Separar pedidos de oração e confirmar presença antes do encontro.",
          leader: cellLeader?.name || "Liderança da célula",
          prayerCount: activePrayerRequests.length,
          href: `/celulas/${myCell.id}`,
          leaders: cellLeaders.length > 0 ? cellLeaders : undefined,
          userIsLeader,
        }
      : undefined;

    const prayers: PrayerRequestCardData[] = activePrayerRequests.slice(0, 2).map((request) => {
      const person = getPerson(request.personId);
      return {
        title: request.title,
        description: request.description,
        person: person?.fullName || "Pedido compartilhado",
        href: "/pedidos-oracao",
      };
    });

    const quickActions: QuickActionItem[] = isAdminLike
      ? [
          { label: "Nova escala", href: "/escalas/nova", icon: "plus" },
          { label: "Nova célula", href: "/celulas", icon: "home" },
          { label: "Nova pessoa", href: "/pessoas", icon: "users" },
        ]
      : profileMode === "connect"
      ? [
          { label: "Quero servir", href: "/ministerios", icon: "heart" },
          { label: "Encontrar célula", href: "/celulas", icon: "home" },
          { label: "Completar cadastro", href: "/perfil", icon: "check" },
        ]
      : [
          { label: "Minha escala", href: "/minhas-escalas", icon: "calendar" },
          { label: "Minha célula", href: "/celulas", icon: "home" },
          { label: "Avisos", href: "/notificacoes", icon: "bell" },
        ];

    const notices = notifications.slice(0, 6).map((notification) => {
      const text = `${notification.title} ${notification.body} ${notification.action_url}`.toLowerCase();
      const scope = text.includes("celula") || text.includes("célula") || text.includes("/celulas")
        ? "Célula" as const
        : text.includes("ministerio") || text.includes("ministério") || text.includes("escala") || text.includes("/escalas")
        ? "Ministério" as const
        : "Aviso" as const;
      return {
        title: notification.title,
        body: notification.body,
        time: formatRelative(notification.created_at),
        href: notification.action_url || "/notificacoes",
        scope,
      };
    });

    return {
      profileMode,
      greeting,
      heroTitle,
      heroSummary,
      heroFocus,
      user,
      churchName: church.name,
      unreadNotifications,
      priorities,
      priorityItems,
      timeline,
      upcoming,
      carePeople,
      insights,
      cell,
      prayers,
      quickActions,
      notices,
    };
  }, [cellMembers, cells, church.name, departments, events, members, notifications, scheduleMembers, schedules, unreadNotifications, user]);

  if (loading) return <DashboardV3Skeleton />;

  return <DashboardV3Home data={data} />;
}
