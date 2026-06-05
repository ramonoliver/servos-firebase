"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ActionDrawer } from "@/components/ui/action-drawer";
import { Avatar, EmptyState } from "@/components/ui";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import {
  CareCaseCard,
  PersonMini,
  PersonTagList,
  PrayerCard,
  SoftCard,
  TabBar,
  TimelineList,
} from "@/components/pastoral/pastoral-ui";
import {
  getCell,
  getPerson,
  getPersonCareCases,
  getPersonMinistries,
  getPersonPrayerRequests,
  getPersonRelationships,
  getPersonTimeline,
} from "@/lib/pastoral/selectors";
import { pastoralCells, pastoralMinistries } from "@/lib/pastoral/mock-data";
import type { CareCase, PastoralPerson, PersonKind, TimelineEvent, PersonGender, MaritalStatus } from "@/lib/pastoral/types";

const tabs = ["Timeline", "Acompanhamentos", "Pedidos de Oração", "Escalas", "Observações"];

const kindOptions: { value: PersonKind; label: string }[] = [
  { value: "member", label: "Membro" },
  { value: "visitor", label: "Visitante" },
  { value: "leader", label: "Líder" },
  { value: "volunteer", label: "Voluntário" },
  { value: "pastor", label: "Pastor" },
];

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatDateMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDateMask(masked: string): string {
  const parts = masked.split("/");
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return "";
  return `${yyyy}-${mm}-${dd}`;
}

