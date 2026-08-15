# Ancestry-Style Pedigree View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the whole-graph dagre tree on `/tree` with a horizontal, re-rootable pedigree chart modelled on Ancestry's default family view.

**Architecture:** The page keeps loading the whole tree once via `getFullTreeData()`. A pure `buildTreeIndex()` turns that into lookup maps; a pure `buildPedigreeLayout()` turns the maps plus a focus id into the handful of React Flow nodes and edges that are visible. Positions are plain arithmetic from Ahnentafel numbering — no graph solver. Re-rooting is client-side only, driven by `window.history.pushState`.

**Tech Stack:** Next.js 16 (App Router), React 19, React Flow 11, TypeScript, vitest 4, Tailwind 4.

## Global Constraints

- This Next.js version differs from training data. Read the relevant guide under `node_modules/next/dist/docs/` before writing Next-specific code (per `AGENTS.md`).
- Path aliases: `@/*` → `./src/*`, `@auth` → `./auth`. Use them; do not write relative imports across `src/`.
- vitest runs in the `node` environment with `globals: true`. New tests must be DOM-free.
- There is no lint script. `npm test` and `npm run build` are the verification gates.
- Layout modules must stay pure functions — no React, no DOM, no `window`.
- Grid constants, defined once in `src/lib/pedigree-layout.ts` and imported everywhere else:
  `NODE_W = 220`, `NODE_H = 72`, `COL_GAP = 80`, `ROW_GAP = 16`, `ROW = NODE_H + ROW_GAP` (88), `MARRIAGE_GAP = 12`, `MAX_GEN = 3`.
- React Flow `position` is the card's **top-left** corner. All `y` formulas in this plan compute a **centre**, so every node's `position.y` is `centre − NODE_H / 2`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/tree-index.ts` (create) | Turn `FullTreeData` into parent/spouse/child lookup maps plus safe accessors |
| `src/lib/pedigree-layout.ts` (create) | Pure focus→nodes/edges layout, plus `resolveFocusId` |
| `src/components/person-node.tsx` (rewrite) | The pedigree card: horizontal, left/right handles, detail chevron |
| `src/components/pedigree-tree.tsx` (create) | Client component: index, focus-from-URL, re-root, panel fetch |
| `src/app/tree/page.tsx` (modify) | Read initial `?focus`, render the new client component |
| `tests/tree-index.test.ts` (create) | Index unit tests |
| `tests/pedigree-layout.test.ts` (create) | Layout unit tests |
| `src/lib/full-tree-layout.ts` (delete) | Superseded |
| `src/components/full-tree.tsx` (delete) | Superseded |
| `src/components/family-connector-node.tsx` (delete) | Pedigrees connect child→parent directly |
| `tests/full-tree-layout.test.ts` (delete) | Tests a deleted module |
| `CLAUDE.md` (modify) | Architecture section describes dagre; must describe the pedigree |

---

### Task 1: Tree index

**Files:**
- Create: `src/lib/tree-index.ts`
- Test: `tests/tree-index.test.ts`

**Interfaces:**
- Consumes: `FullTreeData`, `FamilyRecord`, `Individual` from `src/lib/queries.ts` (already exported).
- Produces: `TreeIndex`, `Parents`, `buildTreeIndex(data: FullTreeData): TreeIndex`, `getParents(index: TreeIndex, id: string): Parents`, `getChildIds(index: TreeIndex, id: string): string[]`, `getSpouseIds(index: TreeIndex, id: string): string[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/tree-index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildTreeIndex, getParents, getChildIds, getSpouseIds } from '../src/lib/tree-index'
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

