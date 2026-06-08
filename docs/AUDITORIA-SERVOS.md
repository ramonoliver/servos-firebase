# Auditoria Completa & Documentação do Sistema — Servos App

> **Propósito deste documento**
> Mapear de forma exaustiva o produto **Servos** (estado atual do código) para permitir que um Product Designer Sênior realize uma revisão estratégica de **UX, Arquitetura de Informação, Navegação, Fluxos, Permissões e Estrutura Geral** sem precisar abrir o sistema.
> **Escopo:** somente documentação e mapeamento. Nenhuma implementação.
> **Base:** auditoria do código-fonte (Next.js 14 App Router + Firebase/Firestore).
> **Data da auditoria:** 2026-06-07.

---

## Índice

1. [Visão Geral do Produto](#1-visão-geral-do-produto)
2. [Mapa Completo do Sistema](#2-mapa-completo-do-sistema)
3. [Arquitetura de Informação Atual](#3-arquitetura-de-informação-atual)
4. [Fluxos do Usuário](#4-fluxos-do-usuário)
5. [Modelagem Conceitual](#5-modelagem-conceitual)
6. [Permissões](#6-permissões)
7. [Jornada por Perfil](#7-jornada-por-perfil)
8. [Home por Perfil](#8-home-por-perfil)
9. [Fluxograma Geral](#9-fluxograma-geral)
10. [Pontos de Acoplamento](#10-pontos-de-acoplamento)
11. [Problemas Identificados](#11-problemas-identificados)
12. [Oportunidades](#12-oportunidades)
13. [Documento Final / Síntese](#13-documento-final--síntese)

---

# 1. Visão Geral do Produto

## Objetivo do Servos
O **Servos** é um sistema de **gestão de igreja** (church management / ChMS) com foco em três pilares operacionais:

1. **Escalas e ministérios** — organizar voluntários, montar escalas de serviço por evento/culto, pedir confirmação e acompanhar presença.
2. **Pessoas e cuidado pastoral** — cadastro de membros, acompanhamento (cuidado), células e relacionamento.
3. **Operação semanal** — agenda unificada de cultos/eventos, check-in infantil (Kids), comunicação e relatórios.

A tese central do produto é tornar a **agenda o "centro do cuidado da semana"** (texto presente na própria UI da Agenda), conectando evento → escala → comunicação → cuidado.

## Público-alvo
- **Igrejas locais** de modelo celular (com células, supervisões/redes e ministérios).
- **Liderança pastoral** (pastores, coordenação) que precisa de visão consolidada.
- **Líderes de ministério** (produção, louvor, acolhimento, kids, mídia…).
- **Líderes e supervisores de célula**.
- **Voluntários e membros** que recebem escalas, confirmam presença e participam de células.

## Principais problemas resolvidos
- Montagem e publicação de **escalas** com cobertura por função e auto-seleção de voluntários (inclui lógica de casais).
- **Confirmação de presença** dos escalados com notificação ao líder.
- **Visão única da semana** (Agenda) combinando cultos recorrentes, eventos especiais, células, escalas e aniversários.
- **Gestão de células** com saúde (frequência, comunhão, participação, crescimento, engajamento, acompanhamento), reuniões e supervisão por rede.
- **Check-in infantil (Kids)** com código seguro de retirada e vínculo responsável↔criança.
- **Cuidado pastoral** (notas, acompanhamentos, pedidos de oração) e **relatórios** consolidados.
- **Onboarding de membros** por convite (e-mail/SMS) com auto-cadastro.

## Funcionalidades atuais (implementadas e funcionais)
- Autenticação por sessão (cookie HMAC) + Firebase custom token.
- Dashboard (Início) adaptativo por perfil.
- Agenda/Calendário unificado + Eventos + relatório pós-evento.
- Pessoas/Membros (cadastro, edição, convite, disponibilidade, desativação).
- Ministérios (CRUD, membros, funções, escalas do ministério).
- Escalas (criação com cobertura por função, edição, confirmação, anexos, chat, lembretes).
- Minhas escalas / Indisponibilidade (datas indisponíveis e férias).
- Células (CRUD, membros, reuniões, saúde, redes/supervisão, estrutura).
- Kids (crianças, salas, check-in/checkout, responsáveis).
- Notificações (sino in-app + push FCM + e-mail/SMS/WhatsApp via serviços) + preferências.
- Mensagens por ministério (chat de departamento).
- Rankings mensais, Repertório (músicas), Relatórios, Configurações, Perfil.

## Funcionalidades planejadas / parciais (telas em protótipo/mock — ver §11)
- **Comunicação** (envio segmentado) — tela é um *stub* estático.
- **Enquetes** — *stub* estático.
- **CRM Pastoral / Dashboard Pastoral / Acompanhamentos / Pedidos de Oração / Alertas / Timeline Pastoral** — rodam sobre **dados mock** (`lib/pastoral/mock-data`), não sobre o banco real.
- **Perfis & Permissões** (`/perfis-permissoes`) — *stub*.
- **Gamificação** (pontos, badges) — modelo de dados existe, telas parciais.

---

# 2. Mapa Completo do Sistema

> Legenda de status:
> ✅ **Funcional** (lê/grava dados reais) · 🟡 **Parcial** (funciona mas incompleto) · 🧪 **Mock** (usa dados fictícios) · ⬜ **Stub** (estático, sem lógica)

## Páginas públicas (fora do app, sem sidebar)

| Rota | Página | Objetivo | Status |
|---|---|---|---|
| `/` | Landing/Redirect | Entrada → redireciona para login/app | ✅ |
| `/login` | Login | Autenticação | ✅ |
| `/cadastro` | Cadastro de igreja/conta | Criar igreja + admin | ✅ |
| `/onboarding` | Onboarding | Primeiros passos pós-cadastro | ✅ |
| `/concluir-cadastro` | Concluir cadastro (convite) | Membro convidado completa perfil + senha (token) | ✅ |
| `/esqueci-senha` | Esqueci a senha | Solicitar reset | ✅ |
| `/redefinir-senha` | Redefinir senha | Aplicar nova senha (token) | ✅ |

## Páginas internas do app (`/(app)`, com sidebar)

### Núcleo de navegação (itens do menu)

| Rota | Página | Objetivo | Status |
|---|---|---|---|
| `/dashboard` | **Início** | Home adaptativa por perfil (re-exporta `dashboard-v3`) | ✅ |
| `/calendario` | **Agenda** | Calendário unificado (cultos, eventos, células, escalas, aniversários) | ✅ |
| `/pessoas` | **Pessoas** | Lista/gestão de pessoas + cadastro rápido + convite | ✅ |
| `/kids` | **Kids** | Check-in infantil, salas, responsáveis | ✅ |
| `/celulas` | **Células** | Lista/gestão de células (filtros, saúde) | ✅ |
| `/ministerios` | **Ministérios** | Lista/gestão de ministérios | ✅ |
| `/minhas-escalas` | **Ministérios (membro)** | Substitui "Ministérios" no menu para `member` | ✅ |
| `/comunicacao` | **Comunicação** | Hub de envios segmentados | ⬜ stub |
| `/relatorios` | **Relatórios** | Visão consolidada Pessoas/Agenda/Células/Ministérios | ✅ |
| `/configuracoes` | **Configurações** | Ajustes da igreja + orientações | ✅ |
| `/perfil` | **Meu Perfil** | Dados pessoais, senha, push | ✅ |

### Sub-rotas e páginas internas (acessadas por links, não diretamente no menu)

| Rota | Objetivo | Status |
|---|---|---|
| `/escalas` | Lista de escalas (split-view) por ministério | ✅ |
| `/escalas/nova` | Wizard de criação de escala (cobertura por função) | ✅ |
| `/escalas/[id]` | Detalhe da escala (equipe, confirmações, anexos, chat) | ✅ |
| `/eventos` | Eventos (cultos recorrentes + especiais) | ✅ |
| `/eventos/[id]` | Detalhe do evento + relatório pós-evento | ✅ |
| `/membros` | Lista de membros (split-view) — **paralelo a `/pessoas`** | ✅ |
| `/membros/[id]` | Perfil de membro (visão pastoral) | ✅ |
| `/membros/convidar` | Convite de pessoa | ✅ |
| `/pessoas/[id]` | Perfil/edição de pessoa (disponibilidade, ministérios, etc.) | ✅ |
| `/celulas/[id]` | Detalhe da célula (membros, reuniões, saúde, cuidado) | ✅ |
| `/celulas/redes` | Redes/supervisões | ✅ |
| `/celulas/estrutura` | Estrutura/organograma de células | ✅ |
| `/ministerios/[id]` | Detalhe do ministério (membros, próximas escalas) | ✅ |
| `/mensagens` | Chat por ministério (department messages) | ✅ |
| `/notificacoes` | Central de notificações (sino) | ✅ |
| `/configuracoes/notificacoes` | Preferências de notificação | ✅ |
| `/indisponibilidade` | Datas indisponíveis / férias do voluntário | ✅ |
| `/rankings` | Ranking mensal de serviço | 🟡 |
| `/repertorio` | Repertório de músicas (louvor) | 🟡 |
| `/relatorios-pastorais` | Relatórios pastorais | ⬜ stub (1 linha) |
| `/acompanhamentos` | Casos de cuidado | 🧪 mock |
| `/pedidos-oracao` | Pedidos de oração | 🧪 mock |
| `/alertas` | Alertas pastorais | 🧪 mock |
| `/timeline-pastoral` | Linha do tempo pastoral | 🧪 mock |
| `/crm-pastoral` | CRM pastoral | 🧪 mock |
| `/dashboard-pastoral` | Dashboard pastoral | 🧪 mock |
| `/enquetes` | Enquetes | ⬜ stub |
| `/perfis-permissoes` | Perfis & permissões | ⬜ stub |

### Detalhe por página principal (objetivo · funcionalidades · componentes · ações · permissões)

#### Início (`/dashboard`)
- **Objetivo:** painel de entrada adaptado ao perfil; mostra o que precisa de atenção hoje.
- **Funcionalidades:** saudação contextual, cards de prioridade, prioridades de hoje, timeline viva, próximos encontros, escalas do membro, célula, pedidos de oração.
- **Componentes:** `DashboardHero`, `PriorityCards`, `PriorityList`, `ActivityTimeline`, `UpcomingEvents`, `MemberSchedulePanel`, `MemberCellPanel`, `MemberPrayerPanel`, `MemberMinistryGrid`, `CarePeopleSection`*, `InsightCards`* (*removidos do Admin na última iteração).
- **Ações:** busca, sino, **Ações rápidas** (dropdown), atalhos por card.
- **Permissões:** todos os perfis; conteúdo varia por `profileMode` (ver §8).

#### Agenda (`/calendario`)
- **Objetivo:** leitura única da semana/mês (cultos, eventos, células, escalas, aniversários).
- **Funcionalidades:** calendário mensal, legenda por tipo, dia selecionado com lista de ocorrências; CTA "+ Novo evento"; registro de pós-evento.
- **Ações:** navegar meses, selecionar dia, abrir ocorrência, criar evento.
- **Permissões:** visualização ampla; criação de evento conforme `event.create`.

#### Pessoas (`/pessoas`) e Membros (`/membros`)
- **Objetivo:** diretório de pessoas da igreja + ações de cuidado/cadastro.
- **Funcionalidades:** busca/filtros, cadastro rápido (drawer "Nova pessoa"), convite, perfil detalhado (`/pessoas/[id]` e `/membros/[id]`).
- **Ações:** criar, editar, convidar, desativar, definir disponibilidade.
- **Permissões:** oculto para `member`; edição/exclusão por `canEditOrDeleteMemberClient` (admin/pastor/líder do escopo).

#### Kids (`/kids`)
- **Objetivo:** check-in infantil seguro durante cultos.
- **Funcionalidades:** seleção de culto/evento, nova criança, check-in/checkout, salas, contador "agora em sala", código de retirada.
- **Componentes:** `KidsCheckInDrawer`, `KidsChildrenList`, `KidsRoomsManager`, `KidsSummaryCards`.
- **Permissões:** oculto para `member`.

#### Células (`/celulas` + `/[id]` + `/redes` + `/estrutura`)
- **Objetivo:** gestão de células, supervisão e acompanhamento.
- **Funcionalidades:** filtros (tipo/dia/supervisão), chips de status, card de saúde, detalhe com membros, reuniões, liderança, saúde detalhada e **pessoas em cuidado** (novo).
- **Permissões:** oculto para `member`; gestão por admin/pastor/coordenação ou líder da célula (`manageableIds`).

#### Ministérios (`/ministerios` + `/[id]`)
- **Objetivo:** equipes de serviço + escalas.
- **Funcionalidades:** card por ministério, detalhe com membros, funções, próximas escalas, criação de escala.
- **Permissões:** criação/edição por `department.*`; membro comum usa `/minhas-escalas`.

#### Escalas (`/escalas` + `/nova` + `/[id]`)
- **Objetivo:** montar, publicar e acompanhar escalas.
- **Funcionalidades:** lista split-view por ministério; wizard de cobertura por função com auto-seleção; detalhe com equipe, confirmações, anexos, chat, lembrar pendentes.
- **Permissões:** `schedule.create/edit/delete` (admin/líder do ministério).

#### Comunicação (`/comunicacao`)
- **Objetivo:** envios segmentados (células, ministérios, cuidado).
- **Status:** ⬜ **stub** — três cards estáticos, botões sem ação.

#### Relatórios (`/relatorios`)
- **Objetivo:** visão consolidada para decisões semanais (Pessoas, Agenda, Células, Ministérios, Engajamento).
- **Permissões:** `report.view` (admin/líder).

#### Configurações (`/configuracoes`) e Perfil (`/perfil`)
- **Configurações:** ajustes da igreja, orientações; `settings.edit` (admin).
- **Perfil:** dados pessoais, troca de senha, ativar push; todos os perfis.

---

# 3. Arquitetura de Informação Atual

## Estrutura do menu principal (sidebar)
O menu é **montado dinamicamente por perfil** em `(app)/layout.tsx` via flag `show`:

```
Menu Principal
├─ Início            (/dashboard)           → todos
├─ Agenda            (/calendario)          → todos
├─ Pessoas           (/pessoas)             → !member
├─ Kids              (/kids)                → !member
├─ Células           (/celulas)             → !member
├─ Ministérios       (/ministerios)         → admin/leader
│   └─ (membro)      (/minhas-escalas)      → member  (mesmo slot do menu)
│   └─ submenu       (/ministerios/[id])    → lista até 5 ministérios do usuário
├─ Comunicação       (/comunicacao)         → message.send OU !admin
│
└─ Gestão (grupo)
    ├─ Relatórios    (/relatorios)          → report.view (admin/leader)
    ├─ Configurações (/configuracoes)       → admin
    └─ Meu Perfil    (/perfil)              → todos
```

### Observações de AI
- O item **"Ministérios"** troca de destino conforme o papel (`/ministerios` vs `/minhas-escalas`) — **mesmo rótulo, rotas diferentes**.
- Diversas páginas **não têm entrada no menu** e só são alcançadas por links internos: `/escalas`, `/eventos`, `/membros`, `/mensagens`, `/notificacoes`, `/indisponibilidade`, `/rankings`, `/repertorio`, e todas as páginas pastorais/mock.
- O **agrupamento por "área"** existe só na lógica de destaque (`isActive`), não na estrutura visível:
  - `Pessoas` destaca também `/membros`, `/acompanhamentos`, `/pedidos-oracao`, `/timeline-pastoral`, `/alertas`, `/crm-pastoral`.
  - `Ministérios`/`Minhas escalas` destaca `/escalas`, `/minhas-escalas`.
  - `Comunicação` destaca `/mensagens`, `/notificacoes`, `/enquetes`.
- **Mobile:** drawer lateral com os mesmos itens + atalhos "Nova escala" e "Convidar pessoa".

## Dependências entre páginas (navegação real)
```
/calendario ─→ /eventos/[id] ─→ (relatório pós-evento)
/eventos ────→ /escalas/nova?departmentId=…
/ministerios/[id] ─→ /escalas/nova?departmentId=…  ·  abre /escalas/[id] (drawer)
/escalas ────→ /escalas/[id] (drawer) ─→ anexos, chat, confirmações
/celulas ────→ /celulas/[id] ─→ /membros/[id]  ·  /celulas/estrutura  ·  /celulas/redes
/pessoas /membros ─→ /pessoas/[id] | /membros/[id] ─→ disponibilidade, ministérios, células
/dashboard ─→ (atalhos) /escalas, /celulas, /pessoas, /acompanhamentos*, /pedidos-oracao*, /ministerios, /relatorios
            (*destinos mock/stub)
/notificacoes ─→ action_url (deep-link para a entidade originadora)
```

---

# 4. Fluxos do Usuário

## 4.1 Escalas

### Criação (`/escalas/nova`)
1. Acesso via **Ministérios → Nova escala**, **Eventos → criar escala** ou **Escalas → +Nova** (`departmentId` no query).
2. Seleciona **evento** (recorrente ou especial), **data/horário**, **horário de chegada**, **instruções**.
3. **Cobertura por função:** define quantos voluntários por função do ministério.
4. **Seleção de equipe:** lista candidatos filtrados por função; **auto-seleção** preenche vagas respeitando casais (`autoSelectWithCouples`) e disponibilidade.
5. Marca **reservas** (`is_reserve`).
6. **Salvar rascunho** (`publish=false`) ou **Publicar e notificar** (`publish=true`).
   - Ao publicar com funções não cobertas, há aviso (`missingFunctions`).
   - Publicação dispara notificação aos escalados (entidade `ScheduleMember`).
- **API:** `POST /api/schedules/create`.

### Edição
- Reabre o detalhe/edição da escala; ajustes de equipe/funções/instruções; re-publicação.
- **API:** `POST /api/schedules/create` (upsert) · `POST /api/schedules/delete`.

### Confirmação (voluntário)
1. Voluntário recebe **notificação in-app + push + e-mail** ("você está escalado").
2. Abre `/escalas/[id]` ou card "Minhas escalas" no Início.
3. Responde **Confirmar** / **Recusar** (com `decline_reason`); status `pending → confirmed | declined`.
4. Ao responder, **o líder do ministério é notificado** (bloco de notificação adicionado em `schedule-members`).
- **API:** `POST /api/schedule-members` (respond).
- **Anexos/Chat:** `GET/POST /api/schedule-attachments`, `/api/schedule-chats` (participante escalado tem acesso).
- **Lembrar pendentes:** `POST /api/send-schedule-reminders` (clique manual ignora dedup/data).

### Disponibilidade / Indisponibilidade
- **Disponibilidade geral:** 7 flags (Seg–Dom) no perfil da pessoa → `POST /api/members/availability` (gravação não destrutiva, dedicada).
- **Datas indisponíveis / férias:** `/indisponibilidade` → `POST /api/unavailable-dates` (tipos: single, range, vacation).
- Disponibilidade influencia o **scoring/auto-seleção** na criação de escalas.

## 4.2 Pessoas

### Cadastro
- **Rápido:** drawer "Nova pessoa" em `/pessoas` → `POST /api/people/create`.
- **Por convite:** `/membros/convidar` ou `/pessoas` → `POST /api/member-invitations/create` (gera token, envia e-mail/SMS) → membro abre `/concluir-cadastro?token=…` → completa perfil e senha → `POST /api/auth/complete-registration`.

### Edição
- `/pessoas/[id]` ou `/membros/[id]`: dados pessoais, endereço (ViaCEP), foto (resize client-side), estado civil, batismo, discipulado, ministérios, célula, disponibilidade.
- **API:** `POST /api/members/update` (pesado, re-sincroniza vínculos) · `POST /api/profile/update` (autoperfil).
- **Desativar:** `POST /api/members/deactivate`.

### Acompanhamento
- Notas pastorais (`pastoral_notes`) por pessoa: visita, ligação, oração, aconselhamento, acompanhamento, anotação.
- **API:** `POST /api/care/manage`, `GET /api/care/list`.
- **Visível** no perfil da pessoa e (novo) na **página da célula** para admin/pastor/líder.

## 4.3 Comunicação

### Envio
- **Mensagens de ministério (chat):** `/mensagens` → `POST /api/department-messages` (real).
- **Comunicação segmentada (`/comunicacao`):** ⬜ **stub** — não envia nada.

### Recebimento / Notificações
- **Sino in-app:** coleção `notifications` (polling a cada 10s em `use-app`).
- **Push:** FCM via `firebase-admin` (`getMessaging().sendEachForMulticast`); tokens em `push_tokens`.
- **E-mail/SMS/WhatsApp:** serviços em `src/services/*` (Resend, Twilio, Evolution API).
- **Preferências:** `/configuracoes/notificacoes` → `POST /api/notifications/preferences` (push respeita preferência; sino sempre grava).
- **Registro de token:** `POST /api/notifications/register-token` (→ `push_tokens`) / `register-push`.

## 4.4 Agenda / Eventos

### Criação
- `/eventos` ou `/calendario` → "+ Novo evento": tipo **recorrente** (`weekly:0-6`) ou **especial** (`once:YYYY-MM-DD`), local, horário base, ícone, instruções.
- **API:** `POST /api/events/manage`.

### Edição
- Ajuste de dados do evento; reflete na Agenda e nas escalas vinculadas (via `event_id`).

### Pós-evento
- `/eventos/[id]` → registrar **EventReport** (presença, voluntários, conversões, reconciliações, pedidos, visitantes, crianças, notas).
- **API:** `POST /api/events/reports/manage`.

## 4.5 Células

### Estrutura
- **Rede/Supervisão** (`CellNetwork`) com supervisores; **células** vinculadas (`network_id`).
- `/celulas/redes` (gestão de redes) · `/celulas/estrutura` (organograma).
- **API:** `POST /api/cells/networks/manage`, `POST /api/cells/manage`.

### Participantes
- Membros da célula (`CellMemberRow`), líderes (`leader_ids`) e co-líderes (`co_leader_ids`).
- Adição/edição via formulário da célula.

### Acompanhamento
- **Reuniões** (`CellMeeting`): tema, palavra, sentimento (🔥/😊/🙂/😕), presença (`CellAttendanceRow`).
- **Saúde** (6 dimensões) → status (Saudável/Em crescimento/Atenção/Crítica/Nova); **frequência** calculada da presença.
- **API:** `GET /api/cells/meetings/list`, `POST /api/cells/meetings/manage`.

## 4.6 Kids

### Cadastro
- "Nova criança" no `/kids`; criança é um `User` com `is_child=true`, `primary_guardian_id`, `guardian_ids`.

### Check-in
1. Selecionar **culto/evento**.
2. **Check-in** (criança existente ou nova) → escolhe **sala** (`KidsRoom` por faixa etária/capacidade) e **responsável**.
3. Gera **código** único (retirada segura); status `in_room`.
- **API:** `POST /api/kids/manage`, `GET /api/kids/list`.

### Salas
- `KidsRoom`: faixa etária, capacidade, voluntários (`volunteer_ids`), status.

### Retirada (checkout)
- Conferência do **código** → status `called`/`checked_out`; registra quem retirou e horário.

---

# 5. Modelagem Conceitual

> Entidades reais do banco (Firestore via adaptador estilo Supabase). Coleções entre parênteses.

## Church (`churches`)
- **Atributos:** id, name, city, state, created_at.
- **Relacionamentos:** 1—N com tudo (raiz multi-tenant via `church_id`).

## User / Pessoa (`users`)
- **Atributos:** id, church_id, email, password_hash, name, phone, role (`admin|leader|member`), **cell_role** (`pastor|coordenacao|null`), cell_id, ministry_ids[], tag_ids[], status, avatar_color, photo_url, birth_date, gender, **is_child**, **primary_guardian_id**, **guardian_ids[]**, endereço (cep/street/number/complement/neighborhood/city/state), instagram, baptized, in_discipleship, marital_status, spouse_id, **availability[7]**, total_schedules, confirm_rate, must_change_password, last_served_at, notes, active, joined_at, created_at.
- **Relacionamentos:** N—N Ministérios (via `DepartmentMember`), N—N Células (via `CellMemberRow`), 1—N como responsável de crianças (`guardian_ids`), 1—1 cônjuge (`spouse_id`).
- **Dependências:** base de Escalas, Cuidado, Kids, Notificações, Ranking.

## Department / Ministério (`departments`)
- **Atributos:** id, church_id, name, description, icon, color, **function_names[]**, **leader_ids[]**, **co_leader_ids[]**, active, created_at.
- **Relacionamentos:** N—N Usuários (`DepartmentMember`), 1—N Escalas (`department_id`), 1—N Mensagens.

## DepartmentMember (`department_members`)
- **Atributos:** id, department_id, user_id, function_name, function_names[], joined_at.
- **Relacionamentos:** liga User↔Department; carrega funções do voluntário no ministério.

## Event / Evento (`events`)
- **Atributos:** id, church_id, name, description, type (`recurring|special`), icon, location, base_time, instructions, **recurrence** (`weekly:0-6` | `once:YYYY-MM-DD`), active, created_at.
- **Relacionamentos:** 1—N Escalas (`event_id`), 1—N EventReport, base do check-in Kids (`event_id`), aparece na Agenda.

## EventReport (`event_reports`)
- **Atributos:** id, church_id, event_id, event_date, attendance/volunteers/new_converts/reconciliations/prayer_requests/people_followed/visitors/children counts, notes, reported_by.
- **Relacionamentos:** N—1 Event; alimenta Relatórios.

## Schedule / Escala (`schedules`)
- **Atributos:** id, church_id, **event_id**, **department_id**, date, time, arrival_time, status (`draft|active|cancelled|completed`), instructions, notes, **published**, created_by.
- **Relacionamentos:** N—1 Event, N—1 Department, 1—N ScheduleMember, 1—N ScheduleSlot, 1—N Anexos/Chat.

## ScheduleMember (`schedule_members`)
- **Atributos:** id, schedule_id, user_id, function_name, **status** (`pending|confirmed|declined`), decline_reason, substitute_id, substitute_for, **is_reserve**, responded_at, notified_at.
- **Relacionamentos:** liga User↔Schedule; núcleo do fluxo de confirmação.

## ScheduleSlot (`schedule_slots`)
- **Atributos:** id, schedule_id, function_name, quantity, filled. (Cobertura por função.)

## ScheduleAttachment (`schedule_attachments`)
- **Atributos:** id, schedule_id, uploaded_by_user_id, file_name, mime_type, size_bytes, content_base64, created_at.

## UnavailableDate (`unavailable_dates`)
- **Atributos:** id, user_id, date, end_date, reason, type (`single|range|vacation`).

## Cell / Célula (`cells`)
- **Atributos:** id, church_id, name, description, cover_color, **leader_ids[]**, **co_leader_ids[]**, **network_id**, address, week_day, time, max_members, audience, status (`active|paused|multiplying`), **health{6 dimensões}**, created_at.
- **Relacionamentos:** N—1 CellNetwork, N—N Usuários (`CellMemberRow`), 1—N CellMeeting.

## CellNetwork / Rede-Supervisão (`cell_networks`)
- **Atributos:** id, church_id, name, description, **supervisor_ids[]**, color.
- **Relacionamentos:** 1—N Cells.

## CellMemberRow (`cell_members`)
- **Atributos:** id, cell_id, user_id, status, joined_at.

## CellMeeting (`cell_meetings`) + CellAttendanceRow (`cell_attendance`)
- **Meeting:** id, cell_id, church_id, date, time, theme, word, notes, feeling, feedback.
- **Attendance:** id, meeting_id, cell_id, user_id, status (`present|absent|visitor|first_visit`).

## KidsRoom (`kids_rooms`)
- **Atributos:** id, church_id, name, min_age, max_age, capacity, description, status, **volunteer_ids[]**.

## KidsGuardianLink (`kids_guardian_links`)
- **Atributos:** id, church_id, child_id, guardian_id, relationship (`Pai|Mae|Responsavel|Avo|Tio|Outro`), is_primary.

## KidsCheckIn (`kids_checkins`)
- **Atributos:** id, church_id, **event_id**, event_date, child_id, room_id, guardian_id, **code**, status (`in_room|called|checked_out|waiting_guardian`), checked_in_at/by, checked_out_at/by, called_at, notes.
- **Relacionamentos:** liga criança↔sala↔responsável↔evento.

## PastoralNote / Nota de cuidado (`pastoral_notes`)
- **Atributos:** id, church_id, person_id, author_id, type (`visit|call|prayer|counseling|care|note|care_case|prayer_request`), title, description, date.
- **Relacionamentos:** N—1 User; usada pelo Início (cuidado) e célula.

## Notification (`notifications`) + PushToken (`push_tokens`)
- **Notification:** id, user_id, church_id, title, body, icon, type, read, action_url, created_at.
- **PushToken:** id, user_id, church_id, token, platform, device_name, active.

## MemberInvitation (`member_invitations`)
- **Atributos:** id, church_id, user_id, invited_by_user_id, email, phone, tracking_token, email_status, sms_status, opened_at, open_count, sent_at.

## Message (`department_messages`)
- **Atributos:** id, department_id, sender_id, content, created_at.

## Gamificação: PointsHistory, Badge, UserBadge, MonthlyRanking
- **PointsHistory:** user_id, schedule_id, reason, points.
- **MonthlyRanking:** month, user_id, points, services, absences, rank.

## AuditLog (`audit_logs`)
- **Atributos:** church_id, user_id, action, entity_type, entity_id, details, created_at.

---

# 6. Permissões

## Como funciona (duas camadas)
1. **Motor base (`lib/auth/permissions.ts` → `can(role, action, ctx)`):**
   - `admin` → **tudo** (`ADMIN_ALL`).
   - `leader` → conjunto `LEADER_ACTIONS`, com **isolamento por departamento** para ações de escrita (`schedule.create/edit`, `member.invite/edit`) restritas aos `userDepartmentIds` que lidera.
   - `member` → conjunto `MEMBER_ACTIONS` (visualizar + `confirm.own` + `profile.edit`).
2. **Permissão fina de pessoa (`canEditOrDeleteMemberClient`):** admin/pastor editam qualquer um; líder só edita quem está sob seu escopo (célula que lidera, rede que supervisiona, ou ministério que lidera); líder **nunca** edita admin.

> ⚠️ **Importante:** os "perfis" de negócio (Supervisor, Líder de Célula, Líder de Ministério, Pastor) **não são valores de `role`**. `role` só tem `admin|leader|member`. Os demais são **derivados**:
> - **Pastor/Coordenação** → `user.cell_role`.
> - **Supervisor** → estar em `CellNetwork.supervisor_ids`.
> - **Líder de Célula** → estar em `Cell.leader_ids/co_leader_ids`.
> - **Líder de Ministério** → estar em `Department.leader_ids/co_leader_ids` (mapeado para `role=leader` + `userDeptIds`).

## Ações disponíveis (`Action`)
`schedule.{create,edit,delete,view}` · `member.{invite,edit,remove,view}` · `department.{create,edit,delete,view}` · `event.{create,edit,delete,view}` · `message.send` · `report.view` · `settings.edit` · `confirm.own` · `profile.edit`.

## Matriz de permissões (base `role`)

| Ação | Admin | Líder (`leader`) | Membro (`member`) |
|---|:--:|:--:|:--:|
| schedule.view | ✅ | ✅ | ✅ |
| schedule.create / edit | ✅ | ✅ (só ministérios que lidera) | ❌ |
| schedule.delete | ✅ | ❌ | ❌ |
| confirm.own (responder escala) | ✅ | ✅ | ✅ |
| member.view | ✅ | ✅ | ✅ |
| member.invite / edit | ✅ | ✅ (escopo) | ❌ |
| member.remove | ✅ | ❌ | ❌ |
| department.view | ✅ | ✅ | ✅ |
| department.create / edit / delete | ✅ | ❌ (edit do próprio via UI) | ❌ |
| event.view | ✅ | ✅ | ✅ |
| event.create / edit | ✅ | ✅ | ❌ |
| event.delete | ✅ | ❌ | ❌ |
| message.send | ✅ | ✅ | ❌ |
| report.view | ✅ | ✅ | ❌ |
| settings.edit | ✅ | ❌ | ❌ |
| profile.edit | ✅ | ✅ | ✅ |

## Mapeamento perfis de negócio → capacidades efetivas

| Perfil de negócio | Implementação | Visualizar | Criar | Editar | Excluir |
|---|---|---|---|---|---|
| **Admin** | `role=admin` | tudo | tudo | tudo | tudo |
| **Pastor / Coordenação** | `cell_role` | tudo da igreja (pastoral) | escalas, pessoas, células, eventos | qualquer pessoa/célula | conforme admin nas telas de célula/pessoa |
| **Supervisor** | `network.supervisor_ids` | suas redes/células | — | pessoas das células supervisionadas | — |
| **Líder de Ministério** | `role=leader` + lidera dept | seus ministérios/escalas | escalas/membros do ministério | escala/membros do ministério | ❌ (escala) |
| **Líder de Célula** | lidera `Cell` | sua célula | reuniões, membros | célula que lidera | ❌ |
| **Voluntário** | `role=member` em ministério | suas escalas/células | — | seu perfil/disponibilidade | — |
| **Membro** | `role=member` | Início, Agenda, suas escalas/célula | — | seu perfil | — |

> Nota: "Voluntário" e "Membro" são **o mesmo `role=member`**; a diferença é apenas ter ou não vínculo de ministério (`hasMinistry`).

---

# 7. Jornada por Perfil

## Admin (uso diário)
`Início` (visão geral) → `Agenda` (semana) → `Escalas`/`Ministérios` (publicar/cobrir) → `Pessoas`/`Células` (cadastro/cuidado) → `Relatórios` → `Configurações`. Telas ocasionais: `Kids`, `Comunicação`, `Notificações`.

## Líder de Ministério
`Início` (hybrid) → `Ministérios/[id]` (sua equipe + próximas escalas) → `Escalas/nova` (montar/publicar) → `Escalas/[id]` (confirmações, anexos, chat, lembrar pendentes) → `Mensagens` (avisar equipe) → `Pessoas` (do seu ministério).

## Líder de Célula
`Início` (hybrid) → `Células/[id]` (membros, reuniões, saúde, **pessoas em cuidado**) → registrar **Reunião** (presença, sentimento) → `Pessoas/[id]` (acompanhamento) → `Comunicação`/`Mensagens` (avisos).

## Supervisor
`Início` (admin-like) → `Células/estrutura` e `Células/redes` (rede sob supervisão) → `Células/[id]` (saúde por célula) → `Pessoas` (das células supervisionadas) → `Relatórios`.

## Voluntário (member com ministério)
`Início` (departmentMember) → "Minhas escalas" (confirmar/recusar) → `/minhas-escalas` → `/indisponibilidade` (marcar férias/datas) → `/celulas` (sua célula) → `/perfil` (disponibilidade, push).

## Membro (member sem ministério → "connect")
`Início` (connect/empty state) → `Agenda` → `Células` (encontrar célula) → `Ministérios` ("quero servir") → `/perfil` (completar cadastro).

---

# 8. Home por Perfil

A Home (`/dashboard` → `DashboardV3Home`) seleciona o layout por **`profileMode`**, derivado em `dashboard-v3/page.tsx`:
- `admin` → admin/pastor/coordenação/**supervisor**.
- `hybrid` → `role=leader` (líder de ministério/célula).
- `departmentMember` → membro com ministério.
- `cellMember` → membro só com célula.
- `connect` → sem ministério e sem célula (estado de conexão).

## Admin / Pastor / Supervisor (`admin`)
- **Componentes:** Hero (saudação + busca + sino + Ações rápidas) · **PriorityCards** · Prioridades de hoje · Timeline viva · Próximos encontros.
- **Priority cards (atualizados):** **Ministérios ativos**, **Membros ativos**, **Células ativas**, **Presença média**.
- **Removidos recentemente:** "Pessoas precisando de cuidado" (movido para a página da célula) e "Insights da semana".
- **Ações rápidas:** Nova escala, Nova célula, Nova pessoa.

## Líder (`hybrid`)
- **Componentes:** Hero · (se houver escalas) **Minhas escalas** em destaque · Prioridades de hoje · Timeline viva · Próximos encontros · **Minha célula** · **Pedidos de oração**.
- **Sem** priority cards pastorais, sem cuidado, sem insights.
- **Ações rápidas:** Minha escala, Minha célula, Avisos.

## Voluntário / Membro de célula (`departmentMember` / `cellMember`)
- **Componentes:** Hero · **Agenda pessoal** (seus compromissos) · **Minha célula** · (se houver) **Minhas escalas** · **Pedidos de oração** · **Grid "Em que você quer servir?"**.
- **Priority cards (membro):** Minhas confirmações, Próxima escala, Minha célula, Pedidos de oração.
- **Ações rápidas:** Minha escala, Minha célula, Avisos.

## Connect (`connect`)
- **Componentes:** Hero + **PersonalizedEmptyState** ("Vamos ajudar você a se conectar") com CTAs Encontrar célula / Quero servir.
- **Ações rápidas:** Quero servir, Encontrar célula, Completar cadastro.

---

# 9. Fluxograma Geral

```
SERVOS (multi-tenant por church_id)
│
├─ AUTENTICAÇÃO
│   ├─ /login ─→ sessão (cookie HMAC) + Firebase custom token
│   ├─ /cadastro ─→ cria Church + Admin ─→ /onboarding
│   └─ Convite ─→ /concluir-cadastro?token ─→ completa perfil/senha
│
└─ APP (sidebar dinâmica por perfil)
    │
    ├─ INÍCIO (/dashboard)
    │   └─ profileMode: admin | hybrid | departmentMember | cellMember | connect
    │        └─ cards, prioridades, timeline, próximos encontros, célula, escalas
    │
    ├─ AGENDA (/calendario)
    │   ├─ Eventos (/eventos, /eventos/[id])
    │   │    ├─ recorrente (weekly) | especial (once)
    │   │    └─ pós-evento ─→ EventReport
    │   └─ ocorrências do dia ─→ escala | célula | aniversário
    │
    ├─ PESSOAS (/pessoas, /membros)
    │   ├─ cadastro rápido | convite (e-mail/SMS)
    │   ├─ /pessoas/[id] ─→ disponibilidade, ministérios, célula, cuidado
    │   └─ acompanhamento ─→ PastoralNote
    │
    ├─ KIDS (/kids)
    │   ├─ Salas (KidsRoom)
    │   ├─ Check-in (evento ─→ sala ─→ responsável ─→ código)
    │   └─ Checkout (código ─→ retirada segura)
    │
    ├─ CÉLULAS (/celulas)
    │   ├─ Redes/Supervisão (/celulas/redes) · Estrutura (/celulas/estrutura)
    │   └─ /celulas/[id]
    │        ├─ Membros · Liderança · Saúde (6 dimensões)
    │        ├─ Reuniões (presença, sentimento) ─→ frequência
    │        └─ Pessoas em cuidado (admin/pastor/líder)
    │
    ├─ MINISTÉRIOS (/ministerios | membro: /minhas-escalas)
    │   └─ /ministerios/[id]
    │        ├─ Membros + funções
    │        └─ Próximas escalas ─→ /escalas/nova | /escalas/[id]
    │
    ├─ ESCALAS (/escalas)
    │   ├─ /escalas/nova (cobertura por função ─→ auto-seleção ─→ publicar)
    │   └─ /escalas/[id]
    │        ├─ Equipe + confirmações (pending→confirmed/declined)
    │        ├─ Anexos · Chat
    │        └─ Lembrar pendentes
    │
    ├─ COMUNICAÇÃO (/comunicacao*) ─→ Mensagens (/mensagens) · Notificações (/notificacoes) · Enquetes*
    │
    ├─ RELATÓRIOS (/relatorios) ─→ Pessoas · Agenda · Células · Ministérios · Engajamento
    │
    └─ GESTÃO ─→ Configurações (/configuracoes, /configuracoes/notificacoes) · Perfil (/perfil)

(* telas stub/mock)
```

---

# 10. Pontos de Acoplamento

| Origem | → | Destino | Mecanismo |
|---|---|---|---|
| **Evento** | → | **Escala** | `Schedule.event_id` (escala pertence a um evento) |
| **Evento** | → | **Check-in Kids** | `KidsCheckIn.event_id` (check-in por culto) |
| **Evento** | → | **Relatório pós-evento** | `EventReport.event_id` |
| **Evento** | → | **Agenda** | renderizado em `/calendario` (recurrence) |
| **Escala** | → | **Voluntário** | `ScheduleMember.user_id` |
| **Escala** | → | **Confirmação** | `ScheduleMember.status` → notifica líder |
| **Escala** | → | **Notificação/E-mail/Push** | publicação dispara `sendUserNotification` |
| **Escala** | → | **Cobertura por função** | `ScheduleSlot` + `Department.function_names` |
| **Escala** | → | **Ranking/Pontos** | `PointsHistory.schedule_id`, `last_served_at` |
| **Ministério** | → | **Escala** | `Schedule.department_id` |
| **Ministério** | → | **Mensagens** | `Message.department_id` |
| **Pessoa** | → | **Ministério** | `DepartmentMember` (N—N) |
| **Pessoa** | → | **Célula** | `CellMemberRow` (N—N) + `User.cell_id` |
| **Pessoa** | → | **Filhos (Kids)** | `User.guardian_ids` / `primary_guardian_id` / `KidsGuardianLink` |
| **Pessoa** | → | **Cônjuge** | `User.spouse_id` (usado na auto-seleção de casais) |
| **Pessoa** | → | **Cuidado** | `PastoralNote.person_id` |
| **Pessoa** | → | **Disponibilidade** | `User.availability[7]` + `UnavailableDate` (afeta escalas) |
| **Célula** | → | **Rede/Supervisão** | `Cell.network_id` → `CellNetwork.supervisor_ids` |
| **Célula** | → | **Reuniões/Frequência** | `CellMeeting` + `CellAttendanceRow` → `health.frequency` |
| **Notificação** | → | **Entidade origem** | `Notification.action_url` (deep-link) |

### Acoplamentos faltantes/fracos (oportunidade)
- **Evento → Comunicação:** previsto na narrativa ("agenda como centro do cuidado"), mas Comunicação é stub.
- **Evento → Acompanhamento pastoral:** sem ligação automática (ex.: visitante do culto vira caso de cuidado).
- **Kids → Notificação ao responsável:** não há disparo automático no checkout/chamada.
- **Reunião de célula → Cuidado:** ausências não geram automaticamente alerta/cuidado.

---

# 11. Problemas Identificados

## A. Duplicações / sistemas paralelos
1. **Dois módulos de "Pessoas":** `/pessoas` (+`/pessoas/[id]`) **e** `/membros` (+`/membros/[id]`, `/membros/convidar`). Funções sobrepostas, navegação confusa, dois perfis de pessoa.
2. **Dois sistemas pastorais:**
   - **Real:** `pastoral_notes` via `/api/care/*` (usado no Início e na Célula).
   - **Mock:** `/acompanhamentos`, `/pedidos-oracao`, `/alertas`, `/crm-pastoral`, `/dashboard-pastoral`, `/timeline-pastoral` rodam em `lib/pastoral/mock-data` (dados fictícios). A Home **linka para esses destinos mock** (ex.: card "Pessoas em cuidado" → `/acompanhamentos`).
3. **Dois sistemas de notificação:**
   - Antigo `lib/server/notification-service.ts` (in-app + push).
   - Novo `src/services/*` (preferências, e-mail/SMS/WhatsApp).
   - Dois conjuntos de tokens historicamente (`push_tokens` vs `device_tokens`) — unificados para `push_tokens`, mas o débito conceitual permanece.
4. **Dois (três) "dashboards":** `/dashboard` (= `dashboard-v3`), `/dashboard-pastoral` (mock) — papéis sobrepostos.
5. **Tipos duplicados:** `CellHealth`, `CellStatus`, `AttendanceStatus`, `CellMeeting` definidos **tanto** em `lib/cells/types.ts` (real) **quanto** em `lib/pastoral/types.ts` (mock) — risco de divergência.

## B. Fluxos desconectados
6. **Comunicação não implementada:** `/comunicacao` e `/enquetes` são stubs; a navegação promete um recurso inexistente.
7. **Páginas órfãs do menu:** `/escalas`, `/eventos`, `/mensagens`, `/indisponibilidade`, `/rankings`, `/repertorio`, `/notificacoes` só existem via links — descoberta dependente de contexto.
8. **`/relatorios-pastorais`** é praticamente vazio (1 linha) mas existe como rota.
9. **Item de menu polimórfico:** "Ministérios" aponta para rotas diferentes por papel — pode confundir documentação/suporte e quebra de expectativa entre perfis.

## C. Arquitetura de informação
10. **Agrupamento implícito, não explícito:** o `isActive` agrupa páginas (Pessoas engloba acompanhamentos/alertas/CRM), mas o usuário **não vê** essa hierarquia no menu — as páginas pastorais ficam invisíveis.
11. **Modelo de papéis fragmentado:** "perfil" do usuário resulta de **4 fontes** (`role`, `cell_role`, `network.supervisor_ids`, `cell/dept leader_ids`). Difícil de explicar, auditar e exibir ("o que sou eu no sistema?"). Não há tela de "perfis & permissões" funcional (`/perfis-permissoes` é stub).
12. **"Voluntário" vs "Membro"** não é um papel explícito — é inferido por ter ou não ministério. Pode gerar inconsistência de copy/jornada.

## D. Dados e consistência
13. **Métricas fictícias na UI:** "Presença média = 92%" era hard-coded (agora calculada por frequência de células); "Insights" usavam `trend` mock. Verificar se outras métricas (rankings, repertório) têm dados reais.
14. **Campos legados/depreciados:** `Cell.leader_id/co_leader_id`, `User.cellId` (duplicado de `cell_id`) — risco de leitura inconsistente.
15. **Dependência de índices compostos do Firestore** para consultas de notificações/escalas (já mapeado em `firestore.indexes.json`); telas quebram se índices não estiverem prontos (mitigado com fallbacks).

## E. UX/UI
16. **Percepção de "simplicidade"** relatada pelo stakeholder (cards genéricos, baixa densidade premium) — Início e listas pedem hierarquia visual e estados vazios mais ricos.
17. **Inconsistência de componentes:** cards de ministério vs células (recém-alinhados), cards de escala vs reunião (recém-alinhados) — sinal de **falta de design system unificado**.
18. **Acessibilidade/contraste:** ajustes pontuais de cinzas já feitos; falta auditoria sistemática (foco, leitura de tela, alvos de toque).

---

# 12. Oportunidades

## Simplificações
- **Unificar Pessoas:** consolidar `/pessoas` e `/membros` em **um** módulo (uma lista, um perfil, um fluxo de convite).
- **Remover/realizar o pastoral mock:** decidir entre (a) implementar de verdade sobre `pastoral_notes` ou (b) remover `/crm-pastoral`, `/dashboard-pastoral`, `/alertas`, `/timeline-pastoral`, `/acompanhamentos`, `/pedidos-oracao` mock e reapontar os links do Início.
- **Unificar tipos** de células/pastoral em uma única fonte da verdade.

## Unificações
- **Centralizar notificações** em um único serviço (transport + preferências + in-app) com uma API.
- **Hub de Comunicação real** que reaproveite Mensagens + Notificações + (futuro) Enquetes, com segmentação por célula/ministério/cuidado.
- **Design System** explícito (tokens de cor/raio/sombra, componentes Card/Stat/EmptyState reutilizados em todas as telas).

## Reorganizações (Arquitetura de Informação)
- **Tornar a hierarquia visível:** grupos no menu ("Pessoas & Cuidado", "Operação/Escalas", "Comunidade/Células", "Comunicação", "Gestão") com subitens reais, em vez de páginas órfãs.
- **Página "Meu papel/Permissões":** transformar `/perfis-permissoes` em uma tela real que explique e gerencie os 6 perfis de negócio, traduzindo as 4 fontes de papel.
- **Promover páginas-chave ao menu** (Escalas, Eventos) ou integrá-las claramente sob Ministérios/Agenda.

## Novas jornadas (acoplamentos que faltam)
- **Evento → Comunicação automática** ("publiquei o culto, aviso a equipe/igreja").
- **Visitante (EventReport/Kids) → Cuidado** (gera caso de acompanhamento).
- **Ausência em célula/escala → Alerta de cuidado** (loop pastoral automático).
- **Kids checkout → notificação ao responsável** (push/SMS com código).
- **Aniversário (Agenda) → ação de cuidado/comunicação** (já há `birthday-notifications`, integrar à jornada).

---

# 13. Documento Final / Síntese

## O que o Servos é hoje
Um **ChMS celular** sólido no núcleo operacional — **Escalas, Agenda/Eventos, Células, Kids, Pessoas, Notificações, Relatórios** — com uma Home adaptativa por perfil e um motor de permissões em duas camadas. A narrativa de produto ("agenda como centro do cuidado") é clara e os acoplamentos principais (Evento→Escala→Confirmação→Notificação; Pessoa→Ministério/Célula/Kids/Cuidado) estão implementados.

## Os 5 riscos estruturais mais relevantes para a revisão de design
1. **Duplicação de módulos** (Pessoas×Membros; pastoral real×mock; notificações antigo×novo; tipos repetidos) → dívida de arquitetura e inconsistência de jornada.
2. **Arquitetura de Informação implícita** → páginas órfãs e grupos invisíveis; o usuário não enxerga a hierarquia que o código assume.
3. **Modelo de papéis fragmentado em 4 fontes** → difícil de comunicar; falta tela de perfis/permissões funcional.
4. **Promessas não cumpridas na navegação** (Comunicação/Enquetes stub; pastoral mock) → quebra de confiança e expectativa.
5. **Falta de design system unificado** → percepção de "simples/genérico"; cards e estados inconsistentes.

## Recomendação de sequência para o redesign (sugestão ao PD Sênior)
1. **Definir o modelo de papéis canônico** (6 perfis → mapeamento único) e a **AI/menu** correspondente (grupos visíveis).
2. **Resolver duplicações** (uma fonte para Pessoas, Pastoral, Notificações, Tipos).
3. **Estabelecer o Design System** (tokens + componentes Card/Stat/EmptyState/List).
4. **Fechar lacunas de jornada** (Comunicação real, loops de cuidado automáticos, Kids/aniversário → ação).
5. **Polir Home e listas** sobre essa base, por perfil.

---

### Anexo — Inventário de rotas de API (50+)
**Auth:** `auth/{login,logout,register,session,forgot-password,reset-password,complete-registration,invite-info}`
**App:** `app/load`
**Pessoas:** `people/{create,get,invite}`, `members/{update,availability,deactivate}`, `member-invitations/{create,resend,open/[token]}`, `profile/{update,summary,change-password}`
**Escalas:** `schedules/{create,delete}`, `schedule-members`, `schedule-attachments`, `schedule-chats`, `send-schedule-reminders`, `unavailable-dates`
**Ministérios:** `departments/manage`, `department-members`, `department-messages`
**Eventos:** `events/manage`, `events/reports/manage`
**Células:** `cells/{list,manage}`, `cells/meetings/{list,manage}`, `cells/networks/manage`
**Kids:** `kids/{list,manage}`
**Cuidado:** `care/{list,manage}`
**Notificações:** `notifications/{preferences,read,register-token,register-push}`, `birthday-notifications`, `send-welcome-email`
**Outros:** `ranking/monthly`, `songs`, `church/update`, `support`
```
```

> **Fim da auditoria.** Documento gerado por análise estática do código em 2026-06-07.
