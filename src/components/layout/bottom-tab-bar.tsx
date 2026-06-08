"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface MobileTab {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface BottomTabBarProps {
  tabs: MobileTab[];
  pathname: string;
  canCreateSchedule: boolean;
  canInviteMember: boolean;
}

function PlusIcon() {
  return (
    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function BottomTabBar({ tabs, pathname, canCreateSchedule, canInviteMember }: BottomTabBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const router = useRouter();

  const actions = [
    canCreateSchedule && { label: "Nova Escala", emoji: "📅", href: "/escalas/nova" },
    canInviteMember && { label: "Convidar Membro", emoji: "👤", href: "/pessoas/convidar" },
    { label: "Registrar Indisponibilidade", emoji: "🚫", href: "/indisponibilidade" },
  ].filter(Boolean) as { label: string; emoji: string; href: string }[];

  const leftTabs = tabs.slice(0, 2);
  const rightTabs = tabs.slice(2);

  return (
    <>
      {sheetOpen && (
        <div className="fixed inset-0 bg-ink/20 backdrop-blur-[2px] z-40" onClick={() => setSheetOpen(false)} />
      )}

      {/* Quick action sheet */}
      <div
        className={`fixed bottom-16 left-0 right-0 z-50 flex flex-col items-center gap-2 pb-4 px-4 transition-all duration-300 ${
          sheetOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        {actions.map((action) => (
          <button
            key={action.href}
            onClick={() => { setSheetOpen(false); router.push(action.href); }}
            className="w-full max-w-xs bg-white shadow-lg rounded-xl px-5 py-3.5 flex items-center gap-3 text-left hover:bg-surface-alt transition-colors"
          >
            <span className="text-xl">{action.emoji}</span>
            <span className="font-medium text-ink text-[15px]">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-sidebar-border flex items-center px-2"
        style={{ height: 64 }}
      >
        {leftTabs.map((tab) => {
          const active = pathname === tab.href || (tab.href !== "/dashboard" && pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${active ? "text-brand" : "text-ink-faint"}`}
            >
              {tab.icon}
              <span className="text-[10px] font-medium">{tab.label}</span>
              {tab.badge ? (
                <span className="absolute top-1.5 right-1/4 w-4 h-4 bg-brand text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              ) : null}
            </Link>
          );
        })}

        {/* FAB */}
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => setSheetOpen(!sheetOpen)}
            className="w-12 h-12 bg-brand rounded-full flex items-center justify-center text-white shadow-lg shadow-brand/30 transition-transform active:scale-95"
            aria-label="Ações rápidas"
          >
            {sheetOpen ? <CloseIcon /> : <PlusIcon />}
          </button>
        </div>

        {rightTabs.map((tab) => {
          const active = pathname === tab.href || (tab.href !== "/dashboard" && pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${active ? "text-brand" : "text-ink-faint"}`}
            >
              {tab.icon}
              <span className="text-[10px] font-medium">{tab.label}</span>
              {tab.badge ? (
                <span className="absolute top-1.5 right-1/4 w-4 h-4 bg-brand text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
