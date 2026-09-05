# Family View with In-Place Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed three-generation pedigree on `/tree` with an Ancestry-style Family View that grows in place as the user clicks chevrons on parent and child cards.

**Architecture:** The page keeps loading the whole tree once and indexing it with `buildTreeIndex`. A new pure module `family-layout.ts` turns the index, a focus id, and an `Expansion` (two sets of ids: whose parents to draw, whose spouse and children to draw) into React Flow nodes and edges. Positions come from a recursive band layout: each expanded person owns a vertical band tall enough for what their expansion draws, so expanding a branch pushes only the branches beside it. The client component owns the expansion state, resets it on re-root, and keeps re-rooting shallow via `window.history.pushState`.

**Tech Stack:** Next.js 16 (App Router), React 19, React Flow 11, TypeScript, vitest 4, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-05-family-view-expansion-design.md`

## Global Constraints

- This Next.js version differs from training data. Read the relevant guide under `node_modules/next/dist/docs/` before writing Next-specific code (per `AGENTS.md`).
- Path aliases: `@/*` → `./src/*`, `@auth` → `./auth`. Use them in `src/`; tests import with relative paths (`../src/lib/...`) as the existing tests do.
- vitest runs in the `node` environment with `globals: true`. Layout tests must be DOM-free.
- There is no lint script. `npm test` and `npm run build` are the verification gates.
- Layout modules must stay pure functions — no React, no DOM, no `window`.
- Layout constants, defined once in `src/lib/family-layout.ts` and imported everywhere else:
  `NODE_W = 220`, `NODE_H = 72`, `COL_GAP = 80`, `ROW_GAP = 16`, `MARRIAGE_GAP = 12`,
  `COUPLE_H = 2 * NODE_H + MARRIAGE_GAP` (156), `DEFAULT_UP_GENERATIONS = 3`.
- React Flow `position` is the card's **top-left** corner. Every `y` formula below computes a **centre**, so a node's `position.y` is `centre − NODE_H / 2`.
- Handles on every card: `left` (target), `right` (source), `top` (target), `bottom` (source). All descent edges run from the younger person's `right` to the older person's `left`. Marriage edges run `bottom` → `top`.
- Re-rooting must not use `router.push` (it would re-run the server component and reissue the 690-row query). Use `window.history.pushState`.
- Commit messages end with the trailer block used on this branch:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_012soJqgnvMntk5iQZf2KGVS
  ```

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/tree-index.ts` (modify) | Add `childFamilyOf` map and `getSiblingGroup` accessor |
| `src/lib/family-layout.ts` (create) | Expansion helpers, `resolveFocusId`, constants, and the pure band layout `buildFamilyLayout` |
| `src/lib/pedigree-layout.ts` (delete) | Superseded by `family-layout.ts` |
| `src/components/person-node.tsx` (rewrite) | The card, now with left and right expand chevrons instead of a detail button |
| `src/components/family-tree.tsx` (create) | Client component: index, focus-from-URL, expansion state, click routing, panel |
| `src/components/pedigree-tree.tsx` (delete) | Superseded by `family-tree.tsx` |
| `src/components/person-panel.tsx` (modify) | "Centre tree here" button |
| `src/app/tree/page.tsx` (modify) | Render `FamilyTree` |
| `src/app/person/[id]/page.tsx`, `src/app/search/page.tsx`, `src/components/search-bar.tsx` (modify) | Links use `?focus=` (they currently use `?id=`, which the tree ignores) |
| `tests/tree-index.test.ts` (modify) | `getSiblingGroup` cases |
| `tests/family-layout.test.ts` (create) | Layout unit tests |
| `tests/pedigree-layout.test.ts` (delete) | Tests a deleted module |
| `CLAUDE.md` (modify) | Commands and architecture sections reference the pedigree layout |

---

### Task 1: Sibling group accessor on the tree index

**Files:**
- Modify: `src/lib/tree-index.ts`
- Test: `tests/tree-index.test.ts`

**Interfaces:**
- Consumes: `FamilyRecord`, `FullTreeData` from `src/lib/queries.ts` (already exported).
- Produces: `TreeIndex.childFamilyOf: Map<string, FamilyRecord>` and
  `getSiblingGroup(index: TreeIndex, id: string): string[]` — the child ids of the first family
  `id` is a child of, in family order and including `id` itself; `[id]` when there is none.

- [ ] **Step 1: Write the failing tests**

Append to `tests/tree-index.test.ts`, inside the file (after the existing `describe` blocks), and add `getSiblingGroup` to the import on line 2:

```ts
import { buildTreeIndex, getParents, getChildIds, getSpouseIds, getSiblingGroup } from '../src/lib/tree-index'
```

```ts
describe('getSiblingGroup', () => {
  it('returns the child ids of the family the person is a child of, in order, including them', () => {
    const data: FullTreeData = {
      individuals: [person('FA'), person('MO', 'F'), person('S1'), person('I1'), person('S2', 'F')],
      families: [family('F1', 'FA', 'MO', ['S1', 'I1', 'S2'])],
    }
    expect(getSiblingGroup(buildTreeIndex(data), 'I1')).toEqual(['S1', 'I1', 'S2'])
  })

  it('returns just the person when they are a child of no family', () => {
    const data: FullTreeData = { individuals: [person('I1')], families: [] }
    expect(getSiblingGroup(buildTreeIndex(data), 'I1')).toEqual(['I1'])
  })

  it('uses the first family when a person is a child in more than one', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('A'), person('B')],
      families: [family('F1', 'A', null, ['I1']), family('F2', 'B', null, ['X', 'I1'])],
    }
    expect(getSiblingGroup(buildTreeIndex(data), 'I1')).toEqual(['I1'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tree-index.test.ts`
Expected: FAIL — `getSiblingGroup` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/tree-index.ts`:

Add to the `TreeIndex` interface:

```ts
  /** The first family each person is a child of. */
  childFamilyOf: Map<string, FamilyRecord>
```

In `buildTreeIndex`, declare `const childFamilyOf = new Map<string, FamilyRecord>()` next to `parentsOf`, and inside the child loop set it alongside `parentsOf`:

```ts
    for (const childId of fam.childIds) {
      // First family wins: a pedigree shows one ancestral line.
      if (!parentsOf.has(childId)) {
        parentsOf.set(childId, { fatherId: fam.husbandId, motherId: fam.wifeId })
        childFamilyOf.set(childId, fam)
      }
    }
```

Return `{ byId, parentsOf, childFamilyOf, spouseFamiliesOf, childrenOf }`.

Add the accessor at the end of the file:

```ts
/**
 * The person and their siblings in family order (the child ids of the first
 * family they are a child of), or just the person when they are in none.
 */
