"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { updateSession } from "@/lib/auth/session";
import { getInitials } from "@/lib/utils/helpers";
import { AvailabilityEditor, Skeleton, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/firebase";
import type { Department, Event, Schedule, ScheduleMember, User } from "@/types";

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

function isoToMask(iso: string | null | undefined): string {
  if (!iso || iso.length !== 10) return "";
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

export default function PerfilPage() {
  const { user, toast, refresh, pushPermission, pushEnabled, registeringPush, enablePushNotifications, retryPushNotifications } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"perfil" | "senha">(
    user.must_change_password ? "senha" : "perfil"
  );

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(formatPhone(user.phone || ""));
  const [birthDateMask, setBirthDateMask] = useState(isoToMask(user.birth_date));
  const [birthDate, setBirthDate] = useState(user.birth_date || "");
  const [cep, setCep] = useState(formatCep(user.address_cep || ""));
  const [street, setStreet] = useState(user.address_street || "");
  const [number, setNumber] = useState(user.address_number || "");
  const [complement, setComplement] = useState(user.address_complement || "");
  const [neighborhood, setNeighborhood] = useState(user.address_neighborhood || "");
  const [city, setCity] = useState(user.address_city || "");
  const [addressState, setAddressState] = useState(user.address_state || "");
  const [spouseId, setSpouseId] = useState(user.spouse_id || "");
  const [members, setMembers] = useState<User[]>([]);
  const [profileScheduleMembers, setProfileScheduleMembers] = useState<ScheduleMember[]>([]);
  const [profileSchedules, setProfileSchedules] = useState<Schedule[]>([]);
  const [profileEvents, setProfileEvents] = useState<Event[]>([]);
  const [profileDepartments, setProfileDepartments] = useState<Department[]>([]);
  const [cepLoading, setCepLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(user.photo_url || "");
  const [avail, setAvail] = useState([
    ...(user.availability || [true, true, true, true, true, true, true]),
  ]);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurPw, setShowCurPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileSummary, setProfileSummary] = useState<{
    monthPoints: number;
    badges: Array<{ id: string; name: string; description: string; icon: string; unlockedAt: string }>;
    pushEnabled: boolean;
  } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast("Imagem muito grande (max 2MB).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPhotoUrl(result);
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setPhotoUrl("");
  }

  async function handleCepBlur() {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) return;
      const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) return;
      if (data.logradouro) setStreet(data.logradouro);
      if (data.bairro) setNeighborhood(data.bairro);
      if (data.localidade) setCity(data.localidade);
      if (data.uf) setAddressState(data.uf);
    } catch {
      // silently ignore
    } finally {
      setCepLoading(false);
    }
  }

  useEffect(() => {
    async function loadProfileSummary() {
      setSummaryLoading(true);
      setSummaryError("");
      try {
        const authToken = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("servos_session") || "null")?.token : null;
        const response = await fetch("/api/profile/summary", {
          credentials: "include",
          headers: authToken ? { "x-servos-auth": authToken } : undefined,
        });
        const data = await response.json().catch(() => null);
        if (response.ok && data?.success) {
          setProfileSummary(data.profile);
        } else {
          setSummaryError("Não foi possível carregar seu resumo agora.");
        }
      } catch (error) {
        console.error("Erro ao carregar resumo do perfil:", error);
        setSummaryError("Não foi possível carregar seu resumo agora.");
      } finally {
        setSummaryLoading(false);
      }
    }

    void loadProfileSummary();
  }, []);

  useEffect(() => {
    supabase
      .from("users")
      .select("*")
      .eq("church_id", user.church_id)
      .eq("active", true)
      .then(({ data, error }) => {
        if (error) {
          console.error("Erro ao carregar membros para cônjuge:", error);
          return;
        }
        setMembers((data || []) as User[]);
        const reverse = ((data || []) as User[]).find((member) => member.spouse_id === user.id);
        if (!user.spouse_id && reverse) setSpouseId(reverse.id);
      });
  }, [user.church_id, user.id, user.spouse_id]);

  useEffect(() => {
    async function loadMySchedules() {
      const { data: smData, error: smError } = await supabase
        .from("schedule_members")
        .select("*")
        .eq("user_id", user.id);
      if (smError) {
        console.error("Erro ao carregar minhas participações:", smError);
        return;
      }
      const memberships = (smData || []) as ScheduleMember[];
      setProfileScheduleMembers(memberships);
      const scheduleIds = [...new Set(memberships.map((item) => item.schedule_id))];
      if (scheduleIds.length === 0) {
        setProfileSchedules([]);
        setProfileEvents([]);
        setProfileDepartments([]);
        return;
      }
      const { data: schedulesData, error: schedulesError } = await supabase
        .from("schedules")
        .select("*")
        .eq("church_id", user.church_id)
        .in("id", scheduleIds);
      if (schedulesError) {
        console.error("Erro ao carregar minhas escalas:", schedulesError);
        return;
      }
      const loadedSchedules = (schedulesData || []) as Schedule[];
      setProfileSchedules(loadedSchedules);
      const eventIds = [...new Set(loadedSchedules.map((item) => item.event_id).filter(Boolean))];
      const departmentIds = [...new Set(loadedSchedules.map((item) => item.department_id).filter(Boolean))];
      const [{ data: eventsData }, { data: departmentsData }] = await Promise.all([
        eventIds.length ? supabase.from("events").select("*").eq("church_id", user.church_id).in("id", eventIds) : Promise.resolve({ data: [] }),
        departmentIds.length ? supabase.from("departments").select("*").eq("church_id", user.church_id).in("id", departmentIds) : Promise.resolve({ data: [] }),
      ]);
      setProfileEvents((eventsData || []) as Event[]);
      setProfileDepartments((departmentsData || []) as Department[]);
    }
    void loadMySchedules();
  }, [user.church_id, user.id]);

  async function saveProfile() {
    if (!name.trim()) {
      toast("Informe seu nome.");
      return;
    }

    setSavingProfile(true);
    try {
      const authToken = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("servos_session") || "null")?.token : null;
      const response = await fetch("/api/profile/update", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { "x-servos-auth": authToken } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          availability: avail,
          photoUrl: photoUrl || null,
          birthDate: birthDate || null,
          addressCep: cep.replace(/\D/g, "") ? cep : "",
          addressStreet: street.trim(),
          addressNumber: number.trim(),
          addressComplement: complement.trim(),
          addressNeighborhood: neighborhood.trim(),
          addressCity: city.trim(),
          addressState: addressState.trim(),
          spouseId,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("Erro ao atualizar perfil:", data);
        toast("Erro ao atualizar perfil.");
        return;
      }

      updateSession({ name: name.trim() });
      await refresh();
      toast("Perfil atualizado!");
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      toast("Erro ao atualizar perfil.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    if (!curPw || !newPw || !confirmPw) {
      toast("Preencha todos os campos.");
      return;
    }

    if (newPw.length < 6) {
      toast("Minimo 6 caracteres.");
      return;
    }

    if (newPw !== confirmPw) {
      toast("As senhas não coincidem.");
      return;
    }

    setSavingPassword(true);
    try {
      const authToken = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("servos_session") || "null")?.token : null;
      const response = await fetch("/api/profile/change-password", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { "x-servos-auth": authToken } : {}),
        },
        body: JSON.stringify({
          currentPassword: curPw,
          newPassword: newPw,
          confirmPassword: confirmPw,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        toast(data?.error || "Erro ao alterar senha.");
        return;
      }

      setCurPw("");
      setNewPw("");
      setConfirmPw("");
      await refresh();
      toast("Senha alterada com sucesso!");
    } catch (error) {
      console.error("Erro ao alterar senha:", error);
      toast("Erro ao alterar senha.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="w-full">
      <PageHeader className="mb-6" eyebrow="Conta" title="Meu Perfil" />

      {user.must_change_password && (
        <div className="bg-amber-light text-amber text-sm px-4 py-3 rounded-[14px] border border-amber/10 mb-5 flex items-center gap-2">
          &#9888; Você está usando uma senha temporária.
          <button onClick={() => setTab("senha")} className="font-bold underline">
            Altere agora
          </button>
          .
        </div>
      )}

      {summaryLoading ? (
        <div className="grid gap-3 mb-5 md:grid-cols-3">
          <Skeleton className="h-[140px] rounded-[18px]" />
          <Skeleton className="h-[140px] rounded-[18px] md:col-span-2" />
        </div>
      ) : summaryError ? (
        <div className="rounded-[14px] border border-amber/20 bg-amber-light px-4 py-3 mb-5 text-sm text-amber flex items-center justify-between gap-3">
          <span>{summaryError}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => window.location.reload()}
          >
            Tentar novamente
          </button>
        </div>
      ) : profileSummary && (
        <div className="grid gap-3 mb-5 md:grid-cols-3">
          <div className="rounded-[18px] border border-border-soft bg-white p-5 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.24em] text-ink-faint mb-2">Pontos este mês</div>
            <div className="text-3xl font-display text-brand">{profileSummary.monthPoints}</div>
            <div className="text-xs text-ink-muted mt-2">Ganhos por confirmação, presença e apoio ao time.</div>
          </div>
          <div className="rounded-[18px] border border-border-soft bg-white p-5 shadow-sm md:col-span-2">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-[11px] uppercase tracking-[0.24em] text-ink-faint">Conquistas</div>
              <div className="text-[11px] text-ink-muted">{profileSummary.badges.length} desbloqueada(s)</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {profileSummary.badges.length > 0 ? (
                profileSummary.badges.map((badge) => (
                  <div key={badge.id} className="rounded-[14px] border border-border-soft bg-surface-alt p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-brand-light text-brand text-sm">{badge.icon}</span>
                      <div>
                        <div className="text-sm font-semibold">{badge.name}</div>
                        <div className="text-[11px] text-ink-faint">{new Date(badge.unlockedAt).toLocaleDateString("pt-BR")}</div>
                      </div>
                    </div>
                    <p className="text-[12px] text-ink-muted">{badge.description}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink-faint">Nenhuma conquista desbloqueada ainda. Confirme sua presença e ajude o time!</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-[14px] border border-border-soft bg-white px-4 py-3 mb-5">
        <div className="text-[11px] uppercase tracking-[0.2em] text-ink-faint mb-2">Notificações push</div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-ink-muted">
            {pushPermission === "granted"
              ? pushEnabled
                ? "Ativas neste dispositivo."
                : "Permissão concedida, finalize o registro do dispositivo."
              : pushPermission === "denied"
              ? "Bloqueadas no navegador. Reative nas configurações do site."
              : pushPermission === "default"
              ? "Desativadas. Ative para receber lembretes e avisos importantes."
              : "Este navegador não suporta notificações push."}
          </div>
          {pushPermission === "default" && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void enablePushNotifications()}
              disabled={registeringPush}
            >
              {registeringPush ? "Ativando..." : "Ativar notificações"}
            </button>
          )}
          {pushPermission === "granted" && !pushEnabled && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void retryPushNotifications()}
              disabled={registeringPush}
            >
              {registeringPush ? "Registrando..." : "Tentar novamente"}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-5 bg-surface-alt rounded-[10px] p-0.5 w-fit">
        <button
          onClick={() => setTab("perfil")}
          className={`px-4 py-1.5 rounded-lg text-[13px] font-medium ${
            tab === "perfil"
              ? "bg-surface text-ink font-semibold shadow-sm"
              : "text-ink-muted"
          }`}
        >
          Perfil
        </button>
        <button
          onClick={() => setTab("senha")}
          className={`px-4 py-1.5 rounded-lg text-[13px] font-medium ${
            tab === "senha"
              ? "bg-surface text-ink font-semibold shadow-sm"
              : "text-ink-muted"
          }`}
        >
          Senha
        </button>
      </div>

      {tab === "perfil" && (
        <div className="space-y-5">
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-5">
            <div className="relative group">
              {photoUrl ? (
                <img src={photoUrl} alt="Foto" className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                  style={{ background: user.avatar_color }}
                >
                  {getInitials(name || user.name)}
                </div>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-ink/0 group-hover:bg-ink/40 flex items-center justify-center transition-all cursor-pointer"
              >
                <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                  {photoUrl ? "Trocar" : "Adicionar"}
                </span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>

            <div>
              <div className="text-sm font-semibold">{user.email}</div>
              <div className="text-xs text-ink-faint capitalize mb-2">
                {user.role === "admin"
                  ? "Administrador"
                  : user.role === "leader"
                  ? "Líder"
                  : "Membro"}
              </div>

              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary btn-sm">
                  {photoUrl ? "Trocar foto" : "Adicionar foto"}
                </button>

                {photoUrl && (
                  <button onClick={removePhoto} className="btn btn-ghost btn-sm text-danger">
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="input-label">Nome completo</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="input-label">Cônjuge</label>
            <select className="input-field" value={spouseId} onChange={(e) => setSpouseId(e.target.value)}>
              <option value="">Sem cônjuge cadastrado</option>
              {members
                .filter((member) => member.id !== user.id)
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-[11px] text-ink-faint">O vínculo aparece automaticamente nos dois perfis.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="input-label">Telefone</label>
              <input
                className="input-field"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
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
                  setBirthDate(parseDateMask(masked));
                }}
              />
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-3">Endereço</p>
            <div className="space-y-3">
              <div>
                <label className="input-label">CEP</label>
                <div className="relative">
                  <input
                    className="input-field"
                    placeholder="00000-000"
                    value={cep}
                    onChange={(e) => setCep(formatCep(e.target.value))}
                    onBlur={() => void handleCepBlur()}
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
                <input className="input-field" placeholder="Preenchido pelo CEP" value={street} onChange={(e) => setStreet(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="input-label">Número</label>
                  <input className="input-field" placeholder="Ex: 123" value={number} onChange={(e) => setNumber(e.target.value)} />
                </div>
                <div>
                  <label className="input-label">Complemento</label>
                  <input className="input-field" placeholder="Apto, Bloco..." value={complement} onChange={(e) => setComplement(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="input-label">Bairro</label>
                <input className="input-field" placeholder="Preenchido pelo CEP" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
                <div>
                  <label className="input-label">Cidade</label>
                  <input className="input-field" placeholder="Preenchido pelo CEP" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div>
                  <label className="input-label">Estado</label>
                  <input className="input-field" placeholder="UF" maxLength={2} value={addressState} onChange={(e) => setAddressState(e.target.value.toUpperCase())} />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="input-label">Disponibilidade semanal</label>
            <AvailabilityEditor availability={avail} onChange={setAvail} />
          </div>

          <button onClick={saveProfile} disabled={savingProfile} className="btn btn-primary">
            {savingProfile ? "Salvando..." : "Salvar perfil"}
          </button>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-display text-lg">Minhas escalas</div>
              <p className="text-sm text-ink-muted">Próximas participações e respostas pendentes.</p>
            </div>
            <a href="/minhas-escalas" className="btn btn-secondary btn-sm">Ver todas</a>
          </div>
          <div className="space-y-2">
            {profileScheduleMembers
              .map((scheduleMember) => {
                const schedule = profileSchedules.find((item) => item.id === scheduleMember.schedule_id);
                if (!schedule) return null;
                const event = profileEvents.find((item) => item.id === schedule.event_id);
                const department = profileDepartments.find((item) => item.id === schedule.department_id);
                return { scheduleMember, schedule, event, department };
              })
              .filter(Boolean)
              .sort((a: any, b: any) => `${a.schedule.date} ${a.schedule.time}`.localeCompare(`${b.schedule.date} ${b.schedule.time}`))
              .slice(0, 4)
              .map((item: any) => (
                <a
                  key={item.scheduleMember.id}
                  href={`/escalas/${item.schedule.id}`}
                  className="flex flex-col gap-2 rounded-[16px] border border-border-soft bg-surface-alt px-4 py-3 transition-colors hover:bg-brand-glow sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-ink">{item.event?.name || "Escala"}</div>
                    <div className="mt-0.5 text-[12px] text-ink-muted">{item.department?.name || "Ministério"} · {item.scheduleMember.function_name || "Função não informada"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge badge-secondary">{item.schedule.date} · {item.schedule.time}</span>
                    <span className={`badge ${item.scheduleMember.status === "confirmed" ? "badge-green" : item.scheduleMember.status === "declined" ? "badge-red" : "badge-amber"}`}>
                      {item.scheduleMember.status === "confirmed" ? "Confirmado" : item.scheduleMember.status === "declined" ? "Recusado" : "Pendente"}
                    </span>
                  </div>
                </a>
              ))}
            {profileScheduleMembers.length === 0 && (
              <div className="rounded-[16px] border border-dashed border-border-soft bg-surface-alt px-4 py-8 text-center text-sm text-ink-faint">
                Nenhuma escala vinculada ao seu perfil ainda.
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {tab === "senha" && (
        <div className="card p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="input-label mb-0">Senha atual</label>
              <button type="button" onClick={() => setShowCurPw((value) => !value)} className="text-xs font-semibold text-brand hover:underline">
                {showCurPw ? "Ocultar" : "Ver senha"}
              </button>
            </div>
            <input
              type={showCurPw ? "text" : "password"}
              className="input-field"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="input-label mb-0">Nova senha (min. 6 caracteres)</label>
              <button type="button" onClick={() => setShowNewPw((value) => !value)} className="text-xs font-semibold text-brand hover:underline">
                {showNewPw ? "Ocultar" : "Ver senha"}
              </button>
            </div>
            <input
              type={showNewPw ? "text" : "password"}
              className="input-field"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="input-label mb-0">Confirmar nova senha</label>
              <button type="button" onClick={() => setShowConfirmPw((value) => !value)} className="text-xs font-semibold text-brand hover:underline">
                {showConfirmPw ? "Ocultar" : "Ver senha"}
              </button>
            </div>
            <input
              type={showConfirmPw ? "text" : "password"}
              className="input-field"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </div>

          <button onClick={changePassword} disabled={savingPassword} className="btn btn-primary">
            {savingPassword ? "Alterando..." : "Alterar senha"}
          </button>
        </div>
      )}
    </div>
  );
}
