"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { ActionDrawer } from "@/components/ui/action-drawer";
import { PageIntro, PersonCard, SoftCard } from "@/components/pastoral/pastoral-ui";
import { calculateAge } from "@/lib/kids/domain";
import { registerPeopleInCache, registerCellsInCache } from "@/lib/pastoral/selectors";
import { pastoralCells, pastoralMinistries, pastoralPeople, pastoralTags } from "@/lib/pastoral/mock-data";
import type { PastoralPerson, PersonGender, PersonKind, MaritalStatus } from "@/lib/pastoral/types";

const kindOptions: { value: PersonKind | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "member", label: "Membros" },
  { value: "visitor", label: "Visitantes" },
  { value: "leader", label: "Líderes" },
  { value: "volunteer", label: "Voluntários" },
  { value: "pastor", label: "Pastores" },
];

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Aplica máscara dd/mm/aaaa ao digitar e retorna a string mascarada. */
function formatDateMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Converte dd/mm/aaaa → YYYY-MM-DD para armazenamento. Retorna "" se inválido. */
function parseDateMask(masked: string): string {
  const parts = masked.split("/");
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return "";
  return `${yyyy}-${mm}-${dd}`;
}

/** Converte YYYY-MM-DD → dd/mm/aaaa para exibição. */
function toDateMask(iso: string): string {
  if (!iso || iso.length !== 10) return iso;
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

const emptyForm = {
  fullName: "",
  phone: "",
  email: "",
  birthDate: "",
  gender: "nao_informado" as PersonGender,
  kind: "visitor" as PersonKind,
  cellId: "",
  ministryId: "",
  guardianName: "",
  guardianPhone: "",
  secondGuardianName: "",
  secondGuardianPhone: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};

export default function PessoasPage() {
  const { user, toast, departments } = useApp();
  const [peopleData, setPeopleData] = useState<PastoralPerson[]>([]);
  const [dbCells, setDbCells] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<PersonKind | "all">("all");
  const [tagId, setTagId] = useState("all");
  const [special, setSpecial] = useState<"all" | "without-cell" | "in-care" | "new-converts">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newPerson, setNewPerson] = useState(emptyForm);
  const [birthDateMask, setBirthDateMask] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", phone: "", email: "" });
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const newPersonAge = calculateAge(newPerson.birthDate);
  const isChildPerson = newPersonAge !== null && newPersonAge <= 12;

  async function loadData() {
    try {
      setLoading(true);
      const [
        { data: usersData, error: usersError },
        cellsResponse,
      ] = await Promise.all([
        supabase.from("users").select("*").eq("church_id", user.church_id),
        fetch("/api/cells/list", { method: "POST", credentials: "include" }).catch(() => null),
      ]);

      if (usersError) {
        console.error("Erro ao carregar pessoas:", usersError);
        toast("Erro ao carregar pessoas.");
      }

      const cellsPayload = cellsResponse ? await cellsResponse.json().catch(() => null) : null;
      const cellsList = (cellsPayload?.cells || []) as any[];
      setDbCells(cellsList);

      registerPeopleInCache(usersData || []);
      registerCellsInCache(cellsList);

      const mapped: PastoralPerson[] = (usersData || []).map((u: any) => {
        const kinds: PersonKind[] = [];
        if (u.role === "admin") kinds.push("member", "volunteer", "leader");
        else if (u.role === "leader") kinds.push("member", "volunteer", "leader");
        else kinds.push("member");

        if (u.cell_role === "lider" || u.cell_role === "lider_em_treinamento") {
          kinds.push("leader");
        }
        if (u.cell_role === "pastor") {
          kinds.push("pastor");
        }

        return {
          id: u.id,
          slug: u.slug || undefined,
          fullName: u.name || "",
          avatarColor: u.avatar_color || "#F4532A",
          photoUrl: u.photo_url || null,
          phone: u.phone || "",
          email: u.email || "",
          birthDate: u.birth_date || "",
          gender: (u.gender || "nao_informado") as PersonGender,
          maritalStatus: (u.marital_status || "nao_informado") as MaritalStatus,
          address: u.address || "",
          instagram: u.instagram || "",
          arrivalDate: u.joined_at || u.created_at || "",
          kinds,
          baptized: u.baptized || false,
          inDiscipleship: u.in_discipleship || false,
          participatesInCell: !!u.cell_id,
          cellId: u.cell_id || null,
          ministryIds: u.ministry_ids || [],
          roleTitle: u.role === "admin" ? "Administrador" : u.role === "leader" ? "Líder" : "Membro",
          tagIds: u.tag_ids || [],
          notes: u.notes || "",
          lastContactAt: u.last_served_at || null,
        };
      });

      setPeopleData(mapped);
    } catch (err) {
      console.error("Erro crítico em loadData:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [user.church_id]);

  const people = useMemo(() => {
    const term = search.trim().toLowerCase();
    const effectiveTag = special === "new-converts" ? "novo-convertido" : tagId;

    return peopleData.filter((person) => {
      const matchesSearch =
        !term ||
        person.fullName.toLowerCase().includes(term) ||
        person.email.toLowerCase().includes(term) ||
        person.phone.toLowerCase().includes(term);
      const matchesKind = kind === "all" || person.kinds.includes(kind);
      const matchesTag = effectiveTag === "all" || person.tagIds.includes(effectiveTag);
      const matchesSpecial =
        special === "all" ||
        special === "new-converts" ||
        (special === "without-cell" && !person.cellId) ||
        (special === "in-care" && person.tagIds.includes("em-acompanhamento"));

      return matchesSearch && matchesKind && matchesTag && matchesSpecial;
    });
  }, [peopleData, search, kind, tagId, special]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleCepBlur() {
    const digits = newPerson.cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) return;
      const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) return;
      setNewPerson((prev) => ({
        ...prev,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
      }));
    } catch {
      // silently ignore network errors
    } finally {
      setCepLoading(false);
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setNewPerson(emptyForm);
    setBirthDateMask("");
    setPhotoPreview(null);
  }

  async function createPerson() {
    const name = newPerson.fullName.trim();
    if (!name) return;
    if (isChildPerson && !newPerson.guardianName.trim()) return;

    try {
      setLoading(true);
      const res = await fetch("/api/people/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: newPerson.email,
          phone: newPerson.phone,
          birthDate: newPerson.birthDate,
          gender: newPerson.gender,
          kind: newPerson.kind,
          cellId: newPerson.cellId || null,
          notes: "",
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        toast(data?.error || "Erro ao criar cadastro.");
        setLoading(false);
        return;
      }

      toast("Pessoa cadastrada com sucesso!");
      closeDrawer();
      await loadData();
    } catch (err) {
      console.error("Erro ao criar pessoa:", err);
      toast("Erro ao criar cadastro.");
      setLoading(false);
    }
  }

  async function handleSendInvite() {
    const name = inviteForm.name.trim();
    const email = inviteForm.email.trim();
    const phone = inviteForm.phone.trim();

    if (!name || !email || !phone) {
      toast("Preencha todos os campos obrigatórios.");
      return;
    }

    setInviteSubmitting(true);
    try {
      const res = await fetch("/api/people/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Erro ao enviar convite.");
      } else {
        toast("Convite enviado com sucesso!");
        setInviteModalOpen(false);
        setInviteForm({ name: "", phone: "", email: "" });
        await loadData();
      }
    } catch (err) {
      console.error("Erro ao enviar convite:", err);
      toast("Erro de conexão ao enviar convite.");
    } finally {
      setInviteSubmitting(false);
    }
  }

  return (
    <div>
      <PageIntro
        eyebrow="Pessoas & Cuidado"
        title="Pessoas"
        description="Uma visão única para membros, visitantes, voluntários, líderes e pessoas em acompanhamento."
        action={
          (user.role === "admin" || user.role === "leader") && (
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" onClick={() => setInviteModalOpen(true)}>
                Enviar convite
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setDrawerOpen(true)}>
                + Nova pessoa
              </button>
            </div>
          )
        }
      />

      <SoftCard className="mb-4 p-3">
        <div className="grid gap-2 md:grid-cols-[1fr_160px_180px_190px]">
          <input
            className="input-field"
            placeholder="Buscar por nome, email ou telefone..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="input-field" value={kind} onChange={(event) => setKind(event.target.value as PersonKind | "all")}>
            {kindOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select className="input-field" value={tagId} onChange={(event) => setTagId(event.target.value)}>
            <option value="all">Todas as tags</option>
            {pastoralTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.label}</option>
            ))}
          </select>
          <select className="input-field" value={special} onChange={(event) => setSpecial(event.target.value as typeof special)}>
            <option value="all">Todos os filtros</option>
            <option value="without-cell">Pessoas sem célula</option>
            <option value="in-care">Em acompanhamento</option>
            <option value="new-converts">Novos convertidos</option>
          </select>
        </div>
      </SoftCard>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-ink-faint">{people.length} pessoas encontradas</span>
        {(search || kind !== "all" || tagId !== "all" || special !== "all") && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch("");
              setKind("all");
              setTagId("all");
              setSpecial("all");
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {people.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            cellName={dbCells.find((c) => c.id === person.cellId)?.name}
          />
        ))}
      </div>

      <ActionDrawer open={drawerOpen} onClose={closeDrawer} title="Nova pessoa" width={480}>
        <div className="space-y-6">

          {/* Foto */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="relative w-20 h-20 rounded-full overflow-hidden bg-surface-alt border-2 border-dashed border-border hover:border-brand transition-colors flex items-center justify-center group"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Foto" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-ink-faint group-hover:text-brand transition-colors">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" />
                  </svg>
                  <span className="text-[10px] font-semibold leading-none">Foto</span>
                </div>
              )}
            </button>
            {photoPreview && (
              <button
                type="button"
                className="text-[11px] text-ink-faint hover:text-danger transition-colors"
                onClick={() => { setPhotoPreview(null); if (photoInputRef.current) photoInputRef.current.value = ""; }}
              >
                Remover foto
              </button>
            )}
          </div>

          {/* Identificação */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">Identificação</p>
            <div className="space-y-3">
              <div>
                <label className="input-label">Nome completo *</label>
                <input
                  className="input-field"
                  placeholder="Ex: João da Silva"
                  value={newPerson.fullName}
                  onChange={(e) => setNewPerson((p) => ({ ...p, fullName: e.target.value }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="input-label">Telefone</label>
                  <input
                    className="input-field"
                    placeholder="(00) 00000-0000"
                    value={newPerson.phone}
                    onChange={(e) => setNewPerson((p) => ({ ...p, phone: formatPhone(e.target.value) }))}
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
                    value={birthDateMask}
                    onChange={(e) => {
                      const masked = formatDateMask(e.target.value);
                      setBirthDateMask(masked);
                      setNewPerson((p) => ({ ...p, birthDate: parseDateMask(masked) }));
                    }}
                  />
                  {newPersonAge !== null && (
                    <div className="mt-1 text-[11px] font-semibold text-ink-faint">
                      Idade calculada: {newPersonAge} anos
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="input-label">Sexo</label>
                <select
                  className="input-field"
                  value={newPerson.gender}
                  onChange={(e) => setNewPerson((p) => ({ ...p, gender: e.target.value as PersonGender }))}
                >
                  <option value="nao_informado">Nao informado</option>
                  <option value="feminino">Feminino</option>
                  <option value="masculino">Masculino</option>
                </select>
              </div>
              <div>
                <label className="input-label">E-mail</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="email@exemplo.com"
                  value={newPerson.email}
                  onChange={(e) => setNewPerson((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {isChildPerson && (
            <div className="rounded-[22px] border border-brand/15 bg-[#FFF8ED] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">Responsáveis obrigatórios</p>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="input-label">Responsável principal *</label>
                    <input
                      className="input-field"
                      placeholder="Nome do responsável"
                      value={newPerson.guardianName}
                      onChange={(e) => setNewPerson((p) => ({ ...p, guardianName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="input-label">Telefone *</label>
                    <input
                      className="input-field"
                      placeholder="(00) 00000-0000"
                      value={newPerson.guardianPhone}
                      onChange={(e) => setNewPerson((p) => ({ ...p, guardianPhone: formatPhone(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="input-label">Segundo responsável</label>
                    <input
                      className="input-field"
                      placeholder="Opcional"
                      value={newPerson.secondGuardianName}
                      onChange={(e) => setNewPerson((p) => ({ ...p, secondGuardianName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="input-label">Telefone</label>
                    <input
                      className="input-field"
                      placeholder="Opcional"
                      value={newPerson.secondGuardianPhone}
                      onChange={(e) => setNewPerson((p) => ({ ...p, secondGuardianPhone: formatPhone(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="rounded-[16px] bg-white/70 px-4 py-3 text-[12px] font-semibold leading-5 text-[#9A6414]">
                  Pessoas com 12 anos ou menos precisam de pelo menos um responsável vinculado antes de salvar.
                </div>
              </div>
            </div>
          )}

          {/* Perfil */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">Perfil</p>
            <div className="space-y-3">
              <div>
                <label className="input-label">Tipo</label>
                <select className="input-field" value={newPerson.kind} onChange={(e) => setNewPerson((p) => ({ ...p, kind: e.target.value as PersonKind }))}>
                  {kindOptions.filter((o) => o.value !== "all").map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Célula</label>
                <select className="input-field" value={newPerson.cellId} onChange={(e) => setNewPerson((p) => ({ ...p, cellId: e.target.value }))}>
                  <option value="">Sem célula por enquanto</option>
                  {dbCells.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Ministério</label>
                <select className="input-field" value={newPerson.ministryId} onChange={(e) => setNewPerson((p) => ({ ...p, ministryId: e.target.value }))}>
                  <option value="">Sem ministério por enquanto</option>
                  {departments.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
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
                    value={newPerson.cep}
                    onChange={(e) => setNewPerson((p) => ({ ...p, cep: formatCep(e.target.value) }))}
                    onBlur={handleCepBlur}
                  />
                  {cepLoading && (
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
                  value={newPerson.street}
                  onChange={(e) => setNewPerson((p) => ({ ...p, street: e.target.value }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="input-label">Número</label>
                  <input
                    className="input-field"
                    placeholder="Ex: 123"
                    value={newPerson.number}
                    onChange={(e) => setNewPerson((p) => ({ ...p, number: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="input-label">Complemento</label>
                  <input
                    className="input-field"
                    placeholder="Apto, Bloco..."
                    value={newPerson.complement}
                    onChange={(e) => setNewPerson((p) => ({ ...p, complement: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="input-label">Bairro</label>
                <input
                  className="input-field"
                  placeholder="Preenchido automaticamente pelo CEP"
                  value={newPerson.neighborhood}
                  onChange={(e) => setNewPerson((p) => ({ ...p, neighborhood: e.target.value }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
                <div>
                  <label className="input-label">Cidade</label>
                  <input
                    className="input-field"
                    placeholder="Preenchido automaticamente pelo CEP"
                    value={newPerson.city}
                    onChange={(e) => setNewPerson((p) => ({ ...p, city: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="input-label">Estado</label>
                  <input
                    className="input-field"
                    placeholder="UF"
                    maxLength={2}
                    value={newPerson.state}
                    onChange={(e) => setNewPerson((p) => ({ ...p, state: e.target.value.toUpperCase() }))}
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            className="btn btn-primary w-full"
            onClick={createPerson}
            disabled={!newPerson.fullName.trim() || (isChildPerson && !newPerson.guardianName.trim())}
          >
            Criar pessoa
          </button>
        </div>
      </ActionDrawer>

      <ActionDrawer
        open={inviteModalOpen}
        onClose={() => {
          setInviteModalOpen(false);
          setInviteForm({ name: "", phone: "", email: "" });
        }}
        title="Enviar convite"
        width={440}
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-brand-light bg-brand-glow p-4 text-xs text-ink-muted leading-relaxed">
            O destinatário receberá um e-mail com um link seguro de cadastro para escolher sua senha e acessar o sistema.
          </div>

          <div className="space-y-4">
            <div>
              <label className="input-label">Nome completo *</label>
              <input
                className="input-field"
                placeholder="Ex: João da Silva"
                value={inviteForm.name}
                onChange={(e) => setInviteForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="input-label">Telefone *</label>
              <input
                className="input-field"
                placeholder="(00) 99999-9999"
                value={inviteForm.phone}
                onChange={(e) => setInviteForm((p) => ({ ...p, phone: formatPhone(e.target.value) }))}
              />
              <span className="text-[11px] text-ink-faint mt-1 block">Necessário para futuros envios por SMS.</span>
            </div>

            <div>
              <label className="input-label">E-mail *</label>
              <input
                type="email"
                className="input-field"
                placeholder="email@exemplo.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-3">
            <button
              className="btn btn-secondary flex-1"
              onClick={() => {
                setInviteModalOpen(false);
                setInviteForm({ name: "", phone: "", email: "" });
              }}
              disabled={inviteSubmitting}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary flex-1"
              onClick={handleSendInvite}
              disabled={
                inviteSubmitting ||
                !inviteForm.name.trim() ||
                !inviteForm.email.trim() ||
                !inviteForm.phone.trim()
              }
            >
              {inviteSubmitting ? "Enviando..." : "Enviar Convite"}
            </button>
          </div>
        </div>
      </ActionDrawer>
    </div>
  );
}
