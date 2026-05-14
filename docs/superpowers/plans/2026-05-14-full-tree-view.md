# Full Tree View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hourglass tree with a full panned/zoomable tree that loads all 690 people at startup, using a family-unit layout (spouses side-by-side, connector dot, children below).

**Architecture:** A new DB query fetches all individuals and family records in three SQL queries. A new layout algorithm assigns each person a generation via BFS from root, then places families left-to-right per generation with a small connector node between each couple. The existing `PersonNode` and `PersonPanel` components are reused unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, React Flow 11, Vitest, Neon Postgres, TypeScript

---

## File Map

| File | Action |
|------|--------|
| `src/lib/queries.ts` | Add `FamilyRecord`, `FullTreeData` types and `getFullTreeData()` |
| `src/lib/full-tree-layout.ts` | **New** — layout algorithm |
| `src/components/family-connector-node.tsx` | **New** — small dot node for family junctions |
| `src/components/full-tree.tsx` | **New** — ReactFlow wrapper replacing hourglass-tree.tsx |
| `src/app/tree/page.tsx` | Update to use new query + FullTree component |
| `tests/full-tree-layout.test.ts` | **New** — unit tests for layout algorithm |
| `src/components/hourglass-tree.tsx` | **Deleted** |
| `src/lib/tree-layout.ts` | **Deleted** |
| `tests/tree-layout.test.ts` | **Deleted** |
| `src/app/api/tree/[id]/route.ts` | **Deleted** |

---

## Task 1: Add types and DB query to queries.ts

**Files:**
- Modify: `src/lib/queries.ts`

- [ ] **Step 1: Add the new types and query function**

Open `src/lib/queries.ts`. After the existing `export interface PersonDetail { ... }` block (around line 44), add:

```typescript
export interface FamilyRecord {
  id: string
  husbandId: string | null
  wifeId: string | null
  childIds: string[]
}

export interface FullTreeData {
  individuals: Individual[]
  families: FamilyRecord[]
}
```

Then append the following function at the end of the file (after `searchIndividuals`):

```typescript
export async function getFullTreeData(): Promise<FullTreeData> {
  const [individualRows, familyRows, memberRows] = await Promise.all([
    sql`
      SELECT i.id, i.full_name, i.sex, i.birth_date, i.birth_place,
             i.death_date, i.death_place,
             (SELECT m.blob_url FROM media m
              WHERE m.individual_id = i.id AND m.media_type = 'photo' LIMIT 1) AS photo_blob_url
      FROM individuals i
    `,
    sql`SELECT id, husband_id, wife_id FROM families`,
    sql`SELECT family_id, individual_id FROM family_members WHERE role = 'child'`,
  ])

  const childIds = new Map<string, string[]>()
  for (const r of memberRows) {
    const row = r as Row
    const famId = row.family_id as string
    const indId = row.individual_id as string
    childIds.set(famId, [...(childIds.get(famId) ?? []), indId])
  }

  return {
    individuals: individualRows.map(r => rowToIndividual(r as Row)),
    families: familyRows.map(r => {
      const row = r as Row
      return {
        id: row.id as string,
        husbandId: row.husband_id as string | null,
        wifeId: row.wife_id as string | null,
        childIds: childIds.get(row.id as string) ?? [],
      }
    }),
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to the new types or function.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat: add getFullTreeData query and FullTreeData types"
```

---

## Task 2: Layout algorithm (TDD)

