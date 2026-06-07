"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils/helpers";
import type { User } from "@/types";

type IconName =
  | "arrow"
  | "bell"
  | "calendar"
  | "check"
  | "chevron"
  | "clock"
  | "heart"
  | "home"
  | "message"
  | "plus"
  | "search"
  | "settings"
  | "spark"
  | "users";

type Tone = "coral" | "care" | "cell" | "visitor" | "neutral";
type ProfileMode = "admin" | "hybrid" | "departmentMember" | "cellMember" | "connect";

export type PriorityCard = {
  label: string;
  value: number | string;
  description: string;
  href: string;
  action: string;
  icon: IconName;
  tone: Tone;
};

export type PriorityListItem = {
  title: string;
  meta: string;
  badge: string;
  href: string;
  icon: IconName;
};

export type TimelineItem = {
  title: string;
  meta: string;
  time: string;
  tone: Tone;
  icon: IconName;
};

export type UpcomingEventItem = {
  title: string;
  meta: string;
  time: string;
  location: string;
  badge: string;
  href: string;
  icon: IconName;
};

export type CarePerson = {
  id: string;
  name: string;
  reason: string;
  lastPresence: string;
  badge: string;
  avatarColor: string;
  photoUrl: string | null;
};

export type Insight = {
  value: string;
  label: string;
  description: string;
  trend?: number[];
  icon?: IconName;
};

export type CellSummary = {
  name: string;
  nextMeeting: string;
  notice: string;
  leader: string;
  prayerCount: number;
  href: string;
  leaders?: Array<{ name: string; role: string }>;
  userIsLeader?: boolean;
};

export type PrayerRequestCardData = {
  title: string;
  description: string;
  person: string;
  href: string;
};

export type QuickActionItem = {
  label: string;
  href: string;
  icon: IconName;
};

export type NoticeItem = {
  title: string;
  body: string;
  time: string;
  href: string;
  scope: "Ministério" | "Célula" | "Aviso";
};

export type DashboardV3Data = {
  profileMode: ProfileMode;
  greeting: string;
  heroTitle: string;
  heroSummary: string;
  heroFocus: string;
  user: User;
  churchName: string;
  unreadNotifications: number;
  priorities: PriorityCard[];
  priorityItems: PriorityListItem[];
  timeline: TimelineItem[];
  upcoming: UpcomingEventItem[];
  carePeople: CarePerson[];
  insights: Insight[];
  cell?: CellSummary;
  prayers: PrayerRequestCardData[];
  quickActions: QuickActionItem[];
  notices: NoticeItem[];
};

const toneSurface: Record<Tone, string> = {
  coral: "bg-[#FFF0EC] text-[#191919]",
  care: "bg-[#FFF8ED] text-[#191919]",
  cell: "bg-[#F5F0FF] text-[#191919]",
  visitor: "bg-[#EEF9F1] text-[#191919]",
  neutral: "bg-white text-[#191919]",
};

const toneIcon: Record<Tone, string> = {
  coral: "bg-white/75 text-[#FF6B57]",
  care: "bg-white/80 text-[#D99025]",
  cell: "bg-white/80 text-[#7B61FF]",
  visitor: "bg-white/80 text-[#33995B]",
  neutral: "bg-[#FAFAF8] text-[#6E6E6E]",
};

const toneActionButton: Record<Tone, string> = {
  coral: "bg-[#FF6B57] text-white shadow-[0_16px_30px_-20px_rgba(255,107,87,0.9)] hover:bg-[#F0492F]",
  care: "bg-[#E7A13A] text-white shadow-[0_16px_30px_-20px_rgba(215,143,36,0.85)] hover:bg-[#C07B1A]",
  cell: "bg-[#6D5DF0] text-white shadow-[0_16px_30px_-20px_rgba(109,93,240,0.88)] hover:bg-[#4A5ADE]",
  visitor: "bg-[#2A9A57] text-white shadow-[0_16px_30px_-20px_rgba(42,154,87,0.85)] hover:bg-[#1F8044]",
  neutral: "bg-[#ECEAE4] text-[#191919] hover:bg-[#E0DDD5]",
};

const toneDot: Record<Tone, string> = {
  coral: "bg-[#FF6B57]",
  care: "bg-[#E7A13A]",
  cell: "bg-[#8C72FF]",
  visitor: "bg-[#45A86B]",
  neutral: "bg-[#B9B5C9]",
};

const toneIconStyle: Record<Tone, string> = {
  coral:   "bg-[#FFF0EC] text-[#FF6B57]",
  care:    "bg-[#FFF8ED] text-[#C07B1A]",
  cell:    "bg-[#EEF1FF] text-[#4A5ADE]",
  visitor: "bg-[#EEFAF2] text-[#1F8044]",
  neutral: "bg-[#FAFAF8] text-[#6E6E6E]",
};

function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  const s = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
    shapeRendering: "geometricPrecision" as const,
    className: cn("block overflow-visible antialiased", className),
  };
  const icons: Record<IconName, React.ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8.8 12.2 2.2 2.2 4.2-4.4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8Z" />,
    home: <><path d="M3 10 12 3l9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10Z" /><path d="M9 22V12h6v10" /></>,
    message: <><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4.2-4.2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    spark: <><path d="M13 2 6 14h6l-1 8 7-12h-6l1-8Z" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.8" /><path d="M16 3.2a4 4 0 0 1 0 7.6" /></>,
  };
  return <svg {...s}>{icons[name]}</svg>;
}

