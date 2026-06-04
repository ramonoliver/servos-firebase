"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/hooks/use-app";
import { formatPhoneInput } from "@/lib/invitations";
import { fileToAvatarDataUrl } from "@/lib/utils/image";
import { getInitials } from "@/lib/utils/helpers";
import { supabase } from "@/lib/firebase";
import { getIconEmoji } from "@/lib/utils/helpers";
import { PageHeader } from "@/components/ui";
import type { User } from "@/types";

type MemberRole = "member" | "leader" | "admin";

type SelectedDepartment = {
  department_id: string;
  function_name: string;
  function_names: string[];
};

type InviteDeliveryResult = {
  trackingEnabled?: boolean;
  email?: {
    status: "sent" | "failed";
    error: string | null;
  };
  sms?: {
    status: "sent" | "failed" | "skipped";
    error: string | null;
    preview?: string | null;
  };
};

export default function ConvidarMembroPage() {
  const { user, toast, departments, church } = useApp();
  const router = useRouter();

  const [members, setMembers] = useState<User[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    role: "member" as MemberRole,
    spouseId: "",
  });

  const [selectedDepartments, setSelectedDepartments] = useState<SelectedDepartment[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhoto(await fileToAvatarDataUrl(file));
    } catch (err) {
      console.error("Erro ao processar a foto:", err);
    } finally {
      setPhotoBusy(false);
    }
  }
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState("");
  const [createdEmail, setCreatedEmail] = useState("");
  const [inviteDelivery, setInviteDelivery] = useState<InviteDeliveryResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const u = (k: string, v: string) =>
    setF((p) => ({ ...p, [k]: k === "phone" ? formatPhoneInput(v) : v }));

  useEffect(() => {
    async function loadMembers() {
      setLoadingMembers(true);

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("church_id", user.church_id)
        .eq("active", true);

      if (error) {
        console.error("Erro ao carregar membros:", error);
        toast("Erro ao carregar membros.");
        setLoadingMembers(false);
        return;
      }

      setMembers((data || []) as User[]);
      setLoadingMembers(false);
    }

    loadMembers();
  }, [user.church_id, toast]);

  const availableSpouses = useMemo(
    () => members.filter((m) => !m.spouse_id),
    [members]
  );

  function isSelected(departmentId: string) {
    return selectedDepartments.some((d) => d.department_id === departmentId);
  }

  function toggleDepartment(departmentId: string) {
    setSelectedDepartments((prev) => {
      const exists = prev.some((d) => d.department_id === departmentId);

      if (exists) {
        return prev.filter((d) => d.department_id !== departmentId);
      }

      return [...prev, { department_id: departmentId, function_name: "", function_names: [] }];
    });
  }

  function toggleDepartmentFunction(departmentId: string, functionName: string) {
    setSelectedDepartments((prev) =>
      prev.map((d) =>
        d.department_id === departmentId
          ? {
              ...d,
              function_names: d.function_names.includes(functionName)
                ? d.function_names.filter((item) => item !== functionName)
                : [...d.function_names, functionName],
              function_name: d.function_names.includes(functionName)
                ? (d.function_names.filter((item) => item !== functionName)[0] || "")
                : d.function_name || functionName,
            }
          : d
      )
    );
  }

  function updateDepartmentCustomFunctions(departmentId: string, rawValue: string) {
    const normalized = rawValue
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    setSelectedDepartments((prev) =>
      prev.map((d) =>
        d.department_id === departmentId
          ? {
              ...d,
              function_names: normalized,
              function_name: normalized[0] || "",
            }
          : d
      )
    );
  }

  async function invite() {
    if (submitting) return;

    if (!f.name.trim() || !f.email.trim()) {
      toast("Preencha nome e email.");
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch("/api/member-invitations/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: f.name.trim(),
          email: f.email.trim(),
          phone: f.phone.trim(),
          role: f.role,
          spouseId: f.spouseId,
          photoUrl: photo,
          selectedDepartments,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            tempPassword?: string;
            member?: { name: string; email: string };
            delivery?: InviteDeliveryResult;
          }
        | null;

      if (!response.ok) {
        console.error("Erro ao criar convite:", payload || response.statusText);
        toast(payload?.error || "Não foi possível criar o convite.");
      } else {
        const delivery = payload?.delivery || null;
        setInviteDelivery(delivery || null);
        setCreatedName(payload?.member?.name || f.name.trim());
        setCreatedEmail(payload?.member?.email || f.email.trim().toLowerCase());
        setTempPw(payload?.tempPassword || null);

        if (delivery?.sms?.status === "failed") {
          toast("Convite enviado por email, mas o SMS falhou.");
        } else if (delivery?.sms?.status === "skipped") {
          toast("Email enviado. SMS aguardando configuracao.");
        } else {
          toast("Convite enviado com sucesso.");
        }
      }
    } catch (err) {
      console.error("Erro ao criar convite:", err);
      toast("Não foi possível criar o convite.");
    } finally {
      setSubmitting(false);
    }
  }

  if (tempPw) {
    return (
      <div className="max-w-[440px] mx-auto text-center">
        <div className="card p-8">
          <div className="text-4xl mb-3">&#9989;</div>
          <h2 className="font-display text-2xl mb-2">{createdName}</h2>
          <p className="text-sm text-ink-muted mb-6">Conta criada. Envie as credenciais abaixo.</p>

          <div className="bg-surface-alt rounded-[14px] p-5 text-left mb-5">
            <div className="text-[10px] font-bold text-ink-faint uppercase tracking-wider mb-2">
              Credenciais
            </div>
            <div className="text-sm mb-1">
              <span className="text-ink-muted">Email:</span> <strong>{createdEmail}</strong>
            </div>
            <div className="text-sm">
              <span className="text-ink-muted">Senha temporária:</span>{" "}
              <strong className="text-brand font-mono text-base">{tempPw}</strong>
            </div>
          </div>

          <div className="bg-amber-light rounded-[10px] p-3 text-xs text-amber border border-amber/10 mb-5">
            O membro devera alterar a senha no primeiro acesso.
          </div>

          <div className="bg-white border border-border-soft rounded-[14px] p-4 text-left mb-5 space-y-2">
            <div className="text-[10px] font-bold text-ink-faint uppercase tracking-wider">
              Resumo do envio
            </div>
            <div className="rounded-xl bg-surface-alt p-3">
              <div className="text-sm flex items-center justify-between gap-3">
                <span>Email</span>
                <strong className={inviteDelivery?.email?.status === "sent" ? "text-success" : "text-danger"}>
                  {inviteDelivery?.email?.status === "sent" ? "Enviado" : "Falhou"}
                </strong>
              </div>
              {inviteDelivery?.email?.error && (
                <div className="text-[11px] text-danger mt-1">{inviteDelivery.email.error}</div>
              )}
            </div>
            <div className="rounded-xl bg-surface-alt p-3">
              <div className="text-sm flex items-center justify-between gap-3">
                <span>SMS</span>
                <strong
                  className={
                    inviteDelivery?.sms?.status === "sent"
                      ? "text-success"
                      : inviteDelivery?.sms?.status === "skipped"
                      ? "text-amber"
                      : "text-danger"
                  }
                >
                  {inviteDelivery?.sms?.status === "sent"
                    ? "Enviado"
                    : inviteDelivery?.sms?.status === "skipped"
                    ? "Não configurado"
                    : "Falhou"}
                </strong>
              </div>
              {inviteDelivery?.sms?.error && (
                <div className="text-[11px] text-ink-faint mt-1">{inviteDelivery.sms.error}</div>
              )}
            </div>
            <div className="text-xs text-ink-faint">
              Tracking de abertura:{" "}
              <strong className="text-ink">
                {inviteDelivery?.trackingEnabled ? "ativo" : "indisponivel"}
              </strong>
            </div>
            {inviteDelivery?.sms?.preview && (
              <div className="rounded-xl bg-surface-alt p-3 text-xs text-ink-muted whitespace-pre-line">
                {inviteDelivery.sms.preview}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              navigator.clipboard?.writeText(`Email: ${createdEmail}\nSenha: ${tempPw}`);
              toast("Copiado!");
            }}
            className="btn btn-secondary w-full mb-2"
          >
            Copiar credenciais
          </button>

          <button onClick={() => router.push("/membros")} className="btn btn-primary w-full">
            Concluir
          </button>
          <button
            onClick={() => {
              setTempPw(null);
              setCreatedName("");
              setCreatedEmail("");
              setInviteDelivery(null);
              setF({
                name: "",
                email: "",
                phone: "",
                role: "member",
                spouseId: "",
              });
              setSelectedDepartments([]);
            }}
            className="btn btn-ghost w-full mt-2"
          >
            Convidar outro membro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        className="mb-6"
        backHref="/membros"
        backLabel="Membros"
        eyebrow="Comunidade"
        title="Convidar Membro"
        subtitle="Adicione um novo voluntário com acesso ao app."
      />

      <div className="card p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {photo ? (
              <img src={photo} alt="Foto do membro" className="h-16 w-16 rounded-full object-cover ring-2 ring-white" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-base font-bold text-ink-faint">
                {f.name.trim() ? getInitials(f.name) : "?"}
              </div>
            )}
            {photoBusy && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-white/60 text-[10px] font-semibold text-ink-muted">…</div>
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">Foto (opcional)</div>
            <div className="mt-1.5 flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-secondary btn-sm">
                {photo ? "Trocar foto" : "Adicionar foto"}
              </button>
              {photo && (
                <button type="button" onClick={() => setPhoto(null)} className="text-xs font-semibold text-ink-faint transition hover:text-danger">
                  Remover
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handlePhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">Nome completo</label>
            <input
              className="input-field"
              value={f.name}
              onChange={(e) => u("name", e.target.value)}
              placeholder="Nome do voluntario"
            />
          </div>

          <div>
            <label className="input-label">Email (sera o login)</label>
            <input
              type="email"
              className="input-field"
              value={f.email}
              onChange={(e) => u("email", e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>

          <div>
            <label className="input-label">Telefone</label>
            <input
              className="input-field"
              value={f.phone}
              onChange={(e) => u("phone", e.target.value)}
              placeholder="(00) 00000-0000"
              inputMode="numeric"
            />
            <div className="text-[11px] text-ink-faint mt-1">
              Usado para envio automatico por SMS quando configurado.
            </div>
          </div>

          <div>
            <label className="input-label">Perfil de acesso</label>
            <select
              className="input-field"
              value={f.role}
              onChange={(e) => u("role", e.target.value as MemberRole)}
            >
              <option value="member">Membro</option>
              <option value="leader">Líder</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="input-label">Vincular como casal (opcional)</label>
            <select
              className="input-field"
              value={f.spouseId}
              onChange={(e) => u("spouseId", e.target.value)}
              disabled={loadingMembers}
            >
              <option value="">Nenhum</option>
              {availableSpouses.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="mb-2">
            <div className="font-display text-lg">Ministérios</div>
            <p className="text-sm text-ink-muted">
              Selecione um ou mais ministérios e defina a função em cada um.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {departments.map((dept) => {
              const selected = isSelected(dept.id);
              const selectedDept = selectedDepartments.find(
                (d) => d.department_id === dept.id
              );

              return (
                <div
                  key={dept.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    selected
                      ? "border-brand bg-brand-glow shadow-sm"
                      : "border-border-soft bg-white hover:border-ink-ghost"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleDepartment(dept.id)}
                      className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] font-bold transition-all ${
                        selected
                          ? "bg-brand border-brand text-white"
                          : "border-border bg-white text-transparent"
                      }`}
                    >
                      ✓
                    </button>

                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ background: dept.color + "18", color: dept.color }}
                    >
                      {getIconEmoji(dept.icon)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm">{dept.name}</div>
                      <div className="text-[12px] text-ink-faint line-clamp-2">
                        {dept.description || "Sem descrição"}
                      </div>
                    </div>
                  </div>

                  {selected && (
                    <div className="mt-3 pl-8">
                      <label className="input-label">Funções neste ministério</label>
                      {dept.function_names?.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {dept.function_names.map((functionName) => {
                            const active = selectedDept?.function_names?.includes(functionName);
                            return (
                              <button
                                key={functionName}
                                type="button"
                                onClick={() => toggleDepartmentFunction(dept.id, functionName)}
                                className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                                  active ? "bg-brand text-white" : "bg-surface-alt text-ink-muted"
                                }`}
                              >
                                {functionName}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      <input
                        className="input-field mt-2"
                        value={(selectedDept?.function_names || []).join(", ")}
                        onChange={(e) =>
                          updateDepartmentCustomFunctions(dept.id, e.target.value)
                        }
                        placeholder="Ex: Vocal, Câmera, Recepção"
                      />
                      <div className="text-[11px] text-ink-faint mt-1">
                        Você pode selecionar várias funções e também editar manualmente separando por vírgula.
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface-alt rounded-[10px] px-4 py-3">
          <div className="text-xs font-semibold text-ink-soft mb-1">&#128274; Sobre a senha</div>
          <div className="text-xs text-ink-muted">
            Uma senha temporaria sera gerada. Voce recebera as credenciais para enviar ao membro.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-[12px] border border-border-soft bg-white px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Email</div>
            <div className="text-sm font-medium mt-1">Convite principal</div>
            <div className="text-[11px] text-ink-faint mt-1">HTML com tracking de abertura</div>
          </div>
          <div className="rounded-[12px] border border-border-soft bg-white px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">SMS</div>
            <div className="text-sm font-medium mt-1">Envio automatico</div>
            <div className="text-[11px] text-ink-faint mt-1">Usa telefone do cadastro</div>
          </div>
          <div className="rounded-[12px] border border-border-soft bg-white px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Reenvio</div>
            <div className="text-sm font-medium mt-1">Depois na ficha</div>
            <div className="text-[11px] text-ink-faint mt-1">Gera nova senha temporaria</div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={() => router.back()} className="btn btn-secondary flex-1">
            Cancelar
          </button>
          <button onClick={invite} disabled={submitting} className="btn btn-primary flex-1">
            {submitting ? "Criando..." : "Criar conta"}
          </button>
        </div>
      </div>
    </div>
  );
}
