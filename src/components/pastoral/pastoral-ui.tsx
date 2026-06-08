"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar, EmptyState } from "@/components/ui";
import { cn, formatDate, getInitials } from "@/lib/utils/helpers";
import { getHealthAverage, getHealthLabel, getPerson, getTag } from "@/lib/pastoral/selectors";
import type {
  CareCase,
  CellHealth,
  PastoralAlert,
  PastoralCell,
  PastoralPerson,
  PersonTag,
  PrayerRequest,
  TimelineEvent,
} from "@/lib/pastoral/types";

const tagColors: Record<PersonTag["color"], string> = {
  brand: "bg-brand-light text-brand border-brand/10",
  success: "bg-success-light text-success border-success/10",
  amber: "bg-amber-light text-amber border-amber/10",
  info: "bg-info-light text-info border-info/10",
  danger: "bg-danger-light text-danger border-danger/10",
  neutral: "bg-surface-alt text-ink-muted border-border-soft",
};

const toneColors = {
  brand: "bg-brand-light text-brand border-brand/10",
  success: "bg-success-light text-success border-success/10",
  amber: "bg-amber-light text-amber border-amber/10",
  info: "bg-info-light text-info border-info/10",
  danger: "bg-danger-light text-danger border-danger/10",
};

export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">
      <div>
        {eyebrow && <div className="text-[10px] font-bold uppercase tracking-[.12em] text-brand mb-1">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-subtitle mt-1 max-w-[640px]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SoftCard({
  children,
  className,
  href,
}: {
  children: React.ReactNode;
  className?: string;
  href?: string;
}) {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "bg-white/40 backdrop-blur-md border border-white/60 rounded-[24px] shadow-sm",
        href && "hover:bg-white/60 transition-colors",
        className
      )}
    >
      {children}
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

export function PastoralTag({ tag }: { tag: PersonTag }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold", tagColors[tag.color])}>
      {tag.label}
    </span>
  );
}

export function PersonTagList({ tagIds, limit = 4 }: { tagIds: string[]; limit?: number }) {
  const tags = tagIds.map(getTag).filter(Boolean) as PersonTag[];
  const visible = tags.slice(0, limit);
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((tag) => (
        <PastoralTag key={tag.id} tag={tag} />
      ))}
      {tags.length > limit && (
        <span className="inline-flex items-center rounded-full border border-border-soft bg-surface-alt px-2.5 py-1 text-[10px] font-bold text-ink-faint">
          +{tags.length - limit}
        </span>
      )}
    </div>
  );
}

export function PersonMini({
  person,
  subtitle,
  href,
  right,
}: {
  person: PastoralPerson;
  subtitle?: string;
  href?: string;
  right?: React.ReactNode;
}) {
  const body = (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar name={person.fullName} color={person.avatarColor} photoUrl={person.photoUrl} size={38} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink truncate">{person.fullName}</div>
        <div className="text-[11px] text-ink-faint truncate">{subtitle || person.roleTitle}</div>
      </div>
      {right}
    </div>
  );

  if (href) {
    return <Link href={href}>{body}</Link>;
  }

  return body;
}

export function PersonCard({ person, cellName }: { person: PastoralPerson; cellName?: string }) {
  const href = `/pessoas/${person.slug || person.id}`;
  return (
    <SoftCard href={href} className="p-4">
      <PersonMini person={person} />
      <div className="mt-3">
        <PersonTagList tagIds={person.tagIds} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-ink-muted">
        <span>
          {person.participatesInCell
            ? cellName
              ? `Célula ${cellName}`
              : "Com célula"
            : "Sem célula"}
        </span>
        {/* "Membro" era redundante com o papel no topo do card; mostramos só o
            que agrega informação (visitante). */}
        {person.kinds.includes("visitor") && (
          <span className="rounded-full bg-rose-light px-2 py-0.5 text-[10px] font-bold text-rose-deep">Visitante</span>
        )}
      </div>
    </SoftCard>
  );
}

// TabBar foi promovido ao DS canônico (components/ui). Re-exportado aqui para
// compatibilidade com telas que ainda importam de pastoral-ui.
export { TabBar } from "@/components/ui";

