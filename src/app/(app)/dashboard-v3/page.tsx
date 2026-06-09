"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { getGreeting } from "@/lib/utils/helpers";
import { getPerson, registerPeopleInCache, registerCellsInCache } from "@/lib/pastoral/selectors";
import {
  DashboardV3Home,
  type CarePerson,
  type CellSummary,
  type DashboardV3Data,
  type Insight,
  type MinistrySummary,
  type PrayerRequestCardData,
  type PriorityCard,
  type PriorityListItem,
  type QuickActionItem,
  type TimelineItem,
  type UpcomingEventItem,
} from "@/components/dashboard/home-v3-ui";
import { isCareCaseType, isPrayerType } from "@/lib/care/types";
import { computeServedStats } from "@/lib/schedules/served-stats";
import type { Cell, CellMemberRow, CellNetwork } from "@/lib/cells/types";
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
  const [networks, setNetworks] = useState<CellNetwork[]>([]);
  const [myDepartmentIds, setMyDepartmentIds] = useState<string[]>([]);
  const [allChurchDepartments, setAllChurchDepartments] = useState<Department[]>([]);
  const [pastoralNotes, setPastoralNotes] = useState<any[]>([]);
  const [prayerCommentCounts, setPrayerCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const visibleDepartmentIds = useMemo(() => departments.map((department) => department.id), [departments]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        const [
          { data: membersData, error: membersError },
          { data: schedulesData, error: schedulesError },
          { data: eventsData, error: eventsError },
          { data: notificationsData, error: notificationsError },
          { data: departmentMembersData, error: departmentMembersError },
          { data: notesData, error: notesError },
          { data: allDeptData },
          cellsResponse,
          { data: prayerCommentsData },
        ] = await Promise.all([
          supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
          supabase.from("schedules").select("*").eq("church_id", user.church_id).neq("status", "cancelled"),
          supabase.from("events").select("*").eq("church_id", user.church_id),
          supabase.from("notifications").select("*").eq("user_id", user.id).eq("read", false).limit(8),
          departments.length
            ? supabase.from("department_members").select("*").in("department_id", visibleDepartmentIds)
            : Promise.resolve({ data: [], error: null }),
          supabase.from("pastoral_notes").select("*").eq("church_id", user.church_id),
          // Todos os ministérios da igreja (para a descoberta "onde servir").
          supabase.from("departments").select("*").eq("church_id", user.church_id),
          fetch("/api/cells/list", { method: "POST", credentials: "include" }).catch(() => null),
          // Comentários de oração (para o indicador "💬 N" no Início).
          supabase.from("prayer_comments").select("prayer_id").eq("church_id", user.church_id),
        ]);

        if (membersError) console.error("loadData users query error:", membersError);
        if (schedulesError) console.error("loadData schedules query error:", schedulesError);
        if (eventsError) console.error("loadData events query error:", eventsError);
        if (notificationsError) console.error("loadData notifications query error:", notificationsError);
        if (departmentMembersError) console.error("loadData department_members query error:", departmentMembersError);
        if (notesError) console.error("loadData notes query error:", notesError);

        const allSchedules = (schedulesData || []) as Schedule[];
        const scheduleIds = allSchedules.map((schedule) => schedule.id);
        const { data: smData, error: smError } = scheduleIds.length
          ? await supabase.from("schedule_members").select("*").in("schedule_id", scheduleIds)
          : { data: [], error: null };

        if (smError) console.error("loadData schedule_members query error:", smError);

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

        // Ministérios em que o PRÓPRIO usuário participa (contexto pessoal).
        // Inclui tanto os vínculos de membro (department_members) quanto os
        // ministérios que ele LIDERA/co-lidera — liderar não cria vínculo de
        // membro, então sem isso um líder de 2 ministérios só via 1 no Início.
        const linkedDeptIds = ((departmentMembersData || []) as Array<{ user_id: string; department_id: string }>)
          .filter((link) => link.user_id === user.id)
          .map((link) => link.department_id);
        const ledDeptIds = departments
          .filter((d) => (d.leader_ids || []).includes(user.id) || (d.co_leader_ids || []).includes(user.id))
          .map((d) => d.id);
        setMyDepartmentIds(Array.from(new Set([...linkedDeptIds, ...ledDeptIds])));

        setAllChurchDepartments((allDeptData || []) as Department[]);
        setMembers(scopedMembers);
        setSchedules(scopedSchedules);
        setScheduleMembers(((smData || []) as ScheduleMember[]).filter((sm) => scopedScheduleIds.has(sm.schedule_id)));
        setEvents((eventsData || []) as Event[]);
        setNotifications((notificationsData || []) as Notification[]);
        const cellsPayload = cellsResponse ? await cellsResponse.json().catch(() => null) : null;
        const cellsList = (cellsPayload?.cells || []) as Cell[];
        setCells(cellsList);
        setCellMembers((cellsPayload?.cellMembers || []) as CellMemberRow[]);
        setNetworks((cellsPayload?.networks || []) as CellNetwork[]);
        setPastoralNotes(notesData || []);

        const commentCounts: Record<string, number> = {};
        ((prayerCommentsData || []) as Array<{ prayer_id: string }>).forEach((c) => {
          if (c.prayer_id) commentCounts[c.prayer_id] = (commentCounts[c.prayer_id] || 0) + 1;
        });
        setPrayerCommentCounts(commentCounts);

        // Register database objects in selector cache
        registerPeopleInCache(membersData || []);
        registerCellsInCache(cellsList);
      } catch (err) {
        console.error("Critical error inside loadData:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
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
    // A visão pastoral (cards de prioridade + cuidado + insights) é só de
    // Admin, Pastor, Coordenador e Supervisor (de rede). Líderes de
    // célula/ministério e membros NÃO veem.
    const isSupervisor = networks.some((n) => (n.supervisor_ids || []).includes(user.id));
    const isPastorOrAdmin =
      user.role === "admin" ||
      user.cell_role === "pastor" ||
      user.cell_role === "coordenacao" ||
      isSupervisor;
    const profileMode: DashboardV3Data["profileMode"] = isPastorOrAdmin
      ? "admin"
      : user.role === "leader"
      ? "hybrid"
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

    const dbPrayerRequests = pastoralNotes.filter((n) => isPrayerType(n.type));
    const activePrayerRequests = dbPrayerRequests.filter((request) => request.status !== "resolved");
    const dbCareCases = pastoralNotes.filter((n) => isCareCaseType(n.type));
    const openCareCount = dbCareCases.length;
    const presenceAvg = cells.length
      ? Math.round(
          cells.reduce((sum, cellItem) => sum + (cellItem.health?.frequency ?? 0), 0) / cells.length
        )
      : 0;
    const activeMinistries = departments.length;

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
            label: "Ministérios ativos",
            value: activeMinistries,
            description: "equipes servindo na igreja.",
            href: "/ministerios",
            action: "Ver ministérios",
            icon: "spark",
            tone: "coral",
          },
          {
            label: "Membros ativos",
            value: members.length,
            description: "pessoas na base da igreja.",
            href: "/pessoas",
            action: "Ver pessoas",
            icon: "users",
            tone: "visitor",
          },
          {
            label: "Células ativas",
            value: cells.length,
            description: "grupos em atividade nesta semana.",
            href: "/celulas",
            action: "Ver células",
            icon: "home",
            tone: "cell",
          },
          {
            label: "Presença média",
            value: presenceAvg ? `${presenceAvg}%` : "—",
            description: "frequência média das células.",
            href: "/relatorios",
            action: "Ver relatórios",
            icon: "clock",
            tone: "care",
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
            value: myCell?.time || "20:00",
            description: myCell?.name || "Sem célula vinculada.",
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

    const priorityItems: PriorityListItem[] = [];
    if (pendingConfirmations > 0) {
      priorityItems.push({
        title: "Confirmar escalas pendentes",
        meta: `${pendingConfirmations} voluntários ainda não responderam.`,
        badge: "Escalas",
        href: "/escalas",
        icon: "check",
      });
    }
    // "Sem servir" computado das confirmações reais (o contador last_served_at
    // não é mantido). Evita marcar como drift quem já serviu.
    const servedStats = computeServedStats(scheduleMembers, schedules, todayIso);
    const driftPeople = members.filter((m) => !servedStats.last.has(m.id)).slice(0, 2);
    driftPeople.forEach((m) => {
      priorityItems.push({
        title: `Entrar em contato com ${m.name.split(" ")[0]}`,
        meta: "Sem escala ou participação recente registrada.",
        badge: "Cuidado",
        href: `/pessoas/${m.id}`,
        icon: "heart",
      });
    });
    const cellWithoutReports = cells.slice(0, 2);
    cellWithoutReports.forEach((c) => {
      priorityItems.push({
        title: `Revisar célula ${c.name}`,
        meta: "Verificar relatórios de reuniões e frequência.",
        badge: "Células",
        href: `/celulas/${c.id}`,
        icon: "calendar",
      });
    });
    if (priorityItems.length === 0) {
      priorityItems.push({
        title: "Tudo em dia!",
        meta: "Nenhuma pendência crítica identificada.",
        badge: "Status",
        href: "/dashboard",
        icon: "check",
      });
    }

    const dbTimeline = pastoralNotes.filter((n) => !isCareCaseType(n.type) && !isPrayerType(n.type));
    const timeline: TimelineItem[] = [
      ...dbTimeline.slice(0, 4).map((event) => {
        const person = members.find((m) => m.id === event.person_id);
        const tone: TimelineItem["tone"] = event.type === "alert" ? "coral" : "visitor";
        return {
          title: person ? `${person.name.split(" ")[0]}: ${event.title.toLowerCase()}` : event.title,
          meta: event.description,
          time: formatRelative(event.date || event.created_at),
          tone,
          icon: event.type === "visit" ? "users" : event.type === "absence" ? "heart" : "spark",
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
        kind: "schedule" as const,
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
            kind: "cell" as const,
          }]
        : []
      : cells.slice(0, Math.max(0, 3 - upcomingFromSchedules.length)).map((cell) => ({
          title: cell.name,
          meta: cell.audience || "Célula",
          time: `${cell.week_day} · ${cell.time}`,
          location: cell.address || "Local a confirmar",
          badge: "Célula",
          href: `/celulas/${cell.id}`,
          icon: "home" as const,
          kind: "cell" as const,
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
        kind: "event" as const,
      }));

    const upcoming: UpcomingEventItem[] = [
      ...upcomingFromSchedules,
      ...upcomingFromCells,
      ...upcomingFromEvents,
    ].slice(0, 6);

    // Escalas PESSOAIS do usuário (mesmo admin/pastor): usadas no bloco de
    // contexto pessoal do Início, distinto das escalas da igreja.
    const personalSchedules: UpcomingEventItem[] = myUpcoming.slice(0, 4).map((schedule) => {
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
        icon: "calendar" as const,
        kind: "schedule" as const,
      };
    });

    // Ministérios em que o próprio usuário participa (contexto pessoal no Início).
    const personalMinistries: MinistrySummary[] = departments
      .filter((d) => myDepartmentIds.includes(d.id))
      .map((d) => ({ id: d.id, name: d.name, icon: d.icon, color: d.color, href: `/ministerios/${d.id}` }));

    // Ministérios da igreja que o usuário ainda NÃO participa (descoberta "onde servir").
    const discoverMinistries: MinistrySummary[] = allChurchDepartments
      .filter((d) => d.active !== false && !myDepartmentIds.includes(d.id))
      .map((d) => ({
        id: d.id,
        name: d.name,
        icon: d.icon,
        color: d.color,
        description: d.description,
        href: `/ministerios/${d.id}`,
      }));

    const carePeople: CarePerson[] = dbCareCases.map((care) => {
      const person = members.find((m) => m.id === care.person_id);
      return {
        id: care.id,
        name: person?.name || care.title,
        reason: care.description || care.title,
        lastPresence: servedStats.last.has(care.person_id)
          ? formatShortDate(servedStats.last.get(care.person_id)!)
          : "sem contato recente",
        badge: "Atenção pastoral",
        avatarColor: person?.avatar_color || "#FF6B57",
        photoUrl: person?.photo_url || null,
      };
    });

    const insights: Insight[] = [
      { value: String(members.length), label: "Membros ativos", description: "na base da igreja", trend: [3, 5, 4, 6, 7, 8, 9, 11], icon: "users" },
      { value: String(cells.length), label: "Células ativas", description: "esta semana", trend: [2, 4, 3, 5, 4, 6, 5, 7], icon: "home" },
      { value: String(openCareCount), label: "Acompanhamentos", description: "em andamento", trend: [1, 1, 2, 1, 3, 2, 3, 4], icon: "heart" },
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
      const person = members.find((m) => m.id === request.person_id);
      return {
        title: request.title,
        description: request.description,
        person: person?.name || "Pedido compartilhado",
        href: "/pedidos-oracao",
        commentCount: prayerCommentCounts[request.id] || 0,
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
      personalSchedules,
      personalMinistries,
      discoverMinistries,
      carePeople,
      insights,
      cell,
      prayers,
      quickActions,
      notices,
    };
  }, [cellMembers, cells, networks, church.name, departments, allChurchDepartments, events, members, myDepartmentIds, notifications, scheduleMembers, schedules, unreadNotifications, user, pastoralNotes, prayerCommentCounts]);

  if (loading) return <DashboardV3Skeleton />;

  return <DashboardV3Home data={data} />;
}
