"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { Avatar, EmptyState, Modal, PageHeader, PageShell, SkeletonList } from "@/components/ui";
import { CARE_TYPES, careType, CARE_TONE_CLASSES, formatCareDate } from "@/lib/care/types";
import type { User } from "@/types";

// Servos 2.0 — Cuidado real (Fase 2, passo 5). Lê pastoral_notes de verdade
// (client-side, como o dashboard) usando a taxonomia real (CARE_TYPES),
// substituindo a versão em dados mock. Inclui CTA para registrar cuidado.
type PastoralNote = {
  id: string;
  person_id: string;
  author_id?: string | null;
  type: string;
  title?: string;
  description?: string;
  date: string;
  created_at?: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function AcompanhamentosPage() {
  const { user, toast } = useApp();
  const [notes, setNotes] = useState<PastoralNote[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ personId: "", type: "care", title: "", description: "", date: todayIso() });

  // Espelha o servidor (/api/care/manage bloqueia role === "member").
  const canRegister = user.role !== "member";

  async function loadNotes() {
    const { data } = await supabase
      .from("pastoral_notes")
      .select("*")
      .eq("church_id", user.church_id)
      .order("date", { ascending: false });
    setNotes((data || []) as PastoralNote[]);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: notesData }, { data: usersData }] = await Promise.all([
        supabase
          .from("pastoral_notes")
          .select("*")
          .eq("church_id", user.church_id)
          .order("date", { ascending: false }),
        supabase.from("users").select("*").eq("church_id", user.church_id).eq("active", true),
      ]);
      if (cancelled) return;
      setNotes((notesData || []) as PastoralNote[]);
      setPeople(((usersData || []) as User[]).slice().sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user.church_id]);

  const peopleById = useMemo(() => {
    const map = new Map<string, User>();
    people.forEach((p) => map.set(p.id, p));
    return map;
  }, [people]);

  const filtered = useMemo(
    () => notes.filter((n) => typeFilter === "all" || n.type === typeFilter),
    [notes, typeFilter]
  );

  function openNew() {
    setForm({ personId: "", type: "care", title: "", description: "", date: todayIso() });
    setOpen(true);
  }

  async function submit() {
    if (!form.personId) {
      toast("Selecione a pessoa.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/care/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          personId: form.personId,
          data: { type: form.type, title: form.title, description: form.description, date: form.date },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Erro ao registrar cuidado.");
        return;
      }
      toast("Cuidado registrado com sucesso!");
      setOpen(false);
      await loadNotes();
    } catch {
      toast("Erro ao registrar cuidado.");
    } finally {
      setSaving(false);
    }
  }

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
      active ? "bg-brand text-white shadow-soft" : "bg-white/70 text-ink-muted hover:bg-surface-alt"
    }`;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Cuidado"
        title="Acompanhamentos"
        subtitle="Histórico pastoral registrado para cada pessoa — visitas, ligações, oração e acompanhamento."
        actions={
          canRegister && (
            <button className="btn btn-primary btn-sm" onClick={openNew}>
              + Novo
            </button>
          )
        }
      />

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTypeFilter("all")} className={chip(typeFilter === "all")}>
          Todos
        </button>
        {CARE_TYPES.map((t) => (
          <button key={t.value} onClick={() => setTypeFilter(t.value)} className={chip(typeFilter === t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🤍"
          title={notes.length === 0 ? "Nenhum cuidado registrado ainda" : "Nada neste filtro"}
          description={
            notes.length === 0
              ? "Registre visitas, ligações e acompanhamentos pastorais — eles aparecem aqui."
              : "Tente outro tipo de cuidado."
          }
          action={
            notes.length === 0 && canRegister ? (
              <button className="btn btn-primary btn-sm" onClick={openNew}>
                + Registrar cuidado
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((note) => {
            const person = peopleById.get(note.person_id);
            const t = careType(note.type);
            return (
              <Link
                key={note.id}
                href={`/pessoas/${note.person_id}`}
                className="flex items-start gap-3 rounded-[18px] border border-border-soft bg-white/70 p-4 shadow-soft backdrop-blur transition hover:border-ink-ghost hover:bg-white hover:shadow-lift"
              >
                <Avatar
                  name={person?.name || "Pessoa"}
                  color={person?.avatar_color || "#FF6B57"}
                  photoUrl={person?.photo_url}
                  size={42}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-bold text-ink">{person?.name || "Pessoa"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CARE_TONE_CLASSES[t.tone]}`}>
                      {t.label}
                    </span>
                    <span className="text-[11px] text-ink-faint">{formatCareDate(note.date)}</span>
                  </div>
                  {note.title && <div className="mt-1 text-[13px] font-semibold text-ink">{note.title}</div>}
                  {note.description && (
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">{note.description}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {open && (
        <Modal
          title="Registrar cuidado"
          close={() => setOpen(false)}
          width={440}
          footer={
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-primary btn-sm" onClick={submit} disabled={saving}>
                {saving ? "Salvando..." : "Registrar"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="input-label">Pessoa</label>
              <select
                className="input-field"
                value={form.personId}
                onChange={(e) => setForm((f) => ({ ...f, personId: e.target.value }))}
              >
                <option value="">Selecione…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label">Tipo de cuidado</label>
              <select
                className="input-field"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {CARE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label">Título</label>
              <input
                className="input-field"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Visita de acompanhamento"
              />
            </div>
            <div>
              <label className="input-label">Descrição</label>
              <textarea
                className="input-field min-h-[110px]"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="input-label">Data</label>
              <input
                type="date"
                className="input-field"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