export function getSiblingGroup(index: TreeIndex, id: string): string[] {
  return index.childFamilyOf.get(id)?.childIds ?? [id]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/tree-index.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tree-index.ts tests/tree-index.test.ts
git commit -m "feat: add sibling group lookup to the tree index"
```

---

### Task 2: Expansion helpers and constants

**Files:**
- Create: `src/lib/family-layout.ts`
- Test: `tests/family-layout.test.ts`

**Interfaces:**
- Consumes: `TreeIndex`, `getParents`, `getChildIds` from `src/lib/tree-index.ts`.
- Produces:
  ```ts
  export const NODE_W, NODE_H, COL_GAP, ROW_GAP, MARRIAGE_GAP, COUPLE_H, DEFAULT_UP_GENERATIONS
  export interface Expansion { up: ReadonlySet<string>; down: ReadonlySet<string> }
  export function resolveFocusId(index: TreeIndex, requested: string | null | undefined, fallback: string): string
  export function defaultExpansion(index: TreeIndex, focusId: string): Expansion
  export function toggleExpansion(expansion: Expansion, side: 'up' | 'down', id: string): Expansion
  ```
  Task 3 adds `buildFamilyLayout` and `PersonCardData` to the same file.

- [ ] **Step 1: Write the failing tests**

Create `tests/family-layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildTreeIndex } from '../src/lib/tree-index'
import {
  defaultExpansion, resolveFocusId, toggleExpansion,
} from '../src/lib/family-layout'
import type { FullTreeData, FamilyRecord, Individual } from '../src/lib/queries'

function person(id: string, sex: 'M' | 'F' = 'M'): Individual {
  return {
    id, fullName: `Person ${id}`, sex,
    birthDate: null, birthPlace: null, deathDate: null, deathPlace: null, photoBlobUrl: null,
  }
}

function family(id: string, husbandId: string | null, wifeId: string | null, childIds: string[]): FamilyRecord {
  return { id, husbandId, wifeId, childIds }
}

/** I1 with a single paternal line G1 <- G2 <- G3 <- G4 and children C1 -> GC1 -> GGC1. */
function chain(): FullTreeData {
  return {
    individuals: [
      person('I1'), person('G1'), person('G2'), person('G3'), person('G4'),
      person('C1'), person('GC1'), person('GGC1'),
    ],
    families: [
      family('F1', 'G1', null, ['I1']),
      family('F2', 'G2', null, ['G1']),
      family('F3', 'G3', null, ['G2']),
      family('F4', 'G4', null, ['G3']),
      family('F5', 'I1', null, ['C1']),
      family('F6', 'C1', null, ['GC1']),
      family('F7', 'GC1', null, ['GGC1']),
    ],
  }
}

describe('resolveFocusId', () => {
  it('returns the requested id when that person exists', () => {
    const index = buildTreeIndex({ individuals: [person('I1'), person('I2')], families: [] })
    expect(resolveFocusId(index, 'I2', 'I1')).toBe('I2')
  })

  it('falls back when the requested id is unknown, null or empty', () => {
    const index = buildTreeIndex({ individuals: [person('I1')], families: [] })
    expect(resolveFocusId(index, 'nope', 'I1')).toBe('I1')
    expect(resolveFocusId(index, null, 'I1')).toBe('I1')
    expect(resolveFocusId(index, '', 'I1')).toBe('I1')
  })
})

describe('defaultExpansion', () => {
  it('expands the focus, parents and grandparents upward so three generations are drawn', () => {
    const { up } = defaultExpansion(buildTreeIndex(chain()), 'I1')
    expect([...up].sort()).toEqual(['G1', 'G2', 'I1'])
  })

  it('expands the focus and their children downward so grandchildren are drawn', () => {
    const { down } = defaultExpansion(buildTreeIndex(chain()), 'I1')
    expect([...down].sort()).toEqual(['C1', 'I1'])
  })

  it('is empty for an unknown focus', () => {
    const expansion = defaultExpansion(buildTreeIndex(chain()), 'ghost')
    expect(expansion.up.size).toBe(0)
    expect(expansion.down.size).toBe(0)
  })
})

