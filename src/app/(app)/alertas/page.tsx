"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { Avatar, EmptyState, PageHeader, PageShell, SkeletonList } from "@/components/ui";
import type { Cell, CellMemberRow } from "@/lib/cells/types";
import type { Schedule, ScheduleMember, User } from "@/types";

// Servos 2.0 — Loop de cuidado (Vision §8). A tela deixa de ser mock e CALCULA
// alertas pastorais a partir dos dados reais. Sem cron/armazenamento novo:
// é uma leitura inteligente do que já existe.

type Severity = "urgent" | "attention" | "gentle";

type Alert = {
  id: string;
  personId: string;
  personName: string;
  avatarColor: string;
  photoUrl: string | null;
  severity: Severity;
  title: string;
  message: string;
  actionLabel: string;
  href: string;
};

type PastoralNote = { id: string; person_id: string; type: string; status?: string; title?: string };
type Meeting = { id: string; cell_id: string; date: string };
type Attendance = { meeting_id: string; user_id: string; status: string };
type DeptMember = { user_id: string; department_id: string };

const SEVERITY = {
  urgent: { label: "Urgente", order: 0, dot: "bg-danger", chip: "bg-danger-light text-danger", ring: "border-danger/30" },
  attention: { label: "Atenção", order: 1, dot: "bg-amber", chip: "bg-amber-light text-amber", ring: "border-amber/30" },
  gentle: { label: "Leve", order: 2, dot: "bg-info", chip: "bg-info-light text-info", ring: "border-info/25" },
} as const;

const todayIso = () => new Date().toISOString().slice(0, 10);

function daysUntilBirthday(birthDate: string): number | null {
  if (!birthDate || birthDate.length < 10) return null;
  const [, mm, dd] = birthDate.split("-").map(Number);
  if (!mm || !dd) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), mm - 1, dd);
  if (next < today) next = new Date(now.getFullYear() + 1, mm - 1, dd);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

