"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { PageHeader, PageShell } from "@/components/ui";
import { SoftCard } from "@/components/pastoral/pastoral-ui";
import type { Cell } from "@/lib/cells/types";

// Servos 2.0 — Comunicação real (Comunicados). Compõe e envia um comunicado
// segmentado (in-app + push) via /api/communications/send.

type Audience = "church" | "ministry" | "cell" | "birthdays" | "no_cell" | "no_ministry";

const AUDIENCE_META: Record<Audience, { label: string; hint: string }> = {
  church: { label: "Toda a igreja", hint: "Todos os membros ativos" },
  ministry: { label: "Um ministério", hint: "Voluntários de uma equipe" },
  cell: { label: "Uma célula", hint: "Membros de uma célula" },
  birthdays: { label: "Aniversariantes da semana", hint: "Quem faz aniversário em até 7 dias" },
  no_cell: { label: "Sem célula", hint: "Membros ainda não conectados a uma célula" },
  no_ministry: { label: "Sem ministério", hint: "Membros que ainda não servem" },
};

export default function ComunicacaoPage() {
  const { roles, departments, toast } = useApp();
  const [cells, setCells] = useState<Cell[]>([]);
  const [audience, setAudience] = useState<Audience>("ministry");
  const [departmentId, setDepartmentId] = useState("");
  const [cellId, setCellId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const isPastorAdmin =
    roles.businessRoles.includes("admin") ||
    roles.businessRoles.includes("pastor") ||
    roles.businessRoles.includes("coordenacao");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cells/list", { method: "POST", credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setCells((d?.cells || []) as Cell[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Alvos que o usuário pode escolher (admin/pastor = tudo; senão só o que lidera).
  const targetDepartments = useMemo(
    () => (isPastorAdmin ? departments : departments.filter((d) => roles.scopes.ledDepartmentIds.includes(d.id))),
    [isPastorAdmin, departments, roles.scopes.ledDepartmentIds]
  );
  const targetCells = useMemo(
    () => (isPastorAdmin ? cells : cells.filter((c) => roles.scopes.ledCellIds.includes(c.id))),
    [isPastorAdmin, cells, roles.scopes.ledCellIds]
  );

  const options = useMemo(() => {
    const opts: Audience[] = [];
    if (isPastorAdmin) opts.push("church");
    if (targetDepartments.length) opts.push("ministry");
    if (targetCells.length) opts.push("cell");
    if (isPastorAdmin) opts.push("birthdays", "no_cell", "no_ministry");
    return opts;
  }, [isPastorAdmin, targetDepartments.length, targetCells.length]);

  // Garante que a audiência selecionada é válida para o papel.
  useEffect(() => {
    if (options.length && !options.includes(audience)) setAudience(options[0]);
  }, [options, audience]);

  const canSend =
    !!title.trim() &&
    !!body.trim() &&
    (audience !== "ministry" || !!departmentId) &&
    (audience !== "cell" || !!cellId);

  async function send() {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await fetch("/api/communications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, departmentId: departmentId || undefined, cellId: cellId || undefined, title, body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Erro ao enviar comunicado.");
        return;
      }
      if (data?.sent === 0) {
        toast(data?.warning || "Nenhuma pessoa neste segmento.");
        return;
      }
      toast(`Comunicado enviado para ${data.sent} ${data.sent === 1 ? "pessoa" : "pessoas"}.`);
      setTitle("");
      setBody("");
    } catch {
      toast("Erro ao enviar comunicado.");
    } finally {
      setSending(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Comunicação"
        title="Comunicados"
        subtitle="Envie um aviso segmentado — chega como notificação no app (e push) para as pessoas certas."
      />

      {options.length === 0 ? (
        <SoftCard className="p-6 text-center text-sm text-ink-muted">
          Você ainda não lidera um ministério ou célula para enviar comunicados.
        </SoftCard>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr] lg:items-start">
          {/* Público */}
          <SoftCard className="p-4">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-faint">Para quem</div>
            <div className="space-y-2">
              {options.map((opt) => {
                const active = audience === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setAudience(opt)}
                    className={`w-full rounded-[14px] border p-3 text-left transition ${
                      active ? "border-brand bg-brand-light/60" : "border-border-soft bg-white/60 hover:bg-surface-alt"
                    }`}
                  >
                    <div className={`text-[13px] font-bold ${active ? "text-brand-deep" : "text-ink"}`}>{AUDIENCE_META[opt].label}</div>
                    <div className="text-[11px] text-ink-faint">{AUDIENCE_META[opt].hint}</div>
                  </button>
                );
              })}
            </div>

            {audience === "ministry" && (
              <div className="mt-3">
                <label className="input-label">Ministério</label>
                <select className="input-field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {targetDepartments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
            {audience === "cell" && (
              <div className="mt-3">
                <label className="input-label">Célula</label>
                <select className="input-field" value={cellId} onChange={(e) => setCellId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {targetCells.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </SoftCard>

          {/* Mensagem */}
          <SoftCard className="p-5">
            <div className="space-y-4">
              <div>
                <label className="input-label">Título</label>
                <input
                  className="input-field"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Ensaio de domingo confirmado"
                  maxLength={120}
                />
              </div>
              <div>
                <label className="input-label">Mensagem</label>
                <textarea
                  className="input-field min-h-[160px]"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Escreva o comunicado…"
                  maxLength={2000}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] text-ink-faint">Chega como notificação no app e push (para quem habilitou).</p>
                <button className="btn btn-primary" disabled={!canSend || sending} onClick={send}>
                  {sending ? "Enviando…" : "Enviar comunicado"}
                </button>
              </div>
            </div>
          </SoftCard>
        </div>
      )}
    </PageShell>
  );
}