describe('buildTreeIndex', () => {
  it('indexes individuals by id', () => {
    const data: FullTreeData = { individuals: [person('I1')], families: [] }
    expect(buildTreeIndex(data).byId.get('I1')!.fullName).toBe('Person I1')
  })

  it('maps a child to its father and mother', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2'), person('I3', 'F')],
      families: [family('F1', 'I2', 'I3', ['I1'])],
    }
    const index = buildTreeIndex(data)
    expect(getParents(index, 'I1')).toEqual({ fatherId: 'I2', motherId: 'I3' })
  })

  it('keeps the first family when a person is a child in two families', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2'), person('I9')],
      families: [family('F1', 'I2', null, ['I1']), family('F2', 'I9', null, ['I1'])],
    }
    expect(getParents(buildTreeIndex(data), 'I1').fatherId).toBe('I2')
  })

  it('unions children across every spouse family', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3', 'F'), person('I4'), person('I5')],
      families: [family('F1', 'I1', 'I2', ['I4']), family('F2', 'I1', 'I3', ['I5'])],
    }
    expect(getChildIds(buildTreeIndex(data), 'I1')).toEqual(['I4', 'I5'])
  })

  it('de-duplicates a child recorded in two of the same person\'s families', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I4')],
      families: [family('F1', 'I1', 'I2', ['I4']), family('F2', 'I1', null, ['I4'])],
    }
    expect(getChildIds(buildTreeIndex(data), 'I1')).toEqual(['I4'])
  })

  it('lists spouses in family order without repeats', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3', 'F')],
      families: [family('F1', 'I1', 'I2', []), family('F2', 'I1', 'I3', []), family('F3', 'I1', 'I2', [])],
    }
    expect(getSpouseIds(buildTreeIndex(data), 'I1')).toEqual(['I2', 'I3'])
  })

  it('returns empty results for a person with no family records', () => {
    const index = buildTreeIndex({ individuals: [person('I1')], families: [] })
    expect(getParents(index, 'I1')).toEqual({ fatherId: null, motherId: null })
    expect(getChildIds(index, 'I1')).toEqual([])
    expect(getSpouseIds(index, 'I1')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tree-index.test.ts`
Expected: FAIL — cannot resolve `../src/lib/tree-index`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/tree-index.ts`:

```ts
import type { FullTreeData, FamilyRecord, Individual } from './queries'

export interface Parents {
  fatherId: string | null
  motherId: string | null
}

export interface TreeIndex {
  byId: Map<string, Individual>
  parentsOf: Map<string, Parents>
  spouseFamiliesOf: Map<string, FamilyRecord[]>
  childrenOf: Map<string, string[]>
}

const NO_PARENTS: Parents = { fatherId: null, motherId: null }

/** Builds the lookup maps the pedigree layout needs, in one pass over the tree. */
export function buildTreeIndex(data: FullTreeData): TreeIndex {
  const byId = new Map(data.individuals.map(i => [i.id, i]))
  const parentsOf = new Map<string, Parents>()
  const spouseFamiliesOf = new Map<string, FamilyRecord[]>()
  const childrenOf = new Map<string, string[]>()

  for (const fam of data.families) {
    for (const childId of fam.childIds) {
      // First family wins: a pedigree shows one ancestral line.
      if (!parentsOf.has(childId)) {
        parentsOf.set(childId, { fatherId: fam.husbandId, motherId: fam.wifeId })
      }
    }

    for (const spouseId of [fam.husbandId, fam.wifeId]) {
      if (!spouseId) continue

      const families = spouseFamiliesOf.get(spouseId)
      if (families) families.push(fam)
      else spouseFamiliesOf.set(spouseId, [fam])

      const children = childrenOf.get(spouseId) ?? []
      for (const childId of fam.childIds) {
        if (!children.includes(childId)) children.push(childId)
      }
      childrenOf.set(spouseId, children)
    }
  }

  return { byId, parentsOf, spouseFamiliesOf, childrenOf }
}

export function getParents(index: TreeIndex, id: string): Parents {
  return index.parentsOf.get(id) ?? NO_PARENTS
}

export function getChildIds(index: TreeIndex, id: string): string[] {
  return index.childrenOf.get(id) ?? []
}

/** The other partner in each family this person is a spouse of, in family order, de-duplicated. */
export function getSpouseIds(index: TreeIndex, id: string): string[] {
  const spouseIds: string[] = []
  for (const fam of index.spouseFamiliesOf.get(id) ?? []) {
    const partnerId = fam.husbandId === id ? fam.wifeId : fam.husbandId
    if (partnerId && !spouseIds.includes(partnerId)) spouseIds.push(partnerId)
  }
  return spouseIds
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/tree-index.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tree-index.ts tests/tree-index.test.ts
git commit -m "feat: add tree index for pedigree lookups"
```

---

### Task 2: Pedigree layout — focus resolution and ancestor slots

**Files:**
- Create: `src/lib/pedigree-layout.ts`
- Test: `tests/pedigree-layout.test.ts`

**Interfaces:**
- Consumes: `TreeIndex`, `getParents` from Task 1.
- Produces: constants `NODE_W`, `NODE_H`, `COL_GAP`, `ROW_GAP`, `ROW`, `MARRIAGE_GAP`, `MAX_GEN`; `PersonCardData`; `resolveFocusId(index: TreeIndex, requested: string | null | undefined, fallback: string): string`; `buildPedigreeLayout(index: TreeIndex, focusId: string): { nodes: Node[]; edges: Edge[] }`. Every node has `type: 'personCard'` and `data: PersonCardData`.

Ahnentafel numbering: the focus person is slot 0 of generation 0; the person in slot `i` of generation `g` has their father at slot `2i` and mother at slot `2i + 1` of generation `g + 1`. Generation `g` therefore has `2^g` slots, and:

```
x(g)    = g × (NODE_W + COL_GAP)
y(g, i) = (i + 0.5) × ROW × 2^(MAX_GEN − g)     // centre
```

This task builds the focus card and its ancestors only. Spouse and children come in Task 3.

- [ ] **Step 1: Write the failing test**

Create `tests/pedigree-layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildTreeIndex } from '../src/lib/tree-index'
import {
  buildPedigreeLayout, resolveFocusId, NODE_W, NODE_H, COL_GAP, ROW, MAX_GEN,
} from '../src/lib/pedigree-layout'
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

function layout(data: FullTreeData, focusId: string) {
  return buildPedigreeLayout(buildTreeIndex(data), focusId)
}

/** Vertical centre of a card, from its top-left position. */
function centreY(nodes: ReturnType<typeof layout>['nodes'], id: string): number {
  return nodes.find(n => n.id === id)!.position.y + NODE_H / 2
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

describe('buildPedigreeLayout ancestors', () => {
  const threeGenerations: FullTreeData = {
    individuals: [
      person('I1'),
      person('FA'), person('MO', 'F'),
      person('FAFA'), person('FAMO', 'F'), person('MOFA'), person('MOMO', 'F'),
    ],
    families: [
      family('F1', 'FA', 'MO', ['I1']),
      family('F2', 'FAFA', 'FAMO', ['FA']),
      family('F3', 'MOFA', 'MOMO', ['MO']),
    ],
  }

  it('returns no nodes when the focus person is not in the index', () => {
    expect(layout({ individuals: [person('I1')], families: [] }, 'ghost').nodes).toEqual([])
  })

  it('renders the focus person as a personCard flagged isFocus', () => {
    const { nodes } = layout({ individuals: [person('I1')], families: [] }, 'I1')
    const focus = nodes.find(n => n.id === 'I1')!
    expect(focus.type).toBe('personCard')
    expect(focus.data.role).toBe('focus')
    expect(focus.data.isFocus).toBe(true)
  })

  it('places each ancestor generation in its own column to the right', () => {
    const { nodes } = layout(threeGenerations, 'I1')
    expect(nodes.find(n => n.id === 'I1')!.position.x).toBe(0)
    expect(nodes.find(n => n.id === 'FA')!.position.x).toBe(NODE_W + COL_GAP)
    expect(nodes.find(n => n.id === 'FAFA')!.position.x).toBe(2 * (NODE_W + COL_GAP))
  })

  it('places the father above the mother', () => {
    const { nodes } = layout(threeGenerations, 'I1')
    expect(centreY(nodes, 'FA')).toBeLessThan(centreY(nodes, 'MO'))
  })

  it('centres a person between the two slots their parents occupy', () => {
    const { nodes } = layout(threeGenerations, 'I1')
    expect(centreY(nodes, 'FA')).toBe((centreY(nodes, 'FAFA') + centreY(nodes, 'FAMO')) / 2)
    expect(centreY(nodes, 'I1')).toBe((centreY(nodes, 'FA') + centreY(nodes, 'MO')) / 2)
  })

  it('uses a fixed slot pitch in the deepest generation', () => {
    const { nodes } = layout(threeGenerations, 'I1')
    expect(centreY(nodes, 'FAMO') - centreY(nodes, 'FAFA')).toBe(ROW * 2 ** (MAX_GEN - 2))
  })

  it('leaves a missing ancestor as an empty slot without shifting their partner', () => {
    const withFather: FullTreeData = {
      individuals: [person('I1'), person('FA'), person('MO', 'F')],
      families: [family('F1', 'FA', 'MO', ['I1'])],
    }
    const withoutFather: FullTreeData = {
      individuals: [person('I1'), person('MO', 'F')],
      families: [family('F1', null, 'MO', ['I1'])],
    }
    expect(layout(withoutFather, 'I1').nodes.find(n => n.id === 'FA')).toBeUndefined()
    expect(centreY(layout(withoutFather, 'I1').nodes, 'MO'))
      .toBe(centreY(layout(withFather, 'I1').nodes, 'MO'))
  })

  it('stops at MAX_GEN and flags cards whose parents are off-screen', () => {
    const individuals = [person('I1')]
    const families: FamilyRecord[] = []
    // A single paternal line I1 <- G1 <- G2 <- G3 <- G4
    let childId = 'I1'
    for (let g = 1; g <= MAX_GEN + 1; g++) {
      const parentId = `G${g}`
      individuals.push(person(parentId))
      families.push(family(`F${g}`, parentId, null, [childId]))
      childId = parentId
    }
    const { nodes } = layout({ individuals, families }, 'I1')

    expect(nodes.find(n => n.id === `G${MAX_GEN}`)!.data.hasMore).toBe(true)
    expect(nodes.find(n => n.id === `G${MAX_GEN + 1}`)).toBeUndefined()
    expect(nodes.find(n => n.id === 'G1')!.data.hasMore).toBe(false)
  })

  it('draws one descendant-to-ancestor edge per known parent', () => {
    const { edges } = layout(threeGenerations, 'I1')
    const toFather = edges.find(e => e.source === 'I1' && e.target === 'FA')!
    expect(toFather.sourceHandle).toBe('right')
    expect(toFather.targetHandle).toBe('left')
    expect(edges.filter(e => e.source === 'I1')).toHaveLength(2)
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
    const { nodes } = layout(data, 'I1')
    expect(nodes.filter(n => n.id === 'SHARED')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/pedigree-layout.test.ts`
Expected: FAIL — cannot resolve `../src/lib/pedigree-layout`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/pedigree-layout.ts`:

```ts
import type { Node, Edge } from 'reactflow'
import type { Individual } from './queries'
import type { TreeIndex } from './tree-index'
import { getParents } from './tree-index'

export const NODE_W = 220
export const NODE_H = 72
export const COL_GAP = 80
export const ROW_GAP = 16
/** Vertical pitch of one slot in the deepest ancestor generation. */
export const ROW = NODE_H + ROW_GAP
export const MARRIAGE_GAP = 12
/** Ancestor generations drawn beyond the focus person. */
export const MAX_GEN = 3

export type CardRole = 'focus' | 'spouse' | 'ancestor' | 'child'

export interface PersonCardData {
  individual: Individual
  role: CardRole
  isFocus: boolean
  /** Card sits at MAX_GEN and has at least one parent that is not drawn. */
  hasMore: boolean
  /** Number of spouses the focus person has; only meaningful on the spouse card. */
  spouseCount: number
}

export function resolveFocusId(
  index: TreeIndex,
  requested: string | null | undefined,
  fallback: string,
): string {
  return requested && index.byId.has(requested) ? requested : fallback
}

function columnX(generation: number): number {
  return generation * (NODE_W + COL_GAP)
}

/** Centre of slot `slot` in generation `generation`. */
function slotCentreY(generation: number, slot: number): number {
  return (slot + 0.5) * ROW * 2 ** (MAX_GEN - generation)
}

function card(
  individual: Individual,
  x: number,
  centreY: number,
  data: Omit<PersonCardData, 'individual'>,
): Node<PersonCardData> {
  return {
    id: individual.id,
    type: 'personCard',
    position: { x, y: centreY - NODE_H / 2 },
    data: { individual, ...data },
  }
}

/**
 * Lays out the pedigree around `focusId`: the focus card, up to MAX_GEN
 * generations of ancestors in fixed Ahnentafel slots, and one edge from each
 * person to each of their drawn parents.
 */
export function buildPedigreeLayout(
  index: TreeIndex,
  focusId: string,
): { nodes: Node<PersonCardData>[]; edges: Edge[] } {
  const nodes: Node<PersonCardData>[] = []
  const edges: Edge[] = []

  const focus = index.byId.get(focusId)
  if (!focus) return { nodes, edges }

  // Breadth-first over ancestor slots. `placed` keeps a person who appears in
  // two slots (cousin marriage, pedigree collapse) from being drawn twice.
  const placed = new Set<string>()
  const queue: Array<{ id: string; generation: number; slot: number }> = [
    { id: focusId, generation: 0, slot: 0 },
  ]

  while (queue.length > 0) {
    const { id, generation, slot } = queue.shift()!
    const individual = index.byId.get(id)
    if (!individual || placed.has(id)) continue
    placed.add(id)

    const parents = getParents(index, id)
    const hasParents = Boolean(parents.fatherId || parents.motherId)

    nodes.push(
      card(individual, columnX(generation), slotCentreY(generation, slot), {
        role: generation === 0 ? 'focus' : 'ancestor',
        isFocus: generation === 0,
        hasMore: generation === MAX_GEN && hasParents,
        spouseCount: 0,
      }),
    )

    if (generation === MAX_GEN) continue

    const parentSlots = [
      { parentId: parents.fatherId, slot: slot * 2 },
      { parentId: parents.motherId, slot: slot * 2 + 1 },
    ]
    for (const { parentId, slot: parentSlot } of parentSlots) {
      if (!parentId || !index.byId.has(parentId) || placed.has(parentId)) continue
      edges.push({
        id: `e-${id}-${parentId}`,
        source: id,
        sourceHandle: 'right',
        target: parentId,
        targetHandle: 'left',
        type: 'smoothstep',
      })
      queue.push({ id: parentId, generation: generation + 1, slot: parentSlot })
    }
  }

  return { nodes, edges }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/pedigree-layout.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pedigree-layout.ts tests/pedigree-layout.test.ts
git commit -m "feat: add pedigree ancestor layout"
```

---

### Task 3: Pedigree layout — spouse and children columns

**Files:**
- Modify: `src/lib/pedigree-layout.ts`
- Test: `tests/pedigree-layout.test.ts`

**Interfaces:**
- Consumes: everything from Task 2, plus `getChildIds` and `getSpouseIds` from Task 1.
- Produces: no new exported names. `buildPedigreeLayout` additionally emits the spouse card (`role: 'spouse'`, `spouseCount` = total spouses), the children column (`role: 'child'`, at `x = −(NODE_W + COL_GAP)`), a straight marriage edge focus→spouse on the `bottom`/`top` handles, and one child→focus edge per child on the `right`/`left` handles.

Geometry added here:

```
spouseTop  = focusTop + NODE_H + MARRIAGE_GAP
coupleY    = focusCentreY + (hasSpouse ? (NODE_H + MARRIAGE_GAP) / 2 : 0)
childY(k)  = coupleY + (k − (n − 1) / 2) × ROW        // n children, k from 0
```

- [ ] **Step 1: Write the failing test**

First extend the import at the top of `tests/pedigree-layout.test.ts` — the new tests need `MARRIAGE_GAP`:

```ts
import {
  buildPedigreeLayout, resolveFocusId, NODE_W, NODE_H, COL_GAP, ROW, MARRIAGE_GAP, MAX_GEN,
} from '../src/lib/pedigree-layout'
```

Then append to the same file:

```ts
describe('buildPedigreeLayout spouse and children', () => {
  const couple: FullTreeData = {
    individuals: [person('I1'), person('SP', 'F'), person('C1'), person('C2', 'F')],
    families: [family('F1', 'I1', 'SP', ['C1', 'C2'])],
  }

  it('places the spouse directly below the focus person', () => {
    const { nodes } = layout(couple, 'I1')
    const spouse = nodes.find(n => n.id === 'SP')!
    const focus = nodes.find(n => n.id === 'I1')!
    expect(spouse.data.role).toBe('spouse')
    expect(spouse.position.x).toBe(focus.position.x)
    expect(spouse.position.y).toBe(focus.position.y + NODE_H + MARRIAGE_GAP)
  })

  it('joins the couple with a straight marriage edge', () => {
    const { edges } = layout(couple, 'I1')
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
    expect(nodes.find(n => n.id === 'SP')!.data.spouseCount).toBe(2)
    expect(nodes.find(n => n.id === 'SP2')).toBeUndefined()
  })

  it('puts children in a column to the left of the focus person', () => {
    const { nodes } = layout(couple, 'I1')
    const child = nodes.find(n => n.id === 'C1')!
    expect(child.data.role).toBe('child')
    expect(child.position.x).toBe(-(NODE_W + COL_GAP))
  })

  it('centres the children column on the couple', () => {
    const { nodes } = layout(couple, 'I1')
    const coupleY = centreY(nodes, 'I1') + (NODE_H + MARRIAGE_GAP) / 2
    expect((centreY(nodes, 'C1') + centreY(nodes, 'C2')) / 2).toBe(coupleY)
    expect(centreY(nodes, 'C2') - centreY(nodes, 'C1')).toBe(ROW)
  })

  it('centres the children on the focus person when there is no spouse', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('C1')],
      families: [family('F1', 'I1', null, ['C1'])],
    }
    const { nodes } = layout(data, 'I1')
    expect(centreY(nodes, 'C1')).toBe(centreY(nodes, 'I1'))
  })

  it('unions children across families and draws each one edge to the focus', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('SP', 'F'), person('SP2', 'F'), person('C1'), person('C2')],
      families: [family('F1', 'I1', 'SP', ['C1']), family('F2', 'I1', 'SP2', ['C2'])],
    }
    const { nodes, edges } = layout(data, 'I1')
    expect(nodes.filter(n => n.data.role === 'child').map(n => n.id)).toEqual(['C1', 'C2'])
    const childEdge = edges.find(e => e.source === 'C1' && e.target === 'I1')!
    expect(childEdge.sourceHandle).toBe('right')
    expect(childEdge.targetHandle).toBe('left')
  })

  it('skips a child whose individual record is missing from the index', () => {
    const data: FullTreeData = {
      individuals: [person('I1')],
      families: [family('F1', 'I1', null, ['GHOST'])],
    }
    const { nodes, edges } = layout(data, 'I1')
    expect(nodes.filter(n => n.data.role === 'child')).toHaveLength(0)
    expect(edges).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/pedigree-layout.test.ts`
Expected: FAIL — the spouse and child cards are not emitted yet.

- [ ] **Step 3: Write the implementation**

In `src/lib/pedigree-layout.ts`, extend the import from `./tree-index`:

```ts
import { getChildIds, getParents, getSpouseIds } from './tree-index'
```

Then, inside `buildPedigreeLayout`, replace the final `return { nodes, edges }` with:

```ts
  const focusCentreY = slotCentreY(0, 0)

  const spouseId = getSpouseIds(index, focusId)[0]
  const spouse = spouseId ? index.byId.get(spouseId) : undefined
  if (spouse && !placed.has(spouse.id)) {
    placed.add(spouse.id)
    nodes.push(
      card(spouse, columnX(0), focusCentreY + NODE_H + MARRIAGE_GAP, {
        role: 'spouse',
        isFocus: false,
        hasMore: false,
        spouseCount: getSpouseIds(index, focusId).length,
      }),
    )
    edges.push({
      id: `m-${focusId}-${spouse.id}`,
      source: focusId,
      sourceHandle: 'bottom',
      target: spouse.id,
      targetHandle: 'top',
      type: 'straight',
    })
  }

  const coupleCentreY = focusCentreY + (spouse ? (NODE_H + MARRIAGE_GAP) / 2 : 0)
  const childIds = getChildIds(index, focusId).filter(id => index.byId.has(id) && !placed.has(id))

  childIds.forEach((childId, k) => {
    const child = index.byId.get(childId)!
    placed.add(childId)
    nodes.push(
      card(child, columnX(-1), coupleCentreY + (k - (childIds.length - 1) / 2) * ROW, {
        role: 'child',
        isFocus: false,
        hasMore: false,
        spouseCount: 0,
      }),
    )
    edges.push({
      id: `e-${childId}-${focusId}`,
      source: childId,
      sourceHandle: 'right',
      target: focusId,
      targetHandle: 'left',
      type: 'smoothstep',
    })
  })

  return { nodes, edges }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/pedigree-layout.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pedigree-layout.ts tests/pedigree-layout.test.ts
git commit -m "feat: add spouse and children columns to pedigree layout"
```

---

### Task 4: Pedigree card component

**Files:**
- Rewrite: `src/components/person-node.tsx`

**Interfaces:**
- Consumes: `PersonCardData`, `NODE_W`, `NODE_H` from Task 2.
- Produces: default-exported memoised `PersonNode`, registered later as `nodeTypes.personCard`. Renders four handles with ids `left` (target), `right` (source), `top` (target), `bottom` (source). The detail button carries the `data-detail-button` attribute — Task 5 uses that attribute to distinguish "open details" from "re-root" inside a single node click handler, which keeps the layout function free of callbacks.

There are no component tests in this codebase and the vitest environment is `node`; this task is verified by `npm run build` and by looking at the page in Task 6.

- [ ] **Step 1: Write the implementation**

Replace the entire contents of `src/components/person-node.tsx`:

```tsx
'use client'

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import { NODE_H, NODE_W, type PersonCardData } from '@/lib/pedigree-layout'

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

function PersonNode({ data }: { data: PersonCardData }) {
  const { individual, role, isFocus, hasMore, spouseCount } = data

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
        {role === 'spouse' && spouseCount > 1 && (
          <p className="text-[10px] text-slate-400 leading-tight">+{spouseCount - 1} more</p>
        )}
      </div>

      <button
        type="button"
        data-detail-button
        aria-label={`View details for ${individual.fullName}`}
        className="flex-shrink-0 text-slate-400 hover:text-indigo-600 px-1 text-lg leading-none"
      >
        ›
      </button>

      {hasMore && (
        <span
          aria-hidden
          className="absolute -right-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg leading-none"
        >
          ›
        </span>
      )}

      <Handle type="source" id="right" position={Position.Right} style={HIDDEN_HANDLE} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={HIDDEN_HANDLE} />
    </div>
  )
}

export default memo(PersonNode)
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors reported for `src/components/person-node.tsx`. Errors in `src/components/full-tree.tsx` are expected at this point — it still imports the old node data shape and is deleted in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/person-node.tsx
git commit -m "feat: restyle person node as a pedigree card"
```

---

### Task 5: Wire up the pedigree page

**Files:**
- Create: `src/components/pedigree-tree.tsx`
- Modify: `src/app/tree/page.tsx`
- Delete: `src/components/full-tree.tsx`, `src/components/family-connector-node.tsx`, `src/lib/full-tree-layout.ts`, `tests/full-tree-layout.test.ts`
- Modify: `package.json` (drop `@dagrejs/dagre`)

**Interfaces:**
- Consumes: `buildTreeIndex` (Task 1); `buildPedigreeLayout`, `resolveFocusId`, `NODE_W`, `NODE_H`, `PersonCardData` (Tasks 2–3); `PersonNode` (Task 4); the existing `PersonPanel` and `/api/person/[id]`, both unchanged.
- Produces: `PedigreeTree`, default export, props `{ data: FullTreeData; defaultFocusId: string }`.

Read `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` (section "Shallow routing on the client") before writing the focus handling. `window.history.pushState` updates the URL and `useSearchParams` **without** a server round-trip; `router.push` would re-run the server component and reissue the 690-row `getFullTreeData()` query on every click, so it must not be used here.

- [ ] **Step 1: Write the client component**

Create `src/components/pedigree-tree.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { NODE_H, NODE_W, buildPedigreeLayout, resolveFocusId } from '@/lib/pedigree-layout'
import type { FullTreeData, Individual } from '@/lib/queries'

const nodeTypes = { personCard: PersonNode }

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

interface PedigreeTreeProps {
  data: FullTreeData
  defaultFocusId: string
}

function PedigreeTreeInner({ data, defaultFocusId }: PedigreeTreeProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [panelData, setPanelData] = useState<PanelData | null>(null)
  const { setCenter } = useReactFlow()

  const searchParams = useSearchParams()
  const index = useMemo(() => buildTreeIndex(data), [data])
  const focusId = resolveFocusId(index, searchParams.get('focus'), defaultFocusId)

  const layout = useMemo(() => buildPedigreeLayout(index, focusId), [index, focusId])

  useEffect(() => {
    setNodes(layout.nodes)
    setEdges(layout.edges)

    const focusNode = layout.nodes.find(n => n.id === focusId)
    if (focusNode) {
      setCenter(
        focusNode.position.x + NODE_W / 2,
        focusNode.position.y + NODE_H / 2,
        { zoom: 1, duration: 400 },
      )
    }
  }, [layout, focusId, setNodes, setEdges, setCenter])

  const setFocus = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('focus', id)
    // Shallow routing: updates useSearchParams without re-running the server component.
    window.history.pushState(null, '', `?${params.toString()}`)
  }, [searchParams])

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
      if ((event.target as HTMLElement).closest('[data-detail-button]')) {
        fetchPanel(node.id)
        return
      }
      if (node.id !== focusId) setFocus(node.id)
    },
    [focusId, fetchPanel, setFocus],
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
        onNavigate={(id) => {
          setPanelData(null)
          setFocus(id)
        }}
      />
    </div>
  )
}

