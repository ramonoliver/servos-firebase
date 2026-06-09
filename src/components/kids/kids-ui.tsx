"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionDrawer, ConfirmDialog, EmptyState } from "@/components/ui";
import { useApp } from "@/hooks/use-app";
import { calculateAge, getKidsStatusLabel, recommendRoomsForAge } from "@/lib/kids/domain";
import type { KidsCheckInView, KidsChild, KidsRoom } from "@/lib/kids/types";
import type { User } from "@/types";

type KidsData = {
  children: KidsChild[];
  rooms: KidsRoom[];
  checkins: KidsCheckInView[];
  schemaReady: boolean;
};

type IconName = "baby" | "check" | "copy" | "door" | "edit" | "phone" | "plus" | "shield" | "spark" | "users" | "x";

export const defaultRooms = [
  { name: "Berçário", min_age: 0, max_age: 2, capacity: 10, description: "Bebês e crianças bem pequenas." },
  { name: "Maternal", min_age: 3, max_age: 4, capacity: 14, description: "Primeira infância com cuidado próximo." },
  { name: "Kids 1", min_age: 5, max_age: 7, capacity: 18, description: "Crianças em fase inicial escolar." },
  { name: "Kids 2", min_age: 8, max_age: 10, capacity: 20, description: "Crianças maiores com atividades dirigidas." },
  { name: "Pré-teens", min_age: 11, max_age: 12, capacity: 16, description: "Pré-adolescentes de 11 a 12 anos." },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const icons: Record<IconName, React.ReactNode> = {
    baby: <><path d="M9 12h.01M15 12h.01" /><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" /><path d="M9 16c1.4 1 4.6 1 6 0" /><path d="M10 4c.5-1.6 2.7-1.6 3.2-.1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></>,
    door: <><path d="M4 21h16" /><path d="M6 21V5a2 2 0 0 1 2-2h8v18" /><path d="M11 12h.01" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1A19.5 19.5 0 0 1 3.2 10 19.8 19.8 0 0 1 1.9 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.6-1.1a2 2 0 0 1 2.1-.5c.8.3 1.6.5 2.5.6A2 2 0 0 1 22 16.9Z" />,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
    spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.8" /></>,
    x: <><path d="M18 6 6 18M6 6l12 12" /></>,
  };
  return <svg {...props}>{icons[name]}</svg>;
}

