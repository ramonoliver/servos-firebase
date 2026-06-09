"use client";
import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/helpers";

// ============================================
// MODAL
// ============================================
export function Modal({
  title, children, footer, close, width = 520
}: {
  title: string; children: React.ReactNode; footer?: React.ReactNode; close: () => void; width?: number;
}) {
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  // `close` via ref: a prop costuma ser uma arrow function nova a cada render.
  // Sem isso, o efeito reexecutava a cada tecla e roubava o foco para o botão X.
  const closeRef = React.useRef(close);
  closeRef.current = close;

  React.useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
    // Roda só na montagem/desmontagem — não deve reagir a mudanças de `close`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="!mt-0 fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && close()}
      role="presentation"
    >
      <div className="bg-white rounded-xl w-full shadow-xl max-h-[90vh] overflow-y-auto animate-in" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border-soft sticky top-0 bg-white z-[1] rounded-t-xl">
          <span className="font-display text-xl">{title}</span>
          <button ref={closeButtonRef} onClick={close} className="w-8 h-8 rounded-full bg-surface-alt flex items-center justify-center hover:bg-border text-ink-muted transition-colors" aria-label="Fechar modal"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-border-soft flex gap-2 justify-end">{footer}</div>}
      </div>
      <style jsx>{`
        @keyframes animateIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-in { animation: animateIn 0.25s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>
    </div>
  );
}

// ============================================
// CONFIRM DIALOG
// ============================================
export function ConfirmDialog({
  title, message, confirmLabel = "Confirmar", cancelLabel = "Cancelar",
  variant = "danger", loading = false, onConfirm, onCancel
}: {
  title: string; message: string; confirmLabel?: string; cancelLabel?: string;
  variant?: "danger" | "warning" | "success"; loading?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const colors = {
    danger: { bg: "bg-danger-light", text: "text-danger", border: "border-danger/10", btn: "btn btn-danger" },
    warning: { bg: "bg-amber-light", text: "text-amber", border: "border-amber/10", btn: "btn btn-secondary" },
    success: { bg: "bg-success-light", text: "text-success", border: "border-success/10", btn: "btn btn-green" },
  }[variant];

  return (
    <Modal title={title} close={() => { if (!loading) onCancel(); }} width={420}
      footer={<>
        <button onClick={onCancel} disabled={loading} className="btn btn-secondary">{cancelLabel}</button>
        <button onClick={onConfirm} disabled={loading} className={colors.btn}>{loading ? "Processando..." : confirmLabel}</button>
      </>}>
      <div className={`${colors.bg} ${colors.text} text-sm px-4 py-3 rounded-[10px] border ${colors.border}`} dangerouslySetInnerHTML={{ __html: message }} />
    </Modal>
  );
}

// ============================================
// EMPTY STATE
// ============================================
export function EmptyState({
  icon, title, description, action
}: {
  icon: string; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-5xl mb-4 opacity-40">{icon}</div>
      <h3 className="font-display text-lg mb-1">{title}</h3>
      {description && <p className="text-sm text-ink-muted max-w-[320px] mb-5">{description}</p>}
      {action}
    </div>
  );
}

// ============================================
// SKELETON LOADER
// ============================================
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cn("bg-surface-alt animate-pulse rounded-[10px]", className)} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-t border-border-soft first:border-t-0">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ============================================
// STAT CARD
// ============================================
export function StatCard({ value, label, color = "text-brand" }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="bg-surface border border-border-soft rounded-[14px] px-5 py-4">
      <div className={`font-display text-[28px] tracking-tight leading-none ${color}`}>{value}</div>
      <div className="text-xs text-ink-muted font-medium mt-1">{label}</div>
    </div>
  );
}

// ============================================
// AVATAR
// ============================================
export function Avatar({
  name,
  color,
  photoUrl,
  size = 36,
  className = "",
}: {
  name: string;
  color: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn("rounded-full object-cover flex-shrink-0", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div className={cn("rounded-full flex items-center justify-center text-white font-bold flex-shrink-0", className)}
      style={{ width: size, height: size, fontSize: size * 0.32, background: color }}>
      {initials}
    </div>
  );
}

// ============================================
// PERSON CARD (genérico — DS 2.0)
// ============================================
// Desacoplado dos tipos do módulo pastoral mock. Props simples para reuso em
// Pessoas, Cuidado, Células e Kids (Fundação Fase 1, Entregável 4).
export function PersonCard({
  name,
  subtitle,
  avatarColor = "#FF6B57",
  photoUrl,
  href,
  badge,
  right,
  size = 40,
  className = "",
}: {
  name: string;
  subtitle?: string;
  avatarColor?: string;
  photoUrl?: string | null;
  href?: string;
  badge?: React.ReactNode;
  right?: React.ReactNode;
  size?: number;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[16px] border border-border-soft bg-white/70 p-3 shadow-soft backdrop-blur transition hover:border-ink-ghost hover:bg-white",
        className
      )}
    >
      <Avatar name={name} color={avatarColor} photoUrl={photoUrl} size={size} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">{name}</div>
        {subtitle && <div className="truncate text-[11px] text-ink-faint">{subtitle}</div>}
        {badge && <div className="mt-1">{badge}</div>}
      </div>
      {right}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    );
  }
  return body;
}

// ============================================
// AVAILABILITY GRID (read-only)
// ============================================
const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

export function AvailabilityGrid({ availability, compact = false }: { availability: boolean[]; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-7 gap-${compact ? "1" : "2"}`}>
      {DAYS.map((d, i) => (
        <div key={i} className={cn(
          "flex flex-col items-center gap-1 rounded-[10px]",
          compact ? "py-1.5" : "py-3",
          availability?.[i] ? "bg-success-light border border-success/20" : "bg-surface-alt border border-border-soft"
        )}>
          <span className={cn("font-bold", compact ? "text-[8px]" : "text-[10px]", availability?.[i] ? "text-success" : "text-ink-faint")}>{d}</span>
          <div className={cn("rounded-full", compact ? "w-2 h-2" : "w-3 h-3", availability?.[i] ? "bg-success" : "bg-ink-ghost")} />
        </div>
      ))}
    </div>
  );
}