**Files:**
- Create: `tests/full-tree-layout.test.ts`
- Create: `src/lib/full-tree-layout.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/full-tree-layout.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildFullTreeLayout } from '../src/lib/full-tree-layout'
import type { FullTreeData, FamilyRecord, Individual } from '../src/lib/queries'

function person(id: string, sex: 'M' | 'F' = 'M'): Individual {
  return { id, fullName: `Person ${id}`, sex, birthDate: null, birthPlace: null, deathDate: null, deathPlace: null, photoBlobUrl: null }
}

function family(id: string, husbandId: string | null, wifeId: string | null, childIds: string[]): FamilyRecord {
  return { id, husbandId, wifeId, childIds }
}

describe('buildFullTreeLayout', () => {
  it('places root person at generation 0 (y = 0)', () => {
    const data: FullTreeData = { individuals: [person('I1')], families: [] }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I1')!.position.y).toBe(0)
  })

  it('places parents above root (negative y)', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2'), person('I3', 'F')],
      families: [family('F1', 'I2', 'I3', ['I1'])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I2')!.position.y).toBeLessThan(0)
    expect(nodes.find(n => n.id === 'I3')!.position.y).toBeLessThan(0)
  })

  it('places children below root (positive y)', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3')],
      families: [family('F1', 'I1', 'I2', ['I3'])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I3')!.position.y).toBeGreaterThan(0)
  })

  it('assigns spouses the same y as their partner', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F')],
      families: [family('F1', 'I1', 'I2', [])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I1')!.position.y).toBe(nodes.find(n => n.id === 'I2')!.position.y)
  })

  it('places spouses at different x positions', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F')],
      families: [family('F1', 'I1', 'I2', [])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I1')!.position.x).not.toBe(nodes.find(n => n.id === 'I2')!.position.x)
  })

  it('creates one familyConnector node per family', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3'), person('I4', 'F')],
      families: [family('F1', 'I1', 'I2', []), family('F2', 'I3', 'I4', [])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.filter(n => n.type === 'familyConnector')).toHaveLength(2)
  })

  it('creates edges from both parents to the connector', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3')],
      families: [family('F1', 'I1', 'I2', ['I3'])],
    }
    const { nodes, edges } = buildFullTreeLayout(data, 'I1')
    const conn = nodes.find(n => n.type === 'familyConnector')!
    expect(edges.some(e => e.source === 'I1' && e.target === conn.id)).toBe(true)
    expect(edges.some(e => e.source === 'I2' && e.target === conn.id)).toBe(true)
  })

  it('creates edges from connector to each child', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3'), person('I4')],
      families: [family('F1', 'I1', 'I2', ['I3', 'I4'])],
    }
    const { nodes, edges } = buildFullTreeLayout(data, 'I1')
    const conn = nodes.find(n => n.type === 'familyConnector')!
    expect(edges.some(e => e.source === conn.id && e.target === 'I3')).toBe(true)
    expect(edges.some(e => e.source === conn.id && e.target === 'I4')).toBe(true)
  })

  it('handles single-parent family (husband only)', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2')],
      families: [family('F1', 'I1', null, ['I2'])],
    }
    const { nodes, edges } = buildFullTreeLayout(data, 'I1')
    const conn = nodes.find(n => n.type === 'familyConnector')!
    expect(conn).toBeDefined()
    expect(edges.some(e => e.source === 'I1' && e.target === conn.id)).toBe(true)
    expect(edges.some(e => e.source === conn.id && e.target === 'I2')).toBe(true)
  })

  it('assigns all individuals personNode type', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F')],
      families: [family('F1', 'I1', 'I2', [])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    const personNodes = nodes.filter(n => n.type === 'personNode')
    expect(personNodes).toHaveLength(2)
  })

  it('places unreachable individuals at y = 0', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I999')],
      families: [],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I999')!.position.y).toBe(0)
  })

  it('grandparents are higher (more negative y) than parents', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2'), person('I3', 'F'), person('I4'), person('I5', 'F')],
      families: [
        family('F1', 'I4', 'I5', ['I2']),
        family('F2', 'I2', 'I3', ['I1']),
      ],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    const parent = nodes.find(n => n.id === 'I2')!
    const grandparent = nodes.find(n => n.id === 'I4')!
    expect(grandparent.position.y).toBeLessThan(parent.position.y)
  })
})
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
npm test tests/full-tree-layout.test.ts
```

Expected: all 11 tests fail with "Cannot find module" or similar.

- [ ] **Step 3: Implement the layout algorithm**

Create `src/lib/full-tree-layout.ts`:

