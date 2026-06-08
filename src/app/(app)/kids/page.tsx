"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageShell } from "@/components/ui";
import { KidsCheckInDrawer, KidsChildrenList, KidsRoomsManager, KidsSummaryCards, useKidsData } from "@/components/kids/kids-ui";
import { supabase } from "@/lib/firebase";
import { useApp } from "@/hooks/use-app";
import type { KidsChild } from "@/lib/kids/types";
import type { Event, User } from "@/types";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function KidsPage() {
  const { user, toast } = useApp();
  const [events, setEvents] = useState<Event[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [eventId, setEventId] = useState("");
  const [eventDate, setEventDate] = useState(todayIso());
  const { children, rooms, checkins, schemaReady, loading, reload } = useKidsData(eventId || undefined, eventDate);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [selectedChild, setSelectedChild] = useState<KidsChild | null>(null);
  const [initialCheckInMode, setInitialCheckInMode] = useState<"existing" | "new">("existing");
  const activeCheckins = useMemo(() => checkins.filter((item) => item.status !== "checked_out"), [checkins]);

  useEffect(() => {
    async function loadEvents() {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("church_id", user.church_id)
        .neq("active", false)
        .order("created_at", { ascending: false });
      if (error) {
        toast("Erro ao carregar eventos para check-in.");
        return;
      }
      const nextEvents = (data || []) as Event[];
      setEvents(nextEvents);
      setEventId((current) => current || nextEvents[0]?.id || "");
    }
    void loadEvents();
  }, [toast, user.church_id]);

  // Membros que podem ser responsáveis (pessoas ativas, não-crianças).
  useEffect(() => {
    async function loadMembers() {
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("church_id", user.church_id)
        .eq("active", true);
      setMembers(((data || []) as User[]).filter((m) => !m.is_child).sort((a, b) => a.name.localeCompare(b.name)));
    }
    void loadMembers();
  }, [user.church_id]);

  function openCheckin(child?: KidsChild, mode: "existing" | "new" = "existing") {
    setSelectedChild(child || null);
    setInitialCheckInMode(child ? "existing" : mode);
    setCheckinOpen(true);
  }

  return (
    <PageShell className="[font-family:'Inter','Plus_Jakarta_Sans',system-ui,sans-serif]">
      <PageHeader
        eyebrow="Seguranca infantil"
        title="Kids"
        subtitle="Gerencie criancas, responsaveis, salas e check-ins dos cultos."
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => openCheckin(undefined, "new")}>Nova crianca</button>
            <button className="btn btn-primary btn-sm" onClick={() => openCheckin()}>Check-in</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setRoomsOpen(true)}>Salas do Kids</button>
          </div>
        }
      />

      <section className="relative overflow-hidden rounded-[34px] border border-white bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF8ED_52%,#F5F0FF_100%)] p-6 shadow-[0_30px_90px_-58px_rgba(244,83,42,0.34)] md:p-8">
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Central operacional
            </div>
            <h1 className="max-w-[760px] text-[32px] font-bold leading-tight tracking-[-0.05em] text-ink md:text-[44px]">
              Check-in infantil com clareza, cuidado e codigo seguro para retirada.
            </h1>
            <p className="mt-3 max-w-[690px] text-[15px] leading-7 text-ink-muted">
              Organize criancas por sala, acompanhe responsaveis e mantenha a equipe Kids alinhada durante cultos com muitas familias.
            </p>
          </div>
          <div className="rounded-[26px] border border-white/80 bg-white/78 p-5 shadow-[0_18px_48px_-36px_rgba(27,23,38,0.35)] backdrop-blur">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Agora em sala</div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-[42px] font-bold leading-none tracking-[-0.055em] text-ink">{loading ? "..." : activeCheckins.length}</span>
              <span className="pb-1 text-sm font-medium text-ink-muted">criancas aguardando retirada</span>
            </div>
            <div className="mt-4 rounded-[18px] bg-[#FFF0EC] px-4 py-3 text-xs font-semibold leading-5 text-[#B33A21]">
              Codigo unico por culto, responsavel vinculado e historico de retirada preparado para auditoria.
            </div>
          </div>
        </div>
      </section>

      {!schemaReady && (
        <div className="rounded-[22px] border border-[#F4C58B] bg-[#FFF8ED] px-5 py-4 text-sm font-semibold text-[#9A6414]">
          Execute a migration `20260603100000_kids_module.sql` para ativar o modulo Kids no banco.
        </div>
      )}

      <section className="rounded-[24px] border border-white/70 bg-white/75 p-4 shadow-sm backdrop-blur">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_auto] md:items-end">
          <label>
            <span className="input-label">Culto/evento do check-in</span>
            <select className="input-field" value={eventId} onChange={(event) => setEventId(event.target.value)}>
              <option value="">Selecione um evento</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          </label>
          <label>
            <span className="input-label">Data</span>
            <input className="input-field" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={!eventId} onClick={() => openCheckin()}>Iniciar check-in</button>
        </div>
      </section>

      <KidsSummaryCards children={children} rooms={rooms} checkins={checkins} loading={loading} />
      <KidsChildrenList children={children} rooms={rooms} onCheckIn={openCheckin} />

      <KidsRoomsManager open={roomsOpen} onClose={() => setRoomsOpen(false)} rooms={rooms} checkins={checkins} onSaved={reload} />
      <KidsCheckInDrawer
        open={checkinOpen}
        onClose={() => setCheckinOpen(false)}
        children={children}
        rooms={rooms}
        members={members}
        selectedChild={selectedChild}
        initialMode={initialCheckInMode}
        eventId={eventId}
        eventDate={eventDate}
        onDone={reload}
      />
    </PageShell>
  );
}