export default function AlertasPage() {
  const { user, departments } = useApp();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const departmentIds = useMemo(() => departments.map((d) => d.id), [departments]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const churchId = user.church_id;
        const [
          { data: usersData },
          cellsRes,
          { data: dmData },
          { data: schedulesData },
          { data: notesData },
          { data: meetingsData },
        ] = await Promise.all([
          supabase.from("users").select("*").eq("church_id", churchId).eq("active", true),
          fetch("/api/cells/list", { method: "POST", credentials: "include" }).catch(() => null),
          departmentIds.length
            ? supabase.from("department_members").select("user_id, department_id").in("department_id", departmentIds)
            : Promise.resolve({ data: [] as DeptMember[] }),
          supabase.from("schedules").select("*").eq("church_id", churchId).neq("status", "cancelled"),
          supabase.from("pastoral_notes").select("*").eq("church_id", churchId),
          supabase.from("cell_meetings").select("id, cell_id, date").eq("church_id", churchId),
        ]);

        const cellsPayload = cellsRes ? await cellsRes.json().catch(() => null) : null;
        const cells = (cellsPayload?.cells || []) as Cell[];
        const cellMembers = (cellsPayload?.cellMembers || []) as CellMemberRow[];

        const schedules = (schedulesData || []) as Schedule[];
        const scheduleIds = schedules.map((s) => s.id);
        const meetings = (meetingsData || []) as Meeting[];
        const meetingIds = meetings.map((m) => m.id);

        // Segunda fase: schedule_members e presença (escopadas por ids).
        const [{ data: smData }, { data: attData }] = await Promise.all([
          scheduleIds.length
            ? supabase.from("schedule_members").select("user_id, schedule_id, status").in("schedule_id", scheduleIds)
            : Promise.resolve({ data: [] as ScheduleMember[] }),
          meetingIds.length
            ? supabase.from("cell_attendance").select("meeting_id, user_id, status").in("meeting_id", meetingIds)
            : Promise.resolve({ data: [] as Attendance[] }),
        ]);

        if (cancelled) return;

        const members = (usersData || []) as User[];
        const dms = (dmData || []) as DeptMember[];
        const sms = (smData || []) as Array<{ user_id: string; schedule_id: string; status: string }>;
        const attendance = (attData || []) as Attendance[];
        const notes = (notesData || []) as PastoralNote[];

        const byId = new Map(members.map((m) => [m.id, m]));
        const inMinistry = new Set(dms.map((d) => d.user_id));
        const memberCellIds = new Map<string, string>();
        cellMembers.forEach((cm) => memberCellIds.set(cm.user_id, cm.cell_id));
        const hasCell = (u: User) => Boolean(u.cell_id) || memberCellIds.has(u.id);

        const today = todayIso();
        const sixtyAgo = new Date();
        sixtyAgo.setDate(sixtyAgo.getDate() - 60);
        const sixtyAgoIso = sixtyAgo.toISOString().slice(0, 10);

        // Última vez que serviu (confirmado em escala passada).
        const pastScheduleDate = new Map<string, string>();
        schedules.filter((s) => s.date <= today).forEach((s) => pastScheduleDate.set(s.id, s.date));
        const lastServed = new Map<string, string>();
        sms.forEach((sm) => {
          if (sm.status !== "confirmed") return;
          const d = pastScheduleDate.get(sm.schedule_id);
          if (!d) return;
          const cur = lastServed.get(sm.user_id);
          if (!cur || d > cur) lastServed.set(sm.user_id, d);
        });

        const out: Alert[] = [];
        const mk = (p: User, severity: Severity, key: string, title: string, message: string, actionLabel: string, tab?: string) =>
          out.push({
            id: `${key}:${p.id}`,
            personId: p.id,
            personName: p.name,
            avatarColor: p.avatar_color || "#FF6B57",
            photoUrl: p.photo_url || null,
            severity,
            title,
            message,
            actionLabel,
            href: `/pessoas/${p.id}${tab ? `?tab=${tab}` : ""}`,
          });

        // A1 — Acompanhamento pendente (status = todo)
        notes.filter((n) => n.status === "todo").forEach((n) => {
          const p = byId.get(n.person_id);
          if (p) mk(p, "attention", "todo", "Acompanhamento pendente", n.title || "Há uma ação de cuidado marcada como “A fazer”.", "Concluir acompanhamento", "Acompanhamentos");
        });

        members.forEach((p) => {
          const isPlainMember = p.role === "member";

          // A2 — Sem servir há 60+ dias (voluntário em ministério)
          if (inMinistry.has(p.id)) {
            const last = lastServed.get(p.id);
            if (!last || last < sixtyAgoIso) {
              mk(p, "attention", "noserve", "Sem servir há mais de 60 dias", last ? `Serviu pela última vez em ${last}.` : "Está em um ministério mas ainda não serviu.", "Reaproximar / escalar", "Escalas");
            }
          }

          // A3 — Membro sem célula
          if (isPlainMember && !hasCell(p)) {
            mk(p, "gentle", "nocell", "Sem célula", "Membro ativo ainda não conectado a uma célula.", "Conectar a uma célula");
          }

          // A4 — Membro sem ministério
          if (isPlainMember && !inMinistry.has(p.id)) {
            mk(p, "gentle", "nomin", "Não serve em nenhum ministério", "Membro ativo sem vínculo de serviço.", "Convidar a servir");
          }

          // A5 — Aniversário nos próximos 7 dias
          const d = p.birth_date ? daysUntilBirthday(p.birth_date) : null;
          if (d !== null && d <= 7) {
            mk(p, "gentle", "bday", d === 0 ? "Aniversário é hoje! 🎂" : `Aniversário em ${d} ${d === 1 ? "dia" : "dias"}`, "Que tal enviar uma mensagem de carinho?", "Enviar mensagem");
          }
        });

        // A6 — 3+ faltas seguidas na célula
        const meetingsByCell = new Map<string, Meeting[]>();
        meetings.forEach((m) => {
          const arr = meetingsByCell.get(m.cell_id) || [];
          arr.push(m);
          meetingsByCell.set(m.cell_id, arr);
        });
        const attByMeeting = new Map<string, Map<string, string>>();
        attendance.forEach((a) => {
          const m = attByMeeting.get(a.meeting_id) || new Map<string, string>();
          m.set(a.user_id, a.status);
          attByMeeting.set(a.meeting_id, m);
        });
        cellMembers.forEach((cm) => {
          const p = byId.get(cm.user_id);
          if (!p) return;
          const cellMeetings = (meetingsByCell.get(cm.cell_id) || [])
            .filter((m) => (attByMeeting.get(m.id)?.size || 0) > 0)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 3);
          if (cellMeetings.length < 3) return;
          const absentAll = cellMeetings.every((m) => attByMeeting.get(m.id)?.get(cm.user_id) === "absent");
          if (absentAll) {
            mk(p, "urgent", "absent", "Faltou às últimas 3 reuniões", "Pode estar se afastando da célula — vale um contato próximo.", "Cuidado pastoral");
          }
        });

        out.sort((a, b) => SEVERITY[a.severity].order - SEVERITY[b.severity].order || a.personName.localeCompare(b.personName));
        setAlerts(out);
      } catch (err) {
        console.error("Erro ao calcular alertas:", err);
        if (!cancelled) setAlerts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user.church_id, departmentIds]);

  const counts = useMemo(() => {
    const c = { urgent: 0, attention: 0, gentle: 0 };
    alerts.forEach((a) => (c[a.severity] += 1));
    return c;
  }, [alerts]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Cuidado"
        title="Alertas pastorais"
        subtitle="Sinais para cuidar antes que alguém se afaste. São sugestões de cuidado, não cobranças."
      />

      {!loading && alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(["urgent", "attention", "gentle"] as Severity[]).map((s) =>
            counts[s] > 0 ? (
              <span key={s} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${SEVERITY[s].chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY[s].dot}`} />
                {counts[s]} {SEVERITY[s].label.toLowerCase()}
              </span>
            ) : null
          )}
        </div>
      )}

      {loading ? (
        <SkeletonList rows={5} />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Nenhum alerta no momento"
          description="Quando surgir um sinal de cuidado — acompanhamento pendente, faltas, alguém sem célula — ele aparece aqui."
        />
      ) : (
        <div className="grid gap-3">
          {alerts.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className={`flex items-start gap-3 rounded-[18px] border bg-white/70 p-4 shadow-soft backdrop-blur transition hover:bg-white hover:shadow-lift ${SEVERITY[a.severity].ring}`}
            >
              <Avatar name={a.personName} color={a.avatarColor} photoUrl={a.photoUrl} size={42} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[14px] font-bold text-ink">{a.personName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SEVERITY[a.severity].chip}`}>
                    {SEVERITY[a.severity].label}
                  </span>
                </div>
                <div className="mt-1 text-[13px] font-semibold text-ink">{a.title}</div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{a.message}</p>
              </div>
              <span className="hidden flex-shrink-0 self-center rounded-full bg-surface-alt px-3 py-1.5 text-[11px] font-semibold text-ink-muted sm:inline">
                {a.actionLabel} →
              </span>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