async function postKids(body: Record<string, unknown>) {
  const response = await fetch("/api/kids/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "Erro ao salvar Kids.");
  return payload;
}

export function useKidsData(eventId?: string, eventDate = todayIso()) {
  const { toast } = useApp();
  const [data, setData] = useState<KidsData>({ children: [], rooms: [], checkins: [], schemaReady: true });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (eventId) params.set("eventId", eventId);
    params.set("eventDate", eventDate);
    try {
      const response = await fetch(`/api/kids/list?${params.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Erro ao carregar Kids.");
      setData(payload as KidsData);
    } catch (error) {
      console.error(error);
      toast(error instanceof Error ? error.message : "Erro ao carregar Kids.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [eventId, eventDate]);

  return { ...data, loading, reload: load };
}

export function KidsSummaryCards({ children, rooms, checkins, loading }: { children: KidsChild[]; rooms: KidsRoom[]; checkins: KidsCheckInView[]; loading?: boolean }) {
  const activeCheckins = checkins.filter((item) => item.status !== "checked_out");
  const items = [
    { label: "Crianças cadastradas", value: children.length, icon: "baby" as const, tone: "bg-[#FFF0EC] text-[#D94420]" },
    { label: "Check-ins hoje", value: checkins.length, icon: "check" as const, tone: "bg-[#EEF9F1] text-[#1F8044]" },
    { label: "Salas ativas", value: rooms.filter((room) => room.status === "active").length, icon: "door" as const, tone: "bg-[#F5F0FF] text-[#6D5DF0]" },
    { label: "Aguardando retirada", value: activeCheckins.length, icon: "shield" as const, tone: "bg-[#FFF8ED] text-[#C07B1A]" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-[24px] border border-white/70 bg-white/75 p-5 shadow-[0_16px_44px_-34px_rgba(27,23,38,0.28)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[34px] font-bold leading-none tracking-[-0.055em] text-ink">{loading ? "..." : item.value}</div>
              <div className="mt-2 text-[12px] font-semibold text-ink-muted">{item.label}</div>
            </div>
            <div className={`flex h-11 w-11 items-center justify-center rounded-[16px] ${item.tone}`}>
              <Icon name={item.icon} size={20} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function KidsChildrenList({ children, rooms, onCheckIn }: { children: KidsChild[]; rooms: KidsRoom[]; onCheckIn: (child: KidsChild) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [age, setAge] = useState("all");
  const [guardian, setGuardian] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return children.filter((child) => {
      const guardianText = child.guardians.map((item) => `${item.guardian.name} ${item.guardian.phone}`).join(" ").toLowerCase();
      const matchesTerm = !term || child.name.toLowerCase().includes(term) || guardianText.includes(term);
      const matchesGuardian = !guardian.trim() || guardianText.includes(guardian.trim().toLowerCase());
      const matchesAge = age === "all" || (age === "0-4" && (child.age || 0) <= 4) || (age === "5-8" && (child.age || 0) >= 5 && (child.age || 0) <= 8) || (age === "9-12" && (child.age || 0) >= 9);
      const matchesStatus = status === "all" || (status === "with-guardian" && child.guardians.length > 0) || (status === "attention" && child.guardians.length === 0);
      return matchesTerm && matchesGuardian && matchesAge && matchesStatus;
    });
  }, [age, children, guardian, search, status]);

  return (
    <section className="rounded-[28px] border border-white/60 bg-white/70 p-4 shadow-[0_18px_54px_-42px_rgba(27,23,38,0.26)] backdrop-blur md:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Cadastro</div>
          <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.025em] text-ink">Crianças cadastradas</h2>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1.5fr)_1fr_130px_150px] lg:min-w-[720px]">
          <input className="input-field" placeholder="Buscar por criança, responsável ou telefone" value={search} onChange={(event) => setSearch(event.target.value)} />
          <input className="input-field" placeholder="Responsável" value={guardian} onChange={(event) => setGuardian(event.target.value)} />
          <select className="input-field" value={age} onChange={(event) => setAge(event.target.value)}>
            <option value="all">Idade</option>
            <option value="0-4">0 a 4</option>
            <option value="5-8">5 a 8</option>
            <option value="9-12">9 a 12</option>
          </select>
          <select className="input-field" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Status</option>
            <option value="with-guardian">Com responsável</option>
            <option value="attention">Sem responsável</option>
          </select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon="+" title="Nenhuma criança cadastrada ainda" description="Cadastre as crianças da igreja e vincule seus responsáveis." />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((child) => <KidsChildCard key={child.id} child={child} rooms={rooms} onCheckIn={() => onCheckIn(child)} />)}
        </div>
      )}
    </section>
  );
}

function KidsChildCard({ child, rooms, onCheckIn }: { child: KidsChild; rooms: KidsRoom[]; onCheckIn: () => void }) {
  const recommended = recommendRoomsForAge(child.age, rooms)[0];
  const primary = child.guardians.find((item) => item.is_primary) || child.guardians[0];
  return (
    <article className="rounded-[22px] border border-border-soft bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[#FFF0EC] text-brand">
          <Icon name="baby" size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-ink">{child.name}</h3>
            <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[10px] font-bold text-ink-muted">{child.age ?? "-"} anos</span>
            <span className="rounded-full bg-[#EEF9F1] px-2.5 py-1 text-[10px] font-bold text-[#1F8044]">{primary ? "Seguro" : "Revisar"}</span>
          </div>
          <div className="mt-2 grid gap-2 text-[12px] text-ink-muted sm:grid-cols-2">
            <span>Nascimento: {child.birth_date || "Não informado"}</span>
            <span>Sexo: {child.gender === "feminino" ? "Feminino" : child.gender === "masculino" ? "Masculino" : "Não informado"}</span>
            <span>Sala frequente: {child.frequent_room_name || recommended?.name || "Sem histórico"}</span>
            <span className="sm:col-span-2">Responsaveis: {child.guardians.map((item) => `${item.guardian.name} (${item.relationship})`).join(", ") || "Não vinculado"}</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="phone" size={13} /> {child.primary_phone || "Sem telefone"}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" type="button">Ver perfil</button>
          <button className="btn btn-primary btn-sm" type="button" onClick={onCheckIn}>Check-in</button>
        </div>
      </div>
    </article>
  );
}

export function KidsRoomsManager({ open, onClose, rooms, checkins, onSaved }: { open: boolean; onClose: () => void; rooms: KidsRoom[]; checkins: KidsCheckInView[]; onSaved: () => void }) {
  const { toast } = useApp();
  const [editing, setEditing] = useState<Partial<KidsRoom> | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveRoom(room: Partial<KidsRoom>) {
    setSaving(true);
    try {
      await postKids({
        mode: "upsert_room",
        room: {
          id: room.id,
          name: room.name,
          min_age: Number(room.min_age || 0),
          max_age: Number(room.max_age || 12),
          capacity: Number(room.capacity || 0),
          description: room.description || "",
          status: room.status || "active",
          volunteer_ids: room.volunteer_ids || [],
        },
      });
      toast("Sala Kids salva.");
      setEditing(null);
      onSaved();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao salvar sala.");
    } finally {
      setSaving(false);
    }
  }

  async function seedRooms() {
    setSaving(true);
    try {
      for (const room of defaultRooms) {
        await postKids({ mode: "upsert_room", room: { ...room, status: "active", volunteer_ids: [] } });
      }
      toast("Salas padrao criadas.");
      onSaved();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao criar salas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionDrawer open={open} onClose={onClose} title="Salas do Kids" width={620}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">Gerencie faixa etaria, capacidade e status das salas.</p>
          <div className="flex gap-2">
            {rooms.length === 0 && <button className="btn btn-secondary btn-sm" onClick={seedRooms} disabled={saving}>Criar modelo</button>}
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({ name: "", min_age: 0, max_age: 12, capacity: 12, description: "", status: "active" })}>Nova sala</button>
          </div>
        </div>
        {editing && <RoomForm room={editing} saving={saving} onCancel={() => setEditing(null)} onSave={saveRoom} />}
        {rooms.length === 0 ? (
          <EmptyState icon="+" title="Nenhuma sala cadastrada" description="Cadastre as salas do Kids para organizar melhor o check-in." />
        ) : (
          <div className="grid gap-3">
            {rooms.map((room) => (
              <KidsRoomCard key={room.id} room={room} activeCount={checkins.filter((item) => item.room_id === room.id && item.status !== "checked_out").length} onEdit={() => setEditing(room)} />
            ))}
          </div>
        )}
      </div>
    </ActionDrawer>
  );
}

function RoomForm({ room, saving, onCancel, onSave }: { room: Partial<KidsRoom>; saving: boolean; onCancel: () => void; onSave: (room: Partial<KidsRoom>) => void }) {
  const [draft, setDraft] = useState(room);
  return (
    <div className="rounded-[22px] border border-brand/15 bg-brand-light/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="input-label">Nome da sala</span><input className="input-field" value={draft.name || ""} onChange={(event) => setDraft((p) => ({ ...p, name: event.target.value }))} /></label>
        <label><span className="input-label">Capacidade</span><input type="number" min={0} className="input-field" value={draft.capacity || 0} onChange={(event) => setDraft((p) => ({ ...p, capacity: Number(event.target.value) }))} /></label>
        <label><span className="input-label">Idade inicial</span><input type="number" min={0} max={12} className="input-field" value={draft.min_age || 0} onChange={(event) => setDraft((p) => ({ ...p, min_age: Number(event.target.value) }))} /></label>
        <label><span className="input-label">Idade final</span><input type="number" min={0} max={12} className="input-field" value={draft.max_age || 0} onChange={(event) => setDraft((p) => ({ ...p, max_age: Number(event.target.value) }))} /></label>
        <label className="sm:col-span-2"><span className="input-label">Descrição</span><textarea className="input-field min-h-[86px]" value={draft.description || ""} onChange={(event) => setDraft((p) => ({ ...p, description: event.target.value }))} /></label>
        <label><span className="input-label">Status</span><select className="input-field" value={draft.status || "active"} onChange={(event) => setDraft((p) => ({ ...p, status: event.target.value as KidsRoom["status"] }))}><option value="active">Ativa</option><option value="inactive">Inativa</option></select></label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary btn-sm" disabled={saving || !draft.name} onClick={() => onSave(draft)}>{saving ? "Salvando..." : "Salvar sala"}</button>
      </div>
    </div>
  );
}

function KidsRoomCard({ room, activeCount, onEdit }: { room: KidsRoom; activeCount: number; onEdit: () => void }) {
  const pct = room.capacity > 0 ? Math.min(100, Math.round((activeCount / room.capacity) * 100)) : 0;
  return (
    <article className="rounded-[22px] border border-border-soft bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-ink">{room.name}</h3>
            <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[10px] font-bold text-ink-muted">{room.min_age} a {room.max_age} anos</span>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${room.status === "active" ? "bg-[#EEF9F1] text-[#1F8044]" : "bg-surface-alt text-ink-faint"}`}>{room.status === "active" ? "Ativa" : "Inativa"}</span>
          </div>
          <p className="mt-2 text-sm text-ink-muted">{room.description || "Sem descrição."}</p>
          <div className="mt-3 h-2 rounded-full bg-surface-alt"><div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
          <div className="mt-1 text-[11px] font-semibold text-ink-faint">{activeCount} de {room.capacity} crianças na sala</div>
        </div>
        <button className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-white text-ink-muted hover:bg-surface-alt" onClick={onEdit} aria-label={`Editar ${room.name}`}><Icon name="edit" size={15} /></button>
      </div>
    </article>
  );
}

export function KidsCheckInDrawer({
  open,
  onClose,
  children,
  rooms,
  members = [],
  eventId,
  eventDate,
  selectedChild,
  initialMode = "existing",
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  children: KidsChild[];
  rooms: KidsRoom[];
  members?: User[];
  eventId?: string;
  eventDate?: string;
  selectedChild?: KidsChild | null;
  initialMode?: "existing" | "new";
  onDone: () => void;
}) {
  const { toast } = useApp();
  const [childId, setChildId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  // Responsável: vincular um membro já cadastrado (evita duplicar pessoas) ou
  // cadastrar um responsável novo.
  const [guardianMode, setGuardianMode] = useState<"existing" | "new">("existing");
  const [guardianId, setGuardianId] = useState("");
  const [guardian, setGuardian] = useState<GuardianDraft>({ name: "", phone: "", email: "", relationship: "Responsável", gender: "nao_informado" });
  // Segundo responsável (opcional). Oferecido após o primeiro ser preenchido.
  const [addSecond, setAddSecond] = useState(false);
  const [guardian2Mode, setGuardian2Mode] = useState<"existing" | "new">("existing");
  const [guardian2Id, setGuardian2Id] = useState("");
  const [guardian2, setGuardian2] = useState<GuardianDraft>({ name: "", phone: "", email: "", relationship: "Responsável", gender: "nao_informado" });
  const [child, setChild] = useState({ name: "", birth_date: "", gender: "feminino", notes: "" });
  const [success, setSuccess] = useState<{ code: string; childName: string; roomName: string; guardianName: string; phone: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const currentChild = children.find((item) => item.id === childId) || selectedChild || null;
  const age = currentChild?.age ?? calculateAge(child.birth_date);
  const recommended = recommendRoomsForAge(age, rooms);

  function resetForm() {
    setChildId("");
    setRoomId("");
    setChild({ name: "", birth_date: "", gender: "feminino", notes: "" });
    setGuardian({ name: "", phone: "", email: "", relationship: "Responsável", gender: "nao_informado" });
    setAddSecond(false);
    setGuardian2Id("");
    setGuardian2({ name: "", phone: "", email: "", relationship: "Responsável", gender: "nao_informado" });
  }

  useEffect(() => {
    if (!open) return;
    setSuccess(null);
    setMode(selectedChild ? "existing" : initialMode);
    setChildId(selectedChild?.id || "");
    setRoomId("");
    setGuardianMode(members.length ? "existing" : "new");
    setGuardianId("");
    setGuardian2Mode(members.length ? "existing" : "new");
    setAddSecond(false);
    setGuardian2Id("");
  }, [initialMode, open, selectedChild, members.length]);

  // Sugere o parentesco complementar do segundo responsável ao abri-lo.
  function openSecondGuardian() {
    setGuardian2((p) => ({ ...p, relationship: complementaryRelationship(guardian.relationship) }));
    setAddSecond(true);
  }

  // Um responsável é válido se for um membro selecionado OU tiver nome+telefone.
  function guardianFilled(gMode: "existing" | "new", id: string, g: GuardianDraft): boolean {
    return gMode === "existing" ? Boolean(id) : Boolean(g.name.trim() && g.phone.trim());
  }

  const primaryGuardianOk = guardianFilled(guardianMode, guardianId, guardian);
  const secondGuardianOk = !addSecond || guardianFilled(guardian2Mode, guardian2Id, guardian2);
  const newChildOk = Boolean(child.name.trim() && child.birth_date) && primaryGuardianOk && secondGuardianOk;
  const canSubmit = !saving && Boolean(eventId) && Boolean(roomId) && (mode === "existing" ? Boolean(childId) : newChildOk);

  // Monta os campos de um responsável novo para a API (membro existente → id).
  function guardianPayload(gMode: "existing" | "new", id: string, g: GuardianDraft) {
    if (gMode === "existing") return { guardianId: id || undefined, guardian: undefined };
    return { guardianId: undefined, guardian: g };
  }

  async function submit() {
    const selectedRoom = rooms.find((room) => room.id === roomId);
    if (!eventId) return toast("Selecione um evento para realizar check-in.");
    if (!roomId) return toast("Selecione uma sala.");
    if (mode === "new" && !primaryGuardianOk) return toast("Informe o responsável.");

    setSaving(true);
    try {
      const primary = currentChild?.guardians.find((item) => item.is_primary) || currentChild?.guardians[0];
      const g1 = mode === "new" ? guardianPayload(guardianMode, guardianId, guardian) : { guardianId: primary?.guardian.id, guardian: undefined };
      const g2 = mode === "new" && addSecond && secondGuardianOk ? guardianPayload(guardian2Mode, guardian2Id, guardian2) : { guardianId: undefined, guardian: undefined };

      const payload = await postKids({
        mode: "checkin",
        eventId,
        eventDate: eventDate || todayIso(),
        roomId,
        childId: mode === "existing" ? childId : undefined,
        guardianId: g1.guardianId,
        guardian: g1.guardian,
        guardianId2: g2.guardianId,
        guardian2: g2.guardian,
        child: mode === "new" ? { ...child, phone: "", relationship: guardian.relationship } : undefined,
        notes: mode === "new" ? child.notes : "",
      });

      // Confirma para a equipe se algum responsável novo recebeu convite.
      const invitedNew =
        mode === "new" &&
        ((guardianMode === "new" && isEmail(guardian.email)) ||
          (addSecond && guardian2Mode === "new" && isEmail(guardian2.email)));
      if (invitedNew) toast("Check-in feito. Convite enviado ao responsável por e-mail.");

      const existingGuardian = mode === "new" && guardianMode === "existing" ? members.find((m) => m.id === guardianId) : undefined;
      setSuccess({
        code: payload.code,
        childName: currentChild?.name || child.name,
        roomName: selectedRoom?.name || "Sala Kids",
        guardianName: primary?.guardian.name || existingGuardian?.name || guardian.name,
        phone: primary?.guardian.phone || existingGuardian?.phone || guardian.phone,
      });
      onDone();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao realizar check-in.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionDrawer open={open} onClose={onClose} title="Check-in Kids" width={620}>
      {success ? (
        <KidsCheckInSuccess success={success} onNew={() => { setSuccess(null); resetForm(); }} />
      ) : (
        <div className="space-y-5">
          <p className="text-sm leading-6 text-ink-muted">Selecione ou cadastre uma criança para direcioná-la à sala correta.</p>
          <div className="flex rounded-full border border-border-soft bg-surface-alt p-1">
            <button className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${mode === "existing" ? "bg-white text-ink shadow-sm" : "text-ink-muted"}`} onClick={() => setMode("existing")}>Criança cadastrada</button>
            <button className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${mode === "new" ? "bg-white text-ink shadow-sm" : "text-ink-muted"}`} onClick={() => setMode("new")}>Cadastrar nova</button>
          </div>
          {mode === "existing" ? (
            <label className="block"><span className="input-label">Buscar criança cadastrada</span><select className="input-field" value={childId} onChange={(event) => setChildId(event.target.value)}><option value="">Selecione</option>{children.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.guardians[0]?.guardian.name || "sem responsável"}</option>)}</select></label>
          ) : (
            <div className="space-y-4">
              <div className="rounded-[20px] bg-[#FFF8ED] p-4">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">Responsável obrigatório</div>
                <GuardianFields
                  members={members}
                  gMode={guardianMode}
                  setGMode={setGuardianMode}
                  guardianId={guardianId}
                  setGuardianId={setGuardianId}
                  guardian={guardian}
                  setGuardian={setGuardian}
                />
              </div>

              {addSecond ? (
                <div className="rounded-[20px] border border-border-soft bg-surface-alt/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">Segundo responsável</div>
                    <button type="button" className="text-xs font-semibold text-ink-muted hover:text-ink" onClick={() => setAddSecond(false)}>Remover</button>
                  </div>
                  <GuardianFields
                    members={members}
                    gMode={guardian2Mode}
                    setGMode={setGuardian2Mode}
                    guardianId={guardian2Id}
                    setGuardianId={setGuardian2Id}
                    guardian={guardian2}
                    setGuardian={setGuardian2}
                  />
                </div>
              ) : (
                primaryGuardianOk && (
                  <button type="button" onClick={openSecondGuardian} className="flex w-full items-center justify-center gap-1.5 rounded-[16px] border border-dashed border-border bg-white py-3 text-sm font-semibold text-brand-deep transition hover:bg-brand-light/30">
                    <Icon name="plus" size={15} /> Adicionar segundo responsável (ex.: {complementaryRelationship(guardian.relationship)})
                  </button>
                )
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <input className="input-field" placeholder="Nome da criança" value={child.name} onChange={(event) => setChild((p) => ({ ...p, name: event.target.value }))} />
                <input className="input-field" type="date" value={child.birth_date} onChange={(event) => setChild((p) => ({ ...p, birth_date: event.target.value }))} />
                <select className="input-field" value={child.gender} onChange={(event) => setChild((p) => ({ ...p, gender: event.target.value }))}>
                  <option value="feminino">Feminino</option>
                  <option value="masculino">Masculino</option>
                  <option value="nao_informado">Não informado</option>
                </select>
                <textarea className="input-field min-h-[86px] sm:col-span-2" placeholder="Observações importantes, restrições ou alergias" value={child.notes} onChange={(event) => setChild((p) => ({ ...p, notes: event.target.value }))} />
              </div>
            </div>
          )}
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">Selecionar sala</div>
            <div className="grid gap-2">
              {rooms.filter((room) => room.status === "active").map((room) => {
                const isRecommended = recommended.some((item) => item.id === room.id);
                return (
                  <button key={room.id} type="button" onClick={() => setRoomId(room.id)} className={`rounded-[18px] border p-4 text-left transition ${roomId === room.id ? "border-brand bg-brand-light/35" : "border-border-soft bg-white hover:bg-surface-alt"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div><div className="font-bold text-ink">{room.name}</div><div className="mt-1 text-xs text-ink-muted">{room.min_age} a {room.max_age} anos · capacidade {room.capacity}</div></div>
                      {isRecommended && <span className="rounded-full bg-[#EEF9F1] px-2.5 py-1 text-[10px] font-bold text-[#1F8044]">Recomendada</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <button className="btn btn-primary w-full" disabled={!canSubmit} onClick={submit}>
            {saving ? "Finalizando..." : "Concluir check-in"}
          </button>
        </div>
      )}
    </ActionDrawer>
  );
}

type GuardianDraft = { name: string; phone: string; email: string; relationship: string; gender: string };

const RELATIONSHIP_OPTIONS = ["Pai", "Mãe", "Responsável", "Avô/Avó", "Tio/Tia", "Outro"];

function complementaryRelationship(relationship: string): string {
  if (relationship === "Mãe") return "Pai";
  if (relationship === "Pai") return "Mãe";
  return "Responsável";
}

function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

/** Campos de um responsável: alterna entre membro já cadastrado e cadastro novo. */
function GuardianFields({
  members,
  gMode,
  setGMode,
  guardianId,
  setGuardianId,
  guardian,
  setGuardian,
}: {
  members: User[];
  gMode: "existing" | "new";
  setGMode: (m: "existing" | "new") => void;
  guardianId: string;
  setGuardianId: (id: string) => void;
  guardian: GuardianDraft;
  setGuardian: React.Dispatch<React.SetStateAction<GuardianDraft>>;
}) {
  const relationshipSelect = (
    <select className="input-field" value={guardian.relationship} onChange={(event) => setGuardian((p) => ({ ...p, relationship: event.target.value }))}>
      {RELATIONSHIP_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
  return (
    <>
      {members.length > 0 && (
        <div className="mb-3 flex rounded-full border border-border-soft bg-white p-1">
          <button type="button" className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold ${gMode === "existing" ? "bg-brand text-white" : "text-ink-muted"}`} onClick={() => setGMode("existing")}>Já cadastrado</button>
          <button type="button" className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold ${gMode === "new" ? "bg-brand text-white" : "text-ink-muted"}`} onClick={() => setGMode("new")}>Novo responsável</button>
        </div>
      )}
      {members.length > 0 && gMode === "existing" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <select className="input-field sm:col-span-2" value={guardianId} onChange={(event) => setGuardianId(event.target.value)}>
            <option value="">Selecione o responsável…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {relationshipSelect}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input-field" placeholder="Nome completo" value={guardian.name} onChange={(event) => setGuardian((p) => ({ ...p, name: event.target.value }))} />
          <input className="input-field" placeholder="Telefone" value={guardian.phone} onChange={(event) => setGuardian((p) => ({ ...p, phone: event.target.value }))} />
          <input className="input-field" placeholder="E-mail (envia convite de cadastro)" value={guardian.email} onChange={(event) => setGuardian((p) => ({ ...p, email: event.target.value }))} />
          {relationshipSelect}
        </div>
      )}
    </>
  );
}

function KidsCheckInSuccess({ success, onNew }: { success: { code: string; childName: string; roomName: string; guardianName: string; phone: string }; onNew: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-[26px] bg-[linear-gradient(135deg,#FFF0EC,#FFF8ED)] p-6 text-center">
        <div className="mx-auto flex h-13 w-13 items-center justify-center rounded-full bg-white text-brand shadow-sm"><Icon name="check" size={24} /></div>
        <h3 className="mt-4 text-xl font-bold text-ink">Check-in realizado com sucesso</h3>
        <div className="mx-auto mt-4 w-fit rounded-[22px] bg-white px-6 py-4 text-[36px] font-black tracking-[-0.04em] text-brand">{success.code}</div>
      </div>
      <div className="rounded-[22px] border border-border-soft bg-white p-4 text-sm text-ink-muted">
        <div><strong className="text-ink">Criança:</strong> {success.childName}</div>
        <div><strong className="text-ink">Sala:</strong> {success.roomName}</div>
        <div><strong className="text-ink">Responsável:</strong> {success.guardianName}</div>
        <div><strong className="text-ink">Telefone:</strong> {success.phone || "Não informado"}</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(success.code)}>Copiar código</button>
        <button className="btn btn-secondary">Imprimir etiqueta</button>
        <button className="btn btn-primary sm:col-span-2" onClick={onNew}>Novo check-in</button>
      </div>
    </div>
  );
}

export function KidsEventCheckInSection({ eventId, eventDate, eventName }: { eventId: string; eventDate: string; eventName?: string }) {
  const { user, toast } = useApp();
  const { children, rooms, checkins, schemaReady, loading, reload } = useKidsData(eventId, eventDate);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirm, setConfirm] = useState<KidsCheckInView | null>(null);
  const canCheckIn = user.role === "admin" || user.role === "leader";
  const grouped = rooms
    .map((room) => ({ room, items: checkins.filter((item) => item.room_id === room.id) }))
    .filter((group) => group.items.length > 0);

  async function updateStatus(mode: "call_guardian" | "checkout", checkin: KidsCheckInView) {
    try {
      await postKids({ mode, checkinId: checkin.id });
      toast(mode === "checkout" ? "Retirada confirmada." : "Responsável chamado.");
      setConfirm(null);
      await reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao atualizar check-in.");
    }
  }

  return (
    <section className="rounded-[28px] border border-border-soft bg-white p-6 shadow-[0_18px_50px_-38px_rgba(27,23,38,0.32)]">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Kids check-in</div>
          <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-ink">Crianças no culto</h2>
          <p className="mt-1 text-sm text-ink-muted">{eventName ? `Check-in para ${eventName}.` : "Acompanhe as crianças separadas por sala."}</p>
        </div>
        <button className="btn btn-primary btn-sm" disabled={!canCheckIn || !schemaReady} onClick={() => setDrawerOpen(true)}>Check-in Kids</button>
      </div>
      {!canCheckIn && <div className="mb-4 rounded-[18px] bg-[#FFF8ED] px-4 py-3 text-sm font-semibold text-[#A96A10]">Você não possui permissão para realizar check-in neste evento.</div>}
      {!schemaReady ? (
        <div className="rounded-[22px] bg-surface-alt px-5 py-8 text-center text-sm text-ink-faint">Execute a migration do modulo Kids para liberar salas e check-ins.</div>
      ) : loading ? (
        <div className="rounded-[22px] bg-surface-alt px-5 py-8 text-center text-sm text-ink-faint">Carregando Kids...</div>
      ) : grouped.length === 0 ? (
        <EmptyState icon="+" title="Nenhum check-in Kids realizado neste culto" description="As crianças aparecerão aqui assim que forem direcionadas para as salas." action={canCheckIn && <button className="btn btn-primary btn-sm" onClick={() => setDrawerOpen(true)}>Iniciar check-in</button>} />
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.room.id}>
              <div className="mb-2 flex items-center gap-2"><h3 className="font-bold text-ink">{group.room.name}</h3><span className="rounded-full bg-surface-alt px-2.5 py-1 text-[10px] font-bold text-ink-muted">{group.items.length}</span></div>
              <div className="grid gap-3 xl:grid-cols-2">
                {group.items.map((item) => <KidsCheckedChildCard key={item.id} checkin={item} onCall={() => updateStatus("call_guardian", item)} onCheckout={() => setConfirm(item)} />)}
              </div>
            </div>
          ))}
        </div>
      )}
      <KidsCheckInDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} children={children} rooms={rooms} eventId={eventId} eventDate={eventDate} onDone={reload} />
      {confirm && (
        <ConfirmDialog
          title="Confirmar retirada"
          message={`Confirmar retirada de <strong>${confirm.child?.name || "criança"}</strong>?<br/>Código: <strong>${confirm.code}</strong><br/>Responsável: ${confirm.guardian?.name || "não informado"}`}
          confirmLabel="Marcar como retirado"
          variant="success"
          onCancel={() => setConfirm(null)}
          onConfirm={() => updateStatus("checkout", confirm)}
        />
      )}
    </section>
  );
}

function KidsCheckedChildCard({ checkin, onCall, onCheckout }: { checkin: KidsCheckInView; onCall: () => void; onCheckout: () => void }) {
  const copied = () => navigator.clipboard?.writeText(checkin.code);
  return (
    <article className="rounded-[22px] border border-border-soft bg-surface-alt/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-ink">{checkin.child?.name || "Criança"}</h4>
            <KidsCodeBadge code={checkin.code} />
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-ink-muted">{getKidsStatusLabel(checkin.status)}</span>
          </div>
          <div className="mt-2 space-y-1 text-[12px] text-ink-muted">
            <div>{checkin.child?.age ?? "-"} anos · {checkin.room?.name || "Sala"}</div>
            <div>Responsável: {checkin.guardian?.name || checkin.child?.guardians?.[0]?.guardian.name || "Não informado"}</div>
            <div>Telefone: {checkin.guardian?.phone || checkin.child?.primary_phone || "Não informado"}</div>
            <div>Entrada: {new Date(checkin.checked_in_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-secondary btn-sm" onClick={copied}><Icon name="copy" size={14} /> Copiar código</button>
        <button className="btn btn-secondary btn-sm" onClick={onCall}>Chamar responsável</button>
        <button className="btn btn-primary btn-sm" disabled={checkin.status === "checked_out"} onClick={onCheckout}>Marcar como retirado</button>
      </div>
    </article>
  );
}

function KidsCodeBadge({ code }: { code: string }) {
  return <span className="rounded-full bg-brand px-3 py-1 text-[12px] font-black tracking-[-0.02em] text-white shadow-[0_10px_22px_-15px_rgba(244,83,42,0.9)]">{code}</span>;
}
