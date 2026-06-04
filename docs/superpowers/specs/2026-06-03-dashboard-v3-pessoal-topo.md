# Dashboard V3 — Seções Pessoais no Topo (Admin + Hybrid)

**Data:** 2026-06-03
**Status:** Aprovado pelo usuário
**Escopo:** Reposicionamento das seções de célula/ministério para logo após `PriorityCards` nos perfis admin e hybrid; pastores mantêm as seções no rodapé.

---

## Regra

| Perfil | Tem célula? | Posição das seções pessoais |
|---|---|---|
| `admin` (`cell_role` neutro) | sim | Logo após `PriorityCards` |
| `hybrid` (líder) | sim | Logo após `PriorityCards` (era no rodapé) |
| `admin` (`cell_role === "pastor"` ou `"coordenacao"`) | sim | Rodapé (após InsightCards) |
| Qualquer perfil sem célula | — | Não exibe |

---

## Detecção de Pastor

```tsx
// Dentro de DashboardV3Home
const isPastor =
  data.user.cell_role === "pastor" || data.user.cell_role === "coordenacao";
const hasPersonalCell = !!data.cell;
```

---

## Layout Admin (não-pastor)

```
PriorityCards
── NOVO (se hasPersonalCell && !isPastor) ──
MemberCellPanel | MemberPrayerPanel  (grid xl:2-col)
── existente ──
PriorityList | ActivityTimeline | UpcomingEvents  (3-col)
CarePeopleSection | InsightCards  (2-col)
```

## Layout Admin (pastor com célula)

```
PriorityCards
── existente ──
PriorityList | ActivityTimeline | UpcomingEvents  (3-col)
CarePeopleSection | InsightCards  (2-col)
── NOVO (se hasPersonalCell && isPastor) ──
MemberCellPanel | MemberPrayerPanel  (grid xl:2-col)
```

## Layout Hybrid (ajuste — era pessoal no rodapé)

```
PriorityCards
── MOVIDO para cima ──
MemberAgenda
MemberCellPanel | MemberPrayerPanel  (grid xl:2-col)
── gestão (eram logo após PriorityCards) ──
PriorityList | ActivityTimeline | UpcomingEvents  (3-col)
CarePeopleSection | InsightCards  (2-col)
```

---

## Componentes alterados

### `DashboardV3Home` — bloco admin

Substituir o bloco else (admin puro) por:

```tsx
} : (
  <>
    <PriorityCards items={data.priorities} />

    {hasPersonalCell && !isPastor && (
      <section className="grid min-w-0 items-stretch gap-6 xl:grid-cols-2">
        <MemberCellPanel cell={data.cell} />
        <MemberPrayerPanel items={data.prayers} />
      </section>
    )}

    <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,340px)]">
      <PriorityList items={data.priorityItems} />
      <ActivityTimeline items={data.timeline} />
      <UpcomingEvents items={data.upcoming} />
    </section>

    <section className="grid min-w-0 items-stretch gap-5 xl:grid-cols-2">
      <CarePeopleSection people={data.carePeople} />
      <InsightCards items={data.insights} />
    </section>

    {hasPersonalCell && isPastor && (
      <section className="grid min-w-0 items-stretch gap-6 xl:grid-cols-2">
        <MemberCellPanel cell={data.cell} />
        <MemberPrayerPanel items={data.prayers} />
      </section>
    )}
  </>
)}
```

### `HybridHomeSections` — mover seções pessoais para o topo

```tsx
function HybridHomeSections({ data }: { data: DashboardV3Data }) {
  return (
    <>
      <PriorityCards items={data.priorities} />

      <MemberAgenda items={data.upcoming} />
      <section className="grid min-w-0 items-stretch gap-6 xl:grid-cols-2">
        <MemberCellPanel cell={data.cell} />
        <MemberPrayerPanel items={data.prayers} />
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,340px)]">
        <PriorityList items={data.priorityItems} />
        <ActivityTimeline items={data.timeline} />
        <UpcomingEvents items={data.upcoming} />
      </section>

      <section className="grid min-w-0 items-stretch gap-5 xl:grid-cols-2">
        <CarePeopleSection people={data.carePeople} />
        <InsightCards items={data.insights} />
      </section>
    </>
  );
}
```

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/dashboard/home-v3-ui.tsx` | `DashboardV3Home` (admin branch + isPastor/hasPersonalCell), `HybridHomeSections` (reorder) |

`page.tsx` não muda.
