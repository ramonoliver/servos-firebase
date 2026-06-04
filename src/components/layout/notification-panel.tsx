"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/firebase";
import type { Notification } from "@/types";

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  onMarkAllRead: () => void;
}

export function NotificationPanel({ open, onClose, userId, onMarkAllRead }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setNotifications((data ?? []) as Notification[]));
  }, [open, userId]);

  async function markAllRead() {
    await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    onMarkAllRead();
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 w-[360px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <h2 className="font-display text-lg font-bold text-ink">Notificações</h2>
          <div className="flex items-center gap-3">
            <button onClick={markAllRead} className="text-[11px] text-ink-muted hover:text-ink transition-colors">
              Marcar todas lidas
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-surface-alt flex items-center justify-center text-ink-muted hover:bg-border transition-colors"
              aria-label="Fechar"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-ink-faint text-sm gap-2">
              <span className="text-3xl">🔔</span>
              <span>Sem notificações</span>
            </div>
          ) : (
            notifications.map((n) => (
              <Link
                key={n.id}
                href={n.action_url ?? "/notificacoes"}
                onClick={onClose}
                className={`flex gap-3 px-5 py-3.5 border-b border-border-soft hover:bg-surface-alt transition-colors ${!n.read ? "bg-brand-light/40" : ""}`}
              >
                {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 flex-shrink-0" />}
                <div className={!n.read ? "" : "pl-[18px]"}>
                  <div className="text-[13px] font-semibold text-ink">{n.title}</div>
                  <div className="text-[12px] text-ink-muted mt-0.5">{n.body}</div>
                </div>
              </Link>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-border-soft">
          <Link href="/notificacoes" onClick={onClose} className="text-[12px] text-ink-muted hover:text-ink transition-colors">
            Ver todas as notificações →
          </Link>
        </div>
      </div>
    </>
  );
}
