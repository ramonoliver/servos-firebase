# Servos 2.0 — Arquitetura & Visão de Produto (Church OS)

> **Status:** Norte estratégico oficial do produto. Documento-companheiro de [`AUDITORIA-SERVOS.md`](./AUDITORIA-SERVOS.md).
> **Regra de ouro (§23):** não criar funcionalidades isoladas antes de resolver a arquitetura. Nada de novas páginas soltas, novos mocks, novos dashboards ou métricas hardcoded até a Fundação estar definida.

---

## 1. Tese central

# Pessoas no centro. Agenda como motor. Cuidado como resultado.

```
Pessoa
  ↓
Agenda
  ↓
Serviço + Comunidade
  ↓
Cuidado
  ↓
Inteligência
```

**Posicionamento:** de "sistema de escalas e ministérios" → **Church OS** — plataforma que conecta pessoas, ministérios, células e eventos para transformar a rotina da igreja em **cuidado real**.

---

## 2. Os 5 pilares

| Pilar | Módulos | Pergunta que responde |
|---|---|---|
| **Operação** | Agenda · Eventos · Escalas · Ministérios · Indisponibilidade · Repertório | O que vai acontecer? Quem serve? Quem confirmou? |
| **Comunidade** | Pessoas · Células · Kids · Visitantes · Famílias | Quem são as pessoas? Quem está conectado/sem vínculo? |
| **Cuidado** | Acompanhamentos · Pedidos de oração · Alertas · Ausências · Reconexões · Histórico pastoral | Quem precisa de atenção agora? |
| **Comunicação** | Mensagens · Comunicados · Notificações · Enquetes · Avisos segmentados | Quem avisar, por qual canal, e foi entregue? |
| **Inteligência** | Relatórios · Insights · Saúde de células/ministério · Engajamento · Crescimento · Presença | Onde a igreja cresce/cai? O que decidir? |

---

## 3. Nova Arquitetura de Informação (menu)

```
Início

OPERAÇÃO
 ├─ Agenda
 ├─ Eventos
 ├─ Escalas
 └─ Ministérios

COMUNIDADE
 ├─ Pessoas
 ├─ Células
 ├─ Kids
 └─ Visitantes

CUIDADO
 ├─ Acompanhamentos
 ├─ Pedidos de oração
 └─ Alertas pastorais

COMUNICAÇÃO
 ├─ Mensagens
 ├─ Comunicados
 ├─ Notificações
 └─ Enquetes

INTELIGÊNCIA
 ├─ Relatórios
 └─ Insights

ADMINISTRAÇÃO
 ├─ Configurações
 ├─ Perfis e permissões
 └─ Meu perfil

Rodapé: usuário · igreja · função · ajuda
```

---

## 4. Correções estruturais (saídas diretas da auditoria)

1. **Unificar Pessoas + Membros** → uma única entidade **Pessoa**, com *estados* (visitante, membro, voluntário, líder, pastor, criança, responsável, supervisor, admin). Filtros: Todas · Visitantes · Membros · Voluntários · Líderes · Crianças · Responsáveis.
2. **Unificar Pastoral real + mock** → remover/reimplementar `/crm-pastoral`, `/dashboard-pastoral`, `/acompanhamentos`, `/pedidos-oracao`, `/alertas`, `/timeline-pastoral` sobre **dados reais** ligados a Pessoa.
3. **Unificar Notificações** → um único **Notification Center** (in-app, push, e-mail, SMS, WhatsApp futuro). Toda notificação: destinatário · origem · tipo · canal · status · action_url · data · preferências respeitadas.
4. **Remover páginas órfãs** → Escalas, Eventos, Mensagens, Indisponibilidade, Notificações, Repertório, Rankings precisam estar no menu, como subitem ou em hub claro.

---

## 5. Modelo canônico de papéis

- **Papel de sistema** (permissão técnica): `admin` · `leader` · `member`.
- **Papel de negócio** (função ministerial/pastoral): Pastor · Supervisor de células · Líder de célula · Líder de ministério · Voluntário · Membro · Responsável Kids · Criança.

