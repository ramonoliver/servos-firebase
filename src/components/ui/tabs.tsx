"use client";

import { cn } from "@/lib/utils/helpers";

// Servos 2.0 — primitivo de DS (Fundação Fase 1, Entregável 4).
// Genérico e desacoplado do módulo pastoral mock (onde vivia como TabBar).
export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto rounded-full border border-border-soft bg-white p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            "min-h-[36px] whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition-colors",
            active === tab ? "bg-brand-light text-brand" : "text-ink-muted hover:bg-surface-alt hover:text-ink"
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

// Alias de compatibilidade (nome legado usado em telas existentes).
export { Tabs as TabBar };
