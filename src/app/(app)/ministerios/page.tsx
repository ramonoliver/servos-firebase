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
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);

    const [{ data: usersData, error: usersError }, { data: dmData, error: dmError }] =
      await Promise.all([
        supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
        supabase.from("department_members").select("*"),
      ]);

    if (usersError || dmError) {
      console.error({ usersError, dmError });
      toast("Erro ao carregar ministérios.");
      setLoading(false);
      return;
    }

    setMembers((usersData || []) as User[]);
    setAllDM((dmData || []) as DepartmentMember[]);
    setLoading(false);
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
        subtitle={`${departments.length} ministério${departments.length === 1 ? "" : "s"} cadastrado${departments.length === 1 ? "" : "s"}`}
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
      ) : departments.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-faint">Nenhum ministério cadastrado.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => {
            const count = allDM.filter((dm) => dm.department_id === d.id).length;
            const leaderNames = (d.leader_ids || [])
              .map((id) => members.find((m) => m.id === id)?.name?.split(" ")[0])
              .filter(Boolean);

            return (
              <div
                key={d.id}
                className="group relative flex flex-col rounded-[18px] border border-border-soft bg-white/70 p-5 shadow-soft backdrop-blur transition-all hover:border-white hover:bg-white/85 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
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
                  
                  {(canDo("department.edit", d.id) || canDo("department.delete")) && (
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {canDo("department.edit", d.id) && (
                        <button
                          onClick={() => setModal({ type: "form", dept: d })}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-alt shadow-sm text-xs text-ink transition hover:bg-white"
                          title="Editar ministério"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                      )}
                      {canDo("department.delete") && (
                        <button
                          onClick={() => setModal({ type: "delete", dept: d })}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-alt shadow-sm text-danger transition hover:bg-danger-light"
                          title="Excluir ministério"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <Link href={`/ministerios/${d.id}`} className="flex-1 mt-3 flex flex-col">
                  {d.description && (
                    <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted mb-4">{d.description}</p>
                  )}
                  
                  {d.function_names?.length > 0 && (
                    <div className="mt-auto">
                       <div className="flex flex-wrap gap-1.5">
                        {d.function_names.slice(0, 3).map((fn) => (
                          <span key={fn} className="badge badge-secondary text-[11px] px-2 py-0.5">{fn}</span>
                        ))}
                        {d.function_names.length > 3 && (
                          <span className="text-[11px] font-semibold text-ink-faint self-center">+{d.function_names.length - 3}</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-border-soft flex items-center justify-between">
                    {leaderNames.length > 0 ? (() => {
                      const firstLeader = (d.leader_ids || [])[0] ? members.find((m) => m.id === d.leader_ids[0]) : null;
                      const extraLeaders = Math.max((d.leader_ids?.length || 0) - 1, 0);
                      return firstLeader ? (
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar name={firstLeader.name} color={firstLeader.avatar_color} photoUrl={firstLeader.photo_url} size={28} />
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-semibold text-ink">
                              {firstLeader.name.split(" ")[0]}{extraLeaders > 0 ? ` +${extraLeaders}` : ""}
                            </div>
                            <div className="text-[10px] text-ink-faint">{d.leader_ids.length > 1 ? "Líderes" : "Líder"}</div>
                          </div>
                        </div>
                      ) : <span className="text-[12px] text-ink-faint">Sem líder definido</span>;
                    })() : (
                      <span className="text-[12px] text-ink-faint">Sem líder definido</span>
                    )}
                    
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-brand-deep bg-brand-light/50 px-2 py-1 rounded-full transition-colors hover:bg-brand-light">
                      Ver detalhes <span aria-hidden>&rarr;</span>
                    </span>
                  </div>
                </Link>
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
