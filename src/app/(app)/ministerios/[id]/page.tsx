"use client";

import { useMemo, useState, useEffect } from "react";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { getInitials, getIconEmoji } from "@/lib/utils/helpers";
import { ActionDrawer, PageShell } from "@/components/ui";
import Link from "next/link";
import type { Department, User, DepartmentMember, Schedule, Event } from "@/types";
import { DeptForm } from "@/components/shared/dept-form";
import { AddMemberForm } from "@/components/shared/add-member-form";
import { EscalaDetailPanel } from "@/components/escalas/escala-detail-panel";

export default function MinisterioDetailPage({ params }: { params: { id: string } }) {
  const { user, departments, canDo, toast, refresh } = useApp();
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditDept, setShowEditDept] = useState(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [interestSent, setInterestSent] = useState(false);

  const [allMembers, setAllMembers] = useState<User[]>([]);
  const [dms, setDms] = useState<DepartmentMember[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const [dbDept, setDbDept] = useState<Department | null>(null);
  const dept = departments.find((d) => d.id === params.id) || dbDept;

  async function loadData() {
    try {
      setLoading(true);

      // O contexto (useApp) só traz os ministérios que o usuário lidera/administra.
      // Para quem é apenas membro/escalado, busca o ministério diretamente.
      let resolvedDept: Department | null = departments.find((d) => d.id === params.id) || null;
      if (!resolvedDept) {
        const { data } = await supabase
          .from("departments")
          .select("*")
          .eq("id", params.id)
          .eq("church_id", user.church_id)
          .maybeSingle();
        resolvedDept = (data as Department) || null;
        setDbDept(resolvedDept);
      }
      if (!resolvedDept) {
        setLoading(false);
        return;
      }

      const [
        { data: usersData, error: usersError },
        { data: dmData, error: dmError },
        { data: schedulesData, error: schedulesError },
        { data: eventsData, error: eventsError },
      ] = await Promise.all([
        supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
        supabase.from("department_members").select("*").eq("department_id", resolvedDept.id),
        supabase.from("schedules").select("*").eq("church_id", user.church_id).eq("department_id", resolvedDept.id),
        supabase.from("events").select("*").eq("church_id", user.church_id),
      ]);

      if (usersError || dmError || schedulesError || eventsError) {
        console.error("Ministry loadData error:", {
          usersError,
          dmError,
          schedulesError,
          eventsError,
        });
        toast("Erro ao carregar dados do ministério.");
        setLoading(false);
        return;
      }

      setAllMembers((usersData || []) as User[]);
      setDms((dmData || []) as DepartmentMember[]);
      setSchedules(
        ((schedulesData || []) as Schedule[])
          .filter((s) => s.status !== "cancelled")
          .sort((a, b) => a.date.localeCompare(b.date))
      );
      setEvents((eventsData || []) as Event[]);
    } catch (err) {
      console.error("Critical error in ministry detail loadData:", err);
      toast("Erro crítico ao carregar ministério.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, user.church_id, departments.length]);

  const deptMemberIds = useMemo(() => dms.map((dm) => dm.user_id), [dms]);

  const leaders = useMemo(
    () =>
      (dept?.leader_ids || [])
        .map((id) => allMembers.find((m) => m.id === id))
        .filter(Boolean),
    [dept, allMembers]
  );

  const coLeaders = useMemo(
    () =>
      (dept?.co_leader_ids || [])
        .map((id) => allMembers.find((m) => m.id === id))
        .filter(Boolean),
    [dept, allMembers]
  );

  const availableToAdd = useMemo(
    () => allMembers.filter((m) => !deptMemberIds.includes(m.id)),
    [allMembers, deptMemberIds]
  );
  const selectedSchedule = selectedScheduleId
    ? schedules.find((schedule) => schedule.id === selectedScheduleId) || null
    : null;

  async function addMembersToDept(selectedMembers: { userId: string; functionName: string; functionNames: string[] }[]) {
    if (!dept) return;

    try {
      const response = await fetch("/api/department-members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          departmentId: dept.id,
          members: selectedMembers,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("Erro ao adicionar membro:", data);
        toast(data?.error || "Erro ao adicionar membro ao ministério.");
        return;
      }

      toast(
        selectedMembers.length === 1
          ? "Membro adicionado ao ministério!"
          : `${selectedMembers.length} membros adicionados ao ministério!`
      );
      setShowAddMember(false);
      await loadData();
    } catch (error) {
      console.error("Erro ao adicionar membro:", error);
      toast("Erro ao adicionar membro ao ministério.");
    }
  }

  async function removeMemberFromDept(dmId: string, memberName: string) {
    if (!confirm(`Remover ${memberName} deste ministério?`)) return;

    try {
      const params = new URLSearchParams({
        departmentId: dept.id,
        departmentMemberId: dmId,
      });

      const response = await fetch(`/api/department-members?${params.toString()}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("Erro ao remover membro:", data);
        toast(data?.error || "Erro ao remover membro do ministério.");
        return;
      }

      toast(memberName + " removido do ministério.");
      await loadData();
    } catch (error) {
      console.error("Erro ao remover membro:", error);
      toast("Erro ao remover membro do ministério.");
    }
  }

  if (!dept) {
    return (
      <PageShell>
        <Link href="/ministerios" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline">
          <span aria-hidden>&larr;</span> Ministérios
        </Link>
        <div className="rounded-[18px] border border-border-soft bg-white/70 px-6 py-12 text-center backdrop-blur">
          <p className="text-sm font-semibold text-ink">Ministério não encontrado</p>
        </div>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell>
        <div className="py-20 text-center text-ink-faint">Carregando ministério...</div>
      </PageShell>
    );
  }

  // Acesso ao detalhe: só quem participa/lidera o ministério (ou admin/pastor).
  // Quem não participa vê apenas que o ministério existe e pode sinalizar interesse.
  const isMemberOfDept = deptMemberIds.includes(user.id);
  const isLeaderOfDept = [...(dept.leader_ids || []), ...(dept.co_leader_ids || [])].includes(user.id);
  const canAccessDetail =
    user.role === "admin" ||
    user.cell_role === "pastor" ||
    user.cell_role === "coordenacao" ||
    canDo("department.edit", dept.id) ||
    isLeaderOfDept ||
    isMemberOfDept;

  async function sendInterest() {
    if (!dept) return;
    try {
      const res = await fetch("/api/ministries/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: dept.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Erro ao enviar interesse.");
        return;
      }
      setInterestSent(true);
      toast(data?.warning || "Interesse enviado à liderança! 🙌");
    } catch {
      toast("Erro ao enviar interesse.");
    }
  }

  if (!canAccessDetail) {
    return (
      <PageShell>
        <Link href="/ministerios" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline">
          <span aria-hidden>&larr;</span> Ministérios
        </Link>
        <div className="mx-auto max-w-[460px] rounded-[22px] border border-border-soft bg-white/70 px-6 py-12 text-center shadow-soft backdrop-blur">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-sm"
            style={{ background: dept.color + "18", color: dept.color }}
          >
            {getIconEmoji(dept.icon)}
          </div>
          <h1 className="mt-4 font-display text-[22px] font-bold text-ink">{dept.name}</h1>
          {dept.description && <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-relaxed text-ink-muted">{dept.description}</p>}
          <p className="mt-3 text-[12px] text-ink-faint">Você ainda não participa deste ministério.</p>
          <button
            onClick={sendInterest}
            disabled={interestSent}
            className="btn btn-primary btn-sm mt-5 disabled:opacity-60"
          >
            {interestSent ? "Interesse enviado ✓" : "Tenho interesse em participar"}
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Link href="/ministerios" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline">
        <span aria-hidden>&larr;</span> Ministérios
      </Link>
      <div className="card p-5 sm:p-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mt-2">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm"
            style={{ background: dept.color + "22", color: dept.color }}
          >
            {getIconEmoji(dept.icon)}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="page-title mb-0 break-words leading-tight">{dept.name}</h1>
              {!dept.active && (
                <span className="text-[10px] font-semibold bg-danger-light text-danger px-2 py-0.5 rounded-full">
                  Inativo
                </span>
              )}
            </div>

            <p className="text-sm text-ink-muted mb-3 break-words">{dept.description || "Sem descrição."}</p>

            <div className="flex flex-wrap gap-2">
              {leaders.length > 0 && (
                <span className="badge badge-brand">
                  Líder: {(leaders as User[]).map((m) => m.name.split(" ")[0]).join(", ")}
                </span>
              )}
              {coLeaders.length > 0 && (
                <span className="badge badge-secondary">
                  Co-líder: {(coLeaders as User[]).map((m) => m.name.split(" ")[0]).join(", ")}
                </span>
              )}
              <span className="badge badge-secondary">{dms.length} membros</span>
              {dept.function_names?.length > 0 && (
                <span className="badge badge-secondary">{dept.function_names.length} funções</span>
              )}
            </div>

            {dept.function_names?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {dept.function_names.map((functionName) => (
                  <span key={functionName} className="badge badge-secondary">
                    {functionName}
                  </span>
                ))}
              </div>
            )}

            <p className="text-[12px] text-ink-faint mt-3 break-words">
              Ajuste nome, líderes, cor e funções por aqui sempre que precisar.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 self-start lg:self-auto">
          {canDo("department.edit", dept.id) && (
            <button onClick={() => setShowEditDept(true)} className="btn btn-secondary">
              ✎ Editar ministério
            </button>
          )}
          {canDo("schedule.create", dept.id) && (
            <Link href={`/escalas/nova?departmentId=${dept.id}`} className="btn btn-secondary">
              + Nova escala
            </Link>
          )}
          {canDo("member.edit", dept.id) && (
            <button onClick={() => setShowAddMember(true)} className="btn btn-primary">
              + Adicionar membros
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-6">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Membros do ministério</h2>
          </div>

          {dms.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-ink-faint">
              Nenhum membro neste ministério.
            </div>
          ) : (
            dms.map((dm) => {
              const member = allMembers.find((m) => m.id === dm.user_id);
              if (!member) return null;

              return (
                <div
                  key={dm.id}
                  className="flex items-center gap-3.5 px-5 py-3 border-t border-border-soft first:border-t-0 hover:bg-brand-glow transition-colors group"
                >
                  <Link href={`/pessoas/${member.id}`} className="flex items-center gap-3.5 flex-1 min-w-0">
                    {member.photo_url ? (
                      <img
                        src={member.photo_url}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: member.avatar_color }}
                      >
                        {getInitials(member.name)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{member.name}</div>
                      <div className="text-[11px] text-ink-faint">
                        {(dm.function_names?.length ? dm.function_names : dm.function_name ? [dm.function_name] : ["Sem função"]).join(", ")} · {member.email}
                      </div>
                    </div>
                  </Link>

                  {canDo("member.edit", dept.id) && (
                    <button
                      onClick={() => removeMemberFromDept(dm.id, member.name)}
                      className="btn btn-ghost btn-sm text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      &#10005;
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title break-words">Próximas escalas</h2>
          </div>

          {schedules.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-ink-faint">
              Nenhuma escala encontrada.
            </div>
          ) : (
            <div className="space-y-2 px-4 pb-4">
              {schedules.map((s) => {
                const event = events.find((e) => e.id === s.event_id);
                const day = new Date(`${s.date}T12:00:00`);
                const dd = String(day.getDate()).padStart(2, "0");
                const mm = day
                  .toLocaleDateString("pt-BR", { month: "short" })
                  .replace(".", "")
                  .toUpperCase();
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedScheduleId(s.id)}
                    className="flex w-full items-center gap-3 rounded-[14px] border border-border-soft bg-white/60 p-3 text-left transition hover:border-ink-ghost hover:bg-white hover:shadow-soft"
                  >
                    <div className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-[12px] bg-brand-light text-brand-deep">
                      <span className="text-[15px] font-extrabold leading-none">{dd}</span>
                      <span className="text-[9px] font-bold uppercase">{mm}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-ink">{event?.name || "Evento"}</div>
                      <div className="text-[11px] text-ink-muted">
                        {s.time}
                        {s.published === false ? " · Rascunho" : ""}
                      </div>
                    </div>
                    <span aria-hidden className="flex-shrink-0 text-ink-faint">&rsaquo;</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ActionDrawer
        open={Boolean(selectedScheduleId)}
        onClose={() => setSelectedScheduleId(null)}
        title="Visualizar escala"
        width={920}
      >
        {selectedScheduleId && (
          <div className="min-h-[70dvh]">
            <EscalaDetailPanel
              key={selectedScheduleId}
              scheduleId={selectedScheduleId}
              initialSchedule={selectedSchedule}
              onRefreshList={loadData}
            />
          </div>
        )}
      </ActionDrawer>

      {showAddMember && (
        <AddMemberForm
          availableToAdd={availableToAdd}
          functionOptions={dept.function_names || []}
          onClose={() => setShowAddMember(false)}
          onSave={addMembersToDept}
        />
      )}

      {showEditDept && (
        <DeptForm
          dept={dept}
          members={allMembers}
          user={user}
          toast={toast}
          allDM={dms}
          close={() => setShowEditDept(false)}
          onSaved={async () => {
            setShowEditDept(false);
            await refresh();
            await loadData();
          }}
        />
      )}
    </PageShell>
  );
}
