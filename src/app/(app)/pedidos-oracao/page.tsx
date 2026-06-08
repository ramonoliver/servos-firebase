"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { Avatar, EmptyState, PageHeader, PageShell, SkeletonList } from "@/components/ui";
import { formatCareDate } from "@/lib/care/types";
import type { User } from "@/types";

// Servos 2.0 — Pedidos de oração reais (Fase 2, passo 5). Lê pastoral_notes
// do tipo "prayer" (Oração), substituindo os dados mock.
type PastoralNote = {
  id: string;
  person_id: string;
  type: string;
  title?: string;
  description?: string;
  date: string;
};

export default function PedidosOracaoPage() {
  const { user } = useApp();
  const [notes, setNotes] = useState<PastoralNote[]>([]);
  const [people, setPeople] = useState<User[]>([]);
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
          .eq("type", "prayer")
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

  return (
    <PageShell>
      <PageHeader
        eyebrow="Cuidado"
        title="Pedidos de oração"
        subtitle="Pedidos vinculados a pessoas para que a igreja ore e acompanhe com cuidado."
      />

      {loading ? (
        <SkeletonList rows={4} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon="🙏"
          title="Nenhum pedido de oração ainda"
          description="Registre um pedido de oração pela página de uma pessoa (tipo de cuidado “Oração”) e ele aparece aqui."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {notes.map((note) => {
            const person = peopleById.get(note.person_id);
            return (
              <Link
                key={note.id}
                href={`/pessoas/${note.person_id}`}
                className="flex items-start gap-3 rounded-[18px] border border-lavender-light bg-white/70 p-4 shadow-soft backdrop-blur transition hover:border-ink-ghost hover:bg-white hover:shadow-lift"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-lavender-light text-lavender-deep">
                  <span className="text-[18px]">🙏</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-bold text-ink">{person?.name || "Pessoa"}</span>
                    <span className="text-[11px] text-ink-faint">{formatCareDate(note.date)}</span>
                  </div>
                  {note.title && <div className="mt-1 text-[13px] font-semibold text-ink">{note.title}</div>}
                  {note.description && (
                    <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{note.description}</p>
                  )}
                </div>
                {person && (
                  <Avatar name={person.name} color={person.avatar_color} photoUrl={person.photo_url} size={34} />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
