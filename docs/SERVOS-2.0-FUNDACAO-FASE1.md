# Servos 2.0 — Fundação (Fase 1)

> **Status:** Spec da Fundação. Documentação/design apenas — **nenhuma alteração de código de produto** (respeita §23 da Arquitetura 2.0).
> **Companheiro de:** [`SERVOS-2.0-ARQUITETURA.md`](./SERVOS-2.0-ARQUITETURA.md) (visão) e [`AUDITORIA-SERVOS.md`](./AUDITORIA-SERVOS.md) (estado atual).
> **Entregáveis:** (1) Modelo canônico de papéis · (2) Mapa de rotas atual→2.0 + redirects · (3) Blueprint do menu por papel · (4) Inventário do Design System base.

---

## Decisões ratificadas (base desta Fundação)

| # | Decisão | Resolução |
|---|---|---|
| 1 | Armazenamento de papéis de negócio | **Derivar em runtime** via `getPersonRoles()` (fonte única, sem materializar) |
| 2 | "Visitantes" | **Estado/segmento de Pessoa**, não rota/entidade paralela |
| 3 | 6 telas pastorais mock | Funde leitura (dashboard/CRM/timeline) · Reimplementa ação (acompanhamentos/pedidos/alertas) |
| 4 | Migração de rotas | **Incremental com redirects/aliases** (preserva `action_url` legadas) |
| 5 | Criança | **Pessoa** `kind=child`, sem credenciais |
| 6 | Indisponibilidade & Repertório | **Contextuais**, não itens de topo |

---

# ENTREGÁVEL 1 — Modelo Canônico de Papéis

## 1.1 Princípio
**Um** papel de **sistema** (permissão técnica) + **N** papéis de **negócio** (função), todos **derivados** em runtime a partir dos dados de relacionamento já existentes. Nenhum papel de negócio é gravado num campo.

```
Papel de sistema (User.role):  admin | leader | member
Papel de negócio (derivado):   Admin · Pastor · Coordenação · Supervisor ·
                               Líder de célula · Líder de ministério ·
                               Voluntário · Membro · Responsável Kids ·
                               Criança · Pessoa em conexão
```

## 1.2 Função única de derivação (contrato)

```ts
// Fonte da verdade ÚNICA para "o que essa pessoa é".
getPersonRoles(person, ctx): {
  systemRole: "admin" | "leader" | "member";
  businessRoles: BusinessRole[];   // todos que se aplicam
  primaryRole: BusinessRole;       // o de maior precedência (rótulo de exibição)
  scopes: {                        // o "onde" de cada papel (isolamento)
    ledDepartmentIds: string[];
    ledCellIds: string[];
    supervisedNetworkIds: string[];
    guardedChildIds: string[];
  };
}
// ctx = { cells, networks, departments, departmentLinks, children }
```

> Esta função substitui as 4 derivações espalhadas hoje (`use-app`, `dashboard-v3`, `permissions.ts`, `celulas/[id]`), eliminando o problema §11.C.11 da auditoria.

## 1.3 Tabela de derivação e precedência

| Papel de negócio | Deriva de | Precedência (rótulo) | Login? |
|---|---|:--:|:--:|
| **Admin** | `role === "admin"` | 1 | ✅ |
| **Pastor** | `cell_role === "pastor"` | 2 | ✅ |
| **Coordenação** | `cell_role === "coordenacao"` | 3 | ✅ |
| **Supervisor de células** | `id ∈ network.supervisor_ids` | 4 | ✅ |
| **Líder de célula** | `id ∈ cell.leader_ids ∪ co_leader_ids` | 5 | ✅ |
| **Líder de ministério** | `id ∈ dept.leader_ids ∪ co_leader_ids` (⇒ `role=leader`) | 6 | ✅ |
| **Voluntário** | `role === "member"` **e** possui `DepartmentMember` | 7 | ✅ |
| **Membro** | `role === "member"` **e** tem célula, sem ministério | 8 | ✅ |
| **Pessoa em conexão** | `role === "member"`, sem célula e sem ministério | 9 | ✅ |
| **Responsável Kids** | possui `guardian_ids`/filhos (atributo transversal) | — (tag) | ✅ |
| **Criança** | `is_child === true` | — (especial) | ❌ |

