"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { Avatar, PageHeader, PageShell, SkeletonList } from "@/components/ui";
import { getPersonRoles, ROLE_LABELS, type BusinessRole } from "@/lib/auth/person-roles";
import type { Department, User } from "@/types";
import type { Cell, CellMemberRow, CellNetwork } from "@/lib/cells/types";

// Servos 2.0 — Perfis e permissões (real). Materializa o modelo canônico de
// papéis (getPersonRoles): explica como cada papel é derivado, o que pode, e
// mostra as pessoas agrupadas por papel principal. Substitui o stub mock.

const ROLE_REFERENCE: { role: BusinessRole; how: string; can: string }[] = [
  { role: "admin", how: "papel de sistema = admin", can: "Acesso total: configurações, pessoas, escalas, células, kids, relatórios e permissões." },
  { role: "pastor", how: "cell_role = pastor", can: "Visão pastoral em toda a igreja: pessoas, células, cuidado, escalas, comunicados e relatórios (tudo, exceto configurações da igreja)." },
  { role: "coordenacao", how: "cell_role = coordenação", can: "Mesmo alcance pastoral, no nível de coordenação de células." },
  { role: "supervisor", how: "supervisiona uma rede de células", can: "Acompanha as células e pessoas da sua rede; vê relatórios." },
  { role: "lider_celula", how: "lidera uma célula", can: "Cuida da sua célula: membros, reuniões, presença, pedidos e cuidado; vê relatórios da célula." },
  { role: "lider_ministerio", how: "lidera um ministério", can: "Monta e publica escalas, gerencia a equipe e comunica seu ministério." },
  { role: "voluntario", how: "membro vinculado a um ministério", can: "Confirma escalas, registra disponibilidade e acompanha sua célula." },
  { role: "membro", how: "membro com célula, sem ministério", can: "Acompanha a agenda, sua célula e oportunidades de servir." },
  { role: "conexao", how: "sem célula e sem ministério", can: "Onboarding: encontrar célula, conhecer ministérios e completar o cadastro." },
];

const ROLE_ORDER: BusinessRole[] = [
  "admin", "pastor", "coordenacao", "supervisor", "lider_celula", "lider_ministerio", "voluntario", "membro", "conexao",
];

export default function PerfisPermissoesPage() {
  const { user, roles, departments } = useApp();
  const [people, setPeople] = useState<User[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [networks, setNetworks] = useState<CellNetwork[]>([]);
  const [cellMembers, setCellMembers] = useState<CellMemberRow[]>([]);
  const [dms, setDms] = useState<Array<{ user_id: string; department_id: string }>>([]);
  const [loading, setLoading] = useState(true);

  const departmentIds = useMemo(() => departments.map((d) => d.id), [departments]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: usersData }, cellsRes, { data: dmData }] = await Promise.all([
        supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
        fetch("/api/cells/list", { method: "POST", credentials: "include" }).catch(() => null),
        departmentIds.length
          ? supabase.from("department_members").select("user_id, department_id").in("department_id", departmentIds)
          : Promise.resolve({ data: [] as Array<{ user_id: string; department_id: string }> }),
      ]);
      const cellsPayload = cellsRes ? await cellsRes.json().catch(() => null) : null;
      if (cancelled) return;
      setPeople((usersData || []) as User[]);
      setCells((cellsPayload?.cells || []) as Cell[]);
      setNetworks((cellsPayload?.networks || []) as CellNetwork[]);
      setCellMembers((cellsPayload?.cellMembers || []) as CellMemberRow[]);
      setDms((dmData || []) as Array<{ user_id: string; department_id: string }>);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user.church_id, departmentIds]);

  // Agrupa pessoas pelo papel principal (fonte única: getPersonRoles).
  const peopleByRole = useMemo(() => {
    const dmByUser = new Map<string, string[]>();
    dms.forEach((d) => dmByUser.set(d.user_id, [...(dmByUser.get(d.user_id) || []), d.department_id]));
    const cellByUser = new Map<string, string[]>();
    cellMembers.forEach((c) => cellByUser.set(c.user_id, [...(cellByUser.get(c.user_id) || []), c.cell_id]));

    const groups = new Map<BusinessRole, User[]>();
    people.forEach((p) => {
      const r = getPersonRoles(p, {
        cells,
        networks,
        departments,
        memberDepartmentIds: dmByUser.get(p.id) || [],
        memberCellIds: cellByUser.get(p.id) || (p.cell_id ? [p.cell_id] : []),
      });
      groups.set(r.primaryRole, [...(groups.get(r.primaryRole) || []), p]);
    });
    return groups;
  }, [people, cells, networks, departments, dms, cellMembers]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Administração"
        title="Perfis e permissões"
        subtitle="Os papéis no Servos são derivados automaticamente dos vínculos da pessoa — não há configuração manual a manter."
      />

      {/* Seu acesso */}
      <div className="rounded-[20px] border border-border-soft bg-white/70 p-5 shadow-soft backdrop-blur">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint">Seu acesso</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Avatar name={user.name} color={user.avatar_color} photoUrl={user.photo_url} size={36} />
          <span className="text-[15px] font-bold text-ink">{user.name}</span>
          {roles.businessRoles.map((r) => (
            <span
              key={r}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                r === roles.primaryRole ? "bg-brand-light text-brand-deep" : "bg-surface-alt text-ink-muted"
              }`}
            >
              {ROLE_LABELS[r]}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-ink-muted">
          Lidera {roles.scopes.ledDepartmentIds.length} ministério(s) e {roles.scopes.ledCellIds.length} célula(s)
          {roles.scopes.supervisedNetworkIds.length > 0 ? `, supervisiona ${roles.scopes.supervisedNetworkIds.length} rede(s)` : ""}.
        </p>
      </div>

      {/* Referência de papéis */}
      <div>
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint">Perfis e o que cada um faz</div>
        <div className="grid gap-3 md:grid-cols-2">
          {ROLE_REFERENCE.map((ref) => {
            const count = peopleByRole.get(ref.role)?.length || 0;
            return (
              <div key={ref.role} className="rounded-[18px] border border-border-soft bg-white/70 p-4 shadow-soft backdrop-blur">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-[15px] font-bold text-ink">{ROLE_LABELS[ref.role]}</h3>
                  {!loading && (
                    <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-bold text-ink-muted">{count}</span>
                  )}
                </div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-deep">{ref.how}</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">{ref.can}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pessoas por papel */}
      <div>
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint">Pessoas por papel</div>
        {loading ? (
          <SkeletonList rows={4} />
        ) : (
          <div className="space-y-3">
            {ROLE_ORDER.filter((r) => (peopleByRole.get(r)?.length || 0) > 0).map((r) => {
              const list = peopleByRole.get(r) || [];
              return (
                <div key={r} className="rounded-[18px] border border-border-soft bg-white/70 p-4 shadow-soft backdrop-blur">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="font-display text-[14px] font-bold text-ink">{ROLE_LABELS[r]}</span>
                    <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] font-bold text-ink-muted">{list.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {list.map((p) => (
                      <Link
                        key={p.id}
                        href={`/pessoas/${p.id}`}
                        className="flex items-center gap-2 rounded-full border border-border-soft bg-white/60 py-1 pl-1 pr-3 transition hover:border-ink-ghost hover:bg-white"
                      >
                        <Avatar name={p.name} color={p.avatar_color} photoUrl={p.photo_url} size={26} />
                        <span className="text-[12px] font-semibold text-ink">{p.name.split(" ")[0]}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
