"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui";
import { getIconEmoji } from "@/lib/utils/helpers";
import type { User, Department } from "@/types";

function SvgIcon({ name, size = 18 }: { name: string; size?: number }) {
  const s = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.8,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  const icons: Record<string, React.ReactNode> = {
    home: <><path d="M3 9.5L12 3l9 6.5V20a2 2 0 01-2 2H5a2 2 0 01-2-2V9.5z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
    house: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 9.8V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8" /><path d="M10 21v-5a2 2 0 0 1 4 0v5" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    "check-square": <><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
    users: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>,
    user: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />,
    "calendar-days": <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><rect x="7" y="14" width="3" height="3" rx="0.5" /><rect x="14" y="14" width="3" height="3" rx="0.5" /></>,
    bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></>,
    "message-circle": <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />,
    "bar-chart": <><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></>,
    heart: <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    compass: <><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></>,
    notebook: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></>,
    megaphone: <><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 11-5.8-1.6" /></>,
    send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
    pray: <><path d="M8 11l4-8 4 8" /><path d="M7 22l5-11 5 11" /><path d="M5 12h14" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>,
    "log-out": <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
    chevrons: <><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></>,
  };
  return <svg {...s}>{icons[name] ?? icons.home}</svg>;
}

function ServosLogo() {
  return (
    <svg viewBox="0 0 180 201" fill="none" width="22" height="24">
      <path d="M74.97 48.53c9.53.03 32.73 17.37 41.45 23.66 26.31 18.98 55.86 31.69 59.08 67.85 1.16 14.63-3.07 27.67-11.64 37.82-13.36 17.09-37.81 24.46-57.27 16.06-18.41-8.6-14.96-12.85-33.77-2.56C57.86 200.4 36.23 197.68 22.15 185.8c-5.7-5.86-9.68-10.73-11.54-19.78a38.26 38.26 0 014.23-30.06c2.34-3.74 6.94-6.88 11.24-7.8 10.76-2.07 20.59 8.98 28.06 14.38 7.74 5.69 15.62 10.67 22.83 15.45 9.06 5.87 20.07 10.68 31.87 8.05 12.34-3.03 23.13-13.74 25.18-27.28 4.01-25.93-21.95-35.26-38.77-47.17-10.62-7.58-39.16-21.78-27.39-37.97 3.2-3.97 5.9-5.24 10.65-6.09z" fill="rgba(255,255,255,.95)" />
      <path d="M49.85.99c7.01-1.42 16.82.42 23.6 2.83 7.04 2.51 16.36 9.86 23.94 8.67 7.83-1.17 14.56-8.2 22.63-9.87 12.3-3.2 25.7-2.72 36.94 3.52 9.52 5.29 16.59 14.09 19.69 23.53 4.97 17.27-2.97 47.83-27.4 40.58-3.61-1.07-8.72-5.67-12.07-7.84-13.39-8.72-26.22-18.36-39.88-26.65-9.6-5.83-22.83-8.68-33.79-5.86-8.82 2.43-15.46 8.38-19.78 15.64-4.73 8.67-4.78 16.61-2.16 24.83 5.67 15.16 24.97 23.2 37.52 31.06 10.28 7.14 40.88 21.48 28.6 37.38-2.57 3.29-6.34 5.42-10.49 5.94-9.79 1.19-24.89-12.07-32.24-17.01-13.06-8.86-25.9-18.72-38.67-28.05C-17.03 75.29-2.73 7.24 49.85.99z" fill="rgba(255,255,255,.95)" />
    </svg>
  );
}

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  group?: string;
  isNew?: boolean;
}

interface SidebarV2Props {
  user: User;
  churchName: string;
  roleLabel?: string;
  departments: Department[];
  navItems: NavItem[];
  pathname: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLogout: () => void;
}