> Uma pessoa acumula papéis (ex.: Pastor **e** Líder de célula). As **permissões** são a **união** de todos; o **rótulo** usa `primaryRole`.

## 1.4 Capacidades por papel × pilar (CRUD efetivo)

Legenda: **V** ver · **C** criar · **E** editar · **X** excluir · — sem acesso · *(e)* escopo (só o que lidera/supervisiona).

| Pilar / módulo | Admin | Pastor/Coord | Supervisor | Líder Célula | Líder Minist. | Voluntário | Membro | Conexão |
|---|---|---|---|---|---|---|---|---|
| **Operação · Agenda/Eventos** | VCEX | VC E | V | V | VC E | V | V | V |
| **Operação · Escalas** | VCEX | V | V | V | VCE *(e)* | V + confirmar | — | — |
| **Operação · Ministérios** | VCEX | V | V | V | E *(e)* | V *(seus)* | V | V |
| **Comunidade · Pessoas** | VCEX | VCEX | VE *(e)* | E *(e)* | E *(e)* | V | — | — |
| **Comunidade · Células** | VCEX | VCEX | VE *(e)* | E *(e)* | V | V *(sua)* | V *(sua)* | V |
| **Comunidade · Kids** | VCEX | VCEX | V | V | — | V *(se voluntário Kids)* | — | — |
| **Cuidado** | VCEX | VCEX | V *(e)* | VCE *(sua célula)* | — | — | V *(próprios pedidos)* | V |
| **Comunicação** | VCEX | VCE | E *(e)* | E *(sua célula)* | E *(seu ministério)* | V | V | V |
| **Inteligência · Relatórios/Insights** | V | V | V *(e)* | V *(sua célula)* | V *(seu ministério)* | — | — | — |
| **Administração** | VCEX | — | — | — | — | — | — | — |
| **Meu perfil** | E | E | E | E | E | E | E | E |

> A coluna "Voluntário/Membro/Conexão" reflete a regra: `role=member` só **vê** + `confirm.own` + `profile.edit`. Os recortes finos de pessoa seguem `canEditOrDeleteMemberClient` (auditoria §6).

## 1.5 Como isso alimenta o resto da Fundação
- **Menu (Entregável 3):** visibilidade por `businessRoles`/`primaryRole`.
- **Home por perfil (Roadmap Fase 4):** `profileMode` deriva de `primaryRole` (admin/pastor → "admin"; supervisor → "admin"; líder → "hybrid"; voluntário → "departmentMember"; membro → "cellMember"; conexão → "connect").
- **Página de Pessoa (Roadmap):** aba "Permissões" exibe `businessRoles` + `scopes`.

---

# ENTREGÁVEL 2 — Mapa de Rotas (atual → 2.0) + Redirects

Legenda de ação: **MANTÉM** · **MOVE** (muda grupo/menu) · **FUNDE** (vira contexto de outra tela) · **REIMPLEMENTA** (de mock→real) · **REMOVE** (com redirect) · **SEGMENTO** (vira filtro de outra rota).

## 2.1 Público / Auth (sem mudança)
| Rota | Ação |
|---|---|
| `/`, `/login`, `/cadastro`, `/onboarding`, `/concluir-cadastro`, `/esqueci-senha`, `/redefinir-senha` | **MANTÉM** |

## 2.2 Início & Operação
| Rota atual | Ação | Destino 2.0 |
|---|---|---|
| `/dashboard` (=`dashboard-v3`) | **MANTÉM** | **Início** (Home por perfil) |
| `/dashboard-pastoral` 🧪 | **FUNDE → REMOVE** | Home do Pastor · redirect `/dashboard` |
| `/calendario` | **MANTÉM** (já é "Agenda") | Operação → **Agenda** |
| `/eventos`, `/eventos/[id]` | **MANTÉM** | Operação → **Eventos** |
| `/escalas`, `/escalas/nova`, `/escalas/[id]` | **MOVE** (promove ao menu) | Operação → **Escalas** |
| `/ministerios`, `/ministerios/[id]` | **MANTÉM** | Operação → **Ministérios** |
| `/minhas-escalas` | **MANTÉM** (visão do voluntário) | acessível via Escalas/Home Voluntário |
| `/indisponibilidade` | **MANTÉM** (contextual) | dentro de Escalas/Minhas escalas + Perfil |
| `/repertorio` 🟡 | **MANTÉM** (contextual) | dentro de Ministério (Louvor) |

