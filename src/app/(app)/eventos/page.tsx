"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type React from "react";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { PageShell, PageHeader } from "@/components/ui";
import { EventFormModal } from "@/components/events/event-form-modal";
import { formatEventRecurrence, getEventCategory } from "@/lib/events/recurrence";
import type { Event, EventReport } from "@/types";

function isMissingEventReportsError(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error || "");
  return /event_reports|schema cache|does not exist/i.test(message);
}

export default function EventosPage() {
  const { user, toast, canDo } = useApp();
  const [modal, setModal] = useState<null | { type: "form"; ev?: Event } | { type: "delete"; ev: Event }>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [reports, setReports] = useState<EventReport[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);

    const [{ data, error }, { data: reportsData, error: reportsError }] = await Promise.all([
      supabase
        .from("events")
        .select("*")
        .eq("church_id", user.church_id)
        .neq("active", false)
        .order("created_at", { ascending: false }),
      supabase.from("event_reports").select("*").eq("church_id", user.church_id),
    ]);

    if (error || (reportsError && !isMissingEventReportsError(reportsError))) {
      console.error("Erro ao carregar eventos:", { error, reportsError });
      toast("Erro ao carregar eventos.");
      setLoading(false);
      return;
    }

    setEvents((data || []) as Event[]);
    setReports(reportsError ? [] : ((reportsData || []) as EventReport[]));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [user.church_id]);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("novo") === "1" && canDo("event.create")) {
      setModal((current) => current || { type: "form" });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [canDo]);

  const recurring = useMemo(
    () => events.filter((e) => e.type === "recurring"),
    [events]
  );

  const special = useMemo(
    () => events.filter((e) => e.type === "special"),
    [events]
  );
  const withTime = useMemo(() => events.filter((e) => Boolean(e.base_time)).length, [events]);
  const reportByEvent = useMemo(() => new Map(reports.map((report) => [report.event_id, report])), [reports]);
  const reportedEvents = reports.length;
  const totalAttendance = useMemo(
    () => reports.reduce((sum, report) => sum + report.attendance_count, 0),
    [reports]
  );
  const totalVisitors = useMemo(
    () => reports.reduce((sum, report) => sum + report.visitors_count, 0),
    [reports]
  );
  const totalVolunteers = useMemo(
    () => reports.reduce((sum, report) => sum + report.volunteers_count, 0),
    [reports]
  );

  async function deleteEvent(ev: Event) {
    try {
      const response = await fetch("/api/events/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "delete",
          eventId: ev.id,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("Erro ao remover evento:", data);
        toast(data?.error || "Erro ao remover evento.");
        return;
      }

      toast(ev.name + " removido.");
      setModal(null);
      await loadData();
    } catch (error) {
      console.error("Erro ao remover evento:", error);
      toast("Erro ao remover evento.");
    }
  }

  return (
    <PageShell className="[font-family:'Inter','Plus_Jakarta_Sans',system-ui,sans-serif]">
      <PageHeader
        eyebrow="Agenda"
        title="Eventos"
        subtitle="Centralize cultos, programações especiais e leituras pós-evento em uma experiência única de agenda pastoral."
        actions={
          canDo("event.create") && (
            <button onClick={() => setModal({ type: "form" })} className="btn btn-primary btn-sm">
              + Novo evento
            </button>
          )
        }
      />

      <section className="relative overflow-hidden rounded-[34px] border border-white bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF0EC_48%,#FAFAF8_100%)] p-6 shadow-[0_28px_80px_-54px_rgba(244,83,42,0.34)] md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Operação da igreja
            </div>
            <h2 className="max-w-[720px] text-[30px] font-bold leading-tight tracking-[-0.045em] text-ink md:text-[38px]">
              Eventos como ponto de encontro entre agenda, escala e cuidado.
            </h2>
            <p className="mt-3 max-w-[650px] text-[14px] leading-6 text-ink-muted">
              Cadastre os eventos base, acompanhe o que já recebeu leitura pós-evento e use a agenda para transformar cada encontro em ação pastoral.
            </p>
          </div>
          <div className="rounded-[26px] border border-white/80 bg-white/78 p-5 shadow-[0_18px_48px_-36px_rgba(27,23,38,0.35)] backdrop-blur">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Pós-eventos registrados</div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-[42px] font-bold leading-none tracking-[-0.055em] text-ink">{loading ? "..." : reportedEvents}</span>
              <span className="pb-1 text-sm font-medium text-ink-muted">de {events.length} eventos</span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <EventMetricPill label="Pessoas" value={totalAttendance} />
              <EventMetricPill label="Visitantes" value={totalVisitors} tone="green" />
              <EventMetricPill label="Servindo" value={totalVolunteers} tone="purple" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <EventStat value={recurring.length} label="Recorrentes" description="Bases semanais para escalas." icon="repeat" tone="green" loading={loading} />
        <EventStat value={special.length} label="Especiais" description="Programações únicas." icon="spark" tone="coral" loading={loading} />
        <EventStat value={withTime} label="Com horário base" description="Mais rápidos de escalar." icon="clock" tone="purple" loading={loading} />
        <EventStat value={reportedEvents} label="Com pós-evento" description="Leitura pastoral registrada." icon="chart" tone="amber" loading={loading} />
      </div>

      {[{ title: "Cultos recorrentes", list: recurring, tone: "green" as const }, { title: "Eventos especiais", list: special, tone: "coral" as const }].map(
        (section) => (
          <section key={section.title} className="rounded-[28px] border border-white/50 bg-white/40 backdrop-blur-xl p-6 shadow-[0_18px_50px_-38px_rgba(27,23,38,0.2)]">
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Eventos</div>
                <h3 className="text-[22px] font-semibold tracking-[-0.025em] text-ink">{section.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {section.title === "Cultos recorrentes"
                    ? "Eventos base para a rotina semanal dos ministérios."
                    : "Programações pontuais que merecem destaque próprio no calendário."}
                </p>
              </div>
              <span className="rounded-full bg-surface-alt px-3 py-1 text-xs font-semibold text-ink-muted">{section.list.length}</span>
            </div>

            <div className="grid gap-3">
              {loading ? (
                <div className="rounded-[22px] bg-surface-alt px-5 py-8 text-center text-sm text-ink-faint">Carregando eventos...</div>
              ) : section.list.length === 0 ? (
                <div className="rounded-[22px] bg-surface-alt px-5 py-8 text-center text-sm text-ink-faint">Nenhum evento.</div>
              ) : (
                section.list.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    report={reportByEvent.get(e.id)}
                    tone={section.tone}
                    canEdit={canDo("event.edit")}
                    onEdit={() => setModal({ type: "form", ev: e })}
                    onDelete={() => setModal({ type: "delete", ev: e })}
                  />
                ))
              )}
            </div>
          </section>
        )
      )}

      {modal?.type === "form" && (
        <EventFormModal
          ev={(modal as any).ev}
          toast={toast}
          close={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadData();
          }}
        />
      )}

      {modal?.type === "delete" && (
        <div
          className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}
        >
          <div className="bg-white rounded-xl w-full max-w-[420px] shadow-xl p-6">
            <div className="bg-danger-light text-danger text-sm px-4 py-3 rounded-[10px] border border-danger/10 mb-5">
              Remover <strong>{modal.ev.name}</strong>?
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="btn btn-secondary">
                Cancelar
              </button>
              <button onClick={() => deleteEvent(modal.ev)} className="btn btn-danger">
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

type EventTone = "coral" | "green" | "purple" | "amber";
type EventIconName = "calendar" | "chart" | "clock" | "repeat" | "spark" | "users";

function EventIcon({ name, size = 18, className }: { name: EventIconName; size?: number; className?: string }) {
  const props = {
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
  const icons: Record<EventIconName, React.ReactNode> = {
    calendar: <><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h17" /><path d="m8 15 4-5 3 3 5-7" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
    spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.8" /></>,
  };
  return <svg {...props}>{icons[name]}</svg>;
}

function toneClasses(tone: EventTone) {
  return {
    coral: "bg-[#FFF0EC] text-[#D94420]",
    green: "bg-[#EEF9F1] text-[#1F8044]",
    purple: "bg-[#F5F0FF] text-[#6D5DF0]",
    amber: "bg-[#FFF8ED] text-[#C07B1A]",
  }[tone];
}

function EventMetricPill({ label, value, tone = "coral" }: { label: string; value: number; tone?: EventTone }) {
  return (
    <div className={`rounded-2xl px-3 py-2 ${toneClasses(tone)}`}>
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] opacity-75">{label}</div>
    </div>
  );
}

function EventStat({
  value,
  label,
  description,
  icon,
  tone,
  loading,
}: {
  value: number;
  label: string;
  description: string;
  icon: EventIconName;
  tone: EventTone;
  loading?: boolean;
}) {
  return (
    <div className="rounded-[26px] border border-white/50 bg-white/70 backdrop-blur-md p-5 shadow-sm transition hover:bg-white/90">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[34px] font-bold leading-none tracking-[-0.055em] text-ink">{loading ? "..." : value}</div>
          <div className="mt-2 text-[13px] font-semibold leading-snug text-ink">{label}</div>
          <div className="mt-1 text-[12px] leading-snug text-ink-muted">{description}</div>
        </div>
        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[18px] ${toneClasses(tone)}`}>
          <EventIcon name={icon} size={21} />
        </div>
      </div>
    </div>
  );
}

function EventRow({
  event,
  report,
  tone,
  canEdit,
  onEdit,
  onDelete,
}: {
  event: Event;
  report?: EventReport;
  tone: EventTone;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group rounded-[22px] border border-white/60 bg-white/60 backdrop-blur-sm px-4 py-4 transition hover:bg-white shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Link href={`/eventos/${event.id}`} className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[18px] ${toneClasses(tone)}`}>
          <EventIcon name={event.type === "special" ? "spark" : "calendar"} size={21} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Link href={`/eventos/${event.id}`} className="break-words text-sm font-semibold text-ink transition hover:text-brand">
              {event.name}
            </Link>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${toneClasses(tone)}`}>
              {event.type === "recurring" ? "Recorrente" : "Especial"}
            </span>
            {event.base_time && <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[10px] font-bold text-ink-muted">{event.base_time}</span>}
            {report && <span className="rounded-full bg-[#EEF9F1] px-2.5 py-1 text-[10px] font-bold text-[#1F8044]">Pós-evento</span>}
          </div>
          {event.description && <p className="max-w-[760px] text-[13px] leading-5 text-ink-muted">{event.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ink-faint">
            {event.location && <span className="rounded-full bg-surface-alt px-2.5 py-1">Local: {event.location}</span>}
            <span className="rounded-full bg-surface-alt px-2.5 py-1">{getEventCategory(event.icon).label}</span>
            <span className="rounded-full bg-surface-alt px-2.5 py-1">{formatEventRecurrence(event)}</span>
            {event.instructions && <span className="rounded-full bg-surface-alt px-2.5 py-1">Instruções disponíveis</span>}
            {report && <span className="rounded-full bg-surface-alt px-2.5 py-1">{report.attendance_count} pessoas · {report.visitors_count} visitantes</span>}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-shrink-0 gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
            <button type="button" onClick={onEdit} className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-white text-ink-muted transition hover:bg-surface-alt hover:text-ink" aria-label={`Editar ${event.name}`}>
              <EventIcon name="chart" size={15} />
            </button>
            <button type="button" onClick={onDelete} className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-white text-danger transition hover:bg-danger-light" aria-label={`Remover ${event.name}`}>
              <span aria-hidden className="text-base leading-none">&times;</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
