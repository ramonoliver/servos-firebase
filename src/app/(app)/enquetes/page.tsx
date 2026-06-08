"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { ConfirmDialog, EmptyState, Modal, PageHeader, PageShell, SkeletonList } from "@/components/ui";

// Servos 2.0 — Enquetes reais. Criar, votar (1 voto por pessoa) e ver apuração.
type Poll = {
  id: string;
  author_id: string;
  question: string;
  options: string[];
  status: "open" | "closed" | string;
  created_at: string;
};

export default function EnquetesPage() {
  const { user, canDo, toast } = useApp();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [tallies, setTallies] = useState<Record<string, number[]>>({});
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [question, setQuestion] = useState("");
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [deleting, setDeleting] = useState<Poll | null>(null);

  const canCreate = canDo("message.send");

  async function load() {
    const res = await fetch("/api/polls/list", { method: "POST", credentials: "include" });
    const data = await res.json().catch(() => null);
    setPolls((data?.polls || []) as Poll[]);
    setTallies(data?.tallies || {});
    setMyVotes(data?.myVotes || {});
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function vote(pollId: string, optionIndex: number) {
    // otimista
    setMyVotes((m) => ({ ...m, [pollId]: optionIndex }));
    const res = await fetch("/api/polls/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pollId, optionIndex }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      toast(d?.error || "Erro ao votar.");
    }
    await load();
  }

  async function createPoll() {
    const cleanOpts = opts.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOpts.length < 2) {
      toast("Informe a pergunta e ao menos 2 opções.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/polls/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "create", question, options: cleanOpts }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Erro ao criar enquete.");
        return;
      }
      toast("Enquete criada!");
      setOpen(false);
      setQuestion("");
      setOpts(["", ""]);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function manage(pollId: string, mode: "close" | "reopen" | "delete") {
    const res = await fetch("/api/polls/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, pollId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast(data?.error || "Erro ao atualizar enquete.");
      return;
    }
    setDeleting(null);
    await load();
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Comunicação"
        title="Enquetes"
        subtitle="Perguntas simples para ouvir pessoas e equipes — um voto por pessoa, apuração em tempo real."
        actions={
          canCreate && (
            <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
              + Nova enquete
            </button>
          )
        }
      />

      {loading ? (
        <SkeletonList rows={3} />
      ) : polls.length === 0 ? (
        <EmptyState
          icon="🗳️"
          title="Nenhuma enquete ainda"
          description="Crie uma pergunta rápida para ouvir a igreja, um ministério ou uma equipe."
          action={
            canCreate ? (
              <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
                + Nova enquete
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {polls.map((poll) => {
            const counts = tallies[poll.id] || poll.options.map(() => 0);
            const total = counts.reduce((s, n) => s + n, 0);
            const myVote = myVotes[poll.id];
            const hasVoted = myVote !== undefined;
            const isClosed = poll.status !== "open";
            const showResults = hasVoted || isClosed;
            const canManage = poll.author_id === user.id || user.role === "admin" || user.cell_role === "pastor";
            return (
              <div key={poll.id} className="flex flex-col rounded-[20px] border border-border-soft bg-white/70 p-5 shadow-soft backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-[16px] font-bold leading-tight text-ink">{poll.question}</h2>
                  {isClosed && (
                    <span className="flex-shrink-0 rounded-full bg-surface-alt px-2.5 py-1 text-[10px] font-bold text-ink-muted">Encerrada</span>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  {poll.options.map((opt, i) => {
                    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
                    const mine = myVote === i;
                    if (showResults) {
                      return (
                        <div key={i} className={`relative overflow-hidden rounded-[12px] border p-2.5 ${mine ? "border-brand" : "border-border-soft"}`}>
                          <div className="absolute inset-y-0 left-0 bg-brand-light" style={{ width: `${pct}%` }} />
                          <div className="relative flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-ink">{opt}{mine ? " ✓" : ""}</span>
                            <span className="text-[12px] font-bold text-ink-muted">{pct}%</span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => vote(poll.id, i)}
                        className="w-full rounded-[12px] border border-border-soft bg-white px-3 py-2.5 text-left text-[13px] font-semibold text-ink transition hover:border-brand hover:bg-brand-light/40"
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-ink-faint">{total} {total === 1 ? "voto" : "votos"}</span>
                  {canManage && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => manage(poll.id, isClosed ? "reopen" : "close")}
                        className="rounded-full px-2 py-1 text-[11px] font-semibold text-ink-muted transition hover:bg-surface-alt hover:text-ink"
                      >
                        {isClosed ? "Reabrir" : "Encerrar"}
                      </button>
                      <button
                        onClick={() => setDeleting(poll)}
                        className="rounded-full px-2 py-1 text-[11px] font-semibold text-danger transition hover:bg-danger-light"
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <Modal
          title="Nova enquete"
          close={() => setOpen(false)}
          width={460}
          footer={
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-primary btn-sm" onClick={createPoll} disabled={saving}>
                {saving ? "Criando…" : "Criar enquete"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="input-label">Pergunta</label>
              <input
                className="input-field"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ex: Qual o melhor horário para o ensaio?"
                maxLength={200}
              />
            </div>
            <div>
              <label className="input-label">Opções</label>
              <div className="space-y-2">
                {opts.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className="input-field"
                      value={o}
                      onChange={(e) => setOpts((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder={`Opção ${i + 1}`}
                      maxLength={120}
                    />
                    {opts.length > 2 && (
                      <button
                        onClick={() => setOpts((arr) => arr.filter((_, j) => j !== i))}
                        className="rounded-[12px] px-3 text-ink-faint transition hover:bg-danger-light hover:text-danger"
                        aria-label="Remover opção"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {opts.length < 8 && (
                <button
                  onClick={() => setOpts((arr) => [...arr, ""])}
                  className="mt-2 text-[12px] font-semibold text-brand-deep hover:underline"
                >
                  + Adicionar opção
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir enquete"
          message="Tem certeza? Os votos também serão removidos."
          confirmLabel="Excluir"
          onCancel={() => setDeleting(null)}
          onConfirm={() => void manage(deleting.id, "delete")}
        />
      )}
    </PageShell>
  );
}
