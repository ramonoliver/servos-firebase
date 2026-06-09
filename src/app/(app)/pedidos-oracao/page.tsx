"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { Avatar, EmptyState, Modal, PageHeader, PageShell, SkeletonList } from "@/components/ui";
import { formatCareDate } from "@/lib/care/types";
import type { User } from "@/types";

// Servos 2.0 — Pedidos de oração reais. Lê pastoral_notes do tipo "prayer";
// permite criar um pedido e comentar em cada um.
type PastoralNote = {
  id: string;
  person_id: string;
  type: string;
  title?: string;
  description?: string;
  date: string;
};

type Comment = {
  id: string;
  prayer_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

export default function PedidosOracaoPage() {
  const { user, toast } = useApp();
  const [notes, setNotes] = useState<PastoralNote[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  // Novo pedido
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Comentários
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState<string | null>(null);

  async function load() {
    const [{ data: notesData }, { data: usersData }, { data: commentsData }] = await Promise.all([
      supabase
        .from("pastoral_notes")
        .select("*")
        .eq("church_id", user.church_id)
        .eq("type", "prayer")
        .order("date", { ascending: false }),
      supabase.from("users").select("*").eq("church_id", user.church_id),
      supabase
        .from("prayer_comments")
        .select("*")
        .eq("church_id", user.church_id)
        .order("created_at", { ascending: true }),
    ]);
    setNotes((notesData || []) as PastoralNote[]);
    setPeople((usersData || []) as User[]);
    setComments((commentsData || []) as Comment[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.church_id]);

  const peopleById = useMemo(() => {
    const map = new Map<string, User>();
    people.forEach((p) => map.set(p.id, p));
    return map;
  }, [people]);

  const commentsByPrayer = useMemo(() => {
    const map = new Map<string, Comment[]>();
    comments.forEach((c) => map.set(c.prayer_id, [...(map.get(c.prayer_id) || []), c]));
    return map;
  }, [comments]);

  async function createPrayer() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/prayer-requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: desc }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Erro ao registrar pedido.");
        return;
      }
      toast("Pedido de oração registrado! 🙏");
      setOpen(false);
      setTitle("");
      setDesc("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function postComment(prayerId: string) {
    const content = (drafts[prayerId] || "").trim();
    if (!content) return;
    setPosting(prayerId);
    try {
      const res = await fetch("/api/prayer-requests/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prayerId, content }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Erro ao comentar.");
        return;
      }
      if (data?.comment) setComments((prev) => [...prev, data.comment as Comment]);
      setDrafts((prev) => ({ ...prev, [prayerId]: "" }));
    } catch {
      toast("Erro ao comentar.");
    } finally {
      setPosting(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Cuidado"
        title="Pedidos de oração"
        subtitle="Compartilhe pedidos e ore uns pelos outros — a comunidade comenta e acompanha."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            + Novo pedido
          </button>
        }
      />

      {loading ? (
        <SkeletonList rows={4} />
      ) : notes.length === 0 ? (
        <EmptyState
          icon="🙏"
          title="Nenhum pedido de oração ainda"
          description="Seja o primeiro a compartilhar um pedido para a igreja orar com você."
          action={
            <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
              + Novo pedido
            </button>
          }
        />
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {notes.map((note) => {
            const person = peopleById.get(note.person_id);
            const cardComments = commentsByPrayer.get(note.id) || [];
            return (
              <div
                key={note.id}
                className="rounded-[18px] border border-lavender-light bg-white/70 p-4 shadow-soft backdrop-blur"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-lavender-light text-lavender-deep">
                    <span className="text-[18px]">🙏</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/pessoas/${note.person_id}`} className="truncate text-[14px] font-bold text-ink hover:text-brand-deep">
                        {person?.name || "Pessoa"}
                      </Link>
                      <span className="text-[11px] text-ink-faint">{formatCareDate(note.date)}</span>
                    </div>
                    {note.title && <div className="mt-1 text-[13px] font-semibold text-ink">{note.title}</div>}
                    {note.description && (
                      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{note.description}</p>
                    )}
                  </div>
                </div>

                {cardComments.length > 0 && (
                  <div className="mt-3 space-y-2.5 border-t border-border-soft pt-3">
                    {cardComments.map((c) => {
                      const author = peopleById.get(c.user_id);
                      return (
                        <div key={c.id} className="flex gap-2">
                          <Avatar name={author?.name || "Pessoa"} color={author?.avatar_color || "#9B8CFB"} photoUrl={author?.photo_url} size={26} />
                          <div className="min-w-0 flex-1 rounded-[12px] bg-surface-alt px-3 py-2">
                            <div className="text-[11px] font-bold text-ink">{author?.name?.split(" ")[0] || "Pessoa"}</div>
                            <p className="text-[12px] leading-relaxed text-ink-muted">{c.content}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <input
                    className="input-field !min-h-0 py-2 text-[13px]"
                    value={drafts[note.id] || ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [note.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") postComment(note.id);
                    }}
                    placeholder="Escreva um comentário…"
                    maxLength={1000}
                  />
                  <button
                    className="btn btn-secondary btn-sm flex-shrink-0"
                    onClick={() => postComment(note.id)}
                    disabled={posting === note.id || !(drafts[note.id] || "").trim()}
                  >
                    {posting === note.id ? "…" : "Comentar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <Modal
          title="Fazer pedido de oração"
          close={() => setOpen(false)}
          width={440}
          footer={
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-primary btn-sm" onClick={createPrayer} disabled={saving || !title.trim()}>
                {saving ? "Enviando…" : "Enviar pedido"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="input-label">Pedido</label>
              <input
                className="input-field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Saúde da minha família"
                maxLength={160}
              />
            </div>
            <div>
              <label className="input-label">Detalhes (opcional)</label>
              <textarea
                className="input-field min-h-[110px]"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Compartilhe como a igreja pode orar por você…"
                maxLength={2000}
              />
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