function toDateMask(iso: string): string {
  if (!iso || iso.length !== 10) return iso;
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function BackIcon() {
  return (
    <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.79 11a19.79 19.79 0 01-3.07-8.67A2 2 0 012.7 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.69a16 16 0 006.29 6.29l1.06-1.06a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export default function PessoaPerfilPage({ params }: { params: { id: string } }) {
  const { user, toast, departments } = useApp();
  const [person, setPerson] = useState<PastoralPerson | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [careOpen, setCareOpen] = useState(false);
  const [dbCells, setDbCells] = useState<any[]>([]);
  const [dbCell, setDbCell] = useState<any>(null);

  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    birthDate: "",
    kind: "member" as PersonKind,
    cellId: "",
    instagram: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    roleTitle: "",
    notes: "",
  });
  const [editBirthDateMask, setEditBirthDateMask] = useState("");
  const [editCepLoading, setEditCepLoading] = useState(false);
  const [contactForm, setContactForm] = useState({ title: "Contato registrado", description: "" });
  const [careForm, setCareForm] = useState({ title: "", reason: "", priority: "medium" as CareCase["priority"], nextStep: "" });
  const [timelineItems, setTimelineItems] = useState<TimelineEvent[]>([]);
  const [careItems, setCareItems] = useState<CareCase[]>([]);

  async function loadPerson() {
    try {
      setLoading(true);
      const [
        { data: uData, error: uError },
        { data: notesData, error: notesError },
        cellsResponse,
      ] = await Promise.all([
        supabase.from("users").select("*").eq("id", params.id).maybeSingle(),
        supabase.from("pastoral_notes").select("*").eq("person_id", params.id).order("date", { ascending: false }),
        fetch("/api/cells/list", { method: "POST", credentials: "include" }).catch(() => null),
      ]);

      if (uError) throw uError;
      if (notesError) throw notesError;

      const cellsPayload = cellsResponse ? await cellsResponse.json().catch(() => null) : null;
      const loadedCells = (cellsPayload?.cells || []) as any[];
      setDbCells(loadedCells);

      if (!uData) {
        setPerson(null);
        setLoading(false);
        return;
      }

      // Map User to PastoralPerson
      const kinds: PersonKind[] = [];
      if (uData.role === "admin") kinds.push("member", "volunteer", "leader");
      else if (uData.role === "leader") kinds.push("member", "volunteer", "leader");
      else kinds.push("member");

      if (uData.cell_role === "lider" || uData.cell_role === "lider_em_treinamento") {
        kinds.push("leader");
      }
      if (uData.cell_role === "pastor") {
        kinds.push("pastor");
      }

      const p: PastoralPerson = {
        id: uData.id,
        fullName: uData.name || "",
        avatarColor: uData.avatar_color || "#F4532A",
        photoUrl: uData.photo_url || null,
        phone: uData.phone || "",
        email: uData.email || "",
        birthDate: uData.birth_date || "",
        gender: (uData.gender || "nao_informado") as PersonGender,
        maritalStatus: (uData.marital_status || "nao_informado") as MaritalStatus,
        address: uData.address || "",
        instagram: uData.instagram || "",
        arrivalDate: uData.joined_at || uData.created_at || "",
        kinds,
        baptized: uData.baptized || false,
        inDiscipleship: uData.in_discipleship || false,
        participatesInCell: !!uData.cell_id,
        cellId: uData.cell_id || null,
        ministryIds: uData.ministry_ids || [],
        roleTitle: uData.role === "admin" ? "Administrador" : uData.role === "leader" ? "Líder" : "Membro",
        tagIds: uData.tag_ids || [],
        notes: uData.notes || "",
        lastContactAt: uData.last_served_at || null,
      };

      setPerson(p);

      // Set Cell
      if (p.cellId) {
        const found = loadedCells.find((c) => c.id === p.cellId);
        setDbCell(found || null);
      } else {
        setDbCell(null);
      }

      // Map notesData to timeline and care items
      const tItems: TimelineEvent[] = (notesData || [])
        .filter((n: any) => n.type !== "care_case")
        .map((n: any) => ({
          id: n.id,
          personId: n.person_id,
          type: (n.type || "care_done") as any,
          title: n.title,
          description: n.description,
          date: n.date,
          tone: n.type === "alert" ? "danger" : "success",
        }));

      const cItems: CareCase[] = (notesData || [])
        .filter((n: any) => n.type === "care_case")
        .map((n: any) => {
          const parts = n.description.split("\n\nPróximo passo: ");
          return {
            id: n.id,
            personId: n.person_id,
            responsibleId: n.author_id || "",
            title: n.title,
            reason: parts[0] || "",
            status: "open" as const,
            priority: "medium" as const,
            openedAt: n.date.slice(0, 10),
            nextStep: parts[1] || "",
            notes: [],
          };
        });

      setTimelineItems(tItems);
      setCareItems(cItems);

      // Populate edit form
      setEditForm({
        fullName: p.fullName,
        phone: p.phone,
        email: p.email,
        birthDate: p.birthDate,
        kind: (p.kinds[0] || "member") as PersonKind,
        cellId: p.cellId || "",
        instagram: p.instagram,
        cep: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        roleTitle: p.roleTitle,
        notes: p.notes,
      });
      setEditBirthDateMask(toDateMask(p.birthDate));
    } catch (err) {
      console.error("Erro ao carregar perfil da pessoa:", err);
      toast("Erro ao carregar perfil.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPerson();
  }, [params.id]);

  if (loading) {
    return (
      <div className="page-shell">
        <div className="py-20 text-center text-ink-faint">Carregando perfil...</div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="page-shell">
        <EmptyState
          icon="♡"
          title="Pessoa não encontrada"
          description="Esse perfil ainda não existe no banco de dados."
          action={<Link href="/pessoas" className="btn btn-secondary btn-sm">Voltar para pessoas</Link>}
        />
      </div>
    );
  }

  const cell = dbCell;
  const ministries = (person.ministryIds || []).map(id => departments.find(d => d.id === id)).filter(Boolean);
  const prayers = [];
  const relationships = [];
  const canEdit = user.role === "admin" || user.role === "leader";

  async function handleEditCepBlur() {
    const digits = editForm.cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setEditCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) return;
      const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) return;
      setEditForm((f) => ({
        ...f,
        street: data.logradouro || f.street,
        neighborhood: data.bairro || f.neighborhood,
        city: data.localidade || f.city,
        state: data.uf || f.state,
      }));
    } catch {
      // silently ignore
    } finally {
      setEditCepLoading(false);
    }
  }

  async function saveProfile() {
    if (!person) return;
    try {
      setLoading(true);
      const { kind, cellId, cep, street, number, complement, neighborhood, city, state, fullName, phone, email, instagram, notes } = editForm;
      const addressParts = [street, number, complement, neighborhood, city, state, cep].filter(Boolean);
      const address = addressParts.length > 0 ? addressParts.join(", ") : person.address;

      const { error } = await supabase
        .from("users")
        .update({
          name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          instagram: instagram.trim(),
          address,
          notes: notes.trim(),
          cell_id: cellId || null,
          birth_date: editForm.birthDate || null,
        })
        .eq("id", person.id);

      if (error) throw error;

      toast("Alterações salvas com sucesso!");
      setEditOpen(false);
      await loadPerson();
    } catch (err) {
      console.error("Erro ao salvar perfil:", err);
      toast("Erro ao salvar perfil.");
    } finally {
      setLoading(false);
    }
  }

  async function registerContact() {
    if (!contactForm.description.trim()) return;
    try {
      setLoading(true);
      const res = await fetch("/api/care/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          personId: person.id,
          data: {
            type: "care_done",
            title: contactForm.title || "Contato registrado",
            description: contactForm.description,
            date: new Date().toISOString(),
          },
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Erro ao registrar contato.");
        setLoading(false);
        return;
      }

      toast("Contato registrado com sucesso!");
      setContactForm({ title: "Contato registrado", description: "" });
      setContactOpen(false);
      await loadPerson();
    } catch (err) {
      console.error("Erro ao registrar contato:", err);
      toast("Erro ao registrar contato.");
      setLoading(false);
    }
  }

  async function createCareCase() {
    if (!careForm.title.trim()) return;
    try {
      setLoading(true);
      const res = await fetch("/api/care/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          personId: person.id,
          data: {
            type: "care_case",
            title: careForm.title,
            description: `${careForm.reason}\n\nPróximo passo: ${careForm.nextStep}`,
            date: new Date().toISOString(),
          },
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Erro ao registrar acompanhamento.");
        setLoading(false);
        return;
      }

      toast("Acompanhamento registrado com sucesso!");
      setCareForm({ title: "", reason: "", priority: "medium", nextStep: "" });
      setCareOpen(false);
      await loadPerson();
    } catch (err) {
      console.error("Erro ao registrar acompanhamento:", err);
      toast("Erro ao registrar acompanhamento.");
      setLoading(false);
    }
  }

  return (
    <div className="page-shell">
      {/* Back navigation */}
      <div>
        <Link
          href="/pessoas"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <BackIcon />
          Pessoas
        </Link>
      </div>

      {/* Profile hero card */}
      <SoftCard className="overflow-hidden">
        {/* Identity + actions */}
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar
              name={person.fullName}
              color={person.avatarColor}
              photoUrl={person.photoUrl}
              size={72}
              className="flex-shrink-0 ring-2 ring-border-soft"
            />
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[.12em] text-brand">Pessoas & Cuidado</div>
              <h1 className="font-display text-[22px] font-bold leading-tight text-ink sm:text-[24px]">
                {person.fullName}
              </h1>
              <p className="mt-0.5 text-sm text-ink-muted">{person.roleTitle}</p>
              <div className="mt-2">
                <PersonTagList tagIds={person.tagIds} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button className="btn btn-secondary btn-sm" onClick={() => setEditOpen(true)}>
                Editar dados
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setContactOpen(true)}>
              Registrar contato
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setCareOpen(true)}>
              + Acompanhamento
            </button>
          </div>
        </div>
      </SoftCard>

      {/* Two-column layout */}
      <div className="grid gap-5 lg:grid-cols-[272px_1fr]">

        {/* Left sidebar — static info */}
        <div className="space-y-4">

          {/* Contact info */}
          <SoftCard className="p-4">
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[.12em] text-ink-faint">Contato</h3>
            <div className="space-y-2.5">
              <ContactRow icon={<PhoneIcon />} value={person.phone} />
              <ContactRow icon={<MailIcon />} value={person.email} />
              {person.instagram && <ContactRow icon={<InstagramIcon />} value={person.instagram} />}
              {person.address && <ContactRow icon={<MapPinIcon />} value={person.address} />}
              {person.arrivalDate && (
                <ContactRow icon={<CalendarIcon />} value={`Chegou em ${person.arrivalDate}`} />
              )}
            </div>
          </SoftCard>

          {/* Church life */}
          <SoftCard className="p-4">
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[.12em] text-ink-faint">Vida na Igreja</h3>
            <div className="space-y-2">
              <InfoChip label="Batizado" active={person.baptized} trueLabel="Sim" falseLabel="Não" />
              <InfoChip
                label="Discipulado"
                active={person.inDiscipleship}
                trueLabel="Em andamento"
                falseLabel="Não iniciado"
              />
            </div>

            {/* Cell */}
            <div className="mt-4 border-t border-border-soft pt-4">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-ink-faint">Célula</h3>
              {cell ? (
                <Link
                  href={`/celulas/${cell.id}`}
                  className="group -mx-2 flex items-center gap-2.5 rounded-[10px] p-2 transition-colors hover:bg-surface-alt"
                >
                  <div
                    className="h-9 w-9 flex-shrink-0 rounded-lg border border-white/40"
                    style={{ background: cell.coverColor }}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-ink transition-colors group-hover:text-brand">
                      {cell.name}
                    </div>
                    <div className="text-[11px] text-ink-faint">
                      {cell.weekDay} · {cell.time}
                    </div>
                  </div>
                </Link>
              ) : (
                <p className="text-[12px] text-ink-faint">Sem célula vinculada</p>
              )}
            </div>
          </SoftCard>

          {/* Ministries */}
          {ministries.length > 0 && (
            <SoftCard className="p-4">
              <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[.12em] text-ink-faint">Ministérios</h3>
              <div className="space-y-1.5">
                {ministries.map((m) => m && (
                  <div
                    key={m.id}
                    className="rounded-[10px] bg-surface-alt px-3 py-2 text-[13px] font-medium text-ink"
                  >
                    {m.name}
                  </div>
                ))}
              </div>
            </SoftCard>
          )}

          {/* Relationships */}
          {relationships.length > 0 && (
            <SoftCard className="p-4">
              <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[.12em] text-ink-faint">Relacionamentos</h3>
              <div className="space-y-3">
                {relationships.map((rel) => rel.person && (
                  <PersonMini
                    key={`${rel.type}-${rel.relatedPersonId}`}
                    person={rel.person}
                    subtitle={rel.label}
                    href={`/pessoas/${rel.person.id}`}
                  />
                ))}
              </div>
            </SoftCard>
          )}
        </div>

        {/* Right — tabbed dynamic content */}
        <div className="min-w-0 space-y-4">
          <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

          {activeTab === "Timeline" && (
            <TimelineList events={timelineItems} />
          )}

          {activeTab === "Acompanhamentos" && (
            <div className="space-y-3">
              {careItems.map((item) => <CareCaseCard key={item.id} care={item} />)}
              {!careItems.length && (
                <EmptyState
                  icon="♡"
                  title="Sem acompanhamentos"
                  description="Nenhum acompanhamento pastoral aberto para esta pessoa."
                />
              )}
            </div>
          )}

          {activeTab === "Pedidos de Oração" && (
            <div className="space-y-3">
              {prayers.map((request) => <PrayerCard key={request.id} request={request} />)}
              {!prayers.length && (
                <EmptyState
                  icon="🙏"
                  title="Sem pedidos de oração"
                  description="Pedidos vinculados a esta pessoa aparecem aqui."
                />
              )}
            </div>
          )}

          {activeTab === "Escalas" && (
            <EmptyState
              icon="▣"
              title="Escalas integradas em breve"
              description="As confirmações e ausências de escala serão exibidas neste histórico pastoral."
            />
          )}

          {activeTab === "Observações" && (
            <SoftCard className="p-5">
              <h3 className="card-title mb-3">Observações pastorais</h3>
              {person.notes ? (
                <p className="text-sm leading-relaxed text-ink-muted">{person.notes}</p>
              ) : (
                <EmptyState
                  icon="✎"
                  title="Sem observações"
                  description="Adicione notas pastorais editando o perfil desta pessoa."
                />
              )}
            </SoftCard>
          )}
        </div>
      </div>

      {/* Edit drawer */}
      <ActionDrawer open={editOpen} onClose={() => setEditOpen(false)} title="Editar pessoa" width={480}>
        <div className="space-y-6">

          {/* Identificação */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">Identificação</p>
            <div className="space-y-3">
              <div>
                <label className="input-label">Nome completo</label>
                <input className="input-field" value={editForm.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="input-label">Telefone</label>
                  <input
                    className="input-field"
                    placeholder="(00) 00000-0000"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="input-label">Data de nascimento</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input-field"
                    placeholder="dd/mm/aaaa"
                    maxLength={10}
                    value={editBirthDateMask}
                    onChange={(e) => {
                      const masked = formatDateMask(e.target.value);
                      setEditBirthDateMask(masked);
                      setEditForm((f) => ({ ...f, birthDate: parseDateMask(masked) }));
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="input-label">Email</label>
                <input type="email" className="input-field" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="input-label">Instagram</label>
                <input className="input-field" value={editForm.instagram} onChange={(e) => setEditForm((f) => ({ ...f, instagram: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Perfil */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">Perfil</p>
            <div className="space-y-3">
              <div>
                <label className="input-label">Tipo</label>
                <select className="input-field" value={editForm.kind} onChange={(e) => setEditForm((f) => ({ ...f, kind: e.target.value as PersonKind }))}>
                  {kindOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Função</label>
                <input className="input-field" value={editForm.roleTitle} onChange={(e) => setEditForm((f) => ({ ...f, roleTitle: e.target.value }))} />
              </div>
              <div>
                <label className="input-label">Célula</label>
                <select className="input-field" value={editForm.cellId} onChange={(e) => setEditForm((f) => ({ ...f, cellId: e.target.value }))}>
                  <option value="">Sem célula</option>
                  {dbCells.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">Endereço</p>
            <div className="space-y-3">
              <div>
                <label className="input-label">CEP</label>
                <div className="relative">
                  <input
                    className="input-field"
                    placeholder="00000-000"
                    value={editForm.cep}
                    onChange={(e) => setEditForm((f) => ({ ...f, cep: formatCep(e.target.value) }))}
                    onBlur={handleEditCepBlur}
                  />
                  {editCepLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="animate-spin w-4 h-4 text-brand" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="input-label">Rua</label>
                <input
                  className="input-field"
                  placeholder="Preenchido automaticamente pelo CEP"
                  value={editForm.street}
                  onChange={(e) => setEditForm((f) => ({ ...f, street: e.target.value }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="input-label">Número</label>
                  <input
                    className="input-field"
                    placeholder="Ex: 123"
                    value={editForm.number}
                    onChange={(e) => setEditForm((f) => ({ ...f, number: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="input-label">Complemento</label>
                  <input
                    className="input-field"
                    placeholder="Apto, Bloco..."
                    value={editForm.complement}
                    onChange={(e) => setEditForm((f) => ({ ...f, complement: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="input-label">Bairro</label>
                <input
                  className="input-field"
                  placeholder="Preenchido automaticamente pelo CEP"
                  value={editForm.neighborhood}
                  onChange={(e) => setEditForm((f) => ({ ...f, neighborhood: e.target.value }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
                <div>
                  <label className="input-label">Cidade</label>
                  <input
                    className="input-field"
                    placeholder="Preenchido automaticamente pelo CEP"
                    value={editForm.city}
                    onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="input-label">Estado</label>
                  <input
                    className="input-field"
                    placeholder="UF"
                    maxLength={2}
                    value={editForm.state}
                    onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">Observações</p>
            <textarea className="input-field min-h-[120px]" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="rounded-[12px] bg-brand-light px-3 py-2 text-[12px] text-brand">
            Alteração local para validação. Ainda não salva no Supabase.
          </div>
          <button className="btn btn-primary w-full" onClick={saveProfile}>Salvar alterações</button>
        </div>
      </ActionDrawer>

      {/* Contact drawer */}
      <ActionDrawer open={contactOpen} onClose={() => setContactOpen(false)} title="Registrar contato" width={420}>
        <div className="space-y-4">
          <div>
            <label className="input-label">Resumo</label>
            <input className="input-field" value={contactForm.title} onChange={(e) => setContactForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="input-label">Como foi o contato?</label>
            <textarea
              className="input-field min-h-[150px]"
              value={contactForm.description}
              onChange={(e) => setContactForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Registre a conversa, percepções pastorais e próximos passos."
            />
          </div>
          <button className="btn btn-primary w-full" onClick={registerContact}>Adicionar à timeline</button>
        </div>
      </ActionDrawer>

      {/* Care drawer */}
      <ActionDrawer open={careOpen} onClose={() => setCareOpen(false)} title="Criar acompanhamento" width={420}>
        <div className="space-y-4">
          <div>
            <label className="input-label">Título</label>
            <input
              className="input-field"
              value={careForm.title}
              onChange={(e) => setCareForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Retomar contato nesta semana"
            />
          </div>
          <div>
            <label className="input-label">Motivo</label>
            <textarea className="input-field min-h-[120px]" value={careForm.reason} onChange={(e) => setCareForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          <div>
            <label className="input-label">Prioridade</label>
            <select className="input-field" value={careForm.priority} onChange={(e) => setCareForm((f) => ({ ...f, priority: e.target.value as CareCase["priority"] }))}>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </select>
          </div>
          <div>
            <label className="input-label">Próximo passo</label>
            <input className="input-field" value={careForm.nextStep} onChange={(e) => setCareForm((f) => ({ ...f, nextStep: e.target.value }))} />
          </div>
          <button className="btn btn-primary w-full" onClick={createCareCase}>Criar acompanhamento</button>
        </div>
      </ActionDrawer>
    </div>
  );
}

function ContactRow({ icon, value }: { icon: React.ReactNode; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex-shrink-0 text-ink-faint">{icon}</span>
      <span className="truncate text-[13px] text-ink-muted">{value}</span>
    </div>
  );
}

function InfoChip({
  label,
  active,
  trueLabel,
  falseLabel,
}: {
  label: string;
  active: boolean;
  trueLabel: string;
  falseLabel: string;
}) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-ink-muted">{label}</span>
      <span
        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
          active ? "bg-success-light text-success" : "bg-surface-alt text-ink-faint"
        }`}
      >
        {active ? trueLabel : falseLabel}
      </span>
    </div>
  );
}
