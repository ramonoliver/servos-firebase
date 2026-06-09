import type { Department, Role, ScheduleMember } from "@/types";
import type { KidsCheckIn, KidsRoom } from "./types";

export function calculateAge(birthDate: string | null | undefined, atDate = new Date()): number | null {
  if (!birthDate) return null;
  const parsed = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  let age = atDate.getFullYear() - parsed.getFullYear();
  const monthDiff = atDate.getMonth() - parsed.getMonth();
  const dayDiff = atDate.getDate() - parsed.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;

  return age >= 0 ? age : null;
}

export function isKidsAge(age: number | null | undefined): boolean {
  return typeof age === "number" && age <= 12;
}

export function recommendRoomsForAge(age: number | null | undefined, rooms: KidsRoom[]): KidsRoom[] {
  if (typeof age !== "number") return [];
  return rooms
    .filter((room) => room.status === "active" && age >= room.min_age && age <= room.max_age)
    .sort((a, b) => a.min_age - b.min_age || a.name.localeCompare(b.name));
}

export function normalizeKidsCode(value: number): string {
  return `K-${String(value).padStart(3, "0")}`;
}

export function generateKidsCode(existingCodes: string[], seed = Date.now()): string {
  const used = new Set(existingCodes.map((code) => code.toUpperCase()));
  for (let offset = 0; offset < 900; offset += 1) {
    const candidate = normalizeKidsCode(((seed + offset) % 900) + 100);
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("Não foi possível gerar um código Kids único para este evento.");
}

export function isRoomFull(room: Pick<KidsRoom, "capacity">, checkins: Pick<KidsCheckIn, "status" | "room_id">[], roomId: string): boolean {
  const activeCount = checkins.filter((item) => item.room_id === roomId && item.status !== "checked_out").length;
  return room.capacity > 0 && activeCount >= room.capacity;
}

export function canManageKidsCheckIn(params: {
  role: Role;
  userId: string;
  kidsDepartment?: Pick<Department, "leader_ids" | "co_leader_ids"> | null;
  scheduleMembers?: Array<Pick<ScheduleMember, "user_id">>;
  eventLeaderIds?: string[];
}): boolean {
  if (params.role === "admin") return true;
  if (params.role !== "leader" && params.role !== "member") return false;

  const leaderIds = params.kidsDepartment?.leader_ids || [];
  const coLeaderIds = params.kidsDepartment?.co_leader_ids || [];
  if (leaderIds.includes(params.userId) || coLeaderIds.includes(params.userId)) return true;
  if ((params.eventLeaderIds || []).includes(params.userId)) return true;
  return Boolean(params.scheduleMembers?.some((member) => member.user_id === params.userId));
}

export function getKidsStatusLabel(status: string): string {
  return {
    in_room: "Em sala",
    called: "Chamado no telão",
    checked_out: "Retirado",
    waiting_guardian: "Aguardando responsável",
  }[status] || status;
}