export function TimelineList({ events, emptyTitle = "Nenhum evento ainda" }: { events: TimelineEvent[]; emptyTitle?: string }) {
  if (!events.length) {
    return <EmptyState icon="◷" title={emptyTitle} description="Quando algo importante acontecer, o cuidado ficará registrado aqui." />;
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex gap-3 rounded-[14px] border border-border-soft bg-white p-4"
        >
          <div className={cn("mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold", toneColors[event.tone])}>
            {getTimelineIcon(event.type)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-semibold text-ink">{event.title}</h3>
              <span className="text-[10px] font-semibold text-ink-faint">{formatDate(event.date.slice(0, 10))}</span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{event.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function getTimelineIcon(type: TimelineEvent["type"]) {
  const map: Record<TimelineEvent["type"], string> = {
    visit: "V",
    cell_joined: "C",
    discipleship_started: "D",
    absence: "!",
    ministry_joined: "M",
    prayer_request: "O",
    care_done: "A",
    leadership_change: "L",
    schedule_confirmed: "E",
    alert: "!",
  };
  return map[type];
}

export function HealthMeter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
        <span className="text-ink-muted">{label}</span>
        <span className="text-ink-faint">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-surface-alt">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="h-2 rounded-full bg-brand"
        />
      </div>
    </div>
  );
}

export function CellHealthSummary({ health }: { health: CellHealth }) {
  const average = getHealthAverage(health);
  return (
    <SoftCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-ink-faint">Saude da celula</div>
          <div className="mt-1 font-display text-[22px] font-bold text-ink">{getHealthLabel(average)}</div>
        </div>
        <div className="rounded-full bg-brand-light px-3 py-1 text-sm font-bold text-brand">{average}%</div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <HealthMeter label="Frequencia" value={health.frequency} />
        <HealthMeter label="Comunhao" value={health.communion} />
        <HealthMeter label="Participacao" value={health.participation} />
        <HealthMeter label="Crescimento" value={health.growth} />
        <HealthMeter label="Engajamento" value={health.engagement} />
        <HealthMeter label="Acompanhamento" value={health.care} />
      </div>
    </SoftCard>
  );
}

export function CellCard({ cell }: { cell: PastoralCell }) {
  const leader = getPerson(cell.leaderId);
  const average = getHealthAverage(cell.health);
  const healthColor = average >= 75 ? "bg-success" : average >= 50 ? "bg-amber" : "bg-danger";
  const healthTextCls = average >= 75
    ? "text-success bg-success-light"
    : average >= 50
    ? "text-amber bg-amber-light"
    : "text-danger bg-danger-light";

  return (
    <SoftCard href={`/celulas/${cell.id}`} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[16px] font-semibold text-ink truncate">{cell.name}</h3>
          <p className="mt-0.5 text-[12px] text-ink-muted">{cell.weekDay} · {cell.time} · {cell.audience}</p>
        </div>
        <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${healthTextCls}`}>
          {average}%
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">{cell.description}</p>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-alt">
        <div className={`h-1.5 rounded-full ${healthColor}`} style={{ width: `${average}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {leader ? (
          <PersonMini person={leader} subtitle="Líder responsável" />
        ) : (
          <span className="text-xs text-ink-faint">Sem líder</span>
        )}
        <span className="text-[11px] font-semibold text-ink-faint">{cell.members.length}/{cell.maxMembers} membros</span>
      </div>
    </SoftCard>
  );
}

export function CareCaseCard({ care }: { care: CareCase }) {
  const person = getPerson(care.personId);
  const responsible = getPerson(care.responsibleId);
  return (
    <SoftCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">{care.title}</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{care.reason}</p>
        </div>
        <PriorityBadge priority={care.priority} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {person && <PersonMini person={person} subtitle="Pessoa acompanhada" href={`/pessoas/${person.id}`} />}
        {responsible && <PersonMini person={responsible} subtitle="Responsavel" href={`/pessoas/${responsible.id}`} />}
      </div>
      <div className="mt-4 rounded-[12px] bg-surface-alt px-3 py-2 text-[12px] text-ink-muted">{care.nextStep}</div>
    </SoftCard>
  );
}

function PriorityBadge({ priority }: { priority: CareCase["priority"] }) {
  const map = {
    low: "bg-success-light text-success",
    medium: "bg-amber-light text-amber",
    high: "bg-danger-light text-danger",
  }[priority];
  const label = { low: "Baixa", medium: "Media", high: "Alta" }[priority];
  return <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold", map)}>{label}</span>;
}

export function AlertCard({ alert }: { alert: PastoralAlert }) {
  const person = getPerson(alert.personId);
  const style = {
    gentle: "bg-success-light text-success border-success/10",
    attention: "bg-amber-light text-amber border-amber/10",
    urgent: "bg-danger-light text-danger border-danger/10",
  }[alert.severity];

  return (
    <SoftCard className="p-4">
      <div className="flex gap-3">
        <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border text-sm font-bold", style)}>!</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-ink">{alert.title}</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{alert.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {person && <Link href={`/pessoas/${person.id}`} className="text-[12px] font-semibold text-brand">{person.fullName}</Link>}
            <Link href={alert.actionLabel.toLowerCase().includes("célula") || alert.actionLabel.toLowerCase().includes("celula") ? "/celulas" : `/pessoas/${alert.personId}`} className="btn btn-secondary btn-sm">
              {alert.actionLabel}
            </Link>
          </div>
        </div>
      </div>
    </SoftCard>
  );
}

export function PrayerCard({ request }: { request: PrayerRequest }) {
  const person = getPerson(request.personId);
  return (
    <SoftCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">{request.title}</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{request.description}</p>
        </div>
        <span className="rounded-full bg-brand-light px-2.5 py-1 text-[10px] font-bold text-brand">
          {request.status === "open" ? "Em oracao" : "Respondido"}
        </span>
      </div>
      {person && (
        <div className="mt-4">
          <PersonMini person={person} subtitle="Pedido vinculado" href={`/pessoas/${person.id}`} />
        </div>
      )}
    </SoftCard>
  );
}

export function GentleEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return <EmptyState icon="♡" title={title} description={description} action={action} />;
}

export function PastoralAvatarStack({ people }: { people: PastoralPerson[] }) {
  return (
    <div className="flex -space-x-2">
      {people.slice(0, 4).map((person) => (
        <div
          key={person.id}
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white"
          style={{ background: person.avatarColor }}
          title={person.fullName}
        >
          {getInitials(person.fullName)}
        </div>
      ))}
    </div>
  );
}
