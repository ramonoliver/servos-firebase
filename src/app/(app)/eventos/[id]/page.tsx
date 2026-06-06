"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type React from "react";
import { useApp } from "@/hooks/use-app";
import { PageShell, PageHeader } from "@/components/ui";
import { EventFormModal } from "@/components/events/event-form-modal";
import { KidsEventCheckInSection } from "@/components/kids/kids-ui";
import { supabase } from "@/lib/firebase";
import { getEventCategory } from "@/lib/events/recurrence";
import type { Event, EventReport } from "@/types";

type ReportFormState = {
  attendance_count: number;
  volunteers_count: number;
  children_count: number;
  visitors_count: number;
  new_converts_count: number;
  reconciliations_count: number;
  prayer_requests_count: number;
  people_followed_count: number;
  notes: string;
};

type IconName = "arrow" | "calendar" | "chart" | "heart" | "message" | "people" | "spark" | "users";
type PrayerItem = { id: string; name: string; type: string; text: string };
type ChartRange = "mensal" | "bimestral" | "semestral" | "anual";

const emptyReport: ReportFormState = {
  attendance_count: 0,
  volunteers_count: 0,
  children_count: 0,
  visitors_count: 0,
  new_converts_count: 0,
  reconciliations_count: 0,
  prayer_requests_count: 0,
  people_followed_count: 0,
  notes: "",
};

const MOCK_PRAYER_EVENT_ID = "mock_culto_oracao_quarta";

const initialPrayerRequests: PrayerItem[] = [];

const mockScheduleMinistries = ["Louvor", "Recepção", "Kids", "Intercessão"];

function createMockPrayerEvent(churchId: string): Event {
  return {
    id: MOCK_PRAYER_EVENT_ID,
    church_id: churchId,
    name: "Culto de Oração",
    description: "Encontro semanal de oração, intercessão, ministração e cuidado comunitário.",
    type: "recurring",
    icon: "church",
    location: "Templo principal",
    base_time: "19:30",
    instructions: "Recepção 30 minutos antes. Separar equipe para acolhimento, intercessão e registro dos visitantes.",
    recurrence: "weekly:3",
    active: true,
    created_at: "2026-06-01T00:00:00.000Z",
  };
}

function createMockPrayerReports(churchId: string): EventReport[] {
  return [
    {
      id: "mock_report_oracao_2026_06_03",
      church_id: churchId,
      event_id: MOCK_PRAYER_EVENT_ID,
      event_date: "2026-06-03",
      attendance_count: 86,
      volunteers_count: 14,
      new_converts_count: 3,
      reconciliations_count: 5,
      prayer_requests_count: 18,
      people_followed_count: 22,
      visitors_count: 7,
      children_count: 12,
      notes: "Visitantes demonstraram interesse em células e acompanhamento pastoral. Encaminhar novos convertidos para contato ainda esta semana.",
      reported_by: null,
      created_at: "2026-06-03T22:00:00.000Z",
      updated_at: "2026-06-03T22:00:00.000Z",
    },
    {
      id: "mock_report_oracao_2026_05_27",
      church_id: churchId,
      event_id: MOCK_PRAYER_EVENT_ID,
      event_date: "2026-05-27",
      attendance_count: 74,
      volunteers_count: 12,
      new_converts_count: 1,
      reconciliations_count: 2,
      prayer_requests_count: 11,
      people_followed_count: 16,
      visitors_count: 5,
      children_count: 9,
      notes: "Noite com boa participação. Dois visitantes demonstraram interesse em célula.",
      reported_by: null,
      created_at: "2026-05-27T22:00:00.000Z",
      updated_at: "2026-05-27T22:00:00.000Z",
    },
  ];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getDateFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("date") || "";
}

function getSpecialEventDate(event: Event) {
  const recurrence = event.recurrence || "";
  return recurrence.startsWith("once:") ? recurrence.split(":")[1] || "" : "";
}

function isMissingEventReportsError(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error || "");
  return /event_reports|schema cache|does not exist/i.test(message);
}