// ============================================
// AVAILABILITY GRID (editable)
// ============================================
export function AvailabilityEditor({ availability, onChange }: { availability: boolean[]; onChange: (avail: boolean[]) => void }) {
  function toggle(i: number) {
    const next = [...availability];
    next[i] = !next[i];
    onChange(next);
  }
  return (
    <div className="grid grid-cols-7 gap-2">
      {DAYS.map((d, i) => (
        <button key={i} type="button" onClick={() => toggle(i)}
          className={cn(
            "flex flex-col items-center gap-1 py-3 rounded-[10px] cursor-pointer transition-all",
            availability?.[i] ? "bg-success-light border border-success/20" : "bg-surface-alt border border-border-soft hover:border-ink-ghost"
          )}
          aria-pressed={Boolean(availability?.[i])}
          aria-label={`${d} ${availability?.[i] ? "disponível" : "indisponível"}`}
        >
          <span className={cn("text-[10px] font-bold", availability?.[i] ? "text-success" : "text-ink-faint")}>{d}</span>
          <div className={cn("w-3 h-3 rounded-full transition-colors", availability?.[i] ? "bg-success" : "bg-ink-ghost")} />
        </button>
      ))}
    </div>
  );
}

// ============================================
// VERSE CARD
// ============================================
export function VerseCard({ text, reference }: { text: string; reference: string }) {
  return (
    <div className="bg-brand-glow border border-brand/10 rounded-[14px] p-5">
      <p className="font-display italic text-sm text-ink-soft leading-relaxed mb-1.5">&ldquo;{text}&rdquo;</p>
      <p className="text-[11px] text-brand font-semibold">{reference}</p>
    </div>
  );
}

// ============================================
// ROLE BADGE
// ============================================
export function RoleBadge({ role }: { role: string }) {
  const config = {
    admin: { label: "Admin", cls: "bg-purple-50 text-purple-600" },
    leader: { label: "Lider", cls: "bg-brand-light text-brand" },
    member: { label: "Membro", cls: "bg-success-light text-success" },
  }[role] || { label: role, cls: "bg-surface-alt text-ink-muted" };
  return <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${config.cls}`}>{config.label}</span>;
}

// ============================================
// COUPLE BADGE
// ============================================
export function CoupleBadge({ spouseName }: { spouseName: string }) {
  return <span className="text-[9px] font-semibold text-brand bg-brand-light px-1.5 py-0.5 rounded-full">&#128145; {spouseName.split(" ")[0]}</span>;
}

export { MultiSelect } from "./multi-select";
export type { MultiSelectOption } from "./multi-select";

export {
  PageShell,
  PageHeader,
  SectionCard,
  StatTile,
  SegmentedControl,
  PageLoading,
} from "./page-header";
export type { Tone } from "./page-header";

export { DateField } from "./date-field";
export { ActionDrawer } from "./action-drawer";
export { Tabs, TabBar } from "./tabs";