## 2.3 Comunidade
| Rota atual | Ação | Destino 2.0 |
|---|---|---|
| `/pessoas`, `/pessoas/[id]` | **MANTÉM** (canônico) | Comunidade → **Pessoas** |
| `/membros` | **REMOVE** | redirect → `/pessoas` |
| `/membros/[id]` | **REMOVE** | redirect → `/pessoas/[id]` |
| `/membros/convidar` | **MOVE** | `/pessoas/convidar` (redirect do antigo) |
| *Visitantes* | **SEGMENTO** (novo) | `/pessoas?segmento=visitantes` (não é rota nova) |
| `/celulas`, `/celulas/[id]`, `/celulas/redes`, `/celulas/estrutura` | **MANTÉM** | Comunidade → **Células** |
| `/kids` | **MANTÉM** | Comunidade → **Kids** |

## 2.4 Cuidado
| Rota atual | Ação | Destino 2.0 |
|---|---|---|
| `/acompanhamentos` 🧪 | **REIMPLEMENTA** (sobre `pastoral_notes.care_case`) | Cuidado → **Acompanhamentos** |
| `/pedidos-oracao` 🧪 | **REIMPLEMENTA** (sobre `pastoral_notes.prayer_request`) | Cuidado → **Pedidos de oração** |
| `/alertas` 🧪 | **REIMPLEMENTA** (saída do loop automático §8) | Cuidado → **Alertas pastorais** |
| `/crm-pastoral` 🧪 | **FUNDE → REMOVE** | aba *Cuidado* da Pessoa + hub Cuidado · redirect `/acompanhamentos` |
| `/timeline-pastoral` 🧪 | **FUNDE → REMOVE** | aba *Histórico* da Pessoa · redirect `/pessoas` |

## 2.5 Comunicação
| Rota atual | Ação | Destino 2.0 |
|---|---|---|
| `/comunicacao` ⬜ | **REIMPLEMENTA** (hub de envio segmentado) | Comunicação → **Comunicados** |
| `/mensagens` | **MANTÉM** | Comunicação → **Mensagens** |
| `/notificacoes` | **MOVE** (promove ao menu) | Comunicação → **Notificações** |
| `/enquetes` ⬜ | **REIMPLEMENTA** ou **DEFER** (Fase 6) | Comunicação → **Enquetes** |

## 2.6 Inteligência
| Rota atual | Ação | Destino 2.0 |
|---|---|---|
| `/relatorios` | **MANTÉM** | Inteligência → **Relatórios** |
| *Insights* | **NOVO** (Fase 7) | Inteligência → **Insights** |
| `/relatorios-pastorais` ⬜ | **REMOVE** | redirect → `/relatorios` |
| `/rankings` 🟡 | **MANTÉM** (contextual) | dentro de Inteligência/Ministérios |

## 2.7 Administração
| Rota atual | Ação | Destino 2.0 |
|---|---|---|
| `/configuracoes`, `/configuracoes/notificacoes` | **MANTÉM** | Administração → **Configurações** |
| `/perfis-permissoes` ⬜ | **REIMPLEMENTA** (usa `getPersonRoles`) | Administração → **Perfis e permissões** |
| `/perfil` | **MANTÉM** | Administração → **Meu perfil** |

## 2.8 Tabela de redirects (preservar `action_url` legadas)
> Camada de alias para não quebrar notificações/deep-links já gravados (Decisão 4).

