"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { EmptyState, Modal, PageHeader, PageShell, SkeletonList } from "@/components/ui";
import { formatCareDate } from "@/lib/care/types";
import type { User } from "@/types";

// Servos 2.0 — Pedidos de oração reais. Lê pastoral_notes do tipo "prayer".
// A listagem é um RESUMO: cada card mostra o pedido + contadores de curtidas e
// comentários e leva à página interna (/pedidos-oracao/[id]) para ver/comentar.
type PastoralNote = {
  id: string;
  person_id: string;
  type: string;
  title?: string;
  description?: string;
  date: string;
};

type Comment = { id: string; prayer_id: string; user_id: string; content: string; created_at: string };
type Like = { id: string; user_id: string; target_type: "prayer" | "comment"; target_id: string };

export default function PedidosOracaoPage() {
  const { user, toast } = useApp();
  const [notes, setNotes] = useState<PastoralNote[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [loading, setLoading] = useState(true);

  // Novo pedido
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [{ data: notesData }, { data: usersData }, { data: commentsData }, { data: likesData }] = await Promise.all([
      supabase
        .from("pastoral_notes")
        .select("*")
        .eq("church_id", user.church_id)
        .eq("type", "prayer")
        .order("date", { ascending: false }),
      supabase.from("users").select("*").eq("church_id", user.church_id),
      supabase.from("prayer_comments").select("*").eq("church_id", user.church_id),
      supabase.from("prayer_likes").select("*").eq("church_id", user.church_id),
    ]);
    setNotes((notesData || []) as PastoralNote[]);
    setPeople((usersData || []) as User[]);
    setComments((commentsData || []) as Comment[]);
    setLikes((likesData || []) as Like[]);
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

  const commentCountByPrayer = useMemo(() => {
    const map = new Map<string, number>();
    comments.forEach((c) => map.set(c.prayer_id, (map.get(c.prayer_id) || 0) + 1));
    return map;
  }, [comments]);

  const myPrayerLike = (prayerId: string) =>
    likes.find((l) => l.user_id === user.id && l.target_type === "prayer" && l.target_id === prayerId);
  const prayerLikeCount = (prayerId: string) =>
    likes.filter((l) => l.target_type === "prayer" && l.target_id === prayerId).length;

  async function toggleLike(prayerId: string) {
    const existing = myPrayerLike(prayerId);
    const tempId = `tmp_prayer_${prayerId}`;
    setLikes((prev) =>
      existing
        ? prev.filter((l) => l.id !== existing.id)
        : [...prev, { id: tempId, user_id: user.id, target_type: "prayer", target_id: prayerId }]
    );
    try {
      const res = await fetch("/api/prayer-requests/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "prayer", targetId: prayerId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao curtir.");
      if (data?.liked && data?.like) {
        setLikes((prev) => prev.map((l) => (l.id === tempId ? (data.like as Like) : l)));
      }
    } catch {
      setLikes((prev) => (existing ? [...prev, existing] : prev.filter((l) => l.id !== tempId)));
      toast("Não foi possível curtir agora.");
    }
  }

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
            const commentCount = commentCountByPrayer.get(note.id) || 0;
            const likeCount = prayerLikeCount(note.id);
            const liked = Boolean(myPrayerLike(note.id));
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
                    <Link href={`/pedidos-oracao/${note.id}`} className="group block">
                      {note.title && <div className="mt-1 text-[13px] font-semibold text-ink group-hover:text-brand-deep">{note.title}</div>}
                      {note.description && (
                        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">{note.description}</p>
                      )}
                    </Link>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-border-soft pt-3">
                  <button
                    type="button"
                    onClick={() => toggleLike(note.id)}
                    aria-pressed={liked}
                    aria-label={liked ? `Remover curtida (${likeCount})` : "Curtir"}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition ${
                      liked ? "border-rose/40 bg-rose-light text-rose-deep" : "border-border-soft bg-white text-ink-muted hover:bg-surface-alt"
                    }`}
                  >
                    <span aria-hidden="true">{liked ? "❤️" : "🤍"}</span>
                    {likeCount > 0 && <span>{likeCount}</span>}
                  </button>
                  <Link
                    href={`/pedidos-oracao/${note.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-white px-3 py-1 text-[12px] font-semibold text-ink-muted transition hover:bg-surface-alt"
                  >
                    💬 {commentCount === 0 ? "Comentar" : `${commentCount} ${commentCount === 1 ? "comentário" : "comentários"}`}
                  </Link>
                  <Link href={`/pedidos-oracao/${note.id}`} className="ml-auto text-[12px] font-semibold text-brand-deep hover:opacity-75">
                    Ver e comentar →
                  </Link>
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
