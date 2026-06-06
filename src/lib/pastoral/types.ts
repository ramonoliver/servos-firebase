export type PastoralRole =
  | "admin_geral"
  | "pastor"
  | "lider_departamento"
  | "lider_celula"
  | "membro";

export type PersonKind = "member" | "visitor" | "volunteer" | "leader" | "pastor" | "disciple";
export type PersonGender = "feminino" | "masculino" | "nao_informado";
export type MaritalStatus = "solteiro" | "casado" | "divorciado" | "viuvo" | "nao_informado";
export type CellStatus = "active" | "paused" | "multiplying";
export type CellMemberStatus = "active" | "visitor" | "care";
export type MeetingFeeling = "muito_boa" | "boa" | "normal" | "dificil";
export type AttendanceStatus = "present" | "absent" | "visitor" | "first_visit";
export type TimelineEventType =
  | "visit"
  | "cell_joined"
  | "discipleship_started"
  | "absence"
  | "ministry_joined"
  | "prayer_request"
  | "care_done"
  | "leadership_change"
  | "schedule_confirmed"
  | "alert";
export type CareStatus = "open" | "in_progress" | "finished";
export type CarePriority = "low" | "medium" | "high";
export type AlertSeverity = "gentle" | "attention" | "urgent";
export type PrayerStatus = "open" | "answered" | "archived";

export interface PersonTag {
  id: string;
  label: string;
  color: "brand" | "success" | "amber" | "info" | "danger" | "neutral";
}

export interface PersonRelationship {
  personId: string;
  relatedPersonId: string;
  type: "spouse" | "discipler" | "cell_leader" | "pastor" | "ministry_leader";
  label: string;
}

export interface PastoralPerson {
  id: string;
  slug?: string;
  fullName: string;
  avatarColor: string;
  photoUrl: string | null;
  phone: string;
  email: string;
  birthDate: string;
  gender: PersonGender;
  maritalStatus: MaritalStatus;
  address: string;
  instagram: string;
  arrivalDate: string;
  kinds: PersonKind[];
  baptized: boolean;
  inDiscipleship: boolean;
  participatesInCell: boolean;
  cellId: string | null;
  spouseId?: string | null;
  ministryIds: string[];
  roleTitle: string;
  tagIds: string[]
  notes: string;
  lastContactAt: string | null;
  mustChangePassword?: boolean;
  role?: string;
  active?: boolean;
}

export interface PastoralMinistry {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface CellMember {
  personId: string;
  status: CellMemberStatus;
  joinedAt: string;
}

export interface CellHealth {
  frequency: number;
  communion: number;
  participation: number;
  growth: number;
  engagement: number;
  care: number;
}

export interface PastoralCell {
  id: string;
  name: string;
  coverColor: string;
  description: string;
  leaderId: string;
  coLeaderId: string | null;
  supervisorId: string | null;
  address: string;
  weekDay: string;
  time: string;
  maxMembers: number;
  audience: string;
  status: CellStatus;
  members: CellMember[];
  health: CellHealth;
}

export interface MeetingAttendance {
  personId: string;
  status: AttendanceStatus;
}

export interface CellMeeting {
  id: string;
  cellId: string;
  date: string;
  time: string;
  theme: string;
  word: string;
  notes: string;
  feeling: MeetingFeeling;
  spiritualEnvironment: string[];
  needs: string[];
  feedback: string;
  attendance: MeetingAttendance[];
}

export interface TimelineEvent {
  id: string;
  personId: string;
  cellId?: string;
  ministryId?: string;
  type: TimelineEventType;
  title: string;
  description: string;
  date: string;
  tone: "brand" | "success" | "amber" | "info" | "danger";
}

export interface CareCase {
  id: string;
  personId: string;
  responsibleId: string;
  title: string;
  reason: string;
  status: CareStatus;
  priority: CarePriority;
  openedAt: string;
  nextStep: string;
  notes: string[];
}

export interface PastoralAlert {
  id: string;
  personId: string;
  cellId?: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  createdAt: string;
  actionLabel: string;
}

export interface PrayerRequest {
  id: string;
  personId: string;
  title: string;
  description: string;
  status: PrayerStatus;
  createdAt: string;
  private: boolean;
}

export interface PermissionPreset {
  id: PastoralRole;
  label: string;
  description: string;
  access: string[];
}