function formatReportDate(date: string) {
  if (!date) return "Sem data";
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function EventoDetailPage({ params }: { params: { id: string } }) {
  const { user, toast, canDo } = useApp();
  const [event, setEvent] = useState<Event | null>(null);
  const [report, setReport] = useState<EventReport | null>(null);
  const [reports, setReports] = useState<EventReport[]>([]);
  const [eventDate, setEventDate] = useState(getDateFromUrl() || todayIso());
  const [form, setForm] = useState<ReportFormState>(emptyReport);
  const [prayerDrawerOpen, setPrayerDrawerOpen] = useState(false);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [prayerItems, setPrayerItems] = useState<PrayerItem[]>(initialPrayerRequests);
  const [chartRange, setChartRange] = useState<ChartRange>("semestral");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);

    if (params.id === MOCK_PRAYER_EVENT_ID) {
      const mockEvent = createMockPrayerEvent(user.church_id);
      const mockReports = createMockPrayerReports(user.church_id);
      const selectedDate = getDateFromUrl() || "2026-06-03";
      const nextReport = mockReports.find((item) => item.event_date === selectedDate) || null;
      setEvent(mockEvent);
      setReports(mockReports);
      setEventDate(selectedDate);
      setReport(nextReport);
      setForm(nextReport ? reportToForm(nextReport) : emptyReport);
      setLoading(false);
      return;
    }

    const [{ data: eventData, error: eventError }, { data: reportsData, error: reportsError }] = await Promise.all([
      supabase.from("events").select("*").eq("id", params.id).eq("church_id", user.church_id).maybeSingle(),
      supabase
        .from("event_reports")
        .select("*")
        .eq("event_id", params.id)
        .eq("church_id", user.church_id)
        .order("event_date", { ascending: false }),
    ]);

    if (eventError || (reportsError && !isMissingEventReportsError(reportsError))) {
      console.error("Erro ao carregar evento:", { eventError, reportsError });
      toast("Erro ao carregar evento.");
      setLoading(false);
      return;
    }

    const nextEvent = (eventData || null) as Event | null;
    const nextReports = reportsError ? [] : ((reportsData || []) as EventReport[]);
    const selectedDate = getDateFromUrl() || (nextEvent ? getSpecialEventDate(nextEvent) : "") || todayIso();
    const nextReport = nextReports.find((item) => item.event_date === selectedDate) || null;
    setEvent(nextEvent);
    setReports(nextReports);
    setEventDate(selectedDate);
    setReport(nextReport);
    setForm(nextReport ? reportToForm(nextReport) : emptyReport);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, [params.id, user.church_id]);

  async function saveReport() {
    if (!event) return;
    setSaving(true);

    if (event.id === MOCK_PRAYER_EVENT_ID) {
      const nextReport: EventReport = {
        id: report?.id || `mock_report_oracao_${eventDate.replaceAll("-", "_")}`,
        church_id: user.church_id,
        event_id: event.id,
        event_date: eventDate,
        ...form,
        reported_by: null,
        created_at: report?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setReport(nextReport);
      setReports((current) => [nextReport, ...current.filter((item) => item.event_date !== eventDate)]);
      toast("Relatório pastoral salvo no exemplo.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/events/reports/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, eventDate, data: form }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("Erro ao salvar relatório pastoral:", payload);
        toast(payload?.error || "Erro ao salvar relatório pastoral.");
        setSaving(false);
        return;
      }

      toast("Relatório pastoral salvo.");
      await loadData();
    } catch (error) {
      console.error("Erro ao salvar relatório pastoral:", error);
      toast("Erro ao salvar relatório pastoral.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <EventSkeleton />;
  }

  if (!event) {
    return <div className="py-20 text-center text-ink-faint">Evento não encontrado.</div>;
  }

  const category = getEventCategory(event.icon);
  const canManageEvent = canDo("event.edit") || user.cell_role === "pastor";
  const canEditSavedEvent = canManageEvent && event.id !== MOCK_PRAYER_EVENT_ID;

  return (
    <PageShell className="[font-family:'Inter','Plus_Jakarta_Sans',system-ui,sans-serif]">
      <PageHeader
        eyebrow="Agenda / Eventos / Culto de Oração"
        title=""
        backHref="/calendario"
        backLabel="Agenda"
        className="mb-[-10px]"
        actions={
          canEditSavedEvent ? (
            <button
              onClick={() => setEventFormOpen(true)}
              className="rounded-full border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface-alt hover:text-ink"
            >
              Editar evento
            </button>
          ) : null
        }
      />

      <section className="relative overflow-hidden rounded-[34px] border border-white bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF0EC_56%,#FAFAF8_100%)] p-6 shadow-[0_30px_90px_-58px_rgba(244,83,42,0.42)] md:p-8">
        <div className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-brand/12 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              {category.label}
            </div>
            <h1 className="max-w-[760px] text-[34px] font-bold leading-tight tracking-[-0.05em] text-ink md:text-[48px]">
              {event.name}
            </h1>
            <p className="mt-3 max-w-[720px] text-[15px] leading-7 text-ink-muted">
              {formatReportDate(eventDate)} · {event.location || "Local não definido"} · {event.base_time || "Sem horário"}
            </p>
          </div>
          <button
            onClick={() => setPrayerDrawerOpen(true)}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_-20px_rgba(244,83,42,0.95)] transition hover:bg-brand-dark"
          >
            <EventIcon name="message" size={17} />
            Pedidos de oração
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon="people" value={form.attendance_count} label="Pessoas" description="participaram do evento" tone="coral" />
        <KpiCard icon="users" value={form.volunteers_count} label="Servindo" description="voluntários ativos" tone="cell" />
        <KpiCard icon="spark" value={form.visitors_count} label="Visitantes" description="precisam de conexão" tone="visitor" />
        <KpiCard icon="heart" value={form.children_count} label="Crianças" description="participaram do evento" tone="care" />
      </div>

      <KidsEventCheckInSection eventId={event.id} eventDate={eventDate} eventName={event.name} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_410px]">
        <section className="space-y-5">
          <PremiumPanel eyebrow="Relatório" title="Registrar pós-evento">
            <div className="space-y-5">
              <FormBlock title="Participação">
                <NumberField label="Pessoas" value={form.attendance_count} onChange={(value) => setForm((current) => ({ ...current, attendance_count: value }))} />
                <NumberField label="Servindo" value={form.volunteers_count} onChange={(value) => setForm((current) => ({ ...current, volunteers_count: value }))} />
                <NumberField label="Crianças" value={form.children_count} onChange={(value) => setForm((current) => ({ ...current, children_count: value }))} />
                <NumberField label="Visitantes" value={form.visitors_count} onChange={(value) => setForm((current) => ({ ...current, visitors_count: value }))} />
              </FormBlock>
              <FormBlock title="Resultado espiritual">
                <NumberField label="Novos convertidos" value={form.new_converts_count} onChange={(value) => setForm((current) => ({ ...current, new_converts_count: value }))} />
                <NumberField label="Reconciliações" value={form.reconciliations_count} onChange={(value) => setForm((current) => ({ ...current, reconciliations_count: value }))} />
                <NumberField label="Pedidos de oração" value={form.prayer_requests_count} onChange={(value) => setForm((current) => ({ ...current, prayer_requests_count: value }))} />
                <NumberField label="Pessoas acompanhadas" value={form.people_followed_count} onChange={(value) => setForm((current) => ({ ...current, people_followed_count: value }))} />
              </FormBlock>
              <div>
                <label className="input-label">Observações pastorais</label>
                <textarea
                  className="input-field min-h-[118px]"
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Exemplo: visitantes demonstraram interesse em células e acompanhamento pastoral..."
                />
              </div>
              <button
                type="button"
                onClick={saveReport}
                disabled={saving || !canManageEvent}
                className="w-full rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_-18px_rgba(244,83,42,0.9)] transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar relatório pastoral"}
              </button>
            </div>
          </PremiumPanel>
        </section>

        <aside className="space-y-5">
          <PremiumPanel eyebrow="Contexto" title="Contexto do evento">
            <div className="space-y-4">
              <InfoBlock title="Descrição">{event.description || "Este evento ainda não possui descrição."}</InfoBlock>
              <InfoBlock title="Instruções operacionais">{event.instructions || "Sem instruções operacionais cadastradas."}</InfoBlock>
              <div>
                <SectionLabel title="Ministérios envolvidos" />
                <div className="flex flex-wrap gap-2">
                  {(event.id === MOCK_PRAYER_EVENT_ID ? mockScheduleMinistries : []).map((item) => (
                    <span key={item} className="rounded-full bg-surface-alt px-3 py-1.5 text-xs font-semibold text-ink-muted">{item}</span>
                  ))}
                  {event.id !== MOCK_PRAYER_EVENT_ID && (
                    <span className="rounded-full bg-surface-alt px-3 py-1.5 text-xs font-semibold text-ink-muted">Sem escalas vinculadas para esta data</span>
                  )}
                </div>
              </div>
            </div>
          </PremiumPanel>
        </aside>
      </div>

      <PremiumPanel eyebrow="Histórico" title="Histórico e evolução do evento">
        {reports.length === 0 ? (
          <div className="rounded-[22px] bg-surface-alt px-5 py-8 text-center text-sm text-ink-faint">
            Nenhum relatório pastoral registrado ainda.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-muted">Acompanhe presença, visitantes e resposta espiritual ao longo do tempo.</p>
              <div className="flex rounded-full border border-border-soft bg-white p-1">
                {(["mensal", "bimestral", "semestral", "anual"] as ChartRange[]).map((range) => (
                  <button
                    key={range}
                    onClick={() => setChartRange(range)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      chartRange === range ? "bg-brand text-white" : "text-ink-muted hover:bg-surface-alt hover:text-ink"
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <EventHistoryChart reports={reports} range={chartRange} />
            <div className="grid gap-3 xl:grid-cols-2">
              {reports.map((item, index) => (
                <HistoryRow key={item.id} item={item} previous={reports[index + 1]} active={item.event_date === eventDate} eventId={event.id} />
              ))}
            </div>
          </div>
        )}
      </PremiumPanel>

      {prayerDrawerOpen && (
        <PrayerDrawer
          close={() => setPrayerDrawerOpen(false)}
          items={prayerItems}
          setItems={setPrayerItems}
        />
      )}
      {eventFormOpen && (
        <EventFormModal
          ev={event}
          toast={toast}
          close={() => setEventFormOpen(false)}
          onSaved={async () => {
            setEventFormOpen(false);
            await loadData();
          }}
        />
      )}
    </PageShell>
  );
}

function reportToForm(report: EventReport): ReportFormState {
  return {
    attendance_count: report.attendance_count || 0,
    volunteers_count: report.volunteers_count || 0,
    children_count: report.children_count || 0,
    visitors_count: report.visitors_count || 0,
    new_converts_count: report.new_converts_count || 0,
    reconciliations_count: report.reconciliations_count || 0,
    prayer_requests_count: report.prayer_requests_count || 0,
    people_followed_count: report.people_followed_count || 0,
    notes: report.notes || "",
  };
}

function EventIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h17" /><path d="m8 15 4-5 3 3 5-7" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8Z" />,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" /><path d="M8 9h8M8 13h5" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>,
    spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.8" /></>,
  };
  return <svg {...props}>{paths[name]}</svg>;
}

type KpiTone = "coral" | "care" | "cell" | "visitor";

function kpiSurfaceClass(tone: KpiTone) {
  return {
    coral: "bg-[#FFF0EC] text-[#191919]",
    care: "bg-[#FFF8ED] text-[#191919]",
    cell: "bg-[#F5F0FF] text-[#191919]",
    visitor: "bg-[#EEF9F1] text-[#191919]",
  }[tone];
}

function kpiIconClass(tone: KpiTone) {
  return {
    coral: "bg-white/75 text-[#F4532A]",
    care: "bg-white/80 text-[#D99025]",
    cell: "bg-white/80 text-[#7B61FF]",
    visitor: "bg-white/80 text-[#33995B]",
  }[tone];
}

function KpiCard({
  icon,
  value,
  label,
  description,
  tone,
}: {
  icon: IconName;
  value: number | string;
  label: string;
  description: string;
  tone: KpiTone;
}) {
  return (
    <div
      className={`group flex items-center gap-4 rounded-[22px] border border-white/70 p-4 shadow-[0_8px_28px_-16px_rgba(25,25,25,0.18)] transition hover:shadow-[0_12px_36px_-16px_rgba(25,25,25,0.22)] ${kpiSurfaceClass(tone)}`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${kpiIconClass(tone)}`}>
        <EventIcon name={icon} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[26px] font-bold leading-none tracking-[-0.05em] text-[#191919]">{value}</div>
        <div className="mt-0.5 truncate text-[13px] font-semibold text-[#191919]">{label}</div>
        <div className="mt-0.5 truncate text-[11px] text-[#888888]">{description}</div>
      </div>
      <div className="shrink-0 text-[#CCCCCC] transition group-hover:text-[#191919]">
        <EventIcon name="arrow" size={14} />
      </div>
    </div>
  );
}

function PremiumPanel({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-border-soft bg-white p-6 shadow-[0_18px_50px_-38px_rgba(27,23,38,0.32)]">
      <div className="mb-5">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">{eyebrow}</div>
        <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SectionLabel({ title }: { title: string }) {
  return <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{title}</div>;
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] bg-surface-alt px-5 py-4">
      <SectionLabel title={title} />
      <p className="text-sm leading-6 text-ink-muted">{children}</p>
    </div>
  );
}

function FormBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel title={title} />
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-ink-muted">{label}</span>
      <input
        type="number"
        min={0}
        className="input-field text-base font-semibold"
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
      />
    </label>
  );
}

function HistoryRow({ item, previous, active, eventId }: { item: EventReport; previous?: EventReport; active: boolean; eventId: string }) {
  const visitorDiff = previous ? item.visitors_count - previous.visitors_count : 0;
  const attendanceDiff = previous ? Math.round(((item.attendance_count - previous.attendance_count) / Math.max(previous.attendance_count, 1)) * 100) : 0;
  const trend =
    previous && attendanceDiff !== 0
      ? attendanceDiff > 0
        ? `↑ presença aumentou ${attendanceDiff}%`
        : `↓ presença caiu ${Math.abs(attendanceDiff)}%`
      : previous
      ? visitorDiff >= 0
        ? `↑ +${visitorDiff} visitantes vs semana passada`
        : `↓ ${Math.abs(visitorDiff)} visitantes vs semana passada`
      : "Primeiro relatório do histórico";
  return (
    <Link
      href={`/eventos/${eventId}?date=${item.event_date}`}
      className={`block rounded-[24px] border p-4 transition hover:bg-surface-alt ${
        active ? "border-brand bg-brand-light/35" : "border-border-soft bg-white"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-base font-semibold tracking-[-0.02em] text-ink">{formatReportDate(item.event_date)}</div>
          <div className="mt-1 text-[12px] text-ink-faint">{item.volunteers_count} voluntários ativos · {item.children_count} crianças</div>
        </div>
        <div className="inline-flex w-fit rounded-full bg-surface-alt px-3 py-1.5 text-xs font-semibold text-ink-muted">
          {trend}
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <span className="rounded-2xl bg-[#FFF0EC] px-3 py-2 font-semibold text-[#D94420]">{item.attendance_count} pessoas</span>
        <span className="rounded-2xl bg-[#EEF9F1] px-3 py-2 font-semibold text-[#1F8044]">{item.visitors_count} visitantes</span>
        <span className="rounded-2xl bg-[#FFF8ED] px-3 py-2 font-semibold text-[#C07B1A]">{item.new_converts_count} convertidos</span>
        <span className="rounded-2xl bg-[#F5F0FF] px-3 py-2 font-semibold text-[#6D5DF0]">{item.prayer_requests_count} pedidos</span>
      </div>
      {item.notes && <div className="mt-4 rounded-[18px] bg-surface-alt px-4 py-3 text-[12px] leading-5 text-ink-faint">{item.notes}</div>}
    </Link>
  );
}

function EventHistoryChart({ reports, range }: { reports: EventReport[]; range: ChartRange }) {
  const limits: Record<ChartRange, number> = { mensal: 4, bimestral: 8, semestral: 24, anual: 52 };
  const items = [...reports].reverse().slice(-limits[range]);
  const max = Math.max(...items.map((item) => item.attendance_count), 1);

  return (
    <div className="rounded-[24px] border border-border-soft bg-surface-alt/60 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">Evolução de presença</div>
          <div className="text-xs text-ink-faint">Visitantes e presença por ocorrência</div>
        </div>
        <EventIcon name="chart" size={20} />
      </div>
      <div className="flex h-44 items-end gap-3">
        {items.map((item) => (
          <div key={item.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-32 w-full items-end justify-center rounded-2xl bg-white px-2 pb-2">
              <div
                className="w-full rounded-t-xl bg-[linear-gradient(135deg,#FF6B57,#FF4D79)]"
                style={{ height: `${Math.max(8, (item.attendance_count / max) * 100)}%` }}
                title={`${item.attendance_count} pessoas`}
              />
            </div>
            <div className="w-full truncate text-center text-[10px] font-semibold text-ink-faint">
              {new Date(`${item.event_date}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrayerDrawer({
  close,
  items,
  setItems,
}: {
  close: () => void;
  items: PrayerItem[];
  setItems: React.Dispatch<React.SetStateAction<PrayerItem[]>>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("Pedido de oração");
  const [text, setText] = useState("");
  const groupedItems = ["Pedido de oração", "Agradecimento", "Outro"]
    .map((label) => ({ label, items: items.filter((item) => item.type === label) }))
    .filter((group) => group.items.length > 0);

  function formatGroupedItems() {
    if (!groupedItems.length) return "Nenhum pedido cadastrado.";

    return groupedItems
      .map((group) => {
        const requests = group.items.map((item, index) => `${index + 1}. ${item.name}: ${item.text}`).join("\n");
        return `*${group.label}*\n${requests}`;
      })
      .join("\n\n");
  }

  function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => {
      const chars: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };
      return chars[char];
    });
  }

  function addItem() {
    if (!name.trim() || !text.trim()) return;
    setItems((current) => [
      { id: `prayer_${Date.now()}`, name: name.trim(), type, text: text.trim() },
      ...current,
    ]);
    setName("");
    setText("");
  }

  function printItems() {
    const printWindow = window.open("", "_blank", "width=760,height=900");
    if (!printWindow) return;

    const groupedContent = groupedItems
      .map(
        (group) => `
          <section>
            <h2>${escapeHtml(group.label)}</h2>
            ${group.items
              .map(
                (item) => `
                  <article>
                    <strong>${escapeHtml(item.name)}</strong>
                    <p>${escapeHtml(item.text)}</p>
                  </article>
                `,
              )
              .join("")}
          </section>
        `,
      )
      .join("");

    printWindow.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Pedidos de oração</title>
          <style>
            body { color: #1C1B2A; font-family: Inter, Arial, sans-serif; margin: 40px; }
            h1 { font-size: 24px; margin: 0 0 24px; }
            h2 { border-bottom: 1px solid #ECEAF4; color: #FF4D3D; font-size: 14px; letter-spacing: .08em; margin: 28px 0 12px; padding-bottom: 8px; text-transform: uppercase; }
            article { border: 1px solid #ECEAF4; border-radius: 14px; margin: 10px 0; padding: 14px 16px; }
            strong { display: block; font-size: 14px; margin-bottom: 6px; }
            p { color: #5F5B73; font-size: 14px; line-height: 1.55; margin: 0; }
          </style>
        </head>
        <body>
          <h1>Pedidos de oração</h1>
          ${groupedContent || "<p>Nenhum pedido cadastrado.</p>"}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  const whatsAppText = encodeURIComponent(formatGroupedItems());

  return (
    <div
      className="fixed inset-0 z-[100] !mt-0 bg-ink/35 backdrop-blur-sm"
      onClick={(event) => event.target === event.currentTarget && close()}
    >
      <aside className="ml-auto flex h-full w-full max-w-[430px] flex-col bg-white shadow-[0_24px_80px_-30px_rgba(27,23,38,0.5)]">
        <div className="flex items-center justify-between border-b border-border-soft px-6 py-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Evento</div>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-ink">Pedidos de oração</h2>
          </div>
          <button
            onClick={close}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-alt text-ink-muted transition hover:bg-border hover:text-ink"
            aria-label="Fechar"
          >
            &times;
          </button>
        </div>
        <div className="border-b border-border-soft px-6 py-5">
          <div className="grid gap-3">
            <input className="input-field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome" />
            <select className="input-field" value={type} onChange={(event) => setType(event.target.value)}>
              <option>Pedido de oração</option>
              <option>Agradecimento</option>
              <option>Outro</option>
            </select>
            <textarea className="input-field min-h-[86px]" value={text} onChange={(event) => setText(event.target.value)} placeholder="Pedido, agradecimento ou observação..." />
            <div className="grid gap-2">
              <button onClick={addItem} className="rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark">
                Cadastrar
              </button>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://wa.me/?text=${whatsAppText}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-border-soft bg-white px-4 py-2 text-center text-sm font-semibold text-ink-muted transition hover:bg-surface-alt hover:text-ink"
                >
                  Enviar lista
                </a>
                <button onClick={printItems} className="rounded-full border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface-alt hover:text-ink">
                  Imprimir lista
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {groupedItems.map((group) => (
            <section key={group.label} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">{group.label}</div>
                <div className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-semibold text-ink-muted">{group.items.length}</div>
              </div>
              {group.items.map((request) => (
                <div key={request.id} className="rounded-[22px] border border-border-soft bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-ink">{request.name}</div>
                      <div className="mt-1 inline-flex rounded-full bg-[#FFF8ED] px-2.5 py-1 text-[10px] font-bold text-[#C07B1A]">
                        {request.type}
                      </div>
                    </div>
                    <EventIcon name="message" size={18} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-ink-muted">{request.text}</p>
                </div>
              ))}
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}

function EventSkeleton() {
  return (
    <PageShell>
      <div className="h-[260px] animate-pulse rounded-[34px] bg-surface-alt" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-[26px] bg-surface-alt" />
        ))}
      </div>
    </PageShell>
  );
}
