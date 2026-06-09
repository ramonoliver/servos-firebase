"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/hooks/use-app";
import { supabase } from "@/lib/firebase";
import { Avatar, EmptyState, PageHeader, PageShell, SkeletonList } from "@/components/ui";
import { formatCareDate } from "@/lib/care/types";
import type { User } from "@/types";

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

type Like = {
  id: string;
  user_id: string;
  target_type: "prayer" | "comment";
  target_id: string;
};

export default function PedidoOracaoDetailPage({ params }: { params: { id: string } }) {
  const prayerId = params.id;
  const { user, toast } = useApp();
  const [prayer, setPrayer] = useState<PastoralNote | null>(null);
  const [people, setPeople] = useState<User[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  async function load() {
    const [{ data: noteData }, { data: usersData }, { data: commentsData }, { data: likesData }] = await Promise.all([
      supabase.from("pastoral_notes").select("*").eq("id", prayerId).eq("church_id", user.church_id).maybeSingle(),
      supabase.from("users").select("*").eq("church_id", user.church_id),
      supabase.from("prayer_comments").select("*").eq("church_id", user.church_id).eq("prayer_id", prayerId).order("created_at", { ascending: true }),
      supabase.from("prayer_likes").select("*").eq("church_id", user.church_id),
    ]);
    setPrayer((noteData as PastoralNote) || null);
    setPeople((usersData || []) as User[]);
    setComments((commentsData || []) as Comment[]);
    setLikes((likesData || []) as Like[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prayerId, user.church_id]);

  const peopleById = useMemo(() => {
    const map = new Map<string, User>();
    people.forEach((p) => map.set(p.id, p));
    return map;
  }, [people]);

  const myLikeFor = (type: Like["target_type"], id: string) =>
    likes.find((l) => l.user_id === user.id && l.target_type === type && l.target_id === id);
  const countFor = (type: Like["target_type"], id: string) =>
    likes.filter((l) => l.target_type === type && l.target_id === id).length;

  async function toggleLike(type: Like["target_type"], id: string) {
    const existing = myLikeFor(type, id);
    const tempId = `tmp_${type}_${id}`;
    // Atualização otimista.
    setLikes((prev) =>
      existing
        ? prev.filter((l) => l.id !== existing.id)
        : [...prev, { id: tempId, user_id: user.id, target_type: type, target_id: id }]
    );
    try {
      const res = await fetch("/api/prayer-requests/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: type, targetId: id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao curtir.");
      if (data?.liked && data?.like) {
        setLikes((prev) => prev.map((l) => (l.id === tempId ? (data.like as Like) : l)));
      }
    } catch {
      // Reverte em caso de erro.
      setLikes((prev) => (existing ? [...prev, existing] : prev.filter((l) => l.id !== tempId)));
      toast("Não foi possível curtir agora.");
    }
  }

  async function postComment() {
    const content = draft.trim();
    if (!content) return;
    setPosting(true);
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
      setDraft("");
    } catch {
      toast("Erro ao comentar.");
    } finally {
      setPosting(false);
    }
  }

  const author = prayer ? peopleById.get(prayer.person_id) : undefined;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Cuidado · Pedido de oração"
        title={prayer?.title || "Pedido de oração"}
        subtitle={author ? `Compartilhado por ${author.name}` : undefined}
        actions={
          <Link href="/pedidos-oracao" className="btn btn-secondary btn-sm">
            ← Voltar
          </Link>
        }
      />

      {loading ? (
        <SkeletonList rows={4} />
      ) : !prayer ? (
        <EmptyState
          icon="🙏"
          title="Pedido não encontrado"
          description="Este pedido pode ter sido removido."
          action={
            <Link href="/pedidos-oracao" className="btn btn-primary btn-sm">
              Ver todos os pedidos
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Cartão do pedido */}
          <div className="rounded-[20px] border border-lavender-light bg-white/70 p-5 shadow-soft backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-lavender-light text-lavender-deep">
                <span className="text-[20px]">🙏</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/pessoas/${prayer.person_id}`} className="text-[15px] font-bold text-ink hover:text-brand-deep">
                    {author?.name || "Pessoa"}
                  </Link>
                  <span className="text-[12px] text-ink-faint">{formatCareDate(prayer.date)}</span>
                </div>
                {prayer.description && (
                  <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-muted">{prayer.description}</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 border-t border-border-soft pt-3">
              <LikeButton
                liked={Boolean(myLikeFor("prayer", prayer.id))}
                count={countFor("prayer", prayer.id)}
                onClick={() => toggleLike("prayer", prayer.id)}
              />
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted">
                💬 {comments.length} {comments.length === 1 ? "comentário" : "comentários"}
              </span>
            </div>
          </div>

          {/* Comentários */}
          <div className="rounded-[20px] border border-border-soft bg-white/70 p-5 shadow-soft backdrop-blur">
            <h2 className="mb-3 text-[14px] font-bold text-ink">Comentários</h2>
            {comments.length === 0 ? (
              <p className="text-[13px] text-ink-faint">Ainda não há comentários. Seja o primeiro a orar e escrever uma palavra.</p>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => {
                  const commenter = peopleById.get(c.user_id);
                  return (
                    <div key={c.id} className="flex gap-2.5">
                      <Avatar name={commenter?.name || "Pessoa"} color={commenter?.avatar_color || "#9B8CFB"} photoUrl={commenter?.photo_url} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="rounded-[14px] bg-surface-alt px-3 py-2">
                          <div className="text-[12px] font-bold text-ink">{commenter?.name?.split(" ")[0] || "Pessoa"}</div>
                          <p className="text-[13px] leading-relaxed text-ink-muted">{c.content}</p>
                        </div>
                        <div className="mt-1 pl-1">
                          <LikeButton
                            small
                            liked={Boolean(myLikeFor("comment", c.id))}
                            count={countFor("comment", c.id)}
                            onClick={() => toggleLike("comment", c.id)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <input
                className="input-field !min-h-0 py-2 text-[13px]"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") postComment();
                }}
                placeholder="Escreva um comentário…"
                maxLength={1000}
              />
              <button className="btn btn-primary btn-sm flex-shrink-0" onClick={postComment} disabled={posting || !draft.trim()}>
                {posting ? "…" : "Comentar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function LikeButton({ liked, count, onClick, small }: { liked: boolean; count: number; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold transition ${
        small ? "text-[12px]" : "text-[13px]"
      } ${liked ? "border-rose/40 bg-rose-light text-rose-deep" : "border-border-soft bg-white text-ink-muted hover:bg-surface-alt"}`}
      aria-pressed={liked}
      aria-label={liked ? `Remover curtida (${count})` : "Curtir"}
    >
      <span aria-hidden="true">{liked ? "❤️" : "🤍"}</span>
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
