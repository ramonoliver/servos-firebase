"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/firebase";
import { getSession } from "@/lib/auth/session";
import { getIconEmoji, genId } from "@/lib/utils/helpers";
import type { Church, User, Department, Event } from "@/types";

type OnboardingProgress = {
  id: string;
  church_id: string;
  completed_steps: string[];
  completed: boolean;
  created_at: string;
};

const STEPS = [
  { id: "church", title: "Sua Igreja", subtitle: "Bem-vindo ao Servos! Confirme os dados da sua igreja." },
  { id: "department", title: "Primeiro Ministério", subtitle: "Crie o primeiro ministério da sua igreja." },
  { id: "invite", title: "Convide Alguém", subtitle: "Traga um líder ou membro para servir com você (opcional)." },
] as const;

const DEPT_ICONS = [
  { value: "music", label: "Louvor" },
  { value: "camera", label: "Midia" },
  { value: "heart", label: "Recepcao" },
  { value: "baby", label: "Infantil" },
  { value: "pray", label: "Intercessao" },
  { value: "church", label: "Outro" },
] as const;

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionChurchId, setSessionChurchId] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [church, setChurch] = useState<Church | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingProgress | null>(null);

  const [existingDepartments, setExistingDepartments] = useState<Department[]>([]);
  const [existingEvents, setExistingEvents] = useState<Event[]>([]);

  const [churchCity, setChurchCity] = useState("");

  const [deptName, setDeptName] = useState("Louvor");
  const [deptIcon, setDeptIcon] = useState("music");

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [tempPw, setTempPw] = useState<string | null>(null);

  async function loadData() {
    const session = getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    setSessionUserId(session.user_id);
    setSessionChurchId(session.church_id);

    const [
      { data: userData, error: userError },
      { data: churchData, error: churchError },
      { data: onboardingData, error: onboardingError },
      { data: departmentsData, error: departmentsError },
      { data: eventsData, error: eventsError },
    ] = await Promise.all([
      supabase.from("users").select("*").eq("id", session.user_id).maybeSingle(),
      supabase.from("churches").select("*").eq("id", session.church_id).maybeSingle(),
      supabase.from("onboarding_progress").select("*").eq("church_id", session.church_id).maybeSingle(),
      supabase.from("departments").select("*").eq("church_id", session.church_id),
      supabase.from("events").select("*").eq("church_id", session.church_id),
    ]);

    if (userError || churchError || onboardingError || departmentsError || eventsError) {
      console.error({ userError, churchError, onboardingError, departmentsError, eventsError });
      router.replace("/login");
      return;
    }

    if (!userData || !churchData) {
      router.replace("/login");
      return;
    }

    setUser(userData as User);
    setChurch(churchData as Church);
    setChurchCity((churchData as Church).city || "");
    setOnboarding((onboardingData || null) as OnboardingProgress | null);
    setExistingDepartments((departmentsData || []) as Department[]);
    setExistingEvents((eventsData || []) as Event[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function next() {
    if (!user || !church) return;

    const current = STEPS[step].id;

    if (current === "church") {
      const { error } = await supabase
        .from("churches")
        .update({ city: churchCity })
        .eq("id", church.id);
      if (error) { console.error("Erro ao atualizar igreja:", error); return; }
    }

    if (current === "department" && deptName.trim()) {
      const alreadyExists = existingDepartments.some((d) => d.name === deptName);
      if (!alreadyExists) {
        const deptId = genId();
        const { error: deptError } = await supabase.from("departments").insert({
          id: deptId,
          church_id: church.id,
          name: deptName.trim(),
          description: "",
          icon: deptIcon,
          color: "#D4A574",
          leader_ids: [user.id],
          co_leader_ids: [],
          active: true,
          created_at: new Date().toISOString(),
        });
        if (deptError) { console.error("Erro ao criar ministério:", deptError); return; }
        const { error: dmError } = await supabase.from("department_members").insert({
          id: genId(),
          department_id: deptId,
          user_id: user.id,
          function_name: "Líder",
          function_names: ["Líder"],
          joined_at: new Date().toISOString(),
        });
        if (dmError) { console.error("Erro ao vincular líder ao ministério:", dmError); return; }
      }
    }

    if (current === "invite" && inviteName.trim() && inviteEmail.trim()) {
      const normalizedEmail = inviteEmail.trim().toLowerCase();
      const { data: existingUser } = await supabase
        .from("users").select("id").eq("email", normalizedEmail).maybeSingle();
      if (!existingUser) {
        try {
          const response = await fetch("/api/member-invitations/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: inviteName.trim(),
              email: normalizedEmail,
              phone: "",
              role: "member",
              spouseId: "",
              selectedDepartments: [],
            }),
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error("Erro ao convidar usuario:", errorData || response.statusText);
            return;
          }
          const payload = (await response.json().catch(() => null)) as { tempPassword?: string } | null;
          setTempPw(payload?.tempPassword || null);
        } catch (error) {
          console.error("Erro ao convidar usuario:", error);
          return;
        }
      }
    }

    // Last step: mark complete and redirect
    if (step === STEPS.length - 1) {
      const completedSteps = STEPS.map((s) => s.id);
      if (onboarding) {
        await supabase.from("onboarding_progress").update({ completed: true, completed_steps: completedSteps }).eq("id", onboarding.id);
      } else if (sessionChurchId) {
        await supabase.from("onboarding_progress").insert({
          id: genId(),
          church_id: sessionChurchId,
          completed: true,
          completed_steps: completedSteps,
          created_at: new Date().toISOString(),
        });
      }
      router.push("/dashboard");
      return;
    }

    await loadData();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function skip() {
    if (step === STEPS.length - 1) {
      router.push("/dashboard");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  if (loading || !user || !church || !sessionUserId) {
    return null;
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path d="M12 3C8 3 5 7.5 5 12C5 16.5 8 21 12 24C16 21 19 16.5 19 12C19 7.5 16 3 12 3Z" fill="rgba(255,255,255,.35)" />
            <circle cx="12" cy="12.5" r="2.5" fill="white" />
          </svg>
        </div>
        <span className="font-display text-[17px] font-semibold text-ink">Servos</span>
      </div>

      <div className="w-full max-w-[440px]">
        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`rounded-full transition-all duration-300 ${
                i === step
                  ? "w-5 h-2 bg-brand"
                  : i < step
                  ? "w-2 h-2 bg-brand/40"
                  : "w-2 h-2 bg-border"
              }`}
            />
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-border-soft shadow-sm p-7">
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-1">
              Passo {step + 1} de {STEPS.length}
            </p>
            <h2 className="font-display text-xl font-bold text-ink">{current.title}</h2>
            <p className="text-sm text-ink-muted mt-1">{current.subtitle}</p>
          </div>

          {current.id === "church" && (
            <div className="space-y-4 mb-6">
              <div>
                <label className="input-label">Nome da igreja</label>
                <input className="input-field" value={church.name} disabled />
              </div>
              <div>
                <label className="input-label">Cidade</label>
                <input
                  className="input-field"
                  placeholder="Ex: Fortaleza, CE"
                  value={churchCity}
                  onChange={(e) => setChurchCity(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
          )}

          {current.id === "department" && (
            <div className="space-y-4 mb-6">
              <div>
                <label className="input-label">Nome do ministério</label>
                <input
                  className="input-field"
                  placeholder="Ex: Louvor"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="input-label">Ícone</label>
                <div className="flex flex-wrap gap-2">
                  {DEPT_ICONS.map((ic) => (
                    <button
                      key={ic.value}
                      type="button"
                      onClick={() => {
                        setDeptIcon(ic.value);
                        if (!deptName || DEPT_ICONS.some((x) => x.label === deptName)) {
                          setDeptName(ic.label);
                        }
                      }}
                      className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 border-2 transition-all ${
                        deptIcon === ic.value
                          ? "border-brand bg-brand-light font-semibold"
                          : "border-border-soft hover:border-ink-ghost"
                      }`}
                    >
                      {getIconEmoji(ic.value)} {ic.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {current.id === "invite" && (
            <div className="space-y-4 mb-6">
              {tempPw ? (
                <div className="text-center py-2">
                  <div className="text-3xl mb-3">&#9989;</div>
                  <p className="text-sm font-semibold mb-3">{inviteName} convidado!</p>
                  <div className="bg-[#F7F7F5] rounded-xl p-4 text-left text-sm">
                    <div className="text-ink-muted mb-1">
                      Email: <strong className="text-ink">{inviteEmail}</strong>
                    </div>
                    <div className="text-ink-muted">
                      Senha: <strong className="text-brand font-mono">{tempPw}</strong>
                    </div>
                  </div>
                  <p className="text-xs text-ink-faint mt-3">Envie essas credenciais para o membro.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="input-label">Nome</label>
                    <input
                      className="input-field"
                      placeholder="Nome do membro"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="input-label">Email</label>
                    <input
                      type="email"
                      className="input-field"
                      placeholder="email@exemplo.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {isLast && !tempPw && (
              <button onClick={skip} className="btn btn-secondary flex-1">
                Pular
              </button>
            )}
            <button onClick={next} className="btn btn-primary flex-1 py-2.5">
              {isLast ? (tempPw ? "Ir para o Dashboard" : "Finalizar") : "Continuar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
