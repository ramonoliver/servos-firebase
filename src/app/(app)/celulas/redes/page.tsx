"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { Avatar, ConfirmDialog, Modal, MultiSelect, PageShell, PageHeader } from "@/components/ui";
import type { MultiSelectOption } from "@/components/ui";
import { fetchCells, saveNetwork } from "@/lib/cells/client";
import type { Cell, CellNetwork } from "@/lib/cells/types";
import type { User } from "@/types";

type ModalState = null | { type: "form"; network?: CellNetwork } | { type: "delete"; network: CellNetwork };

export default function RedesPage() {
  const { user, toast } = useApp();
  const canManage =
    user.role === "admin" || user.cell_role === "pastor" || user.cell_role === "coordenacao";

  const [networks, setNetworks] = useState<CellNetwork[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: usersData }, data] = await Promise.all([
        supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
        fetchCells(),
      ]);
      setMembers((usersData || []) as User[]);
      setNetworks(data.networks);
      setCells(data.cells);
    } catch (error) {
      console.warn("Falha ao carregar redes:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user.church_id]);

  const memberById = useMemo(() => {
    const map = new Map<string, User>();
    members.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  function cellCount(networkId: string) {
    return cells.filter((c) => c.network_id === networkId).length;
  }

  async function remove(network: CellNetwork) {
    try {
      await saveNetwork({ mode: "delete", networkId: network.id });
      toast(`${network.name} removida.`);
      setModal(null);
      await loadData();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao remover rede.");
    }
  }

  if (!canManage) {
    return (
      <PageShell>
        <PageHeader eyebrow="Pessoas & Cuidado" title="Redes & Setores" subtitle="Organização de células por supervisão." />
        <div className="rounded-[18px] border border-border-soft bg-white/70 px-6 py-12 text-center backdrop-blur">
          <p className="text-sm font-semibold text-ink">Acesso restrito</p>
          <p className="mt-1 text-sm text-ink-muted">Apenas admin, pastor ou coordenação podem gerenciar redes.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Pessoas & Cuidado"
        title="Redes & Setores"
        subtitle="Agrupe células por supervisão. Cada rede tem supervisor(es) que enxergam todas as suas células."
        actions={
          <div className="flex gap-2">
            <Link href="/celulas" className="btn btn-secondary btn-sm">Células</Link>
            <button onClick={() => setModal({ type: "form" })} className="btn btn-primary btn-sm">+ Nova rede</button>
          </div>
        }
      />

      {loading ? (
        <div className="py-12 text-center text-sm text-ink-faint">Carregando redes...</div>
      ) : networks.length === 0 ? (
        <div className="rounded-[18px] border border-border-soft bg-white/70 px-6 py-12 text-center backdrop-blur">
          <p className="text-sm font-semibold text-ink">Nenhuma rede cadastrada</p>
          <p className="mt-1 text-sm text-ink-muted">Crie a primeira rede/setor para organizar a supervisão.</p>
          <button onClick={() => setModal({ type: "form" })} className="mt-4 btn btn-primary btn-sm">+ Nova rede</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {networks.map((net) => {
            const supervisors = (net.supervisor_ids || []).map((id) => memberById.get(id)).filter(Boolean) as User[];
            return (
              <div key={net.id} className="rounded-[18px] border border-border-soft bg-white/70 p-4 shadow-soft backdrop-blur">
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-3 w-3 flex-shrink-0 rounded-full" style={{ background: net.color }} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-[16px] font-bold text-ink truncate">{net.name}</h3>
                    {net.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-muted">{net.description}</p>}
                  </div>
                  <span className="flex-shrink-0 rounded-full bg-surface-alt px-2.5 py-1 text-[10px] font-bold text-ink-muted">
                    {cellCount(net.id)} célula{cellCount(net.id) === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint">Supervisão</div>
                  {supervisors.length === 0 ? (
                    <p className="text-xs text-ink-faint">Sem supervisor definido</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {supervisors.map((s) => (
                        <div key={s.id} className="flex items-center gap-1.5 rounded-full bg-surface-alt px-2 py-1">
                          <Avatar name={s.name} color={s.avatar_color} photoUrl={s.photo_url} size={20} />
                          <span className="text-[11px] font-semibold text-ink">{s.name.split(" ")[0]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex gap-2 border-t border-border-soft pt-3">
                  <button onClick={() => setModal({ type: "form", network: net })} className="btn btn-secondary btn-sm flex-1">Editar</button>
                  <button onClick={() => setModal({ type: "delete", network: net })} className="btn btn-danger btn-sm">Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal?.type === "form" && (
        <NetworkForm
          network={modal.network}
          members={members}
          toast={toast}
          close={() => setModal(null)}
          onSaved={async () => { setModal(null); await loadData(); }}
        />
      )}

      {modal?.type === "delete" && (
        <ConfirmDialog
          title="Excluir rede"
          message={`Excluir <strong>${modal.network.name}</strong>? As células dela ficam sem rede (não são apagadas).`}
          confirmLabel="Excluir"
          onCancel={() => setModal(null)}
          onConfirm={() => void remove(modal.network)}
        />
      )}
    </PageShell>
  );
}

const COLORS = ["#9B8CFB", "#FF6B57", "#38BDF0", "#2DD4A7", "#FFC24B", "#FB7199"];

function NetworkForm({
  network,
  members,
  toast,
  close,
  onSaved,
}: {
  network?: CellNetwork;
  members: User[];
  toast: (msg: string) => void;
  close: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!network;
  const [name, setName] = useState(network?.name || "");
  const [description, setDescription] = useState(network?.description || "");
  const [color, setColor] = useState(network?.color || COLORS[0]);
  const [supervisorIds, setSupervisorIds] = useState<string[]>(network?.supervisor_ids || []);
  const [saving, setSaving] = useState(false);

  const options: MultiSelectOption[] = members.map((m) => ({
    id: m.id,
    label: m.name,
    sublabel: m.role === "admin" ? "Admin" : m.role === "leader" ? "Líder" : "Membro",
    avatarColor: m.avatar_color,
  }));

  function addSpouses() {
    const spouses = supervisorIds
      .map((id) => members.find((m) => m.id === id)?.spouse_id)
      .filter((s): s is string => !!s);
    if (!spouses.length) {
      toast("Nenhum cônjuge cadastrado.");
      return;
    }
    setSupervisorIds(Array.from(new Set([...supervisorIds, ...spouses])));
  }

  async function submit() {
    if (!name.trim()) {
      toast("Informe o nome da rede.");
      return;
    }
    setSaving(true);
    try {
      await saveNetwork({
        mode: isEdit ? "update" : "create",
        networkId: network?.id,
        data: { name: name.trim(), description, color, supervisor_ids: supervisorIds },
      });
      toast(isEdit ? "Rede atualizada!" : "Rede criada!");
      onSaved();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao salvar rede.");
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? "Editar rede" : "Nova rede/setor"}
      close={close}
      width={480}
      footer={
        <>
          <button onClick={close} className="btn btn-secondary">Cancelar</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary">{saving ? "Salvando..." : isEdit ? "Salvar" : "Criar"}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="input-label">Nome</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Rede Norte" autoFocus />
        </div>
        <div>
          <label className="input-label">Descrição</label>
          <textarea className="input-field min-h-[52px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sobre a rede/setor..." />
        </div>
        <div>
          <label className="input-label">Cor</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`h-8 w-8 rounded-full border-2 transition ${color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} aria-label={c} />
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="input-label">Supervisor(es)</label>
            <button type="button" onClick={addSpouses} className="text-[11px] font-bold text-brand-deep hover:text-brand">+ Incluir cônjuge</button>
          </div>
          <MultiSelect options={options} selected={supervisorIds} onChange={setSupervisorIds} placeholder="Selecionar supervisor(es)... (casal pode ser os dois)" />
        </div>
      </div>
    </Modal>
  );
}