describe('toggleExpansion', () => {
  it('adds an absent id and removes a present one, without mutating the input', () => {
    const start = defaultExpansion(buildTreeIndex(chain()), 'I1')
    const opened = toggleExpansion(start, 'up', 'G3')
    expect(opened.up.has('G3')).toBe(true)
    expect(start.up.has('G3')).toBe(false)
    expect(opened.down).toBe(start.down)

    const closed = toggleExpansion(opened, 'up', 'G3')
    expect(closed.up.has('G3')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/family-layout.test.ts`
Expected: FAIL — cannot resolve `../src/lib/family-layout`.

- [ ] **Step 3: Implement**

Create `src/lib/family-layout.ts`:

```ts
import type { TreeIndex } from './tree-index'
import { getChildIds, getParents } from './tree-index'

export const NODE_W = 220
export const NODE_H = 72
export const COL_GAP = 80
export const ROW_GAP = 16
export const MARRIAGE_GAP = 12
/** Height of a person card with their spouse card stacked beneath it. */
export const COUPLE_H = 2 * NODE_H + MARRIAGE_GAP
/** Ancestor generations drawn around a freshly rooted focus. */
export const DEFAULT_UP_GENERATIONS = 3

export interface Expansion {
  /** People whose parents are drawn. */
  up: ReadonlySet<string>
  /** People whose spouse and children are drawn. */
  down: ReadonlySet<string>
}

export function resolveFocusId(
  index: TreeIndex,
  requested: string | null | undefined,
  fallback: string,
): string {
  return requested && index.byId.has(requested) ? requested : fallback
}

/** Parents of `id` that exist in the index, father first. */
export function drawableParents(index: TreeIndex, id: string): string[] {
  const { fatherId, motherId } = getParents(index, id)
  return [fatherId, motherId].filter((p): p is string => p !== null && index.byId.has(p))
}

/** Children of `id` that exist in the index, in family order. */
export function drawableChildren(index: TreeIndex, id: string): string[] {
  return getChildIds(index, id).filter(c => index.byId.has(c))
}

/**
 * The starting state around a focus: three ancestor generations (focus,
 * parents and grandparents expanded upward) and two descendant generations
 * (focus and each child expanded downward).
 */
export function defaultExpansion(index: TreeIndex, focusId: string): Expansion {
  const up = new Set<string>()
  const down = new Set<string>()
  if (!index.byId.has(focusId)) return { up, down }

  let generation = [focusId]
  for (let g = 0; g < DEFAULT_UP_GENERATIONS; g++) {
    const next: string[] = []
    for (const id of generation) {
      up.add(id)
      next.push(...drawableParents(index, id))
    }
    generation = next
  }

  down.add(focusId)
  for (const childId of drawableChildren(index, focusId)) down.add(childId)

  return { up, down }
}

/** Returns a new Expansion with `id` added to or removed from one side. */
export function toggleExpansion(expansion: Expansion, side: 'up' | 'down', id: string): Expansion {
  const next = new Set(expansion[side])
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return { ...expansion, [side]: next }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/family-layout.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/family-layout.ts tests/family-layout.test.ts
git commit -m "feat: add family layout expansion helpers"
```

---

### Task 3: Band layout, ancestor side

**Files:**
- Modify: `src/lib/family-layout.ts`
- Test: `tests/family-layout.test.ts`

**Interfaces:**
- Consumes: Task 2's helpers; `getSiblingGroup`, `getSpouseIds` from `src/lib/tree-index.ts`.
- Produces:
  ```ts
  export interface PersonCardData {
    individual: Individual
    isFocus: boolean
    isSpouse: boolean
    spouseCount: number
    canExpandUp: boolean
    expandedUp: boolean
    canExpandDown: boolean
    expandedDown: boolean
  }
  export function buildFamilyLayout(index: TreeIndex, focusId: string, expansion: Expansion):
    { nodes: Node<PersonCardData>[]; edges: Edge[] }
  ```
  In this task the focus column is the focus card alone; Task 4 adds spouse, children and siblings. The code below is written so Task 4 only replaces `buildFamilyLayout` and adds the descendant functions.

- [ ] **Step 1: Write the failing tests**

Add to the import in `tests/family-layout.test.ts`:

```ts
import {
  buildFamilyLayout, defaultExpansion, resolveFocusId, toggleExpansion,
  NODE_W, NODE_H, COL_GAP, ROW_GAP, MARRIAGE_GAP, COUPLE_H,
} from '../src/lib/family-layout'
import type { Expansion } from '../src/lib/family-layout'
```

Add these helpers after `chain()`:

```ts
/**
 * I1 <- FA, MO; FA <- FAFA, FAMO; MO <- MOFA, MOMO; FAFA <- P1, P2 (great-grandparents,
 * drawn by default); P1 <- Q1, Q2 (fourth generation, not drawn by default).
 */
function deep(): FullTreeData {
  return {
    individuals: [
      person('I1'),
      person('FA'), person('MO', 'F'),
      person('FAFA'), person('FAMO', 'F'), person('MOFA'), person('MOMO', 'F'),
      person('P1'), person('P2', 'F'),
      person('Q1'), person('Q2', 'F'),
    ],
    families: [
      family('F1', 'FA', 'MO', ['I1']),
      family('F2', 'FAFA', 'FAMO', ['FA']),
      family('F3', 'MOFA', 'MOMO', ['MO']),
      family('F4', 'P1', 'P2', ['FAFA']),
      family('F5', 'Q1', 'Q2', ['P1']),
    ],
  }
}

function layout(data: FullTreeData, focusId: string, expansion?: Expansion) {
  const index = buildTreeIndex(data)
  return buildFamilyLayout(index, focusId, expansion ?? defaultExpansion(index, focusId))
}

type Nodes = ReturnType<typeof layout>['nodes']

function node(nodes: Nodes, id: string) {
  const found = nodes.find(n => n.id === id)
  if (!found) throw new Error(`no node ${id}`)
  return found
}

/** Vertical centre of a card, from its top-left position. */
function centreY(nodes: Nodes, id: string): number {
  return node(nodes, id).position.y + NODE_H / 2
}

function column(nodes: Nodes, id: string): number {
  return node(nodes, id).position.x / (NODE_W + COL_GAP)
}

function positions(nodes: Nodes): Record<string, { x: number; y: number }> {
  return Object.fromEntries(nodes.map(n => [n.id, n.position]))
}
```

Add these describe blocks:

```ts
describe('buildFamilyLayout ancestors', () => {
  it('returns no nodes when the focus person is not in the index', () => {
    expect(layout({ individuals: [person('I1')], families: [] }, 'ghost').nodes).toEqual([])
  })

  it('renders the focus person as a personCard flagged isFocus', () => {
    const { nodes } = layout({ individuals: [person('I1')], families: [] }, 'I1')
    const focus = node(nodes, 'I1')
    expect(focus.type).toBe('personCard')
    expect(focus.data.isFocus).toBe(true)
    expect(focus.data.canExpandUp).toBe(false)
  })

  it('places each ancestor generation in its own column to the right', () => {
    const { nodes } = layout(deep(), 'I1')
    expect(column(nodes, 'I1')).toBe(0)
    expect(column(nodes, 'FA')).toBe(1)
    expect(column(nodes, 'FAFA')).toBe(2)
    expect(column(nodes, 'P1')).toBe(3)
  })

  it('draws three ancestor generations by default and flags the outermost as expandable', () => {
    const { nodes } = layout(deep(), 'I1')
    expect(nodes.find(n => n.id === 'Q1')).toBeUndefined()
    expect(node(nodes, 'P1').data.canExpandUp).toBe(true)
    expect(node(nodes, 'P1').data.expandedUp).toBe(false)
    expect(node(nodes, 'FA').data.expandedUp).toBe(true)
    expect(node(nodes, 'P2').data.canExpandUp).toBe(false)
  })

  it('places the father above the mother', () => {
    const { nodes } = layout(deep(), 'I1')
    expect(centreY(nodes, 'FA')).toBeLessThan(centreY(nodes, 'MO'))
    expect(centreY(nodes, 'MOFA')).toBeLessThan(centreY(nodes, 'MOMO'))
  })

  it('centres a person between unexpanded parents with one row gap between them', () => {
    const { nodes } = layout(deep(), 'I1')
    expect(centreY(nodes, 'MO')).toBe((centreY(nodes, 'MOFA') + centreY(nodes, 'MOMO')) / 2)
    expect(centreY(nodes, 'MOMO') - centreY(nodes, 'MOFA')).toBe(NODE_H + ROW_GAP)
  })

  it("centres a person on their parents' combined band when one parent is expanded", () => {
    const { nodes } = layout(deep(), 'I1')
    // FAFA's band holds P1 and P2; FAMO's band is a single card.
    const fafaBandTop = centreY(nodes, 'FAFA') - (2 * NODE_H + ROW_GAP) / 2
    const famoBandBottom = centreY(nodes, 'FAMO') + NODE_H / 2
    expect(centreY(nodes, 'FA')).toBe((fafaBandTop + famoBandBottom) / 2)
  })

  it('centres the ancestor tree on the focus card', () => {
    const { nodes } = layout(deep(), 'I1')
    const faBandTop = centreY(nodes, 'FA') - (3 * NODE_H + 2 * ROW_GAP) / 2
    const moBandBottom = centreY(nodes, 'MOMO') + NODE_H / 2
    expect(centreY(nodes, 'I1')).toBe((faBandTop + moBandBottom) / 2)
  })

  it('expanding a great-grandparent adds their parents one column further right', () => {
    const index = buildTreeIndex(deep())
    const expansion = toggleExpansion(defaultExpansion(index, 'I1'), 'up', 'P1')
    const { nodes } = buildFamilyLayout(index, 'I1', expansion)
    expect(column(nodes, 'Q1')).toBe(4)
    expect(centreY(nodes, 'P1')).toBe((centreY(nodes, 'Q1') + centreY(nodes, 'Q2')) / 2)
    expect(node(nodes, 'P1').data.expandedUp).toBe(true)
  })

  it('expanding a branch moves the neighbouring branch as a block', () => {
    const index = buildTreeIndex(deep())
    const before = layout(deep(), 'I1').nodes
    const after = buildFamilyLayout(index, 'I1', toggleExpansion(defaultExpansion(index, 'I1'), 'up', 'P1')).nodes
    const shift = centreY(after, 'MO') - centreY(before, 'MO')
    expect(shift).toBeGreaterThan(0)
    expect(centreY(after, 'MOFA') - centreY(before, 'MOFA')).toBe(shift)
    expect(centreY(after, 'MOMO') - centreY(before, 'MOMO')).toBe(shift)
  })

  it('collapsing removes the branch and re-expanding restores every position', () => {
    const index = buildTreeIndex(deep())
    const start = defaultExpansion(index, 'I1')
    const collapsed = buildFamilyLayout(index, 'I1', toggleExpansion(start, 'up', 'FAFA')).nodes
    expect(collapsed.find(n => n.id === 'P1')).toBeUndefined()
    expect(node(collapsed, 'FAFA').data.expandedUp).toBe(false)
    expect(centreY(collapsed, 'FA')).toBe((centreY(collapsed, 'FAFA') + centreY(collapsed, 'FAMO')) / 2)

    const reopened = buildFamilyLayout(index, 'I1', toggleExpansion(toggleExpansion(start, 'up', 'FAFA'), 'up', 'FAFA')).nodes
    expect(positions(reopened)).toEqual(positions(layout(deep(), 'I1').nodes))
  })

  it('places a single drawable parent level with their child', () => {
    const { nodes } = layout(chain(), 'I1')
    expect(centreY(nodes, 'G1')).toBe(centreY(nodes, 'I1'))
    expect(column(nodes, 'G1')).toBe(1)
  })

  it('draws one edge per drawn parent from the child right handle to the parent left handle', () => {
    const { edges } = layout(deep(), 'I1')
    const toFather = edges.find(e => e.source === 'I1' && e.target === 'FA')!
    expect(toFather.sourceHandle).toBe('right')
    expect(toFather.targetHandle).toBe('left')
    expect(toFather.type).toBe('smoothstep')
    expect(edges.filter(e => e.source === 'I1')).toHaveLength(2)
    expect(edges.find(e => e.source === 'P1')).toBeUndefined()
  })

  it('never offers downward expansion on an ancestor card', () => {
    const { nodes } = layout(deep(), 'I1')
    for (const id of ['FA', 'MO', 'FAFA', 'P1']) {
      expect(node(nodes, id).data.canExpandDown).toBe(false)
    }
  })

  it('places a person who appears twice in the pedigree only once', () => {
    // Cousin marriage: I1's father and mother share a father.
    const data: FullTreeData = {
      individuals: [person('I1'), person('FA'), person('MO', 'F'), person('SHARED')],
      families: [
        family('F1', 'FA', 'MO', ['I1']),
        family('F2', 'SHARED', null, ['FA']),
        family('F3', 'SHARED', null, ['MO']),
      ],
    }
    const { nodes, edges } = layout(data, 'I1')
    expect(nodes.filter(n => n.id === 'SHARED')).toHaveLength(1)
    expect(edges.filter(e => e.target === 'SHARED')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/family-layout.test.ts`
Expected: FAIL — `buildFamilyLayout` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/family-layout.ts`, replace the two import lines at the top with:

```ts
import type { Node, Edge } from 'reactflow'
import type { Individual } from './queries'
import type { TreeIndex } from './tree-index'
import { getChildIds, getParents, getSiblingGroup, getSpouseIds } from './tree-index'
```

(`getSiblingGroup` and `getSpouseIds` are used in Task 4; importing them now avoids an edit later. TypeScript does not fail the build on unused imports in this project.)

Add after the `Expansion` interface:

```ts
export interface PersonCardData {
  individual: Individual
  isFocus: boolean
  /** Drawn as the lower half of a couple. */
  isSpouse: boolean
  /** Number of spouses the partner has; only meaningful on a spouse card. */
  spouseCount: number
  /** Right chevron shown. */
  canExpandUp: boolean
  expandedUp: boolean
  /** Left chevron shown. */
  canExpandDown: boolean
  expandedDown: boolean
}
```

Append the layout to the end of the file:

```ts
// ---------------------------------------------------------------------------
// Layout
//
// Three phases. Plan: decide which cards are drawn, claiming each person once
// so duplicates (cousin marriage, pedigree collapse) resolve before any
// geometry. Measure: each plan node's band height, bottom-up. Place: walk the
// plan top-down, giving every card the centre of its band.
// ---------------------------------------------------------------------------

interface UpPlan {
  id: string
  parents: UpPlan[]
}

interface Builder {
  index: TreeIndex
  expansion: Expansion
  focusId: string
  placed: Set<string>
  nodes: Node<PersonCardData>[]
  edges: Edge[]
}

function columnX(column: number): number {
  return column * (NODE_W + COL_GAP)
}

/** Total height of bands stacked with ROW_GAP between them. */
function stackHeight(heights: number[]): number {
  if (heights.length === 0) return 0
  return heights.reduce((sum, h) => sum + h, 0) + ROW_GAP * (heights.length - 1)
}

function claim(b: Builder, id: string): boolean {
  if (b.placed.has(id)) return false
  b.placed.add(id)
  return true
}

/** Plans the ancestors of `id`, which the caller has already claimed. */
function planUp(b: Builder, id: string): UpPlan {
  const parents: UpPlan[] = []
  if (b.expansion.up.has(id)) {
    for (const parentId of drawableParents(b.index, id)) {
      if (claim(b, parentId)) parents.push(planUp(b, parentId))
    }
  }
  return { id, parents }
}

function heightUp(plan: UpPlan): number {
  if (plan.parents.length === 0) return NODE_H
  return stackHeight(plan.parents.map(heightUp))
}

function upFlags(b: Builder, id: string): Pick<PersonCardData, 'canExpandUp' | 'expandedUp'> {
  return {
    canExpandUp: drawableParents(b.index, id).length > 0,
    expandedUp: b.expansion.up.has(id),
  }
}

function pushCard(
  b: Builder,
  id: string,
  column: number,
  centreY: number,
  flags: Partial<Omit<PersonCardData, 'individual'>>,
): void {
  const individual = b.index.byId.get(id)
  if (!individual) return
  b.nodes.push({
    id,
    type: 'personCard',
    position: { x: columnX(column), y: centreY - NODE_H / 2 },
    data: {
      individual,
      isFocus: id === b.focusId,
      isSpouse: false,
      spouseCount: 0,
      canExpandUp: false,
      expandedUp: false,
      canExpandDown: false,
      expandedDown: false,
      ...flags,
    },
  })
}

/** Descent edge, always from the younger person to the older one. */
function descentEdge(youngerId: string, olderId: string): Edge {
  return {
    id: `e-${youngerId}-${olderId}`,
    source: youngerId,
    sourceHandle: 'right',
    target: olderId,
    targetHandle: 'left',
    type: 'smoothstep',
  }
}

/**
 * Draws `plan`'s parents in `column`, stacked father-above-mother inside a
 * band centred on `centreY` (the child's centre), then recurses.
 */
function placeParents(b: Builder, plan: UpPlan, column: number, centreY: number): void {
  let top = centreY - heightUp(plan) / 2
  for (const parent of plan.parents) {
    const height = heightUp(parent)
    const parentCentre = top + height / 2
    pushCard(b, parent.id, column, parentCentre, upFlags(b, parent.id))
    b.edges.push(descentEdge(plan.id, parent.id))
    placeParents(b, parent, column + 1, parentCentre)
    top += height + ROW_GAP
  }
}

/**
 * Lays out the family view around `focusId`: the focus card in column 0 and
 * its expanded ancestors to the right.
 */
export function buildFamilyLayout(
  index: TreeIndex,
  focusId: string,
  expansion: Expansion,
): { nodes: Node<PersonCardData>[]; edges: Edge[] } {
  const b: Builder = { index, expansion, focusId, placed: new Set(), nodes: [], edges: [] }
  if (!index.byId.has(focusId)) return { nodes: [], edges: [] }

  claim(b, focusId)
  const upPlan = planUp(b, focusId)

  const focusCentre = NODE_H / 2
  pushCard(b, focusId, 0, focusCentre, upFlags(b, focusId))
  placeParents(b, upPlan, 1, focusCentre)

  return { nodes: b.nodes, edges: b.edges }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/family-layout.test.ts`
Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/family-layout.ts tests/family-layout.test.ts
git commit -m "feat: add band layout for the ancestor side of the family view"
```

---

### Task 4: Band layout, descendant side and siblings

**Files:**
- Modify: `src/lib/family-layout.ts`
- Test: `tests/family-layout.test.ts`

**Interfaces:**
- Consumes: Task 3's plan/measure/place functions; `getSiblingGroup`, `getSpouseIds`.
- Produces: the final `buildFamilyLayout`. Its signature is unchanged; the focus column now
  holds the focus's sibling group, each member a descendant-side root with optional spouse card
  and children.

- [ ] **Step 1: Write the failing tests**

Add these describe blocks to `tests/family-layout.test.ts`:

```ts
describe('buildFamilyLayout spouse and children', () => {
  /** I1 + SP with children C1 (married to CS, child GC) and C2. */
  function couple(): FullTreeData {
    return {
      individuals: [
        person('I1'), person('SP', 'F'), person('C1'), person('C2', 'F'),
        person('CS', 'F'), person('GC'),
      ],
      families: [
        family('F1', 'I1', 'SP', ['C1', 'C2']),
        family('F2', 'C1', 'CS', ['GC']),
      ],
    }
  }

  it('places the spouse directly below the focus person, flagged isSpouse', () => {
    const { nodes } = layout(couple(), 'I1')
    const spouse = node(nodes, 'SP')
    const focus = node(nodes, 'I1')
    expect(spouse.data.isSpouse).toBe(true)
    expect(spouse.position.x).toBe(focus.position.x)
    expect(spouse.position.y).toBe(focus.position.y + NODE_H + MARRIAGE_GAP)
    expect(spouse.data.canExpandUp).toBe(false)
    expect(spouse.data.canExpandDown).toBe(false)
  })

  it('joins the couple with a straight marriage edge', () => {
    const { edges } = layout(couple(), 'I1')
    const marriage = edges.find(e => e.source === 'I1' && e.target === 'SP')!
    expect(marriage.type).toBe('straight')
    expect(marriage.sourceHandle).toBe('bottom')
    expect(marriage.targetHandle).toBe('top')
  })

  it('shows the first spouse and counts the rest', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('SP', 'F'), person('SP2', 'F')],
      families: [family('F1', 'I1', 'SP', []), family('F2', 'I1', 'SP2', [])],
    }
    const { nodes } = layout(data, 'I1')
    expect(node(nodes, 'SP').data.spouseCount).toBe(2)
    expect(nodes.find(n => n.id === 'SP2')).toBeUndefined()
  })

  it('draws children one column left and grandchildren two, but not great-grandchildren', () => {
    const { nodes } = layout(chain(), 'I1')
    expect(column(nodes, 'C1')).toBe(-1)
    expect(column(nodes, 'GC1')).toBe(-2)
    expect(nodes.find(n => n.id === 'GGC1')).toBeUndefined()
    expect(node(nodes, 'C1').data.expandedDown).toBe(true)
    expect(node(nodes, 'GC1').data.canExpandDown).toBe(true)
    expect(node(nodes, 'GC1').data.expandedDown).toBe(false)
    expect(node(nodes, 'C1').data.canExpandUp).toBe(false)
  })

  it('draws an expanded child with their spouse beneath them and their children to the left', () => {
    const { nodes, edges } = layout(couple(), 'I1')
    expect(node(nodes, 'CS').data.isSpouse).toBe(true)
    expect(node(nodes, 'CS').position.y).toBe(node(nodes, 'C1').position.y + NODE_H + MARRIAGE_GAP)
    expect(column(nodes, 'GC')).toBe(-2)
    expect(centreY(nodes, 'GC')).toBe(centreY(nodes, 'C1') + (NODE_H + MARRIAGE_GAP) / 2)
    const toParent = edges.find(e => e.source === 'GC' && e.target === 'C1')!
    expect(toParent.sourceHandle).toBe('right')
    expect(toParent.targetHandle).toBe('left')
  })

  it('centres the children band on the couple', () => {
    const { nodes } = layout(couple(), 'I1')
    const coupleCentre = centreY(nodes, 'I1') + (NODE_H + MARRIAGE_GAP) / 2
    // C1's band is a couple (COUPLE_H tall); C2's is a single card.
    const bandTop = centreY(nodes, 'C1') - (NODE_H + MARRIAGE_GAP) / 2 - COUPLE_H / 2
    const bandBottom = centreY(nodes, 'C2') + NODE_H / 2
    expect((bandTop + bandBottom) / 2).toBe(coupleCentre)
  })

  it('collapsing a child hides their spouse and children and pulls the next child up', () => {
    const index = buildTreeIndex(couple())
    const open = layout(couple(), 'I1').nodes
    expect(centreY(open, 'C2') - centreY(open, 'C1')).toBe(COUPLE_H + ROW_GAP)

    const closed = buildFamilyLayout(index, 'I1', toggleExpansion(defaultExpansion(index, 'I1'), 'down', 'C1')).nodes
    expect(closed.find(n => n.id === 'CS')).toBeUndefined()
    expect(closed.find(n => n.id === 'GC')).toBeUndefined()
    expect(centreY(closed, 'C2') - centreY(closed, 'C1')).toBe(NODE_H + ROW_GAP)
    expect(node(closed, 'C1').data.canExpandDown).toBe(true)
    expect(node(closed, 'C1').data.expandedDown).toBe(false)
  })

  it('centres the children on the focus person when there is no spouse', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('C1')],
      families: [family('F1', 'I1', null, ['C1'])],
    }
    const { nodes } = layout(data, 'I1')
    expect(centreY(nodes, 'C1')).toBe(centreY(nodes, 'I1'))
  })

  it('unions children across families in family order', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('SP', 'F'), person('SP2', 'F'), person('C1'), person('C2')],
      families: [family('F1', 'I1', 'SP', ['C1']), family('F2', 'I1', 'SP2', ['C2'])],
    }
    const { nodes } = layout(data, 'I1')
    const children = nodes.filter(n => column(nodes, n.id) === -1).map(n => n.id)
    expect(children).toEqual(['C1', 'C2'])
  })

  it('skips a child whose individual record is missing from the index', () => {
    const data: FullTreeData = {
      individuals: [person('I1')],
      families: [family('F1', 'I1', null, ['GHOST'])],
    }
    const { nodes, edges } = layout(data, 'I1')
    expect(nodes).toHaveLength(1)
    expect(edges).toHaveLength(0)
    expect(node(nodes, 'I1').data.canExpandDown).toBe(false)
  })

  // Defensive: a person married to their own ancestor. The ancestor pass runs
  // first, so the spouse card is skipped and the children stay centred on the focus.
  it('does not double-draw a spouse already placed as an ancestor', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('SP', 'F'), person('FA'), person('C1')],
      families: [
        family('F1', 'FA', 'SP', ['I1']),
        family('F2', 'I1', 'SP', ['C1']),
      ],
    }
    const { nodes } = layout(data, 'I1')
    expect(nodes.filter(n => n.id === 'SP')).toHaveLength(1)
    expect(node(nodes, 'SP').data.isSpouse).toBe(false)
    expect(centreY(nodes, 'C1')).toBe(centreY(nodes, 'I1'))
  })
})