```typescript
import type { Node, Edge } from 'reactflow'
import type { FullTreeData, Individual } from './queries'

export const NODE_W = 200
export const NODE_H = 80
const H_GAP = 48
const COUPLE_GAP = 16
const V_GAP = 120

export function buildFullTreeLayout(
  data: FullTreeData,
  rootPersonId: string,
): { nodes: Node[]; edges: Edge[] } {
  const familyMap = new Map(data.families.map(f => [f.id, f]))

  // personId → family IDs they appear in as spouse
  const spouseFamilyIds = new Map<string, string[]>()
  // personId → family ID they appear in as child (first match only)
  const childFamilyId = new Map<string, string>()

  for (const fam of data.families) {
    if (fam.husbandId) {
      spouseFamilyIds.set(fam.husbandId, [...(spouseFamilyIds.get(fam.husbandId) ?? []), fam.id])
    }
    if (fam.wifeId) {
      spouseFamilyIds.set(fam.wifeId, [...(spouseFamilyIds.get(fam.wifeId) ?? []), fam.id])
    }
    for (const cid of fam.childIds) {
      if (!childFamilyId.has(cid)) childFamilyId.set(cid, fam.id)
    }
  }

  // BFS generation assignment from root
  const gen = new Map<string, number>([[rootPersonId, 0]])
  const queue: string[] = [rootPersonId]

  while (queue.length > 0) {
    const pid = queue.shift()!
    const g = gen.get(pid)!

    // Parents get gen - 1
    const pFamId = childFamilyId.get(pid)
    if (pFamId) {
      const pFam = familyMap.get(pFamId)!
      for (const parentId of [pFam.husbandId, pFam.wifeId]) {
        if (parentId && !gen.has(parentId)) {
          gen.set(parentId, g - 1)
          queue.push(parentId)
        }
      }
    }

    // Spouse families: spouse gets same gen, children get gen + 1
    for (const famId of (spouseFamilyIds.get(pid) ?? [])) {
      const fam = familyMap.get(famId)!
      const spouseId = fam.husbandId === pid ? fam.wifeId : fam.husbandId
      if (spouseId && !gen.has(spouseId)) {
        gen.set(spouseId, g)
        queue.push(spouseId)
      }
      for (const cid of fam.childIds) {
        if (!gen.has(cid)) {
          gen.set(cid, g + 1)
          queue.push(cid)
        }
      }
    }
  }

  // Unreachable people default to gen 0
  for (const ind of data.individuals) {
    if (!gen.has(ind.id)) gen.set(ind.id, 0)
  }

  // Family generation = generation of husband (or wife if no husband)
  const famGen = new Map<string, number>()
  for (const fam of data.families) {
    const refId = fam.husbandId ?? fam.wifeId
    famGen.set(fam.id, refId ? (gen.get(refId) ?? 0) : 0)
  }

  // Assign X positions: sequential within each generation, families first
  const personX = new Map<string, number>()
  const connX = new Map<string, number>()
  const placed = new Set<string>()
  const cursor = new Map<number, number>()

  const allGens = [...new Set(gen.values())].sort((a, b) => a - b)
  for (const g of allGens) cursor.set(g, 0)

  for (const g of allGens) {
    const famsHere = data.families.filter(f => famGen.get(f.id) === g)

    for (const fam of famsHere) {
      let x = cursor.get(g)!

      if (fam.husbandId && !placed.has(fam.husbandId)) {
        personX.set(fam.husbandId, x)
        placed.add(fam.husbandId)
        x += NODE_W + COUPLE_GAP
      }
      if (fam.wifeId && !placed.has(fam.wifeId)) {
        personX.set(fam.wifeId, x)
        placed.add(fam.wifeId)
        x += NODE_W + H_GAP
      } else if (!fam.wifeId) {
        x += H_GAP
      }

      const hx = fam.husbandId ? (personX.get(fam.husbandId) ?? 0) : null
      const wx = fam.wifeId ? (personX.get(fam.wifeId) ?? 0) : null
      const mid =
        hx !== null && wx !== null
          ? hx + NODE_W + COUPLE_GAP / 2 - 4
          : (hx ?? wx ?? 0) + NODE_W / 2 - 4
      connX.set(fam.id, mid)

      cursor.set(g, x)
    }

    // Individuals with no spouse family at this generation
    for (const ind of data.individuals) {
      if (gen.get(ind.id) === g && !placed.has(ind.id)) {
        personX.set(ind.id, cursor.get(g)!)
        placed.add(ind.id)
        cursor.set(g, cursor.get(g)! + NODE_W + H_GAP)
      }
    }
  }

  // Build React Flow nodes and edges
  const nodes: Node[] = []
  const edges: Edge[] = []

  for (const ind of data.individuals) {
    const g = gen.get(ind.id) ?? 0
    nodes.push({
      id: ind.id,
      type: 'personNode',
      position: { x: personX.get(ind.id) ?? 0, y: g * (NODE_H + V_GAP) },
      data: { individual: ind },
    })
  }

  for (const fam of data.families) {
    const g = famGen.get(fam.id) ?? 0
    const cx = connX.get(fam.id) ?? 0
    const cy = g * (NODE_H + V_GAP) + NODE_H + V_GAP / 2
    const connId = `conn-${fam.id}`

    nodes.push({
      id: connId,
      type: 'familyConnector',
      position: { x: cx, y: cy },
      data: {},
    })

    if (fam.husbandId) {
      edges.push({ id: `e-${fam.husbandId}-${connId}`, source: fam.husbandId, target: connId, type: 'straight' })
    }
    if (fam.wifeId) {
      edges.push({ id: `e-${fam.wifeId}-${connId}`, source: fam.wifeId, target: connId, type: 'straight' })
    }
    for (const cid of fam.childIds) {
      edges.push({ id: `e-${connId}-${cid}`, source: connId, target: cid, type: 'smoothstep' })
    }
  }

  return { nodes, edges }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/full-tree-layout.test.ts
```