```
/membros                 → /pessoas
/membros/[id]            → /pessoas/[id]
/membros/convidar        → /pessoas/convidar
/dashboard-pastoral      → /dashboard
/crm-pastoral            → /acompanhamentos
/timeline-pastoral       → /pessoas        (futuramente /pessoas/[id]#historico quando houver origem)
/relatorios-pastorais    → /relatorios
```
> Implementação sugerida (Fase 2): `redirects()` no `next.config` **ou** middleware. As novas `action_url` já saem no padrão 2.0.

## 2.9 Resumo quantitativo
- **Mantém:** 22 rotas · **Move/promove:** 5 · **Funde→remove:** 3 · **Reimplementa:** 4 · **Remove c/ redirect:** 2 · **Segmento novo:** 1 (Visitantes) · **Novo (futuro):** Insights, Comunicados, Enquetes.
- **Telas mock eliminadas como rota:** 6 → restam **3 reais** em Cuidado.

---

# ENTREGÁVEL 3 — Blueprint do Menu por Papel

## 3.1 IA final (estrutura + visibilidade por papel)

```
Início                         → todos

OPERAÇÃO
 ├─ Agenda                     → todos
 ├─ Eventos                    → admin · pastor · líder (event.view)
 ├─ Escalas                    → admin · líder de ministério   |  "Minhas escalas" p/ voluntário
 └─ Ministérios                → admin · líderes  |  voluntário vê os seus

COMUNIDADE
 ├─ Pessoas                    → !membro comum (admin · pastor · supervisor · líderes)
 │   └─ segmentos: Todas · Visitantes · Membros · Voluntários · Líderes · Crianças · Responsáveis
 ├─ Células                    → !membro comum
 └─ Kids                       → admin · pastor · líder · voluntário Kids

CUIDADO                        → admin · pastor · supervisor · líder de célula
 ├─ Acompanhamentos
 ├─ Pedidos de oração          → (membro vê os próprios via Home/Pessoa)
 └─ Alertas pastorais

COMUNICAÇÃO
 ├─ Comunicados                → quem pode message.send (admin · líderes)
 ├─ Mensagens                  → admin · líderes
 ├─ Notificações               → todos
 └─ Enquetes                   → admin · líderes  (Fase 6)

INTELIGÊNCIA                   → admin · pastor · supervisor · líderes (report.view)
 ├─ Relatórios
 └─ Insights                   (Fase 7)

ADMINISTRAÇÃO
 ├─ Configurações              → admin
 ├─ Perfis e permissões        → admin
 └─ Meu perfil                 → todos

Rodapé: avatar · nome · igreja · papel (primaryRole) · ajuda/suporte
```

**Contextuais (fora do menu, acessíveis por contexto):** Indisponibilidade (Escalas/Perfil) · Repertório (Ministério de Louvor) · Rankings (Inteligência/Ministério) · Eventos/[id] · Escalas/[id] · Células subpáginas.

## 3.2 Matriz de visibilidade (grupo/item × papel)

| Item ↓ / Papel → | Admin | Pastor/Coord | Supervisor | Líder Célula | Líder Minist. | Voluntário | Membro | Conexão |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Início | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **OPERAÇÃO** | | | | | | | | |
| Agenda | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Eventos | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Escalas | ✅ | ✅ | ✅ | ✅ | ✅ | ⟳ "Minhas escalas" | — | — |
| Ministérios | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ *(seus)* | ✅ | ✅ |
| **COMUNIDADE** | | | | | | | | |
| Pessoas | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Células | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ *(sua)* | ✅ *(sua)* | ✅ |
| Kids | ✅ | ✅ | ✅ | ✅ | — | ✅ *(se Kids)* | — | — |
| **CUIDADO** | ✅ | ✅ | ✅ | ✅ | — | — | parcial¹ | — |
| **COMUNICAÇÃO** | | | | | | | | |
| Comunicados | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Mensagens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ *(ministério)* | — | — |
| Notificações | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Enquetes | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| **INTELIGÊNCIA** | ✅ | ✅ | ✅ | ✅ *(sua)* | ✅ *(seu)* | — | — | — |
| **ADMINISTRAÇÃO** | | | | | | | | |
| Configurações | ✅ | — | — | — | — | — | — | — |
| Perfis e permissões | ✅ | — | — | — | — | — | — | — |
| Meu perfil | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

