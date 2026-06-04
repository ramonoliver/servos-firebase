"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { getSession } from "@/lib/auth/session";
import { formatInviteOpenedAt } from "@/lib/invitations";
import { getInitials } from "@/lib/utils/helpers";
import { ConfirmDialog, PageHeader } from "@/components/ui";
import Link from "next/link";
import type { User, DepartmentMember, MemberInvitation } from "@/types";

function getLatestInvitesMap(invites: MemberInvitation[]) {
  return invites.reduce<Record<string, MemberInvitation>>((acc, invite) => {
    if (!acc[invite.user_id]) {
      acc[invite.user_id] = invite;
    }
    return acc;
  }, {});
}

function getInviteBadge(invite?: MemberInvitation) {
  if (!invite) {
    return null;
  }

  if (invite.opened_at) {
    return {
      label: `Email aberto ${formatInviteOpenedAt(invite.opened_at)}`,
      cls: "bg-success-light text-success",
    };
  }

  if (invite.email_status === "failed") {
    return {
      label: "Email falhou",
      cls: "bg-danger-light text-danger",
    };
  }

  return {
    label: "Email enviado",
    cls: "bg-amber-light text-amber",
  };
}

function parseResponsePayload(raw: string) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw };
  }
}

export default function MembrosPage() {
  const { user, church, toast, canDo, departments } = useApp();

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [members, setMembers] = useState<User[]>([]);
  const [allDM, setAllDM] = useState<DepartmentMember[]>([]);
  const [latestInvites, setLatestInvites] = useState<Record<string, MemberInvitation>>({});
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [openActionsFor, setOpenActionsFor] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ member: User; action: "deactivate" | "reactivate" | "hard_delete" } | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  async function loadData() {
    setLoading(true);

    const visibleDepartmentIds = departments.map((dept) => dept.id);

    const usersQuery = supabase
      .from("users")
      .select("*")
      .eq("church_id", user.church_id);

    if (user.role !== "admin") {
      usersQuery.eq("active", true);
    }

    const { data: usersData, error: usersError } = await usersQuery;

    const { data: dmData, error: dmError } = visibleDepartmentIds.length
      ? await supabase
          .from("department_members")
          .select("*")
          .in("department_id", visibleDepartmentIds)
      : { data: [], error: null };

    const { data: inviteData, error: inviteError } = await supabase
      .from("member_invitations")
      .select("*")
      .eq("church_id", user.church_id)
      .order("created_at", { ascending: false });

    if (usersError) {
      console.error("Erro ao buscar membros:", usersError);
      toast("Erro ao carregar membros.");
      setLoading(false);
      return;
    }

    if (dmError) {
      console.error("Erro ao buscar vínculos de departamentos:", dmError);
      toast("Erro ao carregar departamentos dos membros.");
      setLoading(false);
      return;
    }

    if (inviteError) {
      console.error("Erro ao buscar convites dos membros:", inviteError);
    }

    const departmentLinks = (dmData || []) as DepartmentMember[];
    const visibleUserIds =
      user.role === "admin"
        ? null
        : new Set([...departmentLinks.map((dm) => dm.user_id), user.id]);

    setMembers(
      ((usersData || []) as User[]).filter((member) =>
        visibleUserIds ? visibleUserIds.has(member.id) : true
      )
    );
    setAllDM(departmentLinks);
    setLatestInvites(getLatestInvitesMap((inviteData || []) as MemberInvitation[]));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [user.church_id, departments.length]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!actionsMenuRef.current) return;
      if (!actionsMenuRef.current.contains(event.target as Node)) {
        setOpenActionsFor(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const filtered = useMemo(() => {
    let result = [...members];

    if (search) {
      const term = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          m.email.toLowerCase().includes(term)
      );
    }

    if (deptFilter !== "all") {
      const deptMemberIds = allDM
        .filter((dm) => dm.department_id === deptFilter)
        .map((dm) => dm.user_id);

      result = result.filter((m) => deptMemberIds.includes(m.id));
    }

    if (statusFilter !== "all") {
      result = result.filter((m) => (statusFilter === "active" ? m.active : !m.active));
    }

    return result;
  }, [members, allDM, search, deptFilter, statusFilter]);

  async function changeMemberState(
    m: User,
    action: "deactivate" | "reactivate" | "hard_delete"
  ) {
    try {
      const response = await fetch("/api/members/deactivate", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(getSession()?.token ? { "x-servos-auth": getSession()!.token! } : {}),
        },
        body: JSON.stringify({
          targetUserId: m.id,
          action,
        }),
      });

      const raw = await response.text();
      const data = parseResponsePayload(raw);

      if (!response.ok) {
        console.error("Erro ao atualizar membro:", data);
        if (
          (action === "reactivate" && data?.error === "Este membro ja esta ativo.") ||
          (action === "deactivate" && data?.error === "Este membro ja esta desativado.")
        ) {
          await loadData();
          setOpenActionsFor(null);
          toast(
            action === "reactivate"
              ? `${m.name} ja estava ativo. A lista foi sincronizada.`
              : `${m.name} ja estava desativado. A lista foi sincronizada.`
          );
          return;
        }
        toast(
          data?.error ||
            (action === "reactivate"
              ? "Erro ao reativar membro."
              : action === "hard_delete"
              ? "Erro ao excluir membro."
              : "Erro ao desativar membro.")
        );
        return;
      }

      toast(
        data?.warning ||
          (action === "reactivate"
            ? `${m.name} reativado.`
            : action === "hard_delete"
            ? `${m.name} excluido permanentemente.`
            : `${m.name} desativado.`)
      );
      setOpenActionsFor(null);
      await loadData();
    } catch (error) {
      console.error("Erro ao atualizar membro:", error);
      toast(
        action === "reactivate"
          ? "Erro ao reativar membro."
          : action === "hard_delete"
          ? "Erro ao excluir membro."
          : "Erro ao desativar membro."
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function resendInvite(member: User) {
    setResendingId(member.id);

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

      const emailSent = data?.email?.status === "sent";
      const smsSent = data?.sms?.status === "sent";

      if (emailSent || smsSent) {
        toast(`Convite reenviado para ${member.name}.`);
      } else {
        toast("O convite foi recriado, mas os envios falharam.");
      }

      setOpenActionsFor(null);
      await loadData();
    } catch (error) {
      console.error("Erro ao reenviar convite:", error);
      toast("Não foi possível reenviar o convite.");
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <PageHeader
        className="mb-5 flex-shrink-0"
        eyebrow="Comunidade"
        title="Membros"
        subtitle={`${members.length} voluntário${members.length === 1 ? "" : "s"}`}
        actions={
          canDo("member.invite") && (
            <Link href="/membros/convidar" className="btn btn-primary btn-sm">
              + Convidar
            </Link>
          )
        }
      />

      {/* Filters */}
      <div className="mb-3 flex-shrink-0 rounded-[24px] border border-white/60 bg-white/40 backdrop-blur-md p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <input
            className="input-field flex-1 min-w-[200px]"
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input-field min-w-[180px]"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="all">Todos os ministérios</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {user.role === "admin" && (
            <select
              className="input-field min-w-[160px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "active" | "inactive" | "all")}
            >
              <option value="active">Somente ativos</option>
              <option value="inactive">Somente desativados</option>
              <option value="all">Todos</option>
            </select>
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between flex-shrink-0">
        <span className="text-[12px] font-semibold text-ink-faint">{filtered.length} voluntários encontrados</span>
        {(search || deptFilter !== "all" || statusFilter !== "active") && (
          <button
            onClick={() => { setSearch(""); setDeptFilter("all"); setStatusFilter("active"); }}
            className="btn btn-ghost btn-sm text-ink-faint"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto rounded-[24px] border border-white/60 bg-white/40 backdrop-blur-md shadow-sm">
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-ink-faint">Carregando membros...</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-ink-faint">Nenhum membro encontrado.</div>
        ) : (
          filtered.map((m) => {
            const mDepts = allDM.filter((dm) => dm.user_id === m.id);
            const deptNames = mDepts
              .map((dm) => departments.find((d) => d.id === dm.department_id)?.name)
              .filter(Boolean);
            const functionSummary = mDepts
              .flatMap((dm) => dm.function_names?.length ? dm.function_names : dm.function_name ? [dm.function_name] : [])
              .filter((v, i, a) => v && a.indexOf(v) === i)
              .join(", ");
            const spouse = m.spouse_id ? members.find((s) => s.id === m.spouse_id) : null;
            const latestInvite = latestInvites[m.id];
            const inviteBadge = getInviteBadge(latestInvite);
            const roleCls =
              m.role === "admin" ? "bg-purple-50 text-purple-600"
              : m.role === "leader" ? "bg-brand-light text-brand"
              : "bg-success-light text-success";

            return (
              <div
                key={m.id}
                className={`flex items-center gap-3 px-4 py-3 border-b border-white/40 last:border-b-0 group transition-colors ${
                  m.active ? "hover:bg-white/60" : "opacity-60"
                }`}
              >
                <Link href={`/membros/${m.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  {m.photo_url ? (
                    <img src={m.photo_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: m.avatar_color }}
                    >
                      {getInitials(m.name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink truncate">
                      {m.name}{m.must_change_password ? " *" : ""}
                    </div>
                    <div className="text-[11px] text-ink-faint truncate">
                      {functionSummary ? `${functionSummary} · ` : ""}
                      {deptNames.length ? deptNames.join(", ") : m.email}
                    </div>
                  </div>
                </Link>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${roleCls}`}>
                    {m.role === "admin" ? "Admin" : m.role === "leader" ? "Líder" : "Membro"}
                  </span>
                  {!m.active && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-danger-light text-danger">Inativo</span>
                  )}
                  {spouse && (
                    <span className="text-[9px] font-semibold text-brand bg-brand-light px-1.5 py-0.5 rounded-full hidden sm:inline">
                      &#128145; {spouse.name.split(" ")[0]}
                    </span>
                  )}
                  {inviteBadge && (
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full hidden sm:inline ${inviteBadge.cls}`}>
                      {inviteBadge.label}
                    </span>
                  )}

                  <div className="relative" ref={openActionsFor === m.id ? actionsMenuRef : null}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setOpenActionsFor((c) => (c === m.id ? null : m.id)); }}
                      className="btn btn-ghost btn-sm opacity-60 group-hover:opacity-100 transition-opacity"
                    >
                      ···
                    </button>
                    {openActionsFor === m.id && (
                      <div className="absolute right-0 z-20 mt-2 min-w-[200px] rounded-xl border border-border-soft bg-white shadow-lg p-1.5 flex flex-col gap-0.5">
                        {canDo("member.invite") && m.must_change_password && (
                          <button onClick={() => resendInvite(m)} disabled={resendingId === m.id} className="w-full text-left rounded-lg px-3 py-2 text-[13px] hover:bg-surface-alt disabled:opacity-60">
                            {resendingId === m.id ? "Reenviando..." : "Reenviar convite"}
                          </button>
                        )}
                        {canDo("member.remove") && m.id !== user.id && m.active && (
                          <button onClick={() => setPendingAction({ member: m, action: "deactivate" })} className="w-full text-left rounded-lg px-3 py-2 text-[13px] text-amber-700 hover:bg-amber-light">
                            Desativar membro
                          </button>
                        )}
                        {canDo("member.remove") && m.id !== user.id && !m.active && (
                          <button onClick={() => setPendingAction({ member: m, action: "reactivate" })} className="w-full text-left rounded-lg px-3 py-2 text-[13px] text-success hover:bg-success-light">
                            Reativar membro
                          </button>
                        )}
                        {user.role === "admin" && canDo("member.remove") && m.id !== user.id && (
                          <button onClick={() => setPendingAction({ member: m, action: "hard_delete" })} className="w-full text-left rounded-lg px-3 py-2 text-[13px] text-danger hover:bg-danger-light">
                            Excluir permanentemente
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {pendingAction && (
        <ConfirmDialog
          title={
            pendingAction.action === "reactivate"
              ? "Reativar membro"
              : pendingAction.action === "hard_delete"
              ? "Excluir membro permanentemente"
              : "Desativar membro"
          }
          message={
            pendingAction.action === "reactivate"
              ? `Você está prestes a reativar <strong>${pendingAction.member.name}</strong>.`
              : pendingAction.action === "hard_delete"
              ? `Esta ação excluirá <strong>${pendingAction.member.name}</strong> e dados relacionados de forma permanente.`
              : `Você está prestes a desativar <strong>${pendingAction.member.name}</strong>.`
          }
          confirmLabel={
            pendingAction.action === "reactivate"
              ? "Reativar"
              : pendingAction.action === "hard_delete"
              ? "Excluir permanentemente"
              : "Desativar"
          }
          variant={pendingAction.action === "reactivate" ? "success" : "danger"}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void changeMemberState(pendingAction.member, pendingAction.action)}
        />
      )}
    </div>
  );
}
