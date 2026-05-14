# Full Tree View — Design Spec

**Date:** 2026-05-14  
**Status:** Approved  

## Overview

Replace the hourglass (per-person focused) tree view with a full panned/zoomable tree that loads all 690 individuals at startup. Layout uses the family-unit groups style: spouses placed side by side with a marriage line, a connector dot node between them, and children fanning down from the connector.

## Goals

- All 690 people visible on the `/tree` page from the start
- Pan and zoom to explore; no navigation buttons required
- Start centred on `DEFAULT_ROOT_PERSON_ID` at zoom 1.2
- Click any person → existing PersonPanel slides in from the right
- Hourglass view and its navigation UX removed entirely

## Data Layer

### New query: `getFullTreeData()`

Three SQL queries, combined in TypeScript:

```sql
-- 1. All individuals (with primary photo)
SELECT i.id, i.full_name, i.sex, i.birth_date, i.birth_place,
       i.death_date, i.death_place,
       (SELECT m.blob_url FROM media m
        WHERE m.individual_id = i.id AND m.media_type = 'photo' LIMIT 1) AS photo_blob_url
FROM individuals i

-- 2. All families
SELECT id, husband_id, wife_id FROM families

-- 3. All child memberships
SELECT family_id, individual_id FROM family_members WHERE role = 'child'
```

**Return type:**

```ts
interface FullTreeData {
  individuals: Individual[]           // existing Individual type
  families: FamilyRecord[]
}

interface FamilyRecord {
  id: string
  husbandId: string | null
  wifeId: string | null
  childIds: string[]
}
```

Photo URLs are signed server-side in parallel before passing to the component.

### Deleted query

`getHourglassData()` remains in `queries.ts` for now but is no longer called from the tree page.

## Layout Algorithm — `src/lib/full-tree-layout.ts`

Inputs: `FullTreeData` + `rootPersonId: string`  
Outputs: `{ nodes: Node[], edges: Edge[] }` (React Flow types)

### Step 1 — Assign generations via BFS

Start from `rootPersonId` at generation `0`. Traverse the family graph:

- A person's parents are at `generation − 1`
- A person's children are at `generation + 1`
- A person's spouse (in any shared family) gets the same generation

People not reachable from root default to generation `0`.

### Step 2 — Group into family units

For each `FamilyRecord`:
- Husband and wife are placed adjacent (husband left, wife right)
- A **connector node** (`type: 'familyConnector'`) is placed at the midpoint between them, offset downward by half a row gap
- Single parents (one of husband/wife is null) get a connector node below them

### Step 3 — Assign X positions

Within each generation row, families are ordered by their earliest-generation ancestor's position (top-down sort). People not in any family as a spouse are interleaved among the families of their generation.

X positions are spread with `NODE_W = 200`, `H_GAP = 48` between siblings, `COUPLE_GAP = 16` between spouses.

### Step 4 — Assign Y positions

`Y = generation × (NODE_H + V_GAP)` where `NODE_H = 80`, `V_GAP = 120`.

### Step 5 — Edges

| Edge | Type |
|------|------|
| husband → connector | `straight` |
| wife → connector | `straight` |
| connector → each child | `smoothstep` |

No edges are drawn directly between spouses — the connector node implies the marriage.

### Node types

| Type | Description |
|------|-------------|
| `personNode` | Existing `PersonNode` component — unchanged |
| `familyConnector` | New: small dot (8×8px), no label, no handles visible — purely structural |

## Component Architecture

### `src/components/full-tree.tsx` (new, replaces `hourglass-tree.tsx`)

- Accepts `{ data: FullTreeData, rootPersonId: string }` as props
- Runs `buildFullTreeLayout(data, rootPersonId)` once on mount
- On init, calls `setCenter` to position viewport on root person at zoom 1.2
- On node click: calls `/api/person/[id]` → shows `PersonPanel`
- No navigation buttons, no "show great-grandparents" controls
- `nodesDraggable={false}` retained

### `src/app/tree/page.tsx` (updated)

- Calls `getFullTreeData()` instead of `getHourglassData()`
- Signs all photo URLs in parallel: `await Promise.all(data.individuals.map(signIndividual))`
- Passes `data` and `rootPersonId` to `<FullTree />`
- Removes `signHourglassData` helper

## Files Changed

| File | Action |
|------|--------|
| `src/lib/queries.ts` | Add `getFullTreeData()` and `FullTreeData`/`FamilyRecord` types |
| `src/lib/full-tree-layout.ts` | **New** — layout algorithm |
| `src/components/full-tree.tsx` | **New** — replaces hourglass-tree.tsx |
| `src/app/tree/page.tsx` | Updated to use new query + component |
| `src/components/hourglass-tree.tsx` | **Deleted** |
| `src/lib/tree-layout.ts` | **Deleted** |
| `src/app/api/tree/[id]/route.ts` | **Deleted** |

## Files Unchanged

- `src/components/person-node.tsx`
- `src/components/person-panel.tsx`
- `src/app/api/person/[id]/route.ts`
- `src/app/api/search/route.ts`
- `src/lib/db.ts`, `src/lib/media.ts`

## Out of Scope

- Dashed border "couple grouping" boxes (requires React Flow subflows; deferred)
- Lazy loading / virtualisation (690 nodes is within React Flow's comfortable range)
- Search-to-highlight in tree (separate feature)
- Printing / export