¹ Membro vê apenas os **próprios** pedidos de oração (via Home/Pessoa), não o hub de Cuidado.
⟳ O slot "Escalas/Ministérios" troca de rótulo/destino para voluntário (como hoje), agora documentado.

## 3.3 Regras de implementação do menu
- Visibilidade calculada por **`getPersonRoles()`**, não por `role` cru (substitui as flags `show` atuais).
- Grupos com **cabeçalho visível** (OPERAÇÃO, COMUNIDADE, …) — torna a AI explícita (resolve §11.C.10).
- Item ativo destaca a si e suas sub-rotas (manter o `isActive` atual, ampliado para a nova hierarquia).
- Mobile: mesmos grupos colapsáveis + atalhos contextuais (Nova escala, Convidar pessoa) conforme papel.

---

# ENTREGÁVEL 4 — Inventário do Design System base

## 4.1 Tokens existentes (reais, de `tailwind.config.js`)

**Cores**
| Token | Valor | Uso |
|---|---|---|
| `bg` | `#FBFAFF` | fundo app |
| `surface` / `.alt` / `.hover` | `#FFFFFF` / `#F4F2FB` / `#ECEAF6` | superfícies |
| `sidebar.bg` / `.border` | `#F7F6FC` / `#ECEAF4` | sidebar |
| `ink` / soft / muted / faint / ghost | `#1B1726` / `#423C52` / `#736D82` / `#A39DAE` / `#CDC9D4` | texto |
| `brand` / deep / light / glow | `#FF6B57` / `#F0492F` / `#FFF1EE` / `#FFF7F5` | marca (coral) |
| `success` / light / deep | `#22B892` / `#E2FBF3` / `#1A8E70` | positivo |
| `danger` / light | `#F2566E` / `#FFECEF` | erro |
| `amber` / light / deep | `#E0A21B` / `#FFF6E2` / `#C2871A` | atenção |
| `info` / light | `#2BA8D6` / `#E8F7FD` | informação |
| `border` / soft | `#E7E5F0` / `#F0EEF8` | bordas |
| `lavender` / light / deep | `#9B8CFB` / `#F0ECFF` / `#6D5DF0` | célula/comunidade |
| `rose` / light / deep | `#FB7199` / `#FFEDF2` / `#E14B82` | cuidado |
| `sky` · `mint` · `sun` | `#38BDF0` · `#2DD4A7` · `#FFC24B` | acentos |

**Tipografia:** `font-body` = Plus Jakarta Sans · `font-display` = Schibsted Grotesk.
**Radius:** sm `12px` · md `16px` · lg `22px` · xl `30px`.
**Shadows:** `soft` · `lift` · `float` · `coral`.

## 4.2 Componentes existentes (reais)

**Classes utilitárias CSS (`globals.css`):** `.btn` (+ primary/secondary/green/danger/brand/ghost/sm) · `.card` (+ header/title) · `.input-field` · `.badge` (+ green/amber/red/brand/secondary/info) · `.page-header` · `.page-title`.

**Componentes React (`components/ui`):** `Modal` · `ConfirmDialog` · `EmptyState` · `Skeleton` · `SkeletonList` · `StatCard` · `Avatar` · `AvailabilityGrid` · `AvailabilityEditor` · `VerseCard` · `RoleBadge` · `CoupleBadge` · `MultiSelect` · `DateField` · `ActionDrawer` · `PageHeader` · `SplitView` · `InlineSearch` · `MentionInput`.

**Outros conjuntos (fragmentados):** `components/dashboard/home-v3-ui` (Hero, PriorityCards, PriorityList, Timeline, UpcomingEvents, Cards de célula/escala…) · `components/pastoral/pastoral-ui` (SoftCard, PageIntro, CareCaseCard, AlertCard, PrayerCard, TimelineList) · `components/kids/kids-ui` · `components/layout` (SidebarV2, NotificationPanel, BottomTabBar).