function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#767676]">{eyebrow}</div>}
        <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-[#191919] md:text-[24px]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Panel({
  children,
  className,
  dataSectionId,
}: {
  children: React.ReactNode;
  className?: string;
  dataSectionId?: string;
}) {
  return (
    <motion.section
      data-section={dataSectionId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={cn(
        "min-w-0 rounded-[28px] border border-[#F0EFEB] bg-white shadow-[0_18px_50px_-34px_rgba(25,25,25,0.35)]",
        className,
      )}
    >
      {children}
    </motion.section>
  );
}

export function DashboardHero({
  title,
  unreadNotifications,
  quickActions,
}: {
  title: string;
  unreadNotifications: number;
  quickActions: QuickActionItem[];
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [namePart, ...rest] = title.split(". ");
  const subtitlePart = rest.join(". ");
  const emoji = title.startsWith("Bom dia")
    ? "☀️"
    : title.startsWith("Boa tarde")
    ? "🌤️"
    : title.startsWith("Boa noite")
    ? "🌙"
    : "👋";

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setQuickActionsOpen(false);
      }
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <section
      data-section="hero"
      className="rounded-[34px] border border-white/90 bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF0EC_48%,#FAFAF8_100%)] px-6 py-6 shadow-[0_14px_36px_-28px_rgba(25,25,25,0.35)] md:px-10 md:py-8"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
        <div>
          <h1 className="leading-[1.04] tracking-[-0.03em] text-[#1F1F2B]">
            <span className="text-[32px] font-semibold">
              {namePart} <span className="aurora-wave inline-block text-[0.78em]">{emoji}</span>
            </span>
            {subtitlePart && (
              <span className="mt-1 block text-[15px] font-normal text-[#5D5D66]">
                {subtitlePart}
              </span>
            )}
          </h1>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <div ref={searchWrapperRef} className="relative">
            <button
              onClick={() => setSearchOpen((prev) => !prev)}
              className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/40 text-[#6B6B6B] backdrop-blur transition hover:bg-white/70"
              aria-label="Abrir busca"
            >
              <Icon name="search" size={16} />
            </button>
            {searchOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(92vw,380px)] rounded-[16px] border border-[#F0EFEB] bg-white p-2 shadow-[0_18px_45px_-25px_rgba(25,25,25,0.35)]">
                <label className="flex h-10 items-center gap-2 rounded-full border border-[#F0EFEB] bg-white px-3 text-[13px] text-[#6E6E6E]">
                  <Icon name="search" size={15} />
                  <input
                    ref={searchInputRef}
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    className="min-w-0 flex-1 border-0 bg-transparent text-[#191919] outline-none placeholder:text-[#767676]"
                    placeholder="Buscar pessoas, escalas, células, ministérios..."
                  />
                </label>
              </div>
            )}
          </div>

          <Link
            href="/notificacoes"
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/40 text-[#6B6B6B] backdrop-blur transition hover:bg-white/70"
            aria-label="Notificações"
          >
            <Icon name="bell" size={17} />
            {unreadNotifications > 0 && (
              <span className="absolute right-2 top-2.5 h-2 w-2 rounded-full bg-[#FF6B57]" />
            )}
          </Link>

          <div ref={actionsRef} className="relative">
            <button
              onClick={() => setQuickActionsOpen((v) => !v)}
              className="flex h-11 items-center gap-2 rounded-full bg-[#FF6B57] px-5 text-[13px] font-semibold text-white shadow-[0_16px_34px_-18px_rgba(255,107,87,0.55)] transition hover:brightness-[0.97]"
            >
              <Icon name="plus" size={16} />
              <span>Ações rápidas</span>
              <Icon name="chevron" size={14} className={cn("transition-transform duration-200", quickActionsOpen && "rotate-90")} />
            </button>

            {quickActionsOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-44 overflow-hidden rounded-[14px] border border-[#F0EFEB] bg-white shadow-[0_12px_32px_-16px_rgba(25,25,25,0.25)]">
                {quickActions.map((item, i, arr) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setQuickActionsOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-[#191919] transition hover:bg-[#FAFAF8]",
                      i < arr.length - 1 && "border-b border-[#F0EFEB]",
                    )}
                  >
                    <Icon name={item.icon} size={14} />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function PriorityCards({ items }: { items: PriorityCard[] }) {
  return (
    <section id="priority-cards" data-section="priority-cards" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: index * 0.04 }}
        >
          <Link
            href={item.href}
            className={cn(
              "group flex items-center gap-4 rounded-[22px] border border-white/70 p-4 shadow-[0_8px_28px_-16px_rgba(25,25,25,0.18)] transition hover:shadow-[0_12px_36px_-16px_rgba(25,25,25,0.22)]",
              toneSurface[item.tone],
            )}
          >
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
                toneIcon[item.tone],
              )}
            >
              <Icon name={item.icon} size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[26px] font-bold leading-none tracking-[-0.05em] text-[#191919]">
                {item.value}
              </div>
              <div className="mt-1 text-[13px] font-semibold leading-tight text-[#191919] line-clamp-2">{item.label}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-[#6B6B6B] line-clamp-1">{item.description}</div>
            </div>
            <Icon
              name="arrow"
              size={14}
              className="shrink-0 text-[#CCCCCC] transition group-hover:text-[#191919]"
            />
          </Link>
        </motion.div>
      ))}
    </section>
  );
}

const priorityBadgeColors: Record<string, string> = {
  Escalas: "bg-[#FFF0EC] text-[#F0492F]",
  Cuidado: "bg-[#FFF8ED] text-[#C07B1A]",
  Células: "bg-[#EEF1FF] text-[#4A5ADE]",
  Pessoas: "bg-[#EEFAF2] text-[#1F8044]",
  Hoje: "bg-[#FFF0EC] text-[#FF6B57] font-bold",
};

const priorityIconColors: Record<string, string> = {
  Escalas: "bg-[#FFF0EC] text-[#FF6B57]",
  Cuidado: "bg-[#FFF8ED] text-[#C07B1A]",
  Células: "bg-[#EEF1FF] text-[#4A5ADE]",
  Pessoas: "bg-[#EEFAF2] text-[#1F8044]",
  Hoje: "bg-[#FFF0EC] text-[#FF6B57]",
};

const priorityFallbackColors = { badge: "bg-[#F0EFEB] text-[#6E6E6E]", icon: "bg-[#FAFAF8] text-[#6E6E6E]" };

export function PriorityList({ items }: { items: PriorityListItem[] }) {
  return (
    <Panel className="p-6" dataSectionId="priority-list">
      <SectionTitle title="Prioridades de hoje" eyebrow="Ações" />
      <div className="space-y-2">
        {items.map((item) => {
          const badgeClass = priorityBadgeColors[item.badge] ?? priorityFallbackColors.badge;
          const iconClass = priorityIconColors[item.badge] ?? priorityFallbackColors.icon;
          return (
            <Link
              key={item.title}
              href={item.href}
              className="group flex items-center gap-3 rounded-[18px] py-3 transition hover:bg-[#FAFAF8]"
            >
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", iconClass)}>
                <Icon name={item.icon} size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-[#191919]">{item.title}</div>
                <div className="truncate text-[12px] text-[#6E6E6E]">{item.meta}</div>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", badgeClass)}>{item.badge}</span>
              <Icon name="chevron" size={16} className="text-[#767676] transition group-hover:text-[#191919]" />
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

export function ActivityTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <Panel className="p-6" dataSectionId="timeline">
      <SectionTitle title="Timeline viva" eyebrow="Comunidade" />
      <div className="relative space-y-1">
        <div className="absolute bottom-6 left-[20px] top-3 w-px bg-[#F0EFEB]" />
        {items.slice(0, 4).map((item) => (
          <div key={`${item.title}-${item.time}`} className="relative flex gap-4 py-3">
            <div className={cn("relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[15px]", toneIconStyle[item.tone])}>
              <Icon name={item.icon} size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="truncate text-[14px] font-semibold text-[#191919]">{item.title}</div>
                <div className="flex-shrink-0 text-[11px] font-medium text-[#767676]">{item.time}</div>
              </div>
              <p className="mt-1 text-[12px] leading-5 text-[#6E6E6E]">{item.meta}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const eventIconColors: Record<string, { bg: string; text: string }> = {
  calendar: { bg: "bg-[#FFF0EC]", text: "text-[#FF6B57]" },
  home: { bg: "bg-[#EEF1FF]", text: "text-[#4A5ADE]" },
  spark: { bg: "bg-[#FFF8ED]", text: "text-[#C07B1A]" },
};

const eventIconFallback = { bg: "bg-[#FAFAF8]", text: "text-[#6E6E6E]" };

export function UpcomingEvents({ items }: { items: UpcomingEventItem[] }) {
  return (
    <Panel className="p-6" dataSectionId="upcoming-events">
      <SectionTitle title="Próximos encontros" eyebrow="Agenda" />
      <div className="grid gap-3">
        {items.slice(0, 4).map((item) => {
          const iconStyle = eventIconColors[item.icon] ?? eventIconFallback;
          return (
            <Link
              key={`${item.title}-${item.time}`}
              href={item.href}
              className="block rounded-[20px] border border-[#F0EFEB] bg-[linear-gradient(180deg,#FFFFFF_0%,#FFFCFA_100%)] p-3.5 transition hover:border-[#E6E0D7] hover:bg-white"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[15px]",
                    iconStyle.bg,
                    iconStyle.text,
                  )}
                >
                  <Icon name={item.icon} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate text-[14px] font-semibold text-[#191919]">{item.title}</div>
                    <span className="flex-shrink-0 rounded-full bg-[#FFF0EC] px-2 py-0.5 text-[10px] font-semibold text-[#F0492F]">
                      {item.badge}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] font-medium text-[#6E6E6E]">{item.time}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

export function MemberAgenda({ items }: { items: UpcomingEventItem[] }) {
  return (
    <Panel className="p-6" dataSectionId="member-agenda">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#767676]">
            Agenda pessoal
          </div>
          <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-[#191919] md:text-[24px]">
            Seus compromissos
          </h2>
        </div>
        <Link
          href="/escalas"
          className="shrink-0 text-[13px] font-semibold text-[#FF6B57] transition hover:opacity-75"
        >
          Ver todos
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[#E6E0D7] bg-[#FAFAF8] px-5 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[18px] bg-white text-[#FF6B57]">
            <Icon name="calendar" size={20} />
          </div>
          <div className="mt-4 text-[15px] font-bold text-[#191919]">Nenhum compromisso publicado</div>
          <p className="mx-auto mt-1 max-w-[300px] text-[13px] leading-5 text-[#6E6E6E]">
            Quando houver escala, encontro de célula ou evento para você, aparece aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {items.slice(0, 4).map((item) => {
            const isEscala = item.icon === "calendar";
            const isPending = isEscala && item.badge === "Confirmar";
            const isConfirmed = isEscala && !isPending;
            const surface = isPending
              ? "bg-[#FFF0EC] border-[rgba(255,107,87,0.18)]"
              : isConfirmed
              ? "bg-[#EEF9F1] border-[#C8EDD5]"
              : "bg-[#EEF1FF] border-[rgba(74,90,222,0.14)]";
            const iconColor = isPending
              ? "text-[#FF6B57]"
              : isConfirmed
              ? "text-[#1F8044]"
              : "text-[#4A5ADE]";
            return (
              <div
                key={`${item.title}-${item.time}`}
                className={cn(
                  "flex min-h-[150px] flex-col justify-between rounded-[20px] border p-4 transition hover:shadow-[0_10px_28px_-16px_rgba(25,25,25,0.18)]",
                  surface,
                )}
              >
                <div>
                  <div
                    className={cn(
                      "mb-3 flex h-[38px] w-[38px] items-center justify-center rounded-[12px] bg-white",
                      iconColor,
                    )}
                  >
                    <Icon name={item.icon} size={17} />
                  </div>
                  <div className="text-[14px] font-bold leading-tight text-[#191919]">{item.title}</div>
                  <div className="mt-1.5 text-[11px] leading-5 text-[#6E6E6E]">{item.time}</div>
                </div>
                <div className="mt-3">
                  {isPending ? (
                    <div className="flex gap-2">
                      <Link
                        href={item.href}
                        className="rounded-full bg-[#FF6B57] px-3 py-1.5 text-[10px] font-bold text-white shadow-[0_4px_10px_-4px_rgba(255,107,87,0.55)] transition hover:bg-[#F0492F]"
                      >
                        ✓ Vou
                      </Link>
                      <Link
                        href={item.href}
                        className="rounded-full border border-[#F0EFEB] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#6E6E6E] transition hover:bg-[#FAFAF8]"
                      >
                        ✕
                      </Link>
                    </div>
                  ) : isConfirmed ? (
                    <span className="inline-block rounded-full border border-[#C8EDD5] bg-white/80 px-3 py-1 text-[10px] font-bold text-[#1F8044]">
                      ✓ Confirmado
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className="inline-block rounded-full border border-[rgba(74,90,222,0.25)] bg-white/80 px-3 py-1 text-[10px] font-bold text-[#4A5ADE] transition hover:bg-[#EEF1FF]"
                    >
                      Ver célula →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

const careBadgeColors: Record<string, string> = {
  "Atenção pastoral": "bg-[#FFF0EC] text-[#F0492F]",
  "Participação baixa": "bg-[#FFF8ED] text-[#C07B1A]",
  "Visitante":         "bg-[#EEF1FF] text-[#4A5ADE]",
  "Reconectado":       "bg-[#EEFAF2] text-[#1F8044]",
  "3 faltas seguidas": "bg-[#EEF1FF] text-[#4A5ADE]",
};
const careBadgeFallback = "bg-[#F0EFEB] text-[#6E6E6E]";

export function CarePeopleSection({ people }: { people: CarePerson[] }) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    function onScroll() {
      const firstCard = el!.firstElementChild as HTMLElement | null;
      const cardW = firstCard ? firstCard.offsetWidth + 16 : el!.offsetWidth;
      const idx = Math.min(Math.round(el!.scrollLeft / cardW), people.length - 1);
      setActive(idx);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [people.length]);

  function goTo(idx: number) {
    const el = trackRef.current;
    if (!el) return;
    const firstCard = el.firstElementChild as HTMLElement | null;
    const cardW = firstCard ? firstCard.offsetWidth + 16 : el.offsetWidth;
    el.scrollTo({ left: idx * cardW, behavior: "smooth" });
    setActive(idx);
  }

  const careActions: Record<string, { label: string; icon: IconName }> = {
    "Atenção pastoral": { label: "Acompanhar", icon: "users" },
    "Participação baixa": { label: "Contato", icon: "message" },
    "Visitante": { label: "Acompanhar", icon: "users" },
    "Reconectado": { label: "Orar", icon: "heart" },
    "3 faltas seguidas": { label: "Orar", icon: "heart" },
  };
  const defaultAction: { label: string; icon: IconName } = { label: "Orar", icon: "heart" };
  const getLastLabel = (badge: string) =>
    badge === "Participação baixa" ? "Último contato" : "Último encontro";

  return (
    <Panel className="flex h-full flex-col bg-white p-6" dataSectionId="care-people">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#191919] md:text-[22px]">
          Pessoas precisando de cuidado
        </h2>
        <Link href="/pessoas" className="shrink-0 text-[13px] font-semibold text-[#FF6B57] transition hover:opacity-75">
          Ver todas
        </Link>
      </div>

      <div
        ref={trackRef}
        className="flex flex-1 gap-4 overflow-x-auto pb-1"
        style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none" } as React.CSSProperties}
      >
        {people.map((person) => {
          const action = careActions[person.badge] ?? defaultAction;
          return (
            <div
              key={person.id}
              className="flex w-[190px] sm:w-[200px] shrink-0 flex-col rounded-[22px] border border-[#F0EFEB] bg-white p-4 shadow-[0_6px_20px_-12px_rgba(25,25,25,0.14)]"
              style={{ scrollSnapAlign: "start" } as React.CSSProperties}
            >
              <div className="flex items-center gap-3">
                <Avatar name={person.name} color={person.avatarColor} photoUrl={person.photoUrl} size={48} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[#191919]">{person.name}</div>
                  <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", careBadgeColors[person.badge] ?? careBadgeFallback)}>
                    {person.badge}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex-1">
                <div className="text-[11px] text-[#BBBBBB]">{getLastLabel(person.badge)}</div>
                <div className="mt-0.5 text-[12px] font-medium text-[#555555]">{person.lastPresence}</div>
              </div>
              <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-[#EBEBEB] px-4 py-2.5 text-[12px] font-semibold text-[#333333] transition hover:bg-[#FAFAF8]">
                <Icon name={action.icon} size={13} />
                {action.label}
              </button>
            </div>
          );
        })}
      </div>

      {people.length > 1 && (
        <div className="mt-4 flex justify-center gap-1.5">
          {people.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={cn("h-2 rounded-full transition-all duration-200", i === active ? "w-5 bg-[#FF6B57]" : "w-2 bg-[#E5E3DE]")}
              aria-label={`Pessoa ${i + 1}`}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

const INSIGHT_COLORS = ["#1F8044", "#6D5DF0", "#C07B1A", "#3B6CF4"] as const;
const insightValueColors = ["text-[#1F8044]", "text-[#6D5DF0]", "text-[#C07B1A]", "text-[#3B6CF4]"];
const insightIconBg = [
  "bg-[#EEFAF2] text-[#1F8044]",
  "bg-[#EEF1FF] text-[#6D5DF0]",
  "bg-[#FFF8ED] text-[#C07B1A]",
  "bg-[#EEF4FF] text-[#3B6CF4]",
];

const insightCardBg = [
  "bg-[#F4FBF7]",
  "bg-[#F2F1FD]",
  "bg-[#FDF8F2]",
  "bg-[#EFF4FD]",
];

function Sparkline({ data, color, idx }: { data: number[]; color: string; idx: number }) {
  if (data.length < 2) return null;
  const W = 200;
  const H = 52;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (W - pad * 2),
    pad + (1 - (v - min) / range) * (H - pad * 2),
  ]);
  const line = pts.map((p) => p.join(",")).join(" ");
  const area = `${pts[0][0]},${H} ${line} ${pts[pts.length - 1][0]},${H}`;
  const gid = `ins-grad-${idx}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InsightCards({ items, className }: { items: Insight[]; className?: string }) {
  return (
    <Panel className={cn("flex h-full flex-col bg-white p-6", className)} dataSectionId="insights">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#191919] md:text-[22px]">
          Insights da semana
        </h2>
        <Link
          href="/relatorios"
          className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-[#FF6B57] transition hover:opacity-75"
        >
          Ver relatório completo
          <Icon name="arrow" size={13} />
        </Link>
      </div>
      <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item, index) => {
          const idx = index % 4;
          return (
            <div
              key={item.label}
              className={cn("flex h-full flex-col overflow-hidden rounded-[20px] border border-white", insightCardBg[idx])}
            >
              <div className="flex flex-1 flex-col items-center p-4 pb-2 text-center">
                {item.icon && (
                  <div className={cn("mb-3 flex h-11 w-11 items-center justify-center rounded-[14px]", insightIconBg[idx])}>
                    <Icon name={item.icon} size={20} />
                  </div>
                )}
                <div className={cn("text-[30px] font-bold leading-none tracking-[-0.05em]", insightValueColors[idx])}>
                  {item.value}
                </div>
                <div className="mt-1.5 text-[13px] font-semibold text-[#191919]">{item.label}</div>
                <div className="mt-0.5 text-[11px] text-[#767676]">{item.description}</div>
              </div>
              {item.trend && item.trend.length > 1 && (
                <div className="px-3 pb-3">
                  <Sparkline data={item.trend} color={INSIGHT_COLORS[idx]} idx={index} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function CellCard({ cell }: { cell?: CellSummary }) {
  if (!cell) return null;
  return (
    <Panel className="overflow-hidden bg-[#F5F0FF]" dataSectionId="cell">
      <div className="p-6">
        <SectionTitle title="Minha célula" eyebrow="Comunhão" />
        <div className="rounded-[26px] bg-white/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[22px] font-bold tracking-[-0.035em] text-[#191919]">{cell.name}</div>
              <p className="mt-2 text-[13px] leading-6 text-[#6E6E6E]">{cell.nextMeeting}</p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[#F5F0FF] text-[#7B61FF]">
              <Icon name="home" size={24} />
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[18px] bg-[#FAFAF8] p-4 sm:col-span-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#767676]">Aviso da célula</div>
              <div className="mt-1 text-[13px] leading-5 text-[#191919]">{cell.notice}</div>
            </div>
            <div className="rounded-[18px] bg-[#FAFAF8] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#767676]">Pedidos</div>
              <div className="mt-1 text-[26px] font-bold leading-none tracking-[-0.04em] text-[#7B61FF]">{cell.prayerCount}</div>
              <div className="mt-1 text-[12px] text-[#6E6E6E]">em oração</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-white/45 px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#767676]">Liderança</div>
            <div className="mt-0.5 text-[13px] font-semibold text-[#191919]">{cell.leader}</div>
          </div>
          <Link href={cell.href} className="rounded-full bg-[#6D5DF0] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_14px_28px_-18px_rgba(109,93,240,0.85)]">Abrir célula</Link>
        </div>
      </div>
    </Panel>
  );
}

export function PrayerRequestCard({ items }: { items: PrayerRequestCardData[] }) {
  if (!items.length) return null;
  return (
    <Panel className="p-6" dataSectionId="prayer-requests">
      <SectionTitle title="Pedidos de oração" eyebrow="Cuidado" />
      <div className="space-y-3">
        {items.map((item) => (
          <Link key={item.title} href={item.href} className="block rounded-[20px] border border-[#F0EFEB] bg-white p-4 transition hover:bg-[#FAFAF8]">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-[#FFF8ED] text-[#D99025]">
                <Icon name="heart" size={18} />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-[#191919]">{item.title}</div>
                <p className="mt-1 text-[12px] leading-5 text-[#6E6E6E]">{item.description}</p>
                <div className="mt-2 text-[11px] font-medium text-[#767676]">{item.person}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function MemberCellPanel({ cell }: { cell?: CellSummary }) {
  return (
    <Panel
      className="overflow-hidden border-[rgba(109,93,240,0.12)] shadow-[0_14px_40px_-28px_rgba(109,93,240,0.2)]"
      dataSectionId="member-cell"
    >
      <div className="h-[5px] bg-[linear-gradient(90deg,#6D5DF0,#8C78FF)]" />
      <div className="p-6">
        {cell ? (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6E6A82]">
                  Minha célula
                </div>
                <h2 className="text-[24px] font-extrabold leading-tight tracking-[-0.04em] text-[#191919]">
                  {cell.name}
                </h2>
                <div className="mt-1 text-[13px] font-semibold text-[#6D5DF0]">{cell.nextMeeting}</div>
                {cell.userIsLeader && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#6D5DF0] px-3 py-1 text-[11px] font-bold text-white">
                    <Icon name="spark" size={11} />
                    Você lidera esta célula
                  </div>
                )}
              </div>
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[16px] bg-[#F5F0FF] text-[#6D5DF0]">
                <Icon name="home" size={22} />
              </div>
            </div>

            <div className="mb-4 rounded-[16px] bg-[#FAFAF8] p-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#767676]">
                Recado da célula
              </div>
              <div className="mt-1 text-[13px] leading-5 text-[#191919]">{cell.notice}</div>
            </div>

            <div className="mb-5">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#767676]">
                Liderança
              </div>
              <div className="flex flex-col gap-2">
                {(cell.leaders && cell.leaders.length > 0
                  ? cell.leaders
                  : [{ name: cell.leader, role: "Líder" }]
                ).map((leader, index) => (
                  <div
                    key={leader.name}
                    className={cn(
                      "flex items-center gap-3 rounded-[14px] px-3 py-2.5",
                      index === 0 ? "bg-[#F5F0FF]" : "bg-[#FAFAF8]",
                    )}
                  >
                    <div
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: index === 0 ? "#6D5DF0" : "#C07B1A" }}
                    >
                      {leader.name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((n) => n.charAt(0))
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-[#191919]">{leader.name}</div>
                      <div className="text-[11px] text-[#6E6A82]">{leader.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Link
              href={cell.href}
              className="block w-full rounded-full bg-[#6D5DF0] px-4 py-2.5 text-center text-[13px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(109,93,240,0.65)] transition hover:bg-[#5849D6]"
            >
              Abrir célula
            </Link>
          </>
        ) : (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6E6A82]">
              Minha célula
            </div>
            <div className="mt-5 rounded-[20px] border border-dashed border-[rgba(109,93,240,0.25)] bg-[#FAFAF8] p-5">
              <div className="text-[16px] font-bold text-[#191919]">
                Você ainda não está em uma célula.
              </div>
              <p className="mt-2 text-[13px] leading-6 text-[#6E6E6E]">
                Escolha uma célula próxima e comece a participar da vida em comunidade.
              </p>
              <Link
                href="/celulas"
                className="mt-4 inline-flex rounded-full bg-[#FF6B57] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_24px_-14px_rgba(255,107,87,0.7)] transition hover:bg-[#F0492F]"
              >
                Ver células
              </Link>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

const prayerAvatarColors = ["#C07B1A", "#4A5ADE", "#1F8044", "#F0492F"];

function MemberPrayerPanel({ items }: { items: PrayerRequestCardData[] }) {
  return (
    <Panel className="flex flex-col p-6" dataSectionId="member-prayers">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#767676]">
            Cuidado
          </div>
          <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-[#191919] md:text-[24px]">
            Pedidos de oração
          </h2>
        </div>
        <Link
          href="/pedidos-oracao"
          className="shrink-0 text-[13px] font-semibold text-[#FF6B57] transition hover:opacity-75"
        >
          Ver todos
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex-1 rounded-[20px] border border-dashed border-[#E6E0D7] bg-[#FAFAF8] px-5 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[18px] bg-white text-[#C07B1A]">
            <Icon name="heart" size={20} />
          </div>
          <div className="mt-3 text-[14px] font-bold text-[#191919]">Nenhum pedido ainda</div>
          <p className="mx-auto mt-1 max-w-[240px] text-[12px] leading-5 text-[#6E6E6E]">
            Compartilhe um pedido e a célula ora por você.
          </p>
        </div>
      ) : (
        <div className="flex-1 divide-y divide-[#F0EFEB]">
          {items.slice(0, 3).map((item, index) => (
            <Link
              key={item.title}
              href={item.href}
              className="flex items-start gap-3 py-3.5 transition hover:opacity-80"
            >
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                style={{ background: prayerAvatarColors[index % prayerAvatarColors.length] }}
              >
                {item.person
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n.charAt(0))
                  .join("")
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-[#191919]">{item.person}</div>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-[#6E6E6E]">
                  {item.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Link
        href="/pedidos-oracao"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-[#E6E0D7] bg-[#FAFAF8] py-3 text-[13px] font-bold text-[#6E6E6E] transition hover:bg-white"
      >
        <Icon name="plus" size={14} />
        Fazer pedido de oração
      </Link>
    </Panel>
  );
}

const MEMBER_MINISTRIES = [
  {
    title: "Louvor",
    description: "Use seu talento para glorificar a Deus.",
    spots: "3 vagas",
    icon: "spark" as IconName,
    surface: "bg-[#EEF9F1] border-[#C8EDD5]",
    accent: "text-[#1F8044]",
  },
  {
    title: "Acolhimento",
    description: "Receba as pessoas com amor e alegria.",
    spots: "5 vagas",
    icon: "heart" as IconName,
    surface: "bg-[#FFF8ED] border-[#F2E0C2]",
    accent: "text-[#C07B1A]",
  },
  {
    title: "Ministério Kids",
    description: "Trabalhe com crianças e faça a diferença.",
    spots: "2 vagas",
    icon: "users" as IconName,
    surface: "bg-[#F5F0FF] border-[#DDD4FE]",
    accent: "text-[#6D5DF0]",
  },
  {
    title: "Mídia",
    description: "Sirva com criatividade na comunicação.",
    spots: "4 vagas",
    icon: "message" as IconName,
    surface: "bg-[#EEF4FF] border-[#C5D8FE]",
    accent: "text-[#3B6CF4]",
  },
];

function MemberMinistryGrid() {
  return (
    <Panel className="p-6" dataSectionId="member-ministry">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#767676]">
            Serviço
          </div>
          <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-[#191919] md:text-[24px]">
            Em que você quer servir?
          </h2>
        </div>
        <Link
          href="/ministerios"
          className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-[#FF6B57] transition hover:opacity-75"
        >
          Ver ministérios
          <Icon name="arrow" size={13} />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MEMBER_MINISTRIES.map((item) => (
          <Link
            key={item.title}
            href="/ministerios"
            className={cn(
              "flex min-h-[148px] flex-col justify-between rounded-[20px] border p-5 transition hover:shadow-[0_14px_36px_-22px_rgba(25,25,25,0.22)]",
              item.surface,
            )}
          >
            <div>
              <div
                className={cn(
                  "mb-3 flex h-10 w-10 items-center justify-center rounded-[14px] bg-white",
                  item.accent,
                )}
              >
                <Icon name={item.icon} size={18} />
              </div>
              <div className="text-[15px] font-bold leading-tight text-[#191919]">{item.title}</div>
              <div className="mt-1.5 text-[12px] leading-5 text-[#6E6E6E]">{item.description}</div>
            </div>
            <span
              className={cn(
                "mt-4 inline-block rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold",
                item.accent,
              )}
            >
              {item.spots}
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function MemberSchedulePanel({ items }: { items: UpcomingEventItem[] }) {
  return (
    <Panel className="p-6" dataSectionId="member-schedules">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#767676]">
            Ministério
          </div>
          <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-[#191919] md:text-[24px]">
            Minhas escalas
          </h2>
        </div>
        <Link
          href="/escalas"
          className="shrink-0 text-[13px] font-semibold text-[#FF6B57] transition hover:opacity-75"
        >
          Ver todas
        </Link>
      </div>
      <div className="flex flex-col gap-3">
        {items.slice(0, 4).map((item) => {
          const isPending = item.badge === "Confirmar";
          return (
            <div
              key={`${item.title}-${item.time}`}
              className={cn(
                "flex items-center gap-3 rounded-[16px] p-3",
                isPending
                  ? "border border-[rgba(255,107,87,0.18)] bg-[#FFF0EC]"
                  : "border border-[#F0EFEB] bg-white",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[12px] bg-white",
                  isPending ? "text-[#FF6B57]" : "text-[#1F8044]",
                )}
              >
                <Icon name="calendar" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-[#191919]">{item.title}</div>
                <div className="mt-0.5 text-[11px] text-[#6E6E6E]">{item.time}</div>
              </div>
              {isPending ? (
                <div className="flex flex-shrink-0 gap-1.5">
                  <Link
                    href={item.href}
                    className="rounded-full bg-[#FF6B57] px-3 py-1.5 text-[10px] font-bold text-white shadow-[0_4px_10px_-4px_rgba(255,107,87,0.5)] transition hover:bg-[#F0492F]"
                  >
                    ✓ Vou
                  </Link>
                  <Link
                    href={item.href}
                    className="rounded-full border border-[#F0EFEB] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#6E6E6E] transition hover:bg-[#FAFAF8]"
                  >
                    ✕
                  </Link>
                </div>
              ) : (
                <span className="flex-shrink-0 rounded-full bg-[#EEF9F1] px-2.5 py-1 text-[10px] font-bold text-[#1F8044]">
                  ✓ Confirmado
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function HybridHomeSections({ data }: { data: DashboardV3Data }) {
  // Líderes de célula/ministério: sem os cards de prioridade (confirmações
  // pendentes, pessoas em cuidado, células, visitantes), sem "Pessoas
  // precisando de cuidado", sem "Insights da semana" (tudo exclusivo de
  // Admin/Pastor/Coordenador/Supervisor) e sem "Agenda pessoal" (já coberta
  // por "Próximos encontros"). As próprias escalas aparecem em destaque.
  const scheduleItems = data.upcoming.filter((item) => item.icon === "calendar");
  const hasSchedules = scheduleItems.length > 0;

  return (
    <>
      {hasSchedules && <MemberSchedulePanel items={scheduleItems} />}

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,340px)]">
        <PriorityList items={data.priorityItems} />
        <ActivityTimeline items={data.timeline} />
        <UpcomingEvents items={data.upcoming} />
      </section>

      <section className="grid min-w-0 items-stretch gap-6 xl:grid-cols-2">
        <MemberCellPanel cell={data.cell} />
        <MemberPrayerPanel items={data.prayers} />
      </section>
    </>
  );
}

function MemberHomeSections({ data }: { data: DashboardV3Data }) {
  const scheduleItems = data.upcoming.filter((item) => item.icon === "calendar");
  const hasSchedules = scheduleItems.length > 0;

  return (
    <>
      <MemberAgenda items={data.upcoming} />
      <section
        className={cn(
          "grid min-w-0 items-stretch gap-6",
          hasSchedules ? "xl:grid-cols-3" : "xl:grid-cols-2",
        )}
      >
        <MemberCellPanel cell={data.cell} />
        {hasSchedules && <MemberSchedulePanel items={scheduleItems} />}
        <MemberPrayerPanel items={data.prayers} />
      </section>
      <MemberMinistryGrid />
    </>
  );
}

export function QuickActions({ items }: { items: QuickActionItem[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link key={item.label} href={item.href} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#F0EFEB] bg-white px-4 text-[13px] font-semibold text-[#191919] shadow-[0_10px_24px_-20px_rgba(25,25,25,0.4)] transition hover:bg-[#FAFAF8]">
          <Icon name={item.icon} size={15} />
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function PersonalizedEmptyState() {
  return (
    <Panel className="p-6" dataSectionId="empty-state">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[20px] font-semibold tracking-[-0.025em] text-[#191919]">Vamos ajudar você a se conectar.</div>
          <p className="mt-2 max-w-[620px] text-[14px] leading-6 text-[#6E6E6E]">
            Encontre uma célula, conheça ministérios e complete seu cadastro para receber convites alinhados com sua caminhada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/celulas" className="rounded-full bg-[linear-gradient(135deg,#FF6B57_0%,#FF6B57_100%)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_14px_30px_-16px_rgba(255,107,87,0.75)]">Encontrar célula</Link>
          <Link href="/ministerios" className="rounded-full border border-[#F0EFEB] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#191919]">Quero servir</Link>
        </div>
      </div>
    </Panel>
  );
}

export function DashboardV3Home({ data }: { data: DashboardV3Data }) {
  const showMemberHome = data.profileMode === "departmentMember" || data.profileMode === "cellMember";
  const showHybridHome = data.profileMode === "hybrid";

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-full space-y-6 pb-12">
        <DashboardHero
          title={data.heroTitle}
          unreadNotifications={data.unreadNotifications}
          quickActions={data.quickActions}
        />
        {data.profileMode === "connect" && <PersonalizedEmptyState />}

        {showHybridHome ? (
          <HybridHomeSections data={data} />
        ) : showMemberHome ? (
          <MemberHomeSections data={data} />
        ) : (
          <>
            <PriorityCards items={data.priorities} />
            <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,340px)]">
              <PriorityList items={data.priorityItems} />
              <ActivityTimeline items={data.timeline} />
              <UpcomingEvents items={data.upcoming} />
            </section>
            <section className="grid min-w-0 items-stretch gap-5 xl:grid-cols-2">
              <CarePeopleSection people={data.carePeople} />
              <InsightCards items={data.insights} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
