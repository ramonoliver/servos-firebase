import type { Event } from "@/types";

export const EVENT_WEEKDAYS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda" },
  { value: "2", label: "Terça" },
  { value: "3", label: "Quarta" },
  { value: "4", label: "Quinta" },
  { value: "5", label: "Sexta" },
  { value: "6", label: "Sábado" },
] as const;

export const EVENT_CATEGORIES = [
  { value: "church", label: "Culto", icon: "calendar" },
  { value: "event", label: "Evento", icon: "spark" },
  { value: "vigil", label: "Vigília", icon: "moon" },
  { value: "evangelism", label: "Evangelismo", icon: "users" },
  { value: "meeting", label: "Reunião", icon: "briefcase" },
  { value: "congress", label: "Congresso", icon: "stage" },
  { value: "training", label: "Treinamento", icon: "book" },
  { value: "care", label: "Cuidado", icon: "heart" },
] as const;

export function getEventCategory(value?: string) {
  return EVENT_CATEGORIES.find((category) => category.value === value) || EVENT_CATEGORIES[0];
}

export function parseEventRecurrence(recurrence?: string) {
  const value = recurrence || "";
  if (value.startsWith("weekly:")) return { weekday: value.split(":")[1] || "0", date: "" };
  if (value.startsWith("once:")) return { weekday: "0", date: value.split(":")[1] || "" };
  return { weekday: "0", date: "" };
}

/**
 * Próxima data concreta (YYYY-MM-DD) de um evento a partir de `fromIso` (hoje
 * por padrão). Usado pela "Agenda como motor" para datar as escalas geradas.
 * - "weekly:N" → próxima data >= fromIso com getDay() === N (0=domingo).
 * - "once:YYYY-MM-DD" → a própria data.
 * - fallback → fromIso.
 */
export function nextOccurrenceDate(recurrence?: string, fromIso?: string): string {
  const base = fromIso || new Date().toISOString().slice(0, 10);
  const parsed = parseEventRecurrence(recurrence);

  if ((recurrence || "").startsWith("once:")) {
    return parsed.date || base;
  }

  if ((recurrence || "").startsWith("weekly:")) {
    const target = Number(parsed.weekday);
    if (!Number.isFinite(target)) return base;
    const [y, m, d] = base.split("-").map(Number);
    const start = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
    const delta = ((target - start.getDay()) % 7 + 7) % 7; // 0..6 (hoje conta)
    start.setDate(start.getDate() + delta);
    const mm = String(start.getMonth() + 1).padStart(2, "0");
    const dd = String(start.getDate()).padStart(2, "0");
    return `${start.getFullYear()}-${mm}-${dd}`;
  }

  return base;
}

export function parseEventCalendarRecurrence(event: Event) {
  const recurrence = event.recurrence || "";
  if (recurrence.startsWith("weekly:")) {
    const weekday = Number(recurrence.split(":")[1]);
    return Number.isFinite(weekday) ? { type: "weekly" as const, weekday } : null;
  }
  if (recurrence.startsWith("once:")) {
    const date = recurrence.split(":")[1];
    return date ? { type: "once" as const, date } : null;
  }
  return null;
}

export function formatEventRecurrence(event: Event) {
  const parsed = parseEventRecurrence(event.recurrence);
  if (event.type === "recurring") {
    return EVENT_WEEKDAYS.find((day) => day.value === parsed.weekday)?.label || "Sem dia definido";
  }
  if (parsed.date) {
    return new Date(`${parsed.date}T12:00:00`).toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return "Sem data definida";
}