## 4.3 Mapa: alvo (Vision §19) × existente × gap

| Componente alvo | Existe? | Observação / ação |
|---|---|---|
| AppShell | parcial | `(app)/layout.tsx` (ShellV2) — extrair como componente nomeado |
| Sidebar | ✅ | `SidebarV2` — adaptar à nova IA (grupos) |
| Topbar | parcial | só header mobile — criar Topbar desktop opcional |
| PageHeader | ✅ | `PageHeader` + `PageIntro` (**duplicados** — unificar) |
| HeroCard | parcial | `DashboardHero` (home-v3) — generalizar |
| ActionCard | parcial | `PriorityCards`/cards do dashboard — extrair |
| StatCard | ✅ (×2) | `ui/StatCard` **e** `celulas StatChip` **e** `InsightCards` — **consolidar** |
| PersonCard | ✗ | criar (usado em Pessoas, Células, Cuidado, Kids) |
| EventCard | parcial | `UpcomingEvents`/agenda — extrair |
| TimelineItem | ✅ (×2) | `ActivityTimeline` **e** `pastoral TimelineList` — consolidar |
| EmptyState | ✅ | `ui/EmptyState` — padronizar uso (vários estados vazios ad-hoc) |
| Drawer | ✅ | `ActionDrawer` |
| Modal | ✅ | `Modal` / `ConfirmDialog` |
| Table | ✗ | criar (Relatórios/listas densas) |
| ListCard | parcial | padrões repetidos em células/ministérios — extrair |
| Badge | ✅ | `.badge*` + `RoleBadge` — ok |
| Tabs | ✗ | criar (página de Pessoa: 8 abas) |
| SegmentedControl | ✗ | criar (segmentos de Pessoas: Visitantes/Membros/…) |

## 4.4 Inconsistências de tokens (achados reais)
1. **Hex hardcoded fora do token system:** `home-v3-ui.tsx` usa `#FF6B57`, `#F0492F`, `#767676`, `#6B6B6B`, `#1F8044`, `#4A5ADE` etc. em vez de `brand`, `ink-*`, `success`, `lavender-deep`. → **migrar para tokens** (cores como `#767676`/`#6B6B6B` nem existem na paleta).
2. **Cinzas divergentes:** paleta usa `ink.muted #736D82`/`faint #A39DAE`; dashboard inventa `#767676/#6B6B6B/#6E6E6E`. → unificar em `ink.*`.
3. **StatCard triplicado** (ui/StatCard, celulas/StatChip, InsightCards) com estilos diferentes. → uma fonte.
4. **PageHeader vs PageIntro** — dois cabeçalhos de página com APIs distintas. → unificar.
5. **Tipos de domínio duplicados** (`CellHealth`/`CellMeeting` em `cells/types` e `pastoral/types`) — não é DS, mas alimenta inconsistência de componentes pastorais. → fonte única.

## 4.5 Alvo de consolidação (Fase 1 → entra na Fase 2 de execução)
- **Promover tokens a fonte única** e proibir hex solto (lint/regra de revisão).
- **Extrair 6 componentes faltantes:** PersonCard, Table, Tabs, SegmentedControl, EventCard, ListCard.
- **Unificar 4 duplicados:** StatCard, TimelineItem, PageHeader/PageIntro, HeroCard.
- **Catálogo vivo** (Storybook-like ou página `/dev/ds`) — opcional, recomendado.

---

# Sequência sugerida para sair da Fundação (Fase 2)
1. Implementar `getPersonRoles()` e plugar em `use-app`/menu/Home (sem mudar telas).
2. Aplicar a nova IA do menu (grupos + visibilidade por papel) + redirects de rotas.
3. Unificar Pessoas↔Membros (rota canônica + redirects).
4. Consolidar tokens/componentes do DS (StatCard, PageHeader, cinzas → `ink.*`).
5. Reimplementar Cuidado (acompanhamentos/pedidos/alertas) sobre `pastoral_notes`.

> Tudo acima é **spec**. Nenhuma linha de produto foi alterada nesta Fundação.