Expected: 11/11 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/full-tree-layout.ts tests/full-tree-layout.test.ts
git commit -m "feat: add full tree layout algorithm with family connector nodes"
```

---

## Task 3: FamilyConnector node component

**Files:**
- Create: `src/components/family-connector-node.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/family-connector-node.tsx`:

```typescript
'use client'

import { memo } from 'react'
import { Handle, Position } from 'reactflow'

function FamilyConnectorNode() {
  return (
    <div style={{ width: 8, height: 8, position: 'relative' }}>
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, width: 0, height: 0, minWidth: 0, minHeight: 0, border: 'none' }}
      />
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#94a3b8',
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, width: 0, height: 0, minWidth: 0, minHeight: 0, border: 'none' }}
      />
    </div>
  )
}

export default memo(FamilyConnectorNode)
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/family-connector-node.tsx
git commit -m "feat: add FamilyConnectorNode component for family junction dots"
```

---

## Task 4: FullTree component

**Files:**
- Create: `src/components/full-tree.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/full-tree.tsx`:

```typescript
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow'
import type { NodeMouseHandler } from 'reactflow'
import 'reactflow/dist/style.css'
import PersonNode from './person-node'
import FamilyConnectorNode from './family-connector-node'
import PersonPanel from './person-panel'
import { buildFullTreeLayout, NODE_W, NODE_H } from '@/lib/full-tree-layout'
import type { FullTreeData, Individual } from '@/lib/queries'

const nodeTypes = {
  personNode: PersonNode,
  familyConnector: FamilyConnectorNode,
}

interface PanelData {
  individual: Individual
  father: Individual | null
  mother: Individual | null
  spouses: Individual[]
  children: Individual[]
  media: Array<{ id: number; blobUrl: string; mediaType: string; title: string | null }>
}

interface FullTreeProps {
  data: FullTreeData
  rootPersonId: string
}