export default function PedigreeTree(props: PedigreeTreeProps) {
  return (
    <ReactFlowProvider>
      <PedigreeTreeInner {...props} />
    </ReactFlowProvider>
  )
}
```

- [ ] **Step 2: Update the page**

Replace the contents of `src/app/tree/page.tsx`:

```tsx
import { Suspense } from 'react'
import { auth } from '@auth'
import { redirect } from 'next/navigation'
import { getFullTreeData } from '@/lib/queries'
import { signIndividual } from '@/lib/media'
import PedigreeTree from '@/components/pedigree-tree'
import type { Individual } from '@/lib/queries'

export default async function TreePage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  const defaultFocusId = process.env.DEFAULT_ROOT_PERSON_ID ?? ''
  if (!defaultFocusId) {
    return <div className="p-8 text-slate-500">Set DEFAULT_ROOT_PERSON_ID in .env.local</div>
  }

  const data = await getFullTreeData()
  const signedIndividuals = await Promise.all(data.individuals.map(i => signIndividual(i)))
  const signedData = {
    ...data,
    individuals: signedIndividuals.filter((i): i is Individual => i !== null),
  }

  return (
    <div className="w-full h-full">
      <Suspense fallback={<div className="p-8 text-slate-500">Loading tree…</div>}>
        <PedigreeTree data={signedData} defaultFocusId={defaultFocusId} />
      </Suspense>
    </div>
  )
}
```

`useSearchParams` requires a `Suspense` boundary above it; the page reads the focus id on the client only, so nothing else needs `searchParams`.

- [ ] **Step 3: Delete the superseded files and dependency**

```bash
git rm src/components/full-tree.tsx src/components/family-connector-node.tsx \
       src/lib/full-tree-layout.ts tests/full-tree-layout.test.ts