describe('buildFamilyLayout siblings', () => {
  /** FA + MO with children S1, I1, S2; S2 has a child N1. */
  function withSiblings(): FullTreeData {
    return {
      individuals: [
        person('FA'), person('MO', 'F'), person('S1'), person('I1'), person('S2', 'F'), person('N1'),
      ],
      families: [
        family('F1', 'FA', 'MO', ['S1', 'I1', 'S2']),
        family('F2', null, 'S2', ['N1']),
      ],
    }
  }

  it('stacks the sibling group in column 0 in family order', () => {
    const { nodes } = layout(withSiblings(), 'I1')
    for (const id of ['S1', 'I1', 'S2']) expect(column(nodes, id)).toBe(0)
    expect(centreY(nodes, 'S1')).toBeLessThan(centreY(nodes, 'I1'))
    expect(centreY(nodes, 'I1')).toBeLessThan(centreY(nodes, 'S2'))
    expect(centreY(nodes, 'I1') - centreY(nodes, 'S1')).toBe(NODE_H + ROW_GAP)
    expect(node(nodes, 'S1').data.isFocus).toBe(false)
  })

  it('leaves siblings collapsed but expandable when they have children', () => {
    const { nodes } = layout(withSiblings(), 'I1')
    expect(nodes.find(n => n.id === 'N1')).toBeUndefined()
    expect(node(nodes, 'S2').data.canExpandDown).toBe(true)
    expect(node(nodes, 'S2').data.expandedDown).toBe(false)
    expect(node(nodes, 'S1').data.canExpandDown).toBe(false)
    expect(node(nodes, 'S2').data.canExpandUp).toBe(false)
  })

  it('expanding a sibling draws their children to the left and pushes nothing above them', () => {
    const index = buildTreeIndex(withSiblings())
    const before = layout(withSiblings(), 'I1').nodes
    const after = buildFamilyLayout(index, 'I1', toggleExpansion(defaultExpansion(index, 'I1'), 'down', 'S2')).nodes
    expect(column(after, 'N1')).toBe(-1)
    expect(centreY(after, 'N1')).toBe(centreY(after, 'S2'))
    expect(centreY(after, 'I1') - centreY(after, 'S1')).toBe(centreY(before, 'I1') - centreY(before, 'S1'))
  })

  it('joins every sibling to the drawn parents', () => {
    const { edges } = layout(withSiblings(), 'I1')
    for (const id of ['S1', 'I1', 'S2']) {
      expect(edges.find(e => e.source === id && e.target === 'FA')).toBeDefined()
      expect(edges.find(e => e.source === id && e.target === 'MO')).toBeDefined()
    }
  })

  it('centres the ancestors on the focus card, not the sibling stack', () => {
    const { nodes } = layout(withSiblings(), 'I1')
    expect((centreY(nodes, 'FA') + centreY(nodes, 'MO')) / 2).toBe(centreY(nodes, 'I1'))
  })

  it('draws only the focus in column 0 when they have no recorded parents', () => {
    const { nodes } = layout({ individuals: [person('I1')], families: [] }, 'I1')
    expect(nodes.map(n => n.id)).toEqual(['I1'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/family-layout.test.ts`
Expected: FAIL — spouse, children and sibling nodes are missing (`no node SP`, etc.).

- [ ] **Step 3: Implement**

In `src/lib/family-layout.ts`, add after `placeParents`:

```ts
interface DownPlan {
  id: string
  spouseId: string | null
  children: DownPlan[]
}

/** Plans the spouse and descendants of `id`, which the caller has already claimed. */
function planDown(b: Builder, id: string): DownPlan {
  const plan: DownPlan = { id, spouseId: null, children: [] }
  if (!b.expansion.down.has(id)) return plan

  const spouseId = getSpouseIds(b.index, id)[0]
  if (spouseId && b.index.byId.has(spouseId) && claim(b, spouseId)) plan.spouseId = spouseId

  for (const childId of drawableChildren(b.index, id)) {
    if (claim(b, childId)) plan.children.push(planDown(b, childId))
  }
  return plan
}

/** Height of the person card, or the couple when the spouse is drawn. */
function unitHeight(plan: DownPlan): number {
  return plan.spouseId ? COUPLE_H : NODE_H
}

function heightDown(plan: DownPlan): number {
  if (plan.children.length === 0) return unitHeight(plan)
  return Math.max(unitHeight(plan), stackHeight(plan.children.map(heightDown)))
}

function downFlags(b: Builder, id: string): Pick<PersonCardData, 'canExpandDown' | 'expandedDown'> {
  return {
    canExpandDown: drawableChildren(b.index, id).length > 0,
    expandedDown: b.expansion.down.has(id),
  }
}

function marriageEdge(personId: string, spouseId: string): Edge {
  return {
    id: `m-${personId}-${spouseId}`,
    source: personId,
    sourceHandle: 'bottom',
    target: spouseId,
    targetHandle: 'top',
    type: 'straight',
  }
}

/**
 * Draws the family unit for `plan` in `column`, centred in the band
 * [top, top + height], then its children one column to the left.
 * Returns the person card's centre so the ancestor tree can hang off it.
 */
function placeDown(b: Builder, plan: DownPlan, column: number, top: number, height: number): number {
  const unitCentre = top + height / 2
  const personCentre = plan.spouseId ? unitCentre - (NODE_H + MARRIAGE_GAP) / 2 : unitCentre

  const flags = plan.id === b.focusId
    ? { ...downFlags(b, plan.id), ...upFlags(b, plan.id) }
    : downFlags(b, plan.id)
  pushCard(b, plan.id, column, personCentre, flags)

  if (plan.spouseId) {
    pushCard(b, plan.spouseId, column, personCentre + NODE_H + MARRIAGE_GAP, {
      isSpouse: true,
      spouseCount: getSpouseIds(b.index, plan.id).length,
    })
    b.edges.push(marriageEdge(plan.id, plan.spouseId))
  }

  const childHeights = plan.children.map(heightDown)
  let childTop = unitCentre - stackHeight(childHeights) / 2
  plan.children.forEach((child, k) => {
    placeDown(b, child, column - 1, childTop, childHeights[k])
    b.edges.push(descentEdge(child.id, plan.id))
    childTop += childHeights[k] + ROW_GAP
  })

  return personCentre
}
```

Replace `buildFamilyLayout` with:

```ts
/**
 * Lays out the family view around `focusId`: the focus's sibling group in
 * column 0 (each a descendant-side root with optional spouse and children to
 * the left), and the focus's expanded ancestors to the right.
 */
export function buildFamilyLayout(
  index: TreeIndex,
  focusId: string,
  expansion: Expansion,
): { nodes: Node<PersonCardData>[]; edges: Edge[] } {
  const b: Builder = { index, expansion, focusId, placed: new Set(), nodes: [], edges: [] }
  if (!index.byId.has(focusId)) return { nodes: [], edges: [] }

  // Ancestors are planned first so a person who is both an ancestor and a
  // spouse or sibling is drawn in the pedigree.
  claim(b, focusId)
  const upPlan = planUp(b, focusId)

  const columnPlans: DownPlan[] = []
  for (const id of getSiblingGroup(index, focusId)) {
    if (id === focusId || (index.byId.has(id) && claim(b, id))) columnPlans.push(planDown(b, id))
  }

  const heights = columnPlans.map(heightDown)
  let top = 0
  let focusCentre = NODE_H / 2
  columnPlans.forEach((plan, k) => {
    const centre = placeDown(b, plan, 0, top, heights[k])
    if (plan.id === focusId) focusCentre = centre
    top += heights[k] + ROW_GAP
  })

  for (const parent of upPlan.parents) {
    for (const plan of columnPlans) {
      if (plan.id !== focusId) b.edges.push(descentEdge(plan.id, parent.id))
    }
  }
  placeParents(b, upPlan, 1, focusCentre)

  return { nodes: b.nodes, edges: b.edges }
}
```

`placeParents` already pushes the focus's own edge to each parent, so the loop above adds only the siblings' edges.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/family-layout.test.ts`
Expected: PASS (38 tests). Also run `npm test` and expect the pedigree tests still green — they are deleted in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/family-layout.ts tests/family-layout.test.ts
git commit -m "feat: add descendants and siblings to the family view layout"
```

---

### Task 5: Card chevrons, tree component, panel button, page wiring

**Files:**
- Rewrite: `src/components/person-node.tsx`
- Create: `src/components/family-tree.tsx`
- Modify: `src/components/person-panel.tsx`
- Modify: `src/app/tree/page.tsx`
- Delete: `src/components/pedigree-tree.tsx`, `src/lib/pedigree-layout.ts`, `tests/pedigree-layout.test.ts`

**Interfaces:**
- Consumes: `buildFamilyLayout`, `defaultExpansion`, `toggleExpansion`, `resolveFocusId`, `Expansion`, `PersonCardData`, `NODE_W`, `NODE_H` from `@/lib/family-layout`; `buildTreeIndex` from `@/lib/tree-index`.
- Produces: default export `FamilyTree({ data, defaultFocusId })`. Click routing contract: an element with `data-expand-up` toggles that card's ancestors, `data-expand-down` toggles its descendants, any other click on the card opens the panel.

There are no DOM tests in this repo; verification is `npm run build` plus a manual check.

- [ ] **Step 1: Rewrite the card**

Replace `src/components/person-node.tsx` with:

```tsx
'use client'

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import { NODE_H, NODE_W, type PersonCardData } from '@/lib/family-layout'

function formatYears(birthDate: string | null, deathDate: string | null): string {
  const birth = birthDate ? birthDate.split(' ').pop() ?? '?' : '?'
  const death = deathDate ? deathDate.split(' ').pop() ?? '' : ''
  return death ? `${birth}–${death}` : `b. ${birth}`
}

function initials(fullName: string): string {
  return fullName.split(' ').map(word => word[0]).slice(0, 2).join('')
}

const HIDDEN_HANDLE = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 'none',
} as const

const CHEVRON =
  'absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border border-slate-300 bg-white ' +
  'text-slate-500 hover:text-indigo-600 hover:border-indigo-400 text-sm leading-none ' +
  'flex items-center justify-center shadow-sm'

/*
  The chevrons carry no onClick by design: the `data-expand-up` and
  `data-expand-down` attributes are the contract. Clicks bubble to React
  Flow's node wrapper, where family-tree.tsx's onNodeClick recovers intent
  via closest('[data-expand-up]') etc. Any other click on the card opens
  the detail panel.
*/
function PersonNode({ data }: { data: PersonCardData }) {
  const { individual, isFocus, isSpouse, spouseCount, canExpandUp, expandedUp, canExpandDown, expandedDown } = data

  const tint =
    individual.sex === 'M' ? 'bg-sky-50 border-sky-200' :
    individual.sex === 'F' ? 'bg-rose-50 border-rose-200' :
    'bg-slate-50 border-slate-200'
  const focusRing = isFocus ? 'ring-2 ring-indigo-500 shadow-md' : 'shadow-sm'

  return (
    <div
      className={`relative flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:shadow-md transition-shadow ${tint} ${focusRing}`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" id="left" position={Position.Left} style={HIDDEN_HANDLE} />
      <Handle type="target" id="top" position={Position.Top} style={HIDDEN_HANDLE} />

      {individual.photoBlobUrl ? (
        <img
          src={individual.photoBlobUrl}
          alt={individual.fullName}
          className="w-12 h-12 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-500 flex-shrink-0">
          {initials(individual.fullName)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 truncate leading-tight">
          {individual.fullName}
        </p>
        <p className="text-xs text-slate-500 leading-tight">
          {formatYears(individual.birthDate, individual.deathDate)}
        </p>
        {isSpouse && spouseCount > 1 && (
          <p className="text-[10px] text-slate-400 leading-tight">+{spouseCount - 1} more</p>
        )}
      </div>

      {canExpandDown && (
        <button
          type="button"
          data-expand-down
          aria-label={`${expandedDown ? 'Hide' : 'Show'} children of ${individual.fullName}`}
          className={`${CHEVRON} -left-3`}
        >
          {expandedDown ? '›' : '‹'}
        </button>
      )}

      {canExpandUp && (
        <button
          type="button"
          data-expand-up
          aria-label={`${expandedUp ? 'Hide' : 'Show'} parents of ${individual.fullName}`}
          className={`${CHEVRON} -right-3`}
        >
          {expandedUp ? '‹' : '›'}
        </button>
      )}

      <Handle type="source" id="right" position={Position.Right} style={HIDDEN_HANDLE} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={HIDDEN_HANDLE} />
    </div>
  )
}

export default memo(PersonNode)
```

- [ ] **Step 2: Create the tree component**

Create `src/components/family-tree.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow'
import type { NodeMouseHandler } from 'reactflow'
import 'reactflow/dist/style.css'
import PersonNode from './person-node'
import PersonPanel from './person-panel'
import { buildTreeIndex } from '@/lib/tree-index'
import {
  NODE_H, NODE_W, buildFamilyLayout, defaultExpansion, resolveFocusId, toggleExpansion,
} from '@/lib/family-layout'
import type { Expansion } from '@/lib/family-layout'
import type { FullTreeData, Individual } from '@/lib/queries'

const nodeTypes = { personCard: PersonNode }
const FIT_VIEW_OPTIONS = { maxZoom: 1, padding: 0.1 }

interface PanelMedia {
  id: number
  blobUrl: string
  mediaType: string
  title: string | null
}

interface PanelData {
  individual: Individual
  father: Individual | null
  mother: Individual | null
  spouses: Individual[]
  children: Individual[]
  media: PanelMedia[]
}

interface FamilyTreeProps {
  data: FullTreeData
  defaultFocusId: string
}

/** Expansion state is keyed by focus so a re-root falls back to the default without a stale render. */
interface ExpansionState {
  focusId: string
  expansion: Expansion
}

function FamilyTreeInner({ data, defaultFocusId }: FamilyTreeProps) {
  const searchParams = useSearchParams()
  const index = useMemo(() => buildTreeIndex(data), [data])
  const focusId = resolveFocusId(index, searchParams.get('focus'), defaultFocusId)

  const [expansionState, setExpansionState] = useState<ExpansionState | null>(null)
  const [rootVersion, setRootVersion] = useState(0)
  const initialExpansion = useMemo(() => defaultExpansion(index, focusId), [index, focusId])
  const expansion = expansionState?.focusId === focusId ? expansionState.expansion : initialExpansion

  const layout = useMemo(() => buildFamilyLayout(index, focusId, expansion), [index, focusId, expansion])

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges)
  const [panelData, setPanelData] = useState<PanelData | null>(null)
  const { setCenter } = useReactFlow()

  // Sync the layout into React Flow. Ease to the focus only when the root
  // changed (a new focus or an explicit re-centre); expansion leaves the
  // viewport alone. The first render is handled by the fitView prop.
  const lastRoot = useRef<string | null>(null)
  useEffect(() => {
    setNodes(layout.nodes)
    setEdges(layout.edges)

    const root = `${focusId}:${rootVersion}`
    if (lastRoot.current === null) {
      lastRoot.current = root
      return
    }
    if (lastRoot.current === root) return
    lastRoot.current = root

    const focusNode = layout.nodes.find(n => n.id === focusId)
    if (focusNode) {
      setCenter(
        focusNode.position.x + NODE_W / 2,
        focusNode.position.y + NODE_H / 2,
        { zoom: 1, duration: 400 },
      )
    }
  }, [layout, focusId, rootVersion, setNodes, setEdges, setCenter])

  const setFocus = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('focus', id)
    // Shallow routing: updates useSearchParams without re-running the server component.
    window.history.pushState(null, '', `?${params.toString()}`)
  }, [searchParams])

  /**
   * Re-root on `id`, resetting expansion. A new focus re-centres via the
   * effect when the URL changes; re-centring on the current focus bumps
   * rootVersion instead so the effect still fires exactly once.
   */
  const recentre = useCallback((id: string) => {
    setPanelData(null)
    setExpansionState(null)
    if (id === focusId) setRootVersion(v => v + 1)
    else setFocus(id)
  }, [focusId, setFocus])

  const toggle = useCallback((side: 'up' | 'down', id: string) => {
    setExpansionState({ focusId, expansion: toggleExpansion(expansion, side, id) })
  }, [focusId, expansion])

  const fetchPanel = useCallback(async (id: string) => {
    const res = await fetch(`/api/person/${id}`)
    if (!res.ok) return
    const detail = await res.json()
    setPanelData({
      individual: detail,
      father: detail.father,
      mother: detail.mother,
      spouses: detail.spouses,
      children: detail.children,
      media: detail.media,
    })
  }, [])

  const onNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      const target = event.target as HTMLElement
      if (target.closest('[data-expand-up]')) {
        toggle('up', node.id)
      } else if (target.closest('[data-expand-down]')) {
        toggle('down', node.id)
      } else {
        fetchPanel(node.id)
      }
    },
    [toggle, fetchPanel],
  )

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
      >
        <Background />
        <Controls />
      </ReactFlow>

      <PersonPanel
        data={panelData}
        onClose={() => setPanelData(null)}
        onNavigate={recentre}
      />
    </div>
  )
}

export default function FamilyTree(props: FamilyTreeProps) {
  return (
    <ReactFlowProvider>
      <FamilyTreeInner {...props} />
    </ReactFlowProvider>
  )
}
```

- [ ] **Step 3: Add the panel button**

In `src/components/person-panel.tsx`, replace the footer `<div className="px-4 py-3 border-t border-slate-100">` block with:

```tsx
      <div className="px-4 py-3 border-t border-slate-100 space-y-2">
        <button
          onClick={() => onNavigate(individual.id)}
          className="w-full text-sm bg-indigo-600 text-white hover:bg-indigo-700 font-medium rounded-md py-1.5"
        >
          Centre tree here
        </button>
        <button
          onClick={() => router.push(`/person/${individual.id}`)}
          className="w-full text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          View full profile →
        </button>
      </div>
```

- [ ] **Step 4: Wire the page and delete the old files**

In `src/app/tree/page.tsx`, change the import and the JSX:

```tsx
import FamilyTree from '@/components/family-tree'
```

```tsx
        <FamilyTree data={signedData} defaultFocusId={defaultFocusId} />
```

Then:

```bash
git rm -q src/components/pedigree-tree.tsx src/lib/pedigree-layout.ts tests/pedigree-layout.test.ts
grep -rn "pedigree-layout\|pedigree-tree\|PedigreeTree" src tests
```

Expected: no matches.

- [ ] **Step 5: Verify tests and build**

Run: `npm test`
Expected: PASS, 3 files (`gedcom-parser`, `tree-index`, `family-layout`).

Run: `npm run build`
Expected: compiles with no type errors.

- [ ] **Step 6: Manual check in the browser**

Start `npm run dev` (with `AUTH_DEV_BYPASS=true` in `.env.local`) and open `http://localhost:3000/tree`. Check, in order:

1. The starting view shows the focus and spouse, siblings above/below, three ancestor generations to the right, children and grandchildren to the left, all fitted in the viewport.
2. Clicking a right-edge chevron on a great-grandparent adds their parents in a new column and the rest of the tree does not jump the viewport.
3. Clicking the same chevron again collapses them.
4. Clicking a left-edge chevron on a grandchild draws their spouse and children.
5. Clicking a card body opens the panel; "Centre tree here" re-roots with the URL changing to `?focus=<id>`; browser back returns to the previous focus.

If headless Chromium is available, a screenshot for the record:

```bash
BIN=$(find ~/Library/Caches/ms-playwright -type f -name chrome-headless-shell | head -1)
"$BIN" --headless --disable-gpu --hide-scrollbars --window-size=1600,1000 --virtual-time-budget=8000 \
  --screenshot=/tmp/family-view.png http://localhost:3000/tree
```

- [ ] **Step 7: Commit**

```bash
git add src/components/person-node.tsx src/components/family-tree.tsx src/components/person-panel.tsx src/app/tree/page.tsx
git commit -m "feat: replace pedigree view with an expandable family view"
```

---

### Task 6: Fix tree links and update docs

**Files:**
- Modify: `src/app/person/[id]/page.tsx:34`, `src/app/search/page.tsx:47`, `src/components/search-bar.tsx:50`
- Modify: `CLAUDE.md:14`, `CLAUDE.md:59-70`

**Interfaces:**
- Consumes: the tree reads `?focus=<id>` (Task 5). The three link sites still write `?id=<id>`, which the tree ignores, so search results and profile links currently land on the default focus.

- [ ] **Step 1: Fix the links**

```bash
sed -i '' 's#/tree?id=#/tree?focus=#g' 'src/app/person/[id]/page.tsx' src/app/search/page.tsx src/components/search-bar.tsx
grep -rn "tree?id=" src
```

Expected: no matches.

- [ ] **Step 2: Update CLAUDE.md**

Replace the two single-test example lines in the Commands block with:

```bash
npx vitest run tests/family-layout.test.ts             # one test file
npx vitest run -t 'places the father above the mother' # one test by name
```

Replace the paragraph beginning `**The tree loads whole, then draws a slice.**` with:

```markdown
**The tree loads whole, then draws a slice that grows in place.** `src/app/tree/page.tsx` fetches
the entire graph with `getFullTreeData()` (~690 individuals) server-side, signs photos, and hands
it to the `FamilyTree` client component. `src/lib/tree-index.ts` builds parent/spouse/child/sibling
lookup maps once; `src/lib/family-layout.ts` then draws only the cards around the current focus
person, driven by an `Expansion` (two sets of ids: whose parents to draw, whose spouse and
children to draw). Positions come from a recursive band layout: an expanded person owns a
vertical band tall enough for what their expansion draws, father above mother on the right,
children stacked on the left, so expanding one branch pushes only its neighbours. The starting
state is Ancestry's Family View (siblings, three ancestor generations, two descendant
generations); chevrons on the card edges toggle expansion. Both modules are pure and unit-tested
without a DOM. Re-rooting (from the detail panel) is client-side only: it calls
`window.history.pushState` to set `?focus=<id>`, because `router.push` would re-run the server
component and reissue the 690-row query.
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/person/[id]/page.tsx' src/app/search/page.tsx src/components/search-bar.tsx CLAUDE.md
git commit -m "fix: point tree links at ?focus and document the family view layout"
```