export function SidebarV2({
  user, churchName, roleLabel, departments, navItems, pathname, collapsed, onToggleCollapse, onLogout,
}: SidebarV2Props) {
  const compact = collapsed;
  const [ministriesOpen, setMinistriesOpen] = useState(false);

  function isActive(item: NavItem) {
    const direct = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
    if (direct) return true;
    // Pessoas engloba o módulo de cuidado e o legado /membros (redirecionado).
    if (item.href === "/pessoas") {
      return ["/membros", "/acompanhamentos", "/pedidos-oracao", "/timeline-pastoral", "/alertas", "/crm-pastoral"].some((p) => pathname.startsWith(p));
    }
    // "Minhas escalas" (perfil membro) cobre as sub-rotas de escala.
    if (item.href === "/minhas-escalas") {
      return pathname.startsWith("/escalas");
    }
    return false;
  }

  return (
    <aside
      className={`${compact ? "w-[82px]" : "w-[258px]"} sidebar-shell`}
    >
      {/* Header */}
      <div className={`sidebar-shell-header ${compact ? "compact" : ""}`}>
        <div className="sidebar-shell-logo-wrap">
          <ServosLogo />
        </div>
        {!compact && (
          <div className="min-w-0">
            <div className="sidebar-shell-title">Servos</div>
            <div className="sidebar-shell-subtitle">{churchName}</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-shell-nav">
        {navItems.map((item, index) => {
          const active = isActive(item);
          const showGroup = !compact && item.group && navItems[index - 1]?.group !== item.group;
          const isMinistries = item.href === "/ministerios" || item.href === "/minhas-escalas";
          return (
            <div key={item.href}>
              {showGroup && (
                <div className="sidebar-group-label">{item.group}</div>
              )}
              <div className="mb-1.5">
                <Link
                  href={item.href}
                  title={compact ? item.label : undefined}
                  className={`group sidebar-link relative ${compact ? "compact" : ""} ${
                    active ? "text-white" : "sidebar-link-idle"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      className="absolute inset-0 rounded-[15px]"
                      style={{
                        background: "linear-gradient(135deg,#FF6B57,#F0492F)",
                        boxShadow: "0 12px 24px -12px rgba(255,107,87,0.55)",
                      }}
                    />
                  )}
                  <span className={`relative z-10 sidebar-link-icon ${active ? "sidebar-link-icon-active" : "group-hover:text-ink-muted"}`}>
                    <SvgIcon name={item.icon} size={20} />
                  </span>
                  {!compact && <span className="relative z-10 flex-1">{item.label}</span>}
                  {!compact && item.badge ? (
                    <span className={`relative z-10 text-[10px] font-bold px-1.5 py-px rounded-full min-w-[18px] text-center ${
                      active ? "bg-white/25 text-white" : "bg-brand text-white"
                    }`}>
                      {item.badge}
                    </span>
                  ) : null}
                  {!compact && isMinistries && departments.length > 0 ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        setMinistriesOpen((open) => !open);
                      }}
                      className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition hover:bg-white/40 hover:text-ink"
                      aria-label={ministriesOpen ? "Recolher ministérios" : "Expandir ministérios"}
                    >
                      <svg className={`transition-transform ${ministriesOpen ? "rotate-180" : ""}`} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  ) : null}
                </Link>

                {!compact && isMinistries && departments.length > 0 && ministriesOpen && (
                  <div className="mt-2 space-y-1 pl-11">
                    {departments.slice(0, 5).map((d) => (
                      <Link
                        key={d.id}
                        href={`/ministerios/${d.id}`}
                        className={`sidebar-submenu-link ${
                          pathname === `/ministerios/${d.id}` ? "active" : ""
                        }`}
                      >
                        <span className="text-sm">{getIconEmoji(d.icon)}</span>
                        <span className="truncate">{d.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-shell-footer">
        <div
          className={`flex items-center gap-3 rounded-[16px] border border-sidebar-border bg-white/60 backdrop-blur transition hover:shadow-soft ${
            compact ? "justify-center p-2" : "p-2.5"
          }`}
        >
          <Link
            href="/perfil"
            title="Meu perfil"
            className={`flex min-w-0 items-center gap-3 ${compact ? "" : "flex-1"}`}
          >
            <Avatar name={user.name} color={user.avatar_color} photoUrl={user.photo_url} size={38} />
            {!compact && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold text-ink">{user.name}</div>
                <div className="text-[11.5px] text-ink-faint">
                  {roleLabel || (user.role === "admin" ? "Administrador" : user.role === "leader" ? "Líder" : "Membro")}
                </div>
              </div>
            )}
          </Link>
          {!compact && (
            <button
              onClick={onLogout}
              className="rounded-full p-1.5 text-ink-faint transition hover:bg-danger-light hover:text-danger"
              title="Sair"
            >
              <SvgIcon name="log-out" size={15} />
            </button>
          )}
        </div>
        {!compact && (
          <button
            onClick={onToggleCollapse}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 py-1 text-[11px] font-semibold text-ink-faint transition-colors hover:text-ink-muted"
          >
            <SvgIcon name="chevrons" size={13} />
            Recolher
          </button>
        )}
      </div>
    </aside>
  );
}
