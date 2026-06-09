"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { getIconEmoji, getInitials } from "@/lib/utils/helpers";
import { ConfirmDialog, Modal, MultiSelect, PageShell, PageHeader, Avatar } from "@/components/ui";
import type { MultiSelectOption } from "@/components/ui";
import Link from "next/link";
import type { Department, User, DepartmentMember } from "@/types";
import { DeptForm } from "@/components/shared/dept-form";

const ICONS = ["music", "camera", "heart", "church", "cross", "flower", "flame", "star", "book", "baby", "pray"];

export default function MinisteriosPage() {
  const { user, toast, canDo, departments, refresh } = useApp();

  const [modal, setModal] = useState<
    null | { type: "form"; dept?: Department } | { type: "delete"; dept: Department }
  >(null);

  const [members, setMembers] = useState<User[]>([]);
  const [allDM, setAllDM] = useState<DepartmentMember[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [interested, setInterested] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);

    const [{ data: usersData, error: usersError }, { data: dmData, error: dmError }, { data: deptData, error: deptError }] =
      await Promise.all([
        supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
        supabase.from("department_members").select("*"),
        // Todos os ministérios da igreja (para descoberta — não só os que o usuário lidera).
        supabase.from("departments").select("*").eq("church_id", user.church_id).order("created_at", { ascending: false }),
      ]);

    if (usersError || dmError || deptError) {
      console.error({ usersError, dmError, deptError });
      toast("Erro ao carregar ministérios.");
      setLoading(false);
      return;
    }

    setMembers((usersData || []) as User[]);
    setAllDM((dmData || []) as DepartmentMember[]);
    setAllDepartments((deptData || []) as Department[]);
    setLoading(false);
  }

  async function sendInterest(departmentId: string) {
    try {
      const res = await fetch("/api/ministries/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Erro ao enviar interesse.");
        return;
      }
      setInterested((prev) => new Set(prev).add(departmentId));
      toast(data?.warning || "Interesse enviado à liderança! 🙌");
    } catch {
      toast("Erro ao enviar interesse.");
    }
  }

  useEffect(() => {
    loadData();
  }, [user.church_id]);

  async function deleteDept(d: Department) {
    try {
      const response = await fetch("/api/departments/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "delete",
          departmentId: d.id,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("Erro ao excluir ministério:", data);
        toast(data?.error || "Erro ao excluir ministério.");
        return;
      }

      toast(d.name + " excluido.");
      setModal(null);
      await refresh();
      await loadData();
    } catch (error) {
      console.error("Erro ao excluir ministério:", error);
      toast("Erro ao excluir ministério.");
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Serviço"
        title="Ministérios"
        subtitle={`${allDepartments.length} ministério${allDepartments.length === 1 ? "" : "s"} na igreja`}
        actions={
          canDo("department.create") && (
            <button onClick={() => setModal({ type: "form" })} className="btn btn-primary btn-sm">
              + Novo
            </button>
          )
        }
      />

      {loading ? (
        <div className="py-12 text-center text-sm text-ink-faint">Carregando ministérios...</div>
      ) : allDepartments.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-faint">Nenhum ministério cadastrado.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {allDepartments.map((d) => {
            const count = allDM.filter((dm) => dm.department_id === d.id).length;
            const firstLeader = (d.leader_ids || [])[0] ? members.find((m) => m.id === d.leader_ids[0]) : null;
            const extraLeaders = Math.max((d.leader_ids?.length || 0) - 1, 0);
            const isMemberOfDept = allDM.some((dm) => dm.department_id === d.id && dm.user_id === user.id);
            const canManageThis = canDo("department.edit", d.id) || canDo("department.delete");

            return (
              <div
                key={d.id}
                className="group flex flex-col rounded-[18px] border border-border-soft bg-white/70 p-4 shadow-soft backdrop-blur transition-all hover:border-white hover:bg-white/85 hover:shadow-lift"
              >
                {/* Header: ícone + nome + status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-[22px] shadow-sm"
                      style={{ background: d.color + "15", color: d.color, border: `1px solid ${d.color}30` }}
                    >
                      {getIconEmoji(d.icon)}
                    </div>
                    <div className="min-w-0">
                      <Link href={`/ministerios/${d.id}`} className="block truncate font-display text-[16px] font-bold text-ink transition-colors hover:text-brand-deep">
                        {d.name}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {count} {count === 1 ? "membro" : "membros"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      d.active === false ? "bg-danger-light text-danger" : "bg-success-light text-success"
                    }`}
                  >
                    {d.active === false ? "Inativo" : "Ativo"}
                  </span>
                </div>

                {/* Descrição */}
                {d.description && (
                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">{d.description}</p>
                )}

                {/* Funções */}
                {d.function_names?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {d.function_names.slice(0, 3).map((fn) => (
                      <span key={fn} className="badge badge-secondary text-[11px] px-2 py-0.5">{fn}</span>
                    ))}
                    {d.function_names.length > 3 && (
                      <span className="self-center text-[11px] font-semibold text-ink-faint">+{d.function_names.length - 3}</span>
                    )}
                  </div>
                )}

                {/* Liderança */}
                <div className="mt-3 flex items-center justify-between gap-3">
                  {firstLeader ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={firstLeader.name} color={firstLeader.avatar_color} photoUrl={firstLeader.photo_url} size={28} />
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold text-ink">
                          {firstLeader.name.split(" ")[0]}{extraLeaders > 0 ? ` +${extraLeaders}` : ""}
                        </div>
                        <div className="text-[10px] text-ink-faint">{(d.leader_ids?.length || 0) > 1 ? "Líderes" : "Líder"}</div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[12px] text-ink-faint">Sem líder</span>
                  )}
                </div>

                {/* Footer: ações */}
                <div className="mt-3 flex gap-2 border-t border-border-soft pt-3">
                  {canManageThis || isMemberOfDept ? (
                    <>
                      <Link
                        href={`/ministerios/${d.id}`}
                        className="btn btn-primary btn-sm flex flex-1 items-center justify-center gap-1.5"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
                        Ver detalhes
                      </Link>
                      {canDo("department.edit", d.id) && (
                        <button onClick={() => setModal({ type: "form", dept: d })} className="btn btn-secondary btn-sm flex items-center gap-1" title="Editar ministério">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                      )}
                      {canDo("department.delete") && (
                        <button onClick={() => setModal({ type: "delete", dept: d })} className="btn btn-danger btn-sm flex items-center gap-1" title="Excluir ministério">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      )}
                    </>
                  ) : (
                    // Não participa: sem acesso ao detalhe, apenas demonstra interesse.
                    <button
                      onClick={() => sendInterest(d.id)}
                      disabled={interested.has(d.id)}
                      className="btn btn-primary btn-sm flex flex-1 items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      {interested.has(d.id) ? "Interesse enviado ✓" : "Tenho interesse"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal?.type === "form" && (
        <DeptForm
          dept={(modal as any).dept}
          members={members}
          user={user}
          toast={toast}
          close={() => setModal(null)}
          allDM={allDM}
          onSaved={async () => {
            setModal(null);
            await refresh();
            await loadData();
          }}
        />
      )}

      {modal?.type === "delete" && (
        <ConfirmDialog
          title="Excluir ministério"
          message={`Você está prestes a excluir <strong>${modal.dept.name}</strong>.`}
          confirmLabel="Excluir"
          onCancel={() => setModal(null)}
          onConfirm={() => void deleteDept(modal.dept)}
        />
      )}
    </PageShell>
  );
}
