import type { Node, Edge } from 'reactflow'
import type { FullTreeData } from './queries'

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
      } else if (fam.wifeId) {
        // already placed elsewhere — advance cursor past her existing position
        x = Math.max(x, (personX.get(fam.wifeId) ?? x) + NODE_W + H_GAP)
      } else {
        x += H_GAP
      }

      const hx = fam.husbandId ? (personX.get(fam.husbandId) ?? 0) : null
      const wx = fam.wifeId ? (personX.get(fam.wifeId) ?? 0) : null
      const mid =
        hx !== null && wx !== null
          ? (hx + wx) / 2 + NODE_W / 2
          : (hx ?? wx ?? 0) + NODE_W / 2
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