npm uninstall @dagrejs/dagre
```

- [ ] **Step 4: Verify nothing still references the deleted modules**

Run: `grep -rn "full-tree\|familyConnector\|dagre" src tests package.json`
Expected: no matches.

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test`
Expected: PASS — `tests/tree-index.test.ts`, `tests/pedigree-layout.test.ts`, `tests/gedcom-parser.test.ts`.

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: replace full tree with Ancestry-style pedigree view"
```

---

### Task 6: Manual verification and documentation

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Run the app and check the pedigree by hand**

Run: `npm run dev`, sign in, open `http://localhost:3000/tree`.

Confirm each of these:
1. The default root person is centred with their spouse below and children to the left.
2. Parents sit to the right, father above mother, then grandparents and great-grandparents.
3. Clicking any card re-roots the tree and the view eases to the new focus.
4. The URL becomes `/tree?focus=<id>`; browser back returns to the previous focus.
5. Clicking a card's `›` button opens the side panel with details and photos.
6. Clicking a relative inside the panel re-roots the tree onto them.
7. Great-grandparents who have parents show the outer `›` marker.
8. Visiting `/tree?focus=not-a-real-id` falls back to the default root rather than rendering empty.

- [ ] **Step 2: Update the architecture notes**

In `CLAUDE.md`, replace the paragraph beginning "**The tree loads whole, then lays out client-side.**" with:

```markdown
**The tree loads whole, then draws a slice.** `src/app/tree/page.tsx` fetches the entire graph with
`getFullTreeData()` (~690 individuals) server-side, signs photos, and hands it to the `PedigreeTree`
client component. `src/lib/tree-index.ts` builds parent/spouse/child lookup maps once;
`src/lib/pedigree-layout.ts` then draws only the cards around the current focus person — the focus
and spouse, their children to the left, and three ancestor generations to the right in fixed
Ahnentafel slots (person *n*'s father is *2n*, mother *2n+1*), so positions are arithmetic rather
than solved. Both modules are pure and unit-tested without a DOM. Re-rooting is client-side only:
it calls `window.history.pushState` to set `?focus=<id>`, because `router.push` would re-run the
server component and reissue the 690-row query on every click.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe pedigree layout in CLAUDE.md"
```
