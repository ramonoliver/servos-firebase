# SERVOS — Master Context (Fonte de Verdade)

> Documento mestre do projeto **Servos** — um "Church OS" (sistema operacional de igreja).
> Gerado a partir da leitura completa do código-fonte em 2026-06-09.
> Use este arquivo como referência única ao trabalhar no projeto. Onde houver
> divergência entre este documento e o código, **o código vence** — atualize aqui.

---

## 1. Visão de Produto

**Tagline:** _Organize. Sirva. Viva o propósito._

**Site:** [servosapp.com](https://servosapp.com)

Servos é um sistema de gestão para igrejas. Começou como "sistema de escalas e
ministérios" e está evoluindo para um **Church OS** — plataforma que conecta
pessoas, ministérios, células, eventos e cuidado pastoral.

**Tese central (docs/SERVOS-2.0-ARQUITETURA.md):**

```
Pessoa → Agenda → Serviço + Comunidade → Cuidado → Inteligência
```
_Pessoas no centro. Agenda como motor. Cuidado como resultado._

### Os 5 pilares

| Pilar | Módulos | Pergunta que responde |
|---|---|---|
| **Operação** | Agenda · Eventos · Escalas · Ministérios · Indisponibilidade · Repertório | O que vai acontecer? Quem serve? Quem confirmou? |
| **Comunidade** | Pessoas · Células · Kids · Visitantes · Famílias | Quem são as pessoas? Quem está conectado/sem vínculo? |
| **Cuidado** | Acompanhamentos · Pedidos de oração · Alertas · Histórico pastoral | Quem precisa de atenção agora? |
| **Comunicação** | Mensagens · Comunicados · Notificações · Enquetes | Quem avisar, por qual canal, e foi entregue? |
| **Inteligência** | Relatórios · Insights · Saúde de células/ministério · Engajamento | Onde a igreja cresce/cai? O que decidir? |

> **Regra de ouro (§23 da arquitetura):** não criar funcionalidades isoladas
> antes de resolver a arquitetura. Nada de páginas soltas, novos mocks ou
> métricas hardcoded até a Fundação estar definida.

### Acesso Demo

```
Email: ramon@servosapp.com
Senha: servos2026
```

---

## 2. Stack Técnica

| Camada | Tecnologia |
|---|---|
| Framework | **Next.js 14** (App Router) + TypeScript 5.7 |
| UI | **React 18**, Tailwind CSS 3.4, Framer Motion 11 |
| Auth | Sessão própria (cookie `servos_auth` + token) + Firebase Auth (custom token) |
| Senhas | **bcryptjs** (hash real) |
| Banco | **Cloud Firestore** (produção) — projeto `servos-bcc51`, região `southamerica-east1` |
| Hosting | **Firebase App Hosting** (backend `servos-backend`) |
| Push | **Firebase Cloud Messaging (FCM)** Web (VAPID) |
| E-mail | **Resend** (`noreply@servosapp.com`) — `nodemailer` também presente |
| SMS | **Twilio** |
| Validação | **Zod** |

> **Nota histórica importante:** o código usa um cliente chamado `supabase`,
> mas **NÃO há Supabase em produção**. É um *shim* que imita a API do Supabase
> sobre o Firestore (ver §5). README/SQL mencionam Supabase e localStorage como
> legado/preparação — a fonte de verdade atual é o **Firestore**.

`package.json` versão `2.0.0`. Scripts: `dev`, `build`, `start`.

---

## 3. Estrutura de Diretórios

```
src/
  types/index.ts          — Tipos TS centrais (Church, User, Department, Schedule, etc.)
  middleware.ts (raiz)    — Proteção de rotas por cookie servos_auth
  app/
    layout.tsx            — RootLayout (html/body, globals.css)
    page.tsx              — redireciona (/ → dashboard|login via middleware)
    globals.css           — estilos globais + classes do design system
    login/ cadastro/ onboarding/
    esqueci-senha/ redefinir-senha/ concluir-cadastro/
    (app)/                — rotas autenticadas (layout com sidebar + bottom tab)
      layout.tsx          — monta navItems por papel, AppProvider
      [ver §7 para todas as páginas]
    api/                  — route handlers (ver §8)
  components/
    ui/                   — Modal, Tabs, ActionDrawer, MentionInput, MultiSelect, etc.
    layout/               — sidebar-v2, bottom-tab-bar, notification-panel
    dashboard/            — home-ui, home-v3-ui
    shared/               — forms (dept, cell, member-edit, add-member, care-note)
    escalas/ events/ kids/ pastoral/
  hooks/
    use-app.tsx           — AppProvider/useApp (contexto global: user, church, roles…)
    use-push-notifications.tsx
  lib/
    firebase.ts           — cliente Firestore (shim "supabase") p/ browser
    firebase-admin.ts     — cliente Firestore Admin (server) p/ API routes
    auth/                 — password, session, permissions, person-roles, api-session
    ai/engine.ts          — motor de scoring (9 fatores)
    cells/ care/ kids/ pastoral/ events/ dashboard/ schedules/
    notifications/        — módulo multicanal (push/email/sms)
    server/               — serviços server-side (notification, ranking, scoring…)
    email/ utils/
  services/               — email/notification/push/whatsapp services
docs/                     — arquitetura, auditoria, specs, planos
sql/                      — migrations Supabase (LEGADO, não usado em produção)
```

---

## 4. Modelo de Dados (Firestore)

### 4.1 Mapeamento de coleções

Tanto `firebase.ts` (cliente) quanto `firebase-admin.ts` (server) traduzem
"nomes de tabela" (estilo snake_case Supabase) para coleções Firestore via
`COLLECTION_MAPPING`. **Atenção:** alguns nomes de tabela mapeiam para coleções
em camelCase.

| Nome lógico (no código) | Coleção Firestore |
|---|---|
| `churches` | `churches` |
| `users` | `users` |
| `members` | `members` |
| `departments` | **`ministries`** |
| `schedules` | `schedules` |
| `events` | `events` |
| `cells` | `cells` |
| `kids` | `kids` |
| `notifications` | `notifications` |
| `unavailable_dates` | `unavailableDates` |
| `songs` | `songs` |
| `member_invitations` | `invitations` |
| `onboarding_progress` | `onboardingProgress` |
| `schedule_members` | `scheduleMembers` |
| `schedule_chats` | `scheduleChats` |
| `schedule_attachments` | `scheduleAttachments` |
| `event_reports` | `eventReports` |
| `kids_rooms` | `kidsRooms` |
| `kids_checkins` | `kidsCheckins` |
| `password_reset_tokens` | `passwordResetTokens` |
| `cell_networks` | `cellNetworks` |
| `cell_meetings` | `cellMeetings` |
| `pastoral_notes` | `pastoralNotes` |
| `push_tokens` | `pushTokens` |
| `notification_preferences` | `notificationPreferences` |
| `device_tokens` | `deviceTokens` |

### 4.2 Dualidade snake_case / camelCase

Em toda escrita, `prepareDocumentForWrite` grava **ambos** `church_id`+`churchId`,
`created_at`+`createdAt`, `updated_at`+`updatedAt`. Em toda leitura, os campos
camelCase são re-mapeados de volta para snake_case. **Convenção do app: use
snake_case** no código de aplicação; o camelCase existe só por compatibilidade
com as Firestore Security Rules.

### 4.3 Entidades principais (de `src/types/index.ts`)

- **Church** — `id, name, city, state, created_at`.
- **User** (entidade "Pessoa" unificada) — campos chave: `church_id, email,
  password_hash, name, phone, role` (`admin|leader|member`), `cell_role`
  (`pastor|coordenacao|null` — papel church-wide do domínio células),
  `cell_id, ministry_ids[], tag_ids[], status` (`active|inactive|paused|vacation`),
  `photo_url, birth_date, gender, is_child, primary_guardian_id, guardian_ids[]`,
  endereço completo, `baptized, in_discipleship, marital_status, spouse_id`,
  `availability: boolean[7]` (Seg→Dom), `total_schedules, confirm_rate,
  must_change_password, last_served_at, active, joined_at`.
- **Department** (= ministério; coleção `ministries`) — `name, description, icon,
  color, function_names[], leader_ids[], co_leader_ids[], active`.
- **DepartmentMember** — vínculo user↔ministério com `function_name` +
  `function_names[]`.
- **Event** — `type` (`recurring|special`), `recurrence` (`"weekly:0-6"` ou
  `"once:YYYY-MM-DD"`), `base_time, location, instructions`.
- **EventReport** — métricas pós-evento (presença, voluntários, conversões,
  reconciliações, pedidos de oração, visitantes, crianças…).
- **Schedule** — escala: `event_id, department_id, date, time, arrival_time,
  status` (`draft|active|cancelled|completed`), `published, created_by`.
- **ScheduleMember** — `function_name, status` (`pending|confirmed|declined`),
  `decline_reason, substitute_id, substitute_for, is_reserve, responded_at,
  notified_at`.
- **ScheduleSlot** — `function_name, quantity, filled`.
- **UnavailableDate** — `date, end_date, reason, type` (`single|range|vacation`).
- **Notification** — `title, body, icon, type, read, action_url`.
  `NotificationType`: `info|reminder|confirmation|alert|welcome|substitution|points|badge`.
- **MemberInvitation** — convite com `tracking_token, email_status, sms_status,
  opened_at, open_count`.
- **Message** — chat por ministério (`department_id, sender_id, content`).
- **ScheduleAttachment** — anexo base64 na escala.
- **AuditLog** — `action, entity_type, entity_id, details`.
- **Gamificação:** `PointsHistory`, `Badge`, `UserBadge`, `MonthlyRanking`,
  `PushToken`.

### 4.4 Domínio Células (`lib/cells/types.ts`)

- **Cell** — `name, leader_ids[], co_leader_ids[], network_id, address, week_day,
  time, max_members, audience, status` (`active|paused|multiplying`), `health`.
- **CellNetwork** — rede de células com `supervisor_ids[]`.
- **CellMeeting** — reunião: `date, theme, word, feeling, feedback`.
- **CellHealth** — 6 dimensões (frequency, communion, participation, growth,
  engagement, care). `cellHealthStatus()` → Nova / Saudável / Em crescimento /
  Atenção / Crítica.

### 4.5 Domínio Kids (`lib/kids/types.ts`)

- **KidsRoom** — sala por faixa etária (`min_age, max_age, capacity, volunteer_ids[]`).
- **KidsGuardianLink** — vínculo criança↔responsável (`relationship, is_primary`).
- **KidsCheckIn** — check-in/out com `code`, `status`
  (`in_room|called|checked_out|waiting_guardian`).

### 4.6 Domínio Cuidado/Pastoral (`lib/care/types.ts`, `lib/pastoral/types.ts`)

- **PastoralNote** — registro de cuidado: `person_id, author_id, type, title,
  description, date`. Tipos (`CARE_TYPES`): visit, call, prayer, counseling,
  care, note. Taxonomia canônica aceita aliases legados (`care_case`,
  `prayer_request`).
- `lib/pastoral/types.ts` define tipos ricos (CareCase, PastoralAlert,
  PrayerRequest, TimelineEvent…) — parte ainda apoiada em `mock-data.ts`
  (ver §11 dívidas).

### 4.7 Índices Firestore (`firestore.indexes.json`)

- `notifications`: (church_id, type, action_url, created_at)
- `schedules`: (church_id, date)
- `scheduleMembers`: (user_id, schedule_id)

---

## 5. Camada de Acesso a Dados (o "shim Supabase")

`src/lib/firebase.ts` (browser) e `src/lib/firebase-admin.ts` (server) exportam
um objeto que **imita a fluent API do Supabase** sobre o Firestore:

```ts
supabase.from("departments").select("*").eq("church_id", id).order("name")
supabase.from("users").update({...}).eq("id", uid)
getFirebaseAdminClient().from("schedules").insert({...})
```

**Como funciona:**
- `ClientQueryBuilder` / `AdminQueryBuilder` acumulam `.eq/.neq/.in/.gte/.ilike/
  .order/.limit/.single()` e executam no `.then()` (são thenables).
- Operadores `!=`, `ilike` e `in` com >30 itens são resolvidos **em memória**
  (Firestore não suporta nativamente). Ordenação e limit também em memória.
- Retorno padroniza `{ data, count, error }` como o Supabase.
- `update()`/`delete()` no Admin fazem `await Promise.resolve()` antes de ler os
  filtros — **detalhe crítico**: os filtros `.eq` são encadeados *depois* de
  `.update()` no padrão fluente; sem o microtask, o update rodaria sobre a
  coleção inteira. **Nunca remova esse `await`.**
- `supabase.channel(...)` implementa realtime via `onSnapshot` (usado em chat de
  escalas e mensagens). Ignora o primeiro snapshot e emite só `added`.

**Implicação para quem desenvolve:** trate como Supabase, mas lembre que filtros
compostos podem cair para memória e que não há JOINs — enriquecimento de dados é
feito manualmente em código (ver tipos `Enriched*`).

---

## 6. Autenticação, Sessão e Permissões

### 6.1 Fluxo de sessão

1. Login (`/api/auth/login`) valida senha com bcrypt, cria sessão.
2. Sessão é guardada em **localStorage** (`servos_session`, `lib/auth/session.ts`,
   TTL 7 dias) **e** num cookie `servos_auth` (lido pelo middleware).
3. `useApp().refresh()` chama `/api/auth/session` + `/api/app/load` em paralelo,
   recebe `firebaseToken` (custom token) e faz `signInWithCustomToken` para
   habilitar leituras client-side respeitando as Security Rules.
4. API routes usam `requireApiSession(req)` / `requireApiActor(req)`
   (`lib/auth/api-session.ts`) — lê cookie ou header `x-servos-auth`, carrega o
   ator (`users`) e valida `church_id`.

### 6.2 Middleware (`middleware.ts`)

Protege prefixos (`/dashboard, /escalas, /ministerios, /membros, /pessoas` etc.)
com base no cookie `servos_auth`. `/` redireciona p/ `/dashboard` ou `/login`.
Páginas de auth redirecionam logados p/ `/dashboard`.

### 6.3 Modelo de papéis — **fonte única: `lib/auth/person-roles.ts`**

> **PRINCÍPIO CENTRAL:** papéis de negócio **NÃO são gravados em campo** — são
> **DERIVADOS em runtime** a partir dos relacionamentos existentes
> (lidera ministério? supervisiona rede? tem célula? é criança?).

- **SystemRole** (gravado em `user.role`): `admin | leader | member`.
- **BusinessRole** (derivado): `admin, pastor, coordenacao, supervisor,
  lider_celula, lider_ministerio, voluntario, membro, conexao, responsavel_kids,
  crianca`.
- `getPersonRoles(person, ctx)` retorna `{ systemRole, businessRoles[],
  primaryRole, scopes }`. `scopes` = `ledDepartmentIds, ledCellIds,
  supervisedNetworkIds, guardedChildIds`.
- Precedência (rótulo principal): admin > pastor > coordenacao > supervisor >
  lider_celula > lider_ministerio > voluntario > membro > conexao.
- `getProfileMode(primaryRole)` → modo da Home: `admin | hybrid |
  departmentMember | cellMember | connect`.

### 6.4 Permissões (`lib/auth/permissions.ts`)

Duas camadas **consistentes** entre si:
- **Servidor:** `can(actorOrRole, action, ctx)` — admin tudo; pastor/coordenação
  = `PASTORAL_ACTIONS` (tudo menos `settings.edit`); leader = `LEADER_ACTIONS`
  com **isolamento por departamento** em escritas escopadas (`schedule.create/
  edit`, `member.invite/edit`); member = `MEMBER_ACTIONS`.
- **Cliente:** `hasPermission(roles, action, ctx)` consumido por
  `useApp().canDo(action, deptId)`, mapeando `businessRoles` → capacidades
  (`ROLE_CAPS`). Mantém isolamento por departamento via `scopes.ledDepartmentIds`.
- `canEditOrDeleteMemberClient(...)` — regra fina para editar/excluir pessoa
  (líder de célula/rede/ministério só age sobre quem está sob seu escopo;
  ninguém abaixo de admin/pastor edita admin).

**Actions:** `schedule.*`, `member.*`, `department.*`, `event.*`, `message.send`,
`report.view`, `settings.edit`, `confirm.own`, `profile.edit`.

---

## 7. Rotas / Páginas (`src/app/(app)/`)

Navegação montada em `(app)/layout.tsx`, agrupada por pilar. `show` controla
visibilidade por papel (`isAdmin, notPureMember, isVolunteer, canCare,
canMessage, canReport`).

| Grupo | Rota | Página | Visibilidade |
|---|---|---|---|
| — | `/dashboard` | Início (home por perfil) | todos |
| Operação | `/calendario` | Agenda mensal | todos |
| Operação | `/eventos`, `/eventos/[id]` | Eventos (CRUD + detalhe) | não-membro puro |
| Operação | `/escalas`, `/escalas/nova`, `/escalas/[id]` | Escalas (lista, criar, detalhe) | não-membro puro |
| Operação | `/minhas-escalas` | Visão do voluntário | voluntário |
| Operação | `/ministerios`, `/ministerios/[id]` | Ministérios (CRUD + detalhe) | todos |
| Operação | `/indisponibilidade` | Datas indisponíveis | (via perfil) |
| Operação | `/repertorio` | Repertório de músicas | — |
| Comunidade | `/pessoas`, `/pessoas/[id]`, `/pessoas/convidar` | Pessoas (entidade unificada) | não-membro puro |
| Comunidade | `/celulas`, `/celulas/[id]`, `/celulas/redes`, `/celulas/estrutura` | Células | todos |
| Comunidade | `/kids` | Kids (salas/check-in) | não-membro puro |
| Cuidado | `/acompanhamentos` | Acompanhamentos pastorais | canCare |
| Cuidado | `/pedidos-oracao` | Pedidos de oração (+comentários) | canCare |
| Cuidado | `/alertas` | Alertas pastorais | canCare |
| Comunicação | `/comunicacao` | Comunicados | canMessage |
| Comunicação | `/mensagens` | Mensagens por ministério | canMessage |
| Comunicação | `/notificacoes` | Central de notificações | todos |
| Comunicação | `/enquetes` | Enquetes/votação | canMessage |
| Inteligência | `/relatorios` | Relatórios e métricas | canReport |
| Administração | `/perfis-permissoes` | Perfis e permissões | admin |
| Administração | `/configuracoes`, `/configuracoes/notificacoes` | Configurações da igreja | admin |
| Administração | `/perfil` | Meu perfil (foto, senha, disponibilidade) | todos |

**Páginas pastorais legadas / em consolidação** (existem no código, fora do menu
principal): `/dashboard-pastoral`, `/crm-pastoral`, `/timeline-pastoral`,
`/relatorios-pastorais`, `/rankings`, `/dashboard-v3`. A arquitetura prevê
unificá-las sobre dados reais (ver §11).

**Rotas públicas / auth:** `/login`, `/cadastro`, `/onboarding` (wizard de igreja),
`/esqueci-senha`, `/redefinir-senha`, `/concluir-cadastro` (convite).

---

## 8. API Routes (`src/app/api/*/route.ts`)

Todas server-side, usando `getFirebaseAdminClient()` + `requireApiSession/Actor`.

**Auth:** `auth/login`, `auth/logout`, `auth/session`, `auth/register`,
`auth/complete-registration`, `auth/forgot-password`, `auth/reset-password`,
`auth/invite-info`.

**App/Igreja:** `app/load` (carrega church + departments + department_members +
cells + cell_networks numa chamada), `church/update`, `support`.

**Pessoas/Membros:** `people/create`, `people/get`, `people/invite`,
`members/update`, `members/availability`, `members/deactivate`,
`member-invitations/create|resend|open/[token]`, `profile/update`,
`profile/change-password`, `profile/summary`.

**Ministérios:** `ministries/interest`, `departments/manage`,
`department-members`, `department-messages`.

**Escalas:** `schedules/create`, `schedules/delete`, `schedule-members`,
`schedule-chats` (chat + menções), `schedule-attachments`,
`send-schedule-reminders`.

**Eventos:** `events/manage`, `events/reports/manage`.

**Células:** `cells/list`, `cells/manage`, `cells/meetings/list|manage`,
`cells/networks/manage`.

**Kids:** `kids/list`, `kids/manage`.

**Cuidado:** `care/list`, `care/manage`, `prayer-requests/create|comment`.

**Comunicação/Notificações:** `communications/send`, `notifications/read`,
`notifications/preferences`, `notifications/register-push|register-token`,
`birthday-notifications`, `send-welcome-email`.

**Enquetes:** `polls/list|manage|vote`.

**Outros:** `songs` (repertório), `ranking/monthly`, `unavailable-dates`.

---

## 9. Motor de IA — Scoring de Escalas (`src/lib/ai/engine.ts`)

`scoreMember(member, deptMember, ctx)` → `MemberScore { score, available,
reasons[], alerts[] }`. Score base 50, com explicação transparente (cada fator
gera um `ScoringReason` com `impact` e `type`). **9 fatores:**

1. **Disponibilidade semanal** — `availability[dayOfWeek]`. Indisponível → score −1, exclui.
2. **Indisponibilidade por data** — bloqueio em `unavailable_dates` → exclui.
3. **Status do membro** — paused/vacation/inactive → exclui.
4. **Rodízio justo** — compara `total_schedules` à média (±2.5/diferença).
5. **Taxa de confirmação** — `confirm_rate`; <70% gera alerta.
6. **Carga recente** — >2 escalas recentes penaliza; >3 alerta.
7. **Vínculo de casal** — cônjuge no ministério → +5.
8. **Função compatível** — match com `requiredFunction` → +15.
9. **Conflito** — já escalado no mesmo dia em outra escala → −20 + alerta.

Usado na criação de escalas para sugerir/ordenar membros. Serviços
correlatos em `lib/server/scoring-service.ts`, `behavior-analysis-service.ts`,
`ranking-service.ts`.

---

## 10. Notificações (multicanal)

Dois módulos coexistem:
- `src/lib/notifications/` — API pública via `index.ts`. `sendNotification()`,
  tipos de payload (ScheduleAssigned, ScheduleReminder, MinistryInvite,
  CellAnnouncement, Welcome, PasswordReset…), providers `fcm-client`,
  `email-provider`, `sms-provider`, `preferences` (com `DEFAULT_PREFERENCES`).
- `src/services/` — `notification.service.ts`, `push.service.ts`,
  `email.service.ts`, `whatsapp.service.ts` + `notification.types.ts`
  (canais `push|email|whatsapp`, categorias `schedule|event|message|prayer|
  birthday|system`, coleção `notifications` + `notificationPreferences`).

**In-app:** `useApp` faz polling a cada 10s em `notifications` (não lidas),
atualiza badge e dispara toast em novidades. Painel em
`components/layout/notification-panel.tsx`.

**Push:** FCM Web com VAPID (`use-push-notifications.tsx`); tokens em
`pushTokens`/`deviceTokens`.

**Eventos notificáveis implementados** (ver `FEATURES_IMPLEMENTED.md`):
adicionar membro à escala (notifica + action_url) e **menções `@usuario`** no
chat de escala (`components/ui/mention-input.tsx` + `api/schedule-chats`).

---

## 11. Design System

Definido em `tailwind.config.js` + `globals.css`. Tema **"Aurora Suave"**.

### Cores (tokens Tailwind)

| Token | Hex | Uso |
|---|---|---|
| `bg` | `#FBFAFF` | fundo da app |
| `surface` / `surface-alt` / `surface-hover` | `#FFFFFF` / `#F4F2FB` / `#ECEAF6` | cartões |
| `sidebar-bg` / `sidebar-border` | `#F7F6FC` / `#ECEAF4` | sidebar |
| `ink` (+ soft/muted/faint/ghost) | `#1B1726`… | textos |
| **`brand`** | `#FF6B57` (coral) | cor principal, CTAs |
| `brand-deep` / `brand-light` / `brand-glow` | `#F0492F` / `#FFF1EE` / `#FFF7F5` | hover, bg suave |
| `success` | `#22B892` | confirmado, saudável |
| `danger` | `#F2566E` | recusa, crítico |
| `amber` / `sun` | `#E0A21B` / `#FFC24B` | atenção |
| `info` / `sky` | `#2BA8D6` / `#38BDF0` | informativo |
| `lavender` / `rose` / `mint` | `#9B8CFB` / `#FB7199` / `#2DD4A7` | acentos |
| `border` / `border-soft` | `#E7E5F0` / `#F0EEF8` | divisores |

> **Nota:** o README cita a marca antiga (`#F4532A` terracotta). A marca **atual
> em código é coral `#FF6B57`** (refresh). Confie no `tailwind.config.js`.

### Tipografia
- `font-body`: **Plus Jakarta Sans**
- `font-display`: **Schibsted Grotesk** (títulos)

### Raio e sombras
- `radius`: sm 12 / md 16 / lg 22 / xl 30 px
- `shadow`: `soft`, `lift`, `float`, `coral` (glow da marca)

### Componentes UI (`src/components/ui/`)
`index.tsx` (Modal, EmptyState, Skeleton, Avatar, Badge…), `tabs`, `action-drawer`,
`page-header`, `split-view`, `inline-search`, `multi-select`, `date-field`,
`mention-input`. Layout: `sidebar-v2` (desktop, com grupos colapsáveis e
sub-menu de ministérios), `bottom-tab-bar` (mobile), `notification-panel`.

---

## 12. Funcionalidades Implementadas (resumo)

- **Dashboard por perfil** (admin / híbrido líder / membro) — `home-ui`, `home-v3-ui`.
- **Onboarding** guiado de igreja (wizard 6 etapas).
- **Pessoas** unificadas (visitante→membro→voluntário→líder→pastor→criança).
- **Ministérios** com múltiplos líderes/co-líderes, funções, membros.
- **Escalas** em página completa com **sugestão IA**, adicionar/remover membros,
  confirmar/recusar com motivo, substituição, anexos, **chat com menções**.
- **Calendário/Agenda** mensal.
- **Eventos** (recorrentes e especiais) + relatórios de evento.
- **Células** com redes, supervisores, reuniões e índice de saúde (6 dimensões).
- **Kids** com salas por idade e check-in/out por código + responsáveis.
- **Cuidado pastoral** — acompanhamentos, pedidos de oração (com comentários),
  alertas.
- **Comunicação** — mensagens por ministério, comunicados, enquetes.
- **Notificações** multicanal (in-app + push FCM; email/SMS preparados).
- **Gamificação** — pontos, badges, ranking mensal.
- **Perfil** — foto (base64), troca de senha, disponibilidade semanal.
- **Convites** de membro por email/SMS com tracking de abertura.
- **Email de boas-vindas** (Resend) com credenciais + versículo (1 Pedro 4:10).

---

## 13. Dívidas Técnicas / Pontos de Atenção

1. **"Supabase" é Firestore** — não há banco Supabase. `sql/` e menções a
   localStorage no README são **legado**. Não reintroduza Supabase real sem
   decisão explícita.
2. **Páginas pastorais sobre mock** — `lib/pastoral/mock-data.ts` ainda alimenta
   telas (`crm-pastoral`, `timeline-pastoral`, etc.). A arquitetura manda migrar
   para dados reais ligados à entidade Pessoa. Há duplicação de tipos entre
   `lib/pastoral/types.ts` (rico/mock) e `lib/cells|care/types.ts` (real).
3. **Filtros em memória** no shim — `!=`, `ilike`, `in`>30, ordenação e limit são
   resolvidos client/server-side em memória. Cuidado com coleções grandes.
4. **Security Rules permissivas** — várias coleções relacionais
   (`schedule_members`, `notifications`, `pushTokens`…) permitem `read,write` a
   qualquer autenticado, **sem isolamento por igreja**. Tokens de reset e
   convites são públicos (`if true`). A regra default exige `church_id ==`, mas
   as exceções abrem superfície. Revisar antes de escalar.
5. **Microtask em update/delete** (Admin) — não remover o `await Promise.resolve()`,
   senão escritas sem filtro afetam a coleção inteira.
6. **Dois sistemas de notificação** (`lib/notifications` vs `services/`) — há
   sobreposição; a arquitetura pede um único Notification Center.
7. **Dois nomes para a marca** — README (terracotta) vs config (coral). Config vence.
8. **`role` (system) × `cell_role` × business roles derivados** — sempre derive
   papéis com `getPersonRoles`; não invente checagens ad-hoc de `user.role`.

---

## 14. Ambiente & Deploy

- **Firebase project:** `servos-bcc51` (`.firebaserc`), Firestore em
  `southamerica-east1`.
- **App Hosting:** backend `servos-backend` (`firebase.json`, `apphosting.yaml`).
- **Env públicas** (em `apphosting.yaml`): `NEXT_PUBLIC_FIREBASE_*`,
  `NEXT_PUBLIC_FIREBASE_VAPID_KEY`, `NEXT_PUBLIC_APP_URL`. **Locais:** `.env.local`.
- **Secrets** (Cloud Secret Manager): `resend_api_key`, `twilio_account_sid`,
  `twilio_auth_token`. `EMAIL_FROM`, `SUPPORT_EMAIL` como value.
- **Rodar local:** `npm install && npm run dev` → http://localhost:3000.

---

## 15. Documentação de Referência (em `docs/`)

- `SERVOS-2.0-ARQUITETURA.md` — visão de produto / Church OS (norte oficial).
- `AUDITORIA-SERVOS.md` — auditoria que originou as correções estruturais.
- `SERVOS-2.0-FUNDACAO-FASE1.md` — fundação (entregável 1 = person-roles).
- `notifications.md` — design das notificações.
- `specs/2026-05-30-cells-roles-model.md` — modelo de papéis de células.
- `superpowers/plans/` e `superpowers/specs/` — planos de design (dashboard v3,
  dept-form, pessoas-cuidado, etc.).
- `README.md`, `FEATURES_IMPLEMENTED.md` (raiz).

---

_Fonte de verdade do código: `src/`. Este documento resume o estado em
2026-06-09 — mantenha-o atualizado ao evoluir a arquitetura._