function FullTreeInner({ data, rootPersonId }: FullTreeProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [panelData, setPanelData] = useState<PanelData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { setCenter } = useReactFlow()
  const initialised = useRef(false)

  useEffect(() => {
    const { nodes: n, edges: e } = buildFullTreeLayout(data, rootPersonId)
    setNodes(n)
    setEdges(e)

    if (!initialised.current) {
      initialised.current = true
      const rootNode = n.find(nd => nd.id === rootPersonId)
      if (rootNode) {
        setTimeout(() => {
          setCenter(
            rootNode.position.x + NODE_W / 2,
            rootNode.position.y + NODE_H / 2,
            { zoom: 1.2, duration: 0 },
          )
        }, 50)
      }
    }
  }, [data, rootPersonId])

  const nodesWithSelection = useMemo(
    () => nodes.map(n => ({ ...n, data: { ...n.data, isSelected: n.id === selectedId } })),
    [nodes, selectedId],
  )

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
    setSelectedId(id)
  }, [])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_evt, node) => {
      if (node.type === 'familyConnector') return
      fetchPanel(node.id)
    },
    [fetchPanel],
  )

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        minZoom={0.05}
        maxZoom={2}
        nodesDraggable={false}
      >
        <Background />
        <Controls />
      </ReactFlow>

      <PersonPanel
        data={panelData}
        onClose={() => { setPanelData(null); setSelectedId(null) }}
        onNavigate={(id) => {
          setPanelData(null)
          setSelectedId(null)
          fetchPanel(id)
        }}
      />
    </div>
  )
}

export default function FullTree(props: FullTreeProps) {
  return (
    <ReactFlowProvider>
      <FullTreeInner {...props} />
    </ReactFlowProvider>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/full-tree.tsx src/components/family-connector-node.tsx
git commit -m "feat: add FullTree component with family-unit layout"
```

---

## Task 5: Update tree page

**Files:**
- Modify: `src/app/tree/page.tsx`

- [ ] **Step 1: Replace the page entirely**

Overwrite `src/app/tree/page.tsx` with:

```typescript
import { auth } from '@auth'
import { redirect } from 'next/navigation'
import { getFullTreeData } from '@/lib/queries'
import { signIndividual } from '@/lib/media'
import FullTree from '@/components/full-tree'
import type { Individual } from '@/lib/queries'

export default async function TreePage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  const personId = process.env.DEFAULT_ROOT_PERSON_ID ?? ''
  if (!personId) {
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
      <FullTree data={signedData} rootPersonId={personId} />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/tree/page.tsx
git commit -m "feat: update tree page to load full tree at startup"
```

---

## Task 6: Delete obsolete files

**Files:**
- Delete: `src/components/hourglass-tree.tsx`
- Delete: `src/lib/tree-layout.ts`
- Delete: `tests/tree-layout.test.ts`
- Delete: `src/app/api/tree/[id]/route.ts`

- [ ] **Step 1: Delete the files**

```bash
git rm src/components/hourglass-tree.tsx \
       src/lib/tree-layout.ts \
       tests/tree-layout.test.ts \
       src/app/api/tree/[id]/route.ts
```

- [ ] **Step 2: Verify nothing imports the deleted files**

```bash
grep -r "hourglass-tree\|tree-layout\|/api/tree/" src/ --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 3: Verify TypeScript and tests still pass**

```bash
npx tsc --noEmit && npm test
```

Expected: no TypeScript errors, all remaining tests pass (full-tree-layout tests).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove hourglass tree, old layout, and tree/[id] API route"
```

---

## Task 7: End-to-end verification

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

Expected: server starts on http://localhost:3000 with no build errors.

- [ ] **Step 2: Open the tree page and verify**

Navigate to http://localhost:3000/tree (log in if prompted).

Check:
- The full tree renders with all people visible (690 person cards)
- The viewport starts centred on the root person at roughly 1.2× zoom
- Panning and zooming work
- Connector dots are visible between spouse pairs
- Clicking a person card opens the PersonPanel slide-in
- Clicking a connector dot does nothing
- Search still works at /search

- [ ] **Step 3: Run the full test suite one final time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Final commit and push**

```bash
git push
```
