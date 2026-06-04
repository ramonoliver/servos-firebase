"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/hooks/use-app";
import { Avatar, PageHeader } from "@/components/ui";
import { MentionInput } from "@/components/ui/mention-input";
import { supabase } from "@/lib/firebase";
import { useSearchParams } from "next/navigation";
import type { Message, User } from "@/types";

function sortMessages(messages: Message[]) {
  return [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export default function MensagensPage() {
  const { user, toast, departments } = useApp();
  const searchParams = useSearchParams();

  const requestedDepartmentId = searchParams.get("departmentId") || "";
  const [selectedDept, setSelectedDept] = useState(requestedDepartmentId || departments[0]?.id || "");
  const [newMsg, setNewMsg] = useState("");
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [syncMode, setSyncMode] = useState<"idle" | "realtime" | "polling">("idle");
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  async function loadData() {
    setLoading(true);

    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("*")
      .eq("church_id", user.church_id);

    if (usersError) {
      console.error({ usersError });
      toast("Erro ao carregar mensagens.");
      setLoading(false);
      return;
    }

    setMembers((usersData || []) as User[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [user.church_id]);

  const visibleDepartments = useMemo(() => departments, [departments]);

  useEffect(() => {
    if (requestedDepartmentId && visibleDepartments.some((dept) => dept.id === requestedDepartmentId)) {
      setSelectedDept(requestedDepartmentId);
      return;
    }

    if (!selectedDept && visibleDepartments.length > 0) {
      setSelectedDept(visibleDepartments[0].id);
    }

    if (selectedDept && !visibleDepartments.some((dept) => dept.id === selectedDept)) {
      setSelectedDept(visibleDepartments[0]?.id || "");
    }
  }, [visibleDepartments, selectedDept, requestedDepartmentId]);

  useEffect(() => {
    if (!selectedDept) {
      setAllMessages([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      setLoading(true);

      try {
        const response = await fetch(
          `/api/department-messages?departmentId=${encodeURIComponent(selectedDept)}`
        );
        const payload = (await response.json().catch(() => null)) as
          | { messages?: Message[]; error?: string }
          | null;

        if (!response.ok) {
          console.error("Erro ao carregar mensagens:", payload || response.statusText);
          if (!cancelled) {
            setAllMessages([]);
            toast("Não foi possível carregar as mensagens deste ministério.");
          }
          return;
        }

        if (!cancelled) {
          setAllMessages(sortMessages((payload?.messages || []) as Message[]));
        }
      } catch (error) {
        console.error("Erro ao carregar mensagens:", error);
        if (!cancelled) {
          setAllMessages([]);
          toast("Não foi possível carregar as mensagens deste ministério.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [selectedDept, user.church_id, user.id, toast]);

  const messages = useMemo(() => {
    return allMessages.filter((m) => m.department_id === selectedDept);
  }, [allMessages, selectedDept]);

  useEffect(() => {
    if (!selectedDept) {
      setSyncMode("idle");
      return;
    }

    let isMounted = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const channelName = `department-messages-${selectedDept}`;
    const channel = supabase.channel(channelName);

    const loadMessagesSilently = async () => {
      try {
        const response = await fetch(
          `/api/department-messages?departmentId=${encodeURIComponent(selectedDept)}`
        );
        const payload = (await response.json().catch(() => null)) as
          | { messages?: Message[] }
          | null;

        if (response.ok && isMounted) {
          setAllMessages(sortMessages((payload?.messages || []) as Message[]));
        }
      } catch {
        // Silent fallback refresh; no toast needed here.
      }
    };

    const enablePollingFallback = () => {
      if (!isMounted || pollInterval) return;
      setSyncMode("polling");
      pollInterval = setInterval(() => {
        void loadMessagesSilently();
      }, 12000);
    };

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `department_id=eq.${selectedDept}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          setAllMessages((current) => {
            if (current.some((item) => item.id === incoming.id)) {
              return current;
            }
            return sortMessages([...current, incoming]);
          });
        }
      )
      .subscribe((status) => {
        if (!isMounted) return;
        if (status === "SUBSCRIBED") {
          setSyncMode("realtime");
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          enablePollingFallback();
        }
      });

    return () => {
      isMounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      supabase.removeChannel(channel);
    };
  }, [selectedDept, user.church_id, user.id]);

  async function send() {
    if (!newMsg.trim() || !selectedDept) return;

    setSending(true);

    const response = await fetch("/api/department-messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        departmentId: selectedDept,
        content: newMsg.trim(),
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; message?: Message }
      | null;

    if (!response.ok) {
      console.error("Erro ao enviar mensagem:", payload || response.statusText);
      toast("Erro ao enviar mensagem.");
      setSending(false);
      return;
    }

    if (payload?.message) {
      setAllMessages((current) => {
        const next = payload.message as Message;
        if (current.some((item) => item.id === next.id)) {
          return current;
        }
        return sortMessages([...current, next]);
      });
    }

    setNewMsg("");
    toast("Enviada!");
    setSending(false);
  }

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages.length, selectedDept]);

  return (
    <div>
      <PageHeader className="mb-6" eyebrow="Comunicação" title="Mensagens" subtitle="Chat por ministério" />

      <div className="flex gap-1 mb-5 bg-surface-alt rounded-[10px] p-0.5 w-fit max-w-full flex-wrap">
        {visibleDepartments.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelectedDept(d.id)}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              selectedDept === d.id
                ? "bg-surface text-ink font-semibold shadow-sm"
                : "text-ink-muted"
            }`}
          >
            {d.name}
          </button>
        ))}
      </div>

      {!selectedDept && visibleDepartments.length === 0 && (
        <div className="card px-5 py-12 text-center text-sm text-ink-faint">
          Você ainda não participa de nenhum ministério com chat disponível.
        </div>
      )}

      <div className="card flex flex-col" style={{ minHeight: 440 }}>
        <div className="px-5 pt-4 pb-3 border-b border-border-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-display text-[15px] break-words">Chat do ministério</div>
            <div className="text-[11px] text-ink-faint mt-0.5">
              Conversa interna do time selecionado.
            </div>
          </div>
          {selectedDept && (
            <span
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                syncMode === "realtime"
                  ? "bg-success-light text-success"
                  : syncMode === "polling"
                  ? "bg-amber-light text-amber"
                  : "bg-surface-alt text-ink-faint"
              }`}
            >
              {syncMode === "realtime"
                ? "Ao vivo"
                : syncMode === "polling"
                ? "Atualizacao automatica"
                : "Sincronizando"}
            </span>
          )}
        </div>

        <div ref={messagesContainerRef} className="flex-1 p-5 space-y-3 overflow-y-auto">
          {loading ? (
            <div className="text-center py-16 text-ink-faint text-sm">Carregando mensagens...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 text-ink-faint text-sm">Nenhuma mensagem.</div>
          ) : (
            messages.map((m) => {
              const sender = members.find((u) => u.id === m.sender_id);
              const isMe = m.sender_id === user.id;

              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[88%] sm:max-w-[70%] flex gap-2 ${isMe ? "flex-row-reverse" : ""} items-end`}
                  >
                    <Avatar
                      name={sender?.name || "?"}
                      color={sender?.avatar_color || "#999"}
                      photoUrl={sender?.photo_url}
                      size={28}
                    />

                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                        isMe
                          ? "bg-brand text-white rounded-br-sm"
                          : "bg-surface-alt text-ink rounded-bl-sm"
                      }`}
                    >
                      {!isMe && (
                        <div className="text-[10px] font-semibold opacity-70 mb-0.5">
                          {sender?.name?.split(" ")[0]}
                        </div>
                      )}

                      <div className="break-words whitespace-pre-wrap">{m.content}</div>

                      <div className="text-[9px] opacity-50 mt-1 text-right">
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-3 border-t border-border-soft flex gap-2">
          <MentionInput
            value={newMsg}
            onChange={setNewMsg}
            onSend={send}
            placeholder="Digite @ para mencionar alguém..."
            disabled={sending || !selectedDept}
            scheduleId={selectedDept}
            churchId={user.church_id}
            mode="department"
          />
          <button onClick={send} disabled={sending || !selectedDept} className="btn btn-primary self-center">
            {sending ? "..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