Os papéis de negócio são **derivados** de: `cell_role`, `network.supervisor_ids`, `cell.leader_ids/co_leader_ids`, `department.leader_ids/co_leader_ids` (ver auditoria §6).

---

## 6. Entidade central: Pessoa

```
Pessoa
 ├─ Ministérios       ├─ Pedidos de oração
 ├─ Escalas           ├─ Acompanhamentos
 ├─ Células           ├─ Notificações
 ├─ Kids              ├─ Mensagens
 ├─ Família           ├─ Relatórios
 ├─ Eventos           └─ Histórico pastoral
```

**Nova página de Pessoa** (uma das telas mais importantes): abas **Perfil · Vínculos · Histórico · Cuidado · Serviço · Família · Comunicação · Permissões**.

---

## 7. Agenda como motor (Evento gera ações)

**Ao criar evento**, sugerir:
- Criar escala para este evento?
- Avisar algum ministério?
- Habilitar check-in Kids?
- Criar comunicação para participantes?

**Ao registrar pós-evento**, sugerir:
- "7 visitantes participaram. Iniciar acompanhamento?"
- "3 pedidos de oração registrados. Criar tarefas pastorais?"
- "2 crianças no 1º check-in. Enviar mensagem aos responsáveis?"

---

## 8. Cuidado como loop automático

**Gatilhos:** 3 faltas na célula · muitas recusas de escala · visitante 2+ vezes · pedido de oração · 1º check-in Kids · pessoa sem célula há muito tempo · membro sem ministério · aniversário próximo.

**Resultado:** alerta pastoral + tarefa de acompanhamento + sugestão de comunicação + insight + registro no histórico da pessoa.

---

## 9. Home por perfil (central personalizada, não widgets genéricos)

| Perfil | Objetivo da Home |
|---|---|
| Admin | **Mission Control** — ações prioritárias, pessoas que precisam de você, igreja hoje, timeline, próximos acontecimentos, insights |
| Pastor / Coordenação | **Central de cuidado** — alertas, pedidos de oração, visitantes recorrentes, ausentes, células em atenção, acompanhamentos abertos |
| Líder de Ministério | **Central do ministério** — próximas escalas, confirmações pendentes, indisponíveis, mensagens, equipe, ações rápidas |
| Líder de Célula | **Central da célula** — próxima reunião, membros, frequência, pedidos, ausentes, visitantes, ações pastorais |
| Voluntário | **Minha jornada de serviço** — próxima escala, confirmação, mensagens do ministério, disponibilidade, célula |
| Membro | **Minha vida na igreja** — agenda, minha célula, pedidos, eventos, servir |
| Pessoa sem vínculo | **Onboarding relacional** — encontrar célula, conhecer ministérios, completar perfil, próximos cultos, falar com a igreja |

---

## 10. Design System explícito

**Tokens:** cores · tipografia · sombras · radius · spacing · ícones · badges · estados · empty states.

**Componentes base:** AppShell · Sidebar · Topbar · PageHeader · HeroCard · ActionCard · StatCard · PersonCard · EventCard · TimelineItem · EmptyState · Drawer · Modal · Table · ListCard · Badge · Tabs · SegmentedControl.

**Direção visual:** premium · humano · pastoral · moderno · inteligente · acolhedor · organizado. Referências: Linear, Notion, Stripe, Apple, Planning Center, Arc. **Evitar:** cara de ERP, dashboard genérico, excesso de gráficos/cards, telas frias.

---

## 11. Roadmap

1. **Fundação** — papéis canônicos · redesenho do menu · consolidação de rotas · remoção de órfãs · design system base.
2. **Unificação** — Pessoas+Membros · Pastoral real+mock · Notificações · tipos duplicados.
3. **Fluxos centrais** — Evento→Escala·Comunicação·Kids·Pós-evento · Pós-evento→Cuidado.
4. **Home por perfil** — 7 homes.
5. **Cuidado inteligente** — alertas automáticos, visitantes, ausências, sem célula/ministério.
6. **Comunicação real** — comunicados, segmentação, templates, histórico, multicanal.
7. **Inteligência** — relatórios e insights reais (saúde, crescimento, presença, engajamento).

