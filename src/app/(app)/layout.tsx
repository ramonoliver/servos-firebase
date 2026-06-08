"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppProvider, useApp } from "@/hooks/use-app";
import { ROLE_LABELS } from "@/lib/auth/person-roles";
import { SidebarV2, type NavItem } from "@/components/layout/sidebar-v2";
import { NotificationPanel } from "@/components/layout/notification-panel";
import { Avatar } from "@/components/ui";
import { SupportButton } from "@/components/shared/support-button";
import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <ShellV2>{children}</ShellV2>
    </AppProvider>
  );
}

// ── Inline icons for mobile header / tabs ──────────────────
function ServosLogoSmall() {
  return (
    <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 180 201" fill="none" width="13" height="15">
        <path d="M74.97 48.53c9.53.03 32.73 17.37 41.45 23.66 26.31 18.98 55.86 31.69 59.08 67.85 1.16 14.63-3.07 27.67-11.64 37.82-13.36 17.09-37.81 24.46-57.27 16.06-18.41-8.6-14.96-12.85-33.77-2.56C57.86 200.4 36.23 197.68 22.15 185.8c-5.7-5.86-9.68-10.73-11.54-19.78a38.26 38.26 0 014.23-30.06c2.34-3.74 6.94-6.88 11.24-7.8 10.76-2.07 20.59 8.98 28.06 14.38 7.74 5.69 15.62 10.67 22.83 15.45 9.06 5.87 20.07 10.68 31.87 8.05 12.34-3.03 23.13-13.74 25.18-27.28 4.01-25.93-21.95-35.26-38.77-47.17-10.62-7.58-39.16-21.78-27.39-37.97 3.2-3.97 5.9-5.24 10.65-6.09z" fill="rgba(255,255,255,.85)" />
        <path d="M49.85.99c7.01-1.42 16.82.42 23.6 2.83 7.04 2.51 16.36 9.86 23.94 8.67 7.83-1.17 14.56-8.2 22.63-9.87 12.3-3.2 25.7-2.72 36.94 3.52 9.52 5.29 16.59 14.09 19.69 23.53 4.97 17.27-2.97 47.83-27.4 40.58-3.61-1.07-8.72-5.67-12.07-7.84-13.39-8.72-26.22-18.36-39.88-26.65-9.6-5.83-22.83-8.68-33.79-5.86-8.82 2.43-15.46 8.38-19.78 15.64-4.73 8.67-4.78 16.61-2.16 24.83 5.67 15.16 24.97 23.2 37.52 31.06 10.28 7.14 40.88 21.48 28.6 37.38-2.57 3.29-6.34 5.42-10.49 5.94-9.79 1.19-24.89-12.07-32.24-17.01-13.06-8.86-25.9-18.72-38.67-28.05C-17.03 75.29-2.73 7.24 49.85.99z" fill="rgba(255,255,255,.85)" />
      </svg>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function HomeIcon() {
  return <svg width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M3 9.5L12 3l9 6.5V20a2 2 0 01-2 2H5a2 2 0 01-2-2V9.5z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
}

function CalendarIcon() {
  return <svg width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
}

function UsersIcon() {
  return <svg width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>;
}

function MoreHorizIcon() {
  return <svg width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

function MenuIcon() {
  return <svg width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>;
}

// ── Split-view pages: fill content area edge-to-edge ───────
const SPLIT_PAGES = ["/escalas"];

function ShellV2({ children }: { children: React.ReactNode }) {
  const { user, church, departments, canDo, logout, unreadNotifications, setUnreadNotifications, roles } = useApp();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const sync = () => setIsMobile(window.innerWidth < 1024);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  // ── Visibilidade derivada dos papéis canônicos (getPersonRoles) ───────────
  const br = roles.businessRoles;
  const isAdmin = roles.systemRole === "admin";
  const isLeader = roles.systemRole === "leader";
  const isPastor = br.includes("pastor") || br.includes("coordenacao");
  const isSupervisor = br.includes("supervisor");
  const isCellLeader = br.includes("lider_celula");
  const isMinistryLeader = br.includes("lider_ministerio");
  const notPureMember = isAdmin || isPastor || isSupervisor || isCellLeader || isMinistryLeader;
  const isPureMember = !notPureMember;
  const canCare = isAdmin || isPastor || isSupervisor || isCellLeader;
  const canMessage = canDo("message.send");
  const canReport = canDo("report.view");

  // Telas ainda em mock/stub (Cuidado, Comunicados, Enquetes, Perfis): a
  // ESTRUTURA da IA 2.0 já fica no código, mas não exibimos destinos com dados
  // fictícios. Vira `true` quando reimplementadas (Fase 2 passos 3+/5).
  const SHOW_UNBUILT = false;

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Início", icon: "home", show: true },

    // OPERAÇÃO
    { href: "/calendario", label: "Agenda", icon: "calendar-days", group: "Operação", show: true },
    { href: "/eventos", label: "Eventos", icon: "calendar", group: "Operação", show: notPureMember },
    { href: isPureMember ? "/minhas-escalas" : "/escalas", label: isPureMember ? "Minhas escalas" : "Escalas", icon: "check-square", group: "Operação", show: true },
    { href: "/ministerios", label: "Ministérios", icon: "heart", group: "Operação", show: notPureMember },

    // COMUNIDADE
    { href: "/pessoas", label: "Pessoas", icon: "users", group: "Comunidade", show: notPureMember },
    { href: "/celulas", label: "Células", icon: "house", group: "Comunidade", show: true },
    { href: "/kids", label: "Kids", icon: "shield", group: "Comunidade", show: notPureMember },

    // CUIDADO — Acompanhamentos e Pedidos já leem dados reais (passo 5).
    // Alertas pastorais (loop derivado) segue gated até ser implementado.
    { href: "/acompanhamentos", label: "Acompanhamentos", icon: "compass", group: "Cuidado", show: canCare },
    { href: "/pedidos-oracao", label: "Pedidos de oração", icon: "pray", group: "Cuidado", show: canCare },
    { href: "/alertas", label: "Alertas pastorais", icon: "bell", group: "Cuidado", show: canCare },

    // COMUNICAÇÃO
    { href: "/comunicacao", label: "Comunicados", icon: "megaphone", group: "Comunicação", show: SHOW_UNBUILT && canMessage },
    { href: "/mensagens", label: "Mensagens", icon: "message-circle", group: "Comunicação", show: canMessage },
    { href: "/notificacoes", label: "Notificações", icon: "bell", group: "Comunicação", show: true },
    { href: "/enquetes", label: "Enquetes", icon: "notebook", group: "Comunicação", show: SHOW_UNBUILT && canMessage },

    // INTELIGÊNCIA
    { href: "/relatorios", label: "Relatórios", icon: "bar-chart", group: "Inteligência", show: canReport },

    // ADMINISTRAÇÃO
    { href: "/perfis-permissoes", label: "Perfis e permissões", icon: "shield", group: "Administração", show: SHOW_UNBUILT && isAdmin },
    { href: "/configuracoes", label: "Configurações", icon: "settings", group: "Administração", show: isAdmin },
    { href: "/perfil", label: "Meu Perfil", icon: "user", group: "Administração", show: true },
  ].filter((n) => n.show) as NavItem[];

  // Apenas as listas (que usam SplitView de altura cheia) ficam sem scroll de
  // página. Sub-rotas como /escalas/nova e /escalas/[id] devem rolar normalmente.
  const isSplitPage = SPLIT_PAGES.includes(pathname);

  return (
    <div className="relative flex h-[100dvh] overflow-hidden">
      {/* Aurora background layer */}
      <div className="fixed inset-0 -z-10 overflow-hidden bg-[radial-gradient(60%_50%_at_12%_8%,rgba(255,107,87,0.10),transparent_60%),radial-gradient(55%_45%_at_92%_4%,rgba(56,189,240,0.09),transparent_60%),radial-gradient(50%_50%_at_82%_92%,rgba(155,140,251,0.09),transparent_60%),radial-gradient(45%_45%_at_6%_94%,rgba(45,212,167,0.08),transparent_60%),linear-gradient(180deg,#FBFAFF_0%,#F7F6FC_100%)]">
        <span className="aurora-blob b1" />
        <span className="aurora-blob b2" />
        <span className="aurora-blob b3" />
        <div className="aurora-grain" />
      </div>
      {/* Desktop sidebar */}
      {!isMobile && (
        <SidebarV2
          user={user}
          churchName={church.name}
          roleLabel={ROLE_LABELS[roles.primaryRole]}
          departments={departments}
          navItems={navItems}
          pathname={pathname}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onLogout={logout}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        {isMobile && (
          <header className="h-14 bg-white border-b border-sidebar-border flex items-center px-4 gap-3 flex-shrink-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
              aria-label="Abrir menu"
            >
              <MenuIcon />
            </button>
            <ServosLogoSmall />
            <span className="font-display font-bold text-[15px] text-ink">Servos</span>
            <span className="text-[11px] text-ink-faint truncate flex-1">{church.name}</span>
            <button
              onClick={() => setNotifOpen(true)}
              className="relative text-ink-muted hover:text-ink transition-colors p-1"
              aria-label="Notificações"
            >
              <BellIcon />
              {unreadNotifications > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-brand text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </button>
            <Link href="/perfil">
              <Avatar name={user.name} color={user.avatar_color} photoUrl={user.photo_url} size={30} />
            </Link>
          </header>
        )}

        {/* Page content */}
        {isSplitPage ? (
          <main className="flex-1 overflow-hidden flex flex-col p-4 sm:p-6 lg:p-8">
            <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col">{children}</div>
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 xl:px-10">
            <div className="mx-auto w-full max-w-[1200px]">{children}</div>
          </main>
        )}
      </div>

      {/* Mobile navigation drawer */}
      {isMobile && mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[84vw] max-w-[360px] flex-col border-r border-sidebar-border bg-white shadow-2xl">
            <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
              <ServosLogoSmall />
              <div className="min-w-0 flex-1">
                <div className="font-display text-[16px] font-bold text-ink">Servos</div>
                <div className="truncate text-[11px] font-semibold text-ink-faint">{church.name}</div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-full px-3 py-2 text-sm font-bold text-ink-muted hover:bg-surface-alt"
              >
                Fechar
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              {navItems.map((item) => {
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`mb-1 flex min-h-[46px] items-center justify-between rounded-[14px] px-4 text-[14px] font-semibold transition-colors ${
                      active ? "bg-brand text-white" : "text-ink-muted hover:bg-surface-alt hover:text-ink"
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.href === "/notificacoes" && unreadNotifications > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? "bg-white/20 text-white" : "bg-brand text-white"}`}>
                        {unreadNotifications > 9 ? "9+" : unreadNotifications}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-sidebar-border p-3">
              {(isAdmin || isLeader) && (
                <Link href="/escalas/nova" onClick={() => setMobileMenuOpen(false)} className="btn btn-primary mb-2 w-full">
                  Nova escala
                </Link>
              )}
              {canDo("member.invite") && (
                <Link href="/pessoas/convidar" onClick={() => setMobileMenuOpen(false)} className="btn btn-secondary w-full">
                  Convidar pessoa
                </Link>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Notification panel */}
      <NotificationPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        userId={user.id}
        onMarkAllRead={() => setUnreadNotifications(0)}
      />

      <SupportButton />
    </div>
  );
}
