"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/hooks/use-app";
import { getSession } from "@/lib/auth/session";
import { formatInviteDate, formatInviteOpenedAt } from "@/lib/invitations";
import { supabase } from "@/lib/firebase";
import { formatDate, formatShortDate } from "@/lib/utils/helpers";
import { MemberEditModal } from "@/components/shared/member-edit-modal";
import { CareNoteForm } from "@/components/shared/care-note-form";
import { AvailabilityGrid, Avatar, ConfirmDialog } from "@/components/ui";
import { fetchCareNotes, saveCareNote } from "@/lib/care/client";
import { careType, CARE_TONE_CLASSES, formatCareDate, type PastoralNote } from "@/lib/care/types";
import Link from "next/link";
import type {
  User,
  DepartmentMember,
  Schedule,
  ScheduleMember,
  Event,
  MemberInvitation,
} from "@/types";

type SelectedDepartment = {
  department_id: string;
  function_name: string;
  function_names: string[];
};

function formatPhoneDisplay(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length !== 11) return value || "-";
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function parseResponsePayload(raw: string) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw };
  }
}

export default function MembroDetailPage({ params }: { params: { id: string } }) {
  const { user, church, departments, canDo, toast } = useApp();
  const router = useRouter();

  const [showEdit, setShowEdit] = useState(false);
  const [member, setMember] = useState<User | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [dms, setDms] = useState<DepartmentMember[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [allSM, setAllSM] = useState<ScheduleMember[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [latestInvite, setLatestInvite] = useState<MemberInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [resendingInvite, setResendingInvite] = useState(false);
  const [careNotes, setCareNotes] = useState<PastoralNote[]>([]);
  const [showCareForm, setShowCareForm] = useState(false);
  const [deleteNote, setDeleteNote] = useState<PastoralNote | null>(null);
  const canCare = user.role !== "member";

  async function loadCare() {
    try {
      setCareNotes(await fetchCareNotes(params.id));
    } catch (error) {
      console.warn("Falha ao carregar cuidado pastoral:", error);
    }
  }

  async function handleDeleteNote(note: PastoralNote) {
    try {
      await saveCareNote({ mode: "delete", personId: params.id, noteId: note.id });
      toast("Registro removido.");
      setDeleteNote(null);
      await loadCare();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao remover registro.");
    }
  }

  async function loadData() {
    setLoading(true);

    const [
      { data: memberData, error: memberError },
      { data: membersData, error: membersError },
      { data: dmsData, error: dmsError },
      { data: schedulesData, error: schedulesError },
      { data: smData, error: smError },
      { data: eventsData, error: eventsError },
      { data: inviteData, error: inviteError },
    ] = await Promise.all([
      supabase.from("users").select("*").eq("id", params.id).eq("church_id", user.church_id).maybeSingle(),
      supabase.from("users").select("*").eq("church_id", user.church_id),
      supabase.from("department_members").select("*").eq("user_id", params.id),
      supabase.from("schedules").select("*").eq("church_id", user.church_id),
      supabase.from("schedule_members").select("*").eq("user_id", params.id),
      supabase.from("events").select("*").eq("church_id", user.church_id),
      supabase
        .from("member_invitations")
        .select("*")
        .eq("user_id", params.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (memberError || membersError || dmsError || schedulesError || smError || eventsError) {
      console.error({
        memberError,
        membersError,
        dmsError,
        schedulesError,
        smError,
        eventsError,
        inviteError,
      });
      toast("Erro ao carregar dados do membro.");
      setLoading(false);
      return;
    }

    const visibleDepartmentIds = new Set(departments.map((department) => department.id));
    const targetDepartmentLinks = (dmsData || []) as DepartmentMember[];
    const canViewTarget =
      user.role === "admin" ||
      params.id === user.id ||
      targetDepartmentLinks.some((dm) => visibleDepartmentIds.has(dm.department_id));

    setMember(canViewTarget ? ((memberData || null) as User | null) : null);
    setMembers((membersData || []) as User[]);
    setDms(targetDepartmentLinks);
    setSchedules((schedulesData || []) as Schedule[]);
    setAllSM((smData || []) as ScheduleMember[]);
    setEvents((eventsData || []) as Event[]);
    setLatestInvite((inviteData || null) as MemberInvitation | null);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    loadCare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, user.church_id, departments.length]);

  if (loading) {
    return <div className="py-20 text-center text-ink-faint">Carregando membro...</div>;
  }

  if (!member) {
    return <div className="py-20 text-center text-ink-faint">Membro não encontrado.</div>;
  }

  const spouse = member.spouse_id ? members.find((m) => m.id === member.spouse_id) : null;
  const roleCls =
    member.role === "admin"
      ? "bg-purple-50 text-purple-600"
      : member.role === "leader"
      ? "bg-brand-light text-brand"
      : "bg-success-light text-success";
  const statusLabelMap: Record<string, string> = {
    active: "Ativo",
    inactive: "Inativo",
    paused: "Pausa",
    vacation: "Férias",
  };
  const displayStatus = member.active ? statusLabelMap[member.status] || member.status : "Desativado";

  const inviteTimeline = latestInvite
    ? [
        {
          label: "Convite enviado",
          value: formatInviteDate(latestInvite.sent_at || latestInvite.created_at),
          tone: "text-ink",
        },
        {
          label: "Email",
          value:
            latestInvite.email_status === "sent"
              ? "Entregue"
              : latestInvite.email_status === "failed"
              ? "Falhou"
              : "Pendente",
          tone:
            latestInvite.email_status === "sent"
              ? "text-success"
              : latestInvite.email_status === "failed"
              ? "text-danger"
              : "text-amber",
        },
        {
          label: "SMS",
          value:
            latestInvite.sms_status === "sent"
              ? "Entregue"
              : latestInvite.sms_status === "failed"
              ? "Falhou"
              : latestInvite.sms_status === "skipped"
              ? "Não configurado"
              : "Pendente",
          tone:
            latestInvite.sms_status === "sent"
              ? "text-success"
              : latestInvite.sms_status === "failed"
              ? "text-danger"
              : latestInvite.sms_status === "skipped"
              ? "text-amber"
              : "text-ink",
        },
        {
          label: "Abertura do email",
          value: latestInvite.opened_at
            ? `${formatInviteOpenedAt(latestInvite.opened_at)} (${latestInvite.open_count}x)`
            : "Ainda não abriu",
          tone: latestInvite.opened_at ? "text-success" : "text-ink",
        },
      ]
    : [];

  async function resendInvite() {
    setResendingInvite(true);

    try {
      const response = await fetch("/api/member-invitations/resend", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(getSession()?.token ? { "x-servos-auth": getSession()!.token! } : {}),
        },
        body: JSON.stringify({
          userId: member.id,
        }),
      });

      const raw = await response.text();
      const data = parseResponsePayload(raw);

      if (!response.ok) {
        console.error("Erro ao reenviar convite:", data);
        toast("Não foi possível reenviar o convite.");
        return;
      }

      toast(`Convite reenviado para ${member.name}.`);
      await loadData();
    } catch (error) {
      console.error("Erro ao reenviar convite:", error);
      toast("Não foi possível reenviar o convite.");
    } finally {
      setResendingInvite(false);
    }
  }

  async function changeMemberState(action: "deactivate" | "reactivate" | "hard_delete") {
    if (!member || !canDo("member.remove") || member.id === user.id) return;
    const confirmed = window.confirm(
      action === "reactivate"
        ? `Reativar ${member.name}?`
        : action === "hard_delete"
        ? `Excluir ${member.name} permanentemente e apagar os dados relacionados?`
        : `Desativar ${member.name}?`
    );
    if (!confirmed) return;

    try {
      const response = await fetch("/api/members/deactivate", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(getSession()?.token ? { "x-servos-auth": getSession()!.token! } : {}),
        },
        body: JSON.stringify({
          targetUserId: member.id,
          action,
        }),
      });

      const raw = await response.text();
      const data = parseResponsePayload(raw);
      if (!response.ok) {
        if (
          (action === "reactivate" && data?.error === "Este membro ja esta ativo.") ||
          (action === "deactivate" && data?.error === "Este membro ja esta desativado.")
        ) {
          await loadData();
          toast(
            action === "reactivate"
              ? "Este membro ja estava ativo. A tela foi sincronizada."
              : "Este membro ja estava desativado. A tela foi sincronizada."
          );
          return;
        }
        toast(
          data?.error ||
            (action === "reactivate"
              ? "Não foi possível reativar este membro."
              : action === "hard_delete"
              ? "Não foi possível excluir este membro."
              : "Não foi possível desativar este membro.")
        );
        return;
      }

      toast(
        data?.warning ||
          (action === "reactivate"
            ? "Membro reativado com sucesso."
            : action === "hard_delete"
            ? "Usuário excluído com sucesso."
            : "Membro desativado com sucesso.")
      );
      if (action === "hard_delete") {
        router.push("/membros");
        return;
      }

      await loadData();
    } catch (error) {
      console.error("Erro ao atualizar membro:", error);
      toast(
        action === "reactivate"
          ? "Não foi possível reativar este membro."
          : action === "hard_delete"
          ? "Não foi possível excluir este membro."
          : "Não foi possível desativar este membro."
      );
    }
  }

  return (
    <div>
      <Link href="/membros" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline">
        <span aria-hidden>&larr;</span> Membros
      </Link>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-2">
            <Avatar name={member.name} color={member.avatar_color} photoUrl={member.photo_url} size={64} />

            <div className="min-w-0 flex-1">
              <h1 className="page-title break-words">{member.name}</h1>
              <p className="page-subtitle break-all">{member.email}</p>

              <div className="flex gap-2 mt-2 flex-wrap">
                <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${roleCls}`}>
                  {member.role === "admin" ? "Administrador" : member.role === "leader" ? "Líder" : "Membro"}
                </span>

                {spouse && (
                  <span className="text-[10px] font-semibold text-brand bg-brand-light px-2 py-0.5 rounded-full">
                    &#128145; {spouse.name}
                  </span>
                )}

                {member.must_change_password && <span className="badge badge-amber">Senha temporária</span>}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:ml-auto sm:self-start">
              {canDo("member.edit") && (
                <button onClick={() => setShowEdit(true)} className="btn btn-secondary btn-sm">
                  &#9998; Editar
                </button>
              )}
              {canDo("member.remove") && member.id !== user.id && member.active && (
                <button onClick={() => changeMemberState("deactivate")} className="btn btn-secondary btn-sm">
                  Desativar membro
                </button>
              )}
              {canDo("member.remove") && member.id !== user.id && !member.active && (
                <button onClick={() => changeMemberState("reactivate")} className="btn btn-primary btn-sm">
                  Reativar membro
                </button>
              )}
              {canDo("member.remove") && member.id !== user.id && user.role === "admin" && (
                <button onClick={() => changeMemberState("hard_delete")} className="btn btn-danger btn-sm">
                  Excluir permanente
                </button>
              )}
            </div>
          </div>

          <div className="card p-5">
            <div className="font-display text-lg mb-3">Disponibilidade</div>
            <AvailabilityGrid availability={member.availability || []} />
          </div>

          {/* Cuidado pastoral */}
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-[17px]">Cuidado pastoral</span>
              {canCare && (
                <button onClick={() => setShowCareForm(true)} className="btn btn-primary btn-sm">+ Registrar</button>
              )}
            </div>
            {careNotes.length === 0 ? (
              <p className="py-5 text-center text-sm text-ink-faint">Nenhum registro de cuidado ainda.</p>
            ) : (
              <div className="space-y-3">
                {careNotes.map((note) => {
                  const t = careType(note.type);
                  return (
                    <div key={note.id} className="group flex gap-3">
                      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${CARE_TONE_CLASSES[t.tone]}`}>{t.short}</div>
                      <div className="min-w-0 flex-1 border-b border-border-soft pb-3 last:border-b-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-bold text-ink">{note.title || t.label}</span>
                          <span className="text-[11px] font-semibold text-ink-faint">{formatCareDate(note.date)}</span>
                          {canCare && (
                            <button onClick={() => setDeleteNote(note)} className="ml-auto text-[11px] font-semibold text-ink-faint opacity-0 transition hover:text-danger group-hover:opacity-100">Remover</button>
                          )}
                        </div>
                        {note.description && <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{note.description}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card">
            <div className="px-5 pt-4 pb-3">
              <span className="font-display text-[17px]">Histórico de Escalas</span>
            </div>

            {allSM.slice(0, 10).map((sm) => {
              const sched = schedules.find((s) => s.id === sm.schedule_id);
              const ev = sched ? events.find((e) => e.id === sched.event_id) : null;

              return sched ? (
                <Link
                  key={sm.id}
                  href={`/escalas/${sched.id}`}
                  className="flex items-center gap-3 px-5 py-2.5 border-t border-border-soft hover:bg-brand-glow transition-colors"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                      sm.status === "confirmed"
                        ? "bg-success-light"
                        : sm.status === "pending"
                        ? "bg-amber-light"
                        : "bg-danger-light"
                    }`}
                  >
                    {sm.status === "confirmed" ? "\u2713" : sm.status === "pending" ? "\u23F3" : "\u2715"}
                  </div>

                  <div className="flex-1">
                    <div className="text-sm font-medium">{ev?.name}</div>
                    <div className="text-[11px] text-ink-faint">{formatShortDate(sched.date)}</div>
                  </div>
                </Link>
              ) : null;
            })}

            {allSM.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-ink-faint">Nenhuma escala ainda.</div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <div className="font-display text-lg mb-3">Informações</div>

            <div className="space-y-2 text-sm">
              {[
                ["Telefone", formatPhoneDisplay(member.phone)],
                ["Escalas", String(member.total_schedules)],
                ["Confirmação", member.confirm_rate + "%"],
                ["Status", displayStatus],
                ["Desde", member.joined_at ? formatDate(member.joined_at.split("T")[0]) : "-"],
              ].map(([l, v], i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4 py-1.5 border-t border-border-soft first:border-t-0">
                  <span className="text-ink-muted">{l}</span>
                  <span className="font-medium text-right break-words">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {member.must_change_password && (
            <div className="card p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-3">
                <div>
                  <div className="font-display text-lg">Acesso e convite</div>
                  <p className="text-sm text-ink-muted">
                    Acompanhe o último envio e o progresso de abertura.
                  </p>
                </div>

                {canDo("member.invite") && (
                  <button
                    onClick={resendInvite}
                    disabled={resendingInvite}
                    className="btn btn-secondary btn-sm"
                  >
                    {resendingInvite ? "Reenviando..." : "Reenviar convite"}
                  </button>
                )}
              </div>

              {latestInvite ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-surface-alt px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                        Último envio
                      </div>
                      <div className="text-sm font-medium mt-1">
                        {formatInviteDate(latestInvite.sent_at || latestInvite.created_at)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-surface-alt px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                        Aberturas
                      </div>
                      <div className="text-sm font-medium mt-1">
                        {latestInvite.open_count} {latestInvite.open_count === 1 ? "abertura" : "aberturas"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {inviteTimeline.map((item) => (
                      <div key={item.label} className="flex gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-brand mt-1.5 shrink-0" />
                        <div className="flex-1 border-b border-border-soft pb-3 last:border-b-0 last:pb-0">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                            {item.label}
                          </div>
                          <div className={`text-sm font-medium mt-0.5 break-words ${item.tone}`}>{item.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {(latestInvite.email_error || latestInvite.sms_error) && (
                  <div className="rounded-xl border border-amber/20 bg-amber-light px-4 py-3 text-xs text-amber break-words">
                      {latestInvite.email_error && <div>Email: {latestInvite.email_error}</div>}
                      {latestInvite.sms_error && <div>SMS: {latestInvite.sms_error}</div>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-ink-faint">
                  Nenhum histórico de convite encontrado.
                </div>
              )}
            </div>
          )}

          <div className="card p-5">
            <div className="font-display text-lg mb-3">Ministérios</div>
            <p className="text-sm text-ink-muted mb-3">
              Use <strong>Editar</strong> para ajustar em quais ministérios este membro está e qual função ele exerce em cada um.
            </p>

            {dms.length === 0 ? (
              <p className="text-sm text-ink-faint">Nenhum ministério.</p>
            ) : (
              dms.map((dm) => {
                const d = departments.find((dep) => dep.id === dm.department_id);
                return d ? (
                  <div key={dm.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 py-1.5">
                    <span className="text-sm font-medium break-words">{d.name}</span>
                    <span className="text-xs text-ink-faint text-left sm:text-right break-words">
                      {(dm.function_names?.length ? dm.function_names : dm.function_name ? [dm.function_name] : ["Sem função"]).join(", ")}
                    </span>
                  </div>
                ) : null;
              })
            )}
          </div>
        </div>
      </div>

      {showEdit && (
        <MemberEditModal
          member={member}
          departments={departments}
          allDeptMembers={dms}
          allMembers={members}
          canAssignCellRole={user.role === "admin" || user.cell_role === "pastor"}
          onClose={() => setShowEdit(false)}
          onSave={async (updates, selectedDepartments, spouseId) => {
            try {
              const response = await fetch("/api/members/update", {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  ...(getSession()?.token ? { "x-servos-auth": getSession()!.token! } : {}),
                },
                body: JSON.stringify({
                  memberId: member.id,
                  updates,
                  selectedDepartments,
                  spouseId,
                }),
              });

              const raw = await response.text();
              const data = parseResponsePayload(raw);

              if (!response.ok) {
                console.error("Erro ao atualizar membro:", data);
                toast(data?.error || "Erro ao atualizar membro.");
                return;
              }

              toast("Membro atualizado!");
              setShowEdit(false);
              await loadData();
            } catch (error) {
              console.error("Erro ao atualizar membro:", error);
              toast("Erro ao atualizar membro.");
            }
          }}
        />
      )}

      {showCareForm && (
        <CareNoteForm
          personId={params.id}
          toast={toast}
          close={() => setShowCareForm(false)}
          onSaved={async () => { setShowCareForm(false); await loadCare(); }}
        />
      )}

      {deleteNote && (
        <ConfirmDialog
          title="Remover registro"
          message={`Remover este registro de cuidado de <strong>${formatCareDate(deleteNote.date)}</strong>?`}
          confirmLabel="Remover"
          onCancel={() => setDeleteNote(null)}
          onConfirm={() => void handleDeleteNote(deleteNote)}
        />
      )}
    </div>
  );
}