---

## 12. Critério de sucesso

O menu explica o produto · cada página tem função clara · zero duplicação · Pessoa é o centro · eventos geram ações · cuidado nasce dos dados · comunicação integrada · permissões compreensíveis · home muda por perfil · parece **um** produto · tudo conectado.

---

# Apêndice A — Alinhamento com a auditoria

| Vision 2.0 pede | Auditoria confirmou (§) | Esforço |
|---|---|---|
| Unificar Pessoas+Membros | §11.A.1 (dois módulos paralelos) | Médio |
| Unificar pastoral real+mock | §11.A.2 (6 telas em mock) | Alto |
| Unificar notificações | §11.A.3 (dois sistemas) | Médio |
| Menu com hierarquia | §11.C.10 (AI implícita) | Baixo (IA) / Médio (rotas) |
| Papéis canônicos | §11.C.11 (4 fontes de papel) | Médio |
| Remover órfãs | §11.B.7 (7+ páginas órfãs) | Baixo |
| Design system | §11.E.17 (inconsistência de componentes) | Alto |
| Evento→ações / loops de cuidado | §10 (acoplamentos faltantes) | Alto |

**Conclusão:** a Vision 2.0 é coerente com 100% dos problemas estruturais da auditoria. Não há conflito — é o "para onde ir" do "onde estamos".

---

# Apêndice B — Decisões em aberto (precisam de definição antes da Fase 1)

> Estas são escolhas de arquitetura que a Vision implica mas não fecha. Resolver aqui evita retrabalho.

1. **Armazenamento dos papéis de negócio.** Manter `role` técnico + **derivar** papéis em runtime (estado atual), ou **materializar** papéis num campo/coleção própria (mais simples de exibir/auditar, mas exige sincronização)? → Recomendação: derivar + uma camada `getPersonRoles(person)` única e cacheada.
2. **"Visitantes" — onde vive?** Aparece no menu (Comunidade → Visitantes) **e** como filtro de Pessoas. É uma página própria ou um filtro/estado de Pessoa? → Recomendação: estado de Pessoa + view salva, sem rota duplicada.
3. **Pastoral mock: remover ou reimplementar, página a página.** `/dashboard-pastoral` e `/crm-pastoral` podem ser **fundidos** nas Homes por perfil (Pastor) em vez de virar rotas próprias. Decidir o destino de cada uma das 6.
4. **Estratégia de migração de rotas.** As `action_url` das notificações e deep-links existentes apontam para rotas atuais. Consolidar exige **redirects** (de `/membros/*`→`/pessoas/*`, etc.). Big-bang vs incremental com aliases.
5. **Criança como Pessoa.** Hoje criança é `User{is_child:true}`. Manter (mantém Pessoa central) — confirmar que o cadastro/login não conflita (criança não loga). → Recomendação: manter, marcar `kind=child`, sem credenciais.
6. **Indisponibilidade & Repertório** na nova IA: ficam sob Operação como subitens, ou dentro de Ministérios/Escalas? Definir antes de mexer no menu.

---

# Apêndice C — Fundação (Fase 1): entregáveis concretos (somente documentação/design)

1. **Modelo canônico de papéis** — tabela única: papel de negócio → fonte de dado → capacidades (visualizar/criar/editar/excluir) por módulo. (Base já rascunhada na auditoria §6.)
2. **Mapa de rotas: atual → 2.0** — cada rota existente recebe destino (mantém / move / funde / remove / vira filtro) + redirect necessário.
3. **Blueprint do menu** — IA final com grupos, itens, subitens, regra de visibilidade por papel, e estados ativos.
4. **Inventário do Design System base** — tokens atuais vs alvo + lista de componentes a extrair/consolidar (a partir do que já existe em `components/ui`, `pastoral-ui`, cards de células/ministérios).

Nenhum desses entregáveis altera código de produto — são specs que destravam as Fases 2+.
