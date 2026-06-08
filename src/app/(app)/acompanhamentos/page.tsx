"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { Avatar, EmptyState, PageHeader, PageShell, SkeletonList } from "@/components/ui";
import { CARE_TYPES, careType, CARE_TONE_CLASSES, formatCareDate } from "@/lib/care/types";
import type { User } from "@/types";

// Servos 2.0 — Cuidado real (Fase 2, passo 5). Lê pastoral_notes de verdade
// (client-side, como o dashboard) usando a taxonomia real (CARE_TYPES),
// substituindo a versão em dados mock.
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

export default function AcompanhamentosPage() {
  const { user } = useApp();
  const [notes, setNotes] = useState<PastoralNote[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

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
        supabase.from("users").select("*").eq("church_id", user.church_id),
      ]);
      if (cancelled) return;
      setNotes((notesData || []) as PastoralNote[]);
      setPeople((usersData || []) as User[]);
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
              ? "Quando a liderança registrar visitas, ligações ou acompanhamentos, eles aparecem aqui. Registre pela página de uma pessoa."
              : "Tente outro tipo de cuidado."
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
    </PageShell>
  );
}
