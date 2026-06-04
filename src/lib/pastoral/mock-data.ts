import type {
  CareCase,
  CellMeeting,
  PastoralAlert,
  PastoralCell,
  PastoralMinistry,
  PastoralPerson,
  PermissionPreset,
  PersonRelationship,
  PersonTag,
  PrayerRequest,
  TimelineEvent,
} from "./types";

export const pastoralTags: PersonTag[] = [];
export const pastoralMinistries: PastoralMinistry[] = [];
export const pastoralPeople: PastoralPerson[] = [];
export const pastoralCells: PastoralCell[] = [];
export const cellMeetings: CellMeeting[] = [];
export const timelineEvents: TimelineEvent[] = [];
export const careCases: CareCase[] = [];
export const pastoralAlerts: PastoralAlert[] = [];
export const prayerRequests: PrayerRequest[] = [];
export const pastoralRelationships: PersonRelationship[] = [];

export const permissionPresets: PermissionPreset[] = [
  {
    id: "admin_geral",
    label: "Admin Geral",
    description: "Acesso total ao Servos, configuracoes e modulos pastorais.",
    access: ["Tudo no sistema", "Configuracoes", "Permissoes", "Relatorios completos"],
  },
  {
    id: "pastor",
    label: "Pastor",
    description: "Visao ampla para cuidado, acompanhamento e dashboards pastorais.",
    access: ["CRM Pastoral", "Dashboard Pastoral", "Acompanhamentos", "Timeline"],
  },
  {
    id: "lider_departamento",
    label: "Lider de Departamento",
    description: "Cuida de voluntarios, escalas e comunicacao do seu departamento.",
    access: ["Membros do departamento", "Escalas", "Comunicacao", "Voluntarios"],
  },
  {
    id: "lider_celula",
    label: "Lider de Celula",
    description: "Acompanha sua propria celula, reunioes, presencas e feedbacks.",
    access: ["Propria celula", "Membros", "Reunioes", "Feedbacks"],
  },
  {
    id: "membro",
    label: "Membro",
    description: "Acompanha perfil pessoal, escalas, pedidos de oracao e confirmacoes.",
    access: ["Perfil pessoal", "Minhas escalas", "Pedidos de oracao", "Confirmacoes"],
  },
];

