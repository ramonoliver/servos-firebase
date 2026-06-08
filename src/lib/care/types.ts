export interface PastoralNote {
  id: string;
  church_id: string;
  person_id: string;
  author_id: string | null;
  type: string;
  title: string;
  description: string;
  date: string;
  created_at: string;
}

export type CareTone = "brand" | "success" | "amber" | "info" | "lavender" | "rose";

export const CARE_TYPES: { value: string; label: string; tone: CareTone; short: string }[] = [
  { value: "visit", label: "Visita", tone: "brand", short: "V" },
  { value: "call", label: "Ligação / contato", tone: "info", short: "L" },
  { value: "prayer", label: "Oração", tone: "lavender", short: "O" },
  { value: "counseling", label: "Aconselhamento", tone: "rose", short: "A" },
  { value: "care", label: "Acompanhamento", tone: "success", short: "C" },
  { value: "note", label: "Anotação", tone: "amber", short: "N" },
];

export function careType(value: string) {
  return CARE_TYPES.find((t) => t.value === value) || CARE_TYPES[CARE_TYPES.length - 1];
}

// ── Taxonomia canônica de cuidado (Servos 2.0) ───────────────────────────────
// O app grava os tipos reais de CARE_TYPES (care/prayer/...). Telas legadas e
// dados antigos podem ter usado care_case/prayer_request. Estas constantes
// aceitam AMBOS para que nada existente suma e os registros reais sejam contados.
/** Tipos que indicam acompanhamento pastoral aberto ("pessoa em cuidado"). */
export const CARE_CASE_TYPES = ["care", "care_case"] as const;
/** Tipos que representam pedidos/momentos de oração. */
export const PRAYER_TYPES = ["prayer", "prayer_request"] as const;

export function isCareCaseType(type?: string | null): boolean {
  return !!type && (CARE_CASE_TYPES as readonly string[]).includes(type);
}
export function isPrayerType(type?: string | null): boolean {
  return !!type && (PRAYER_TYPES as readonly string[]).includes(type);
}

export const CARE_TONE_CLASSES: Record<CareTone, string> = {
  brand: "bg-brand-light text-brand-deep",
  success: "bg-success-light text-success",
  amber: "bg-sun-light text-sun-deep",
  info: "bg-sky-light text-info",
  lavender: "bg-lavender-light text-lavender-deep",
  rose: "bg-rose-light text-rose-deep",
};

export function formatCareDate(date: string): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
