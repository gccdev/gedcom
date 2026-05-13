import type { Node, Edge } from 'reactflow'
import type { Individual as QueryIndividual, HourglassData as QueryHourglassData } from './queries'

// Re-export types so tests can import from tree-layout
export type Individual = QueryIndividual
export type HourglassData = QueryHourglassData

const NODE_W = 200
const NODE_H = 80
const H_GAP = 48
const V_GAP = 120

function makeNode(individual: Individual, x: number, y: number): Node {
  return {
    id: individual.id,
    type: 'personNode',
    position: { x, y },
    data: { individual },
  }
}

function makeEdge(sourceId: string, targetId: string): Edge {
  return {
    id: `${sourceId}→${targetId}`,
    source: sourceId,
    target: targetId,
    type: 'smoothstep',
  }
}

export function buildHourglassLayout(data: HourglassData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Selected person at centre
  nodes.push(makeNode(data.individual, 0, 0))

  // Parents (generation +1, above)
  const parentY = -(NODE_H + V_GAP)
  const halfSlot = NODE_W / 2 + H_GAP / 2

  if (data.father) {
    nodes.push(makeNode(data.father, -halfSlot, parentY))
    edges.push(makeEdge(data.father.id, data.individual.id))
  }
  if (data.mother) {
    nodes.push(makeNode(data.mother, halfSlot, parentY))
    edges.push(makeEdge(data.mother.id, data.individual.id))
  }

  // Grandparents (generation +2, above parents)
  const grandY = -2 * (NODE_H + V_GAP)
  const grandSlots: Array<{ person: Individual | null; x: number; parentId: string | undefined }> = [
    { person: data.paternalGrandfather, x: -(NODE_W * 1.5 + H_GAP * 1.5), parentId: data.father?.id },
    { person: data.paternalGrandmother, x: -(NODE_W * 0.5 + H_GAP * 0.5), parentId: data.father?.id },
    { person: data.maternalGrandfather, x:  NODE_W * 0.5 + H_GAP * 0.5,  parentId: data.mother?.id },
    { person: data.maternalGrandmother, x:  NODE_W * 1.5 + H_GAP * 1.5,  parentId: data.mother?.id },
  ]
  for (const slot of grandSlots) {
    if (!slot.person) continue
    nodes.push(makeNode(slot.person, slot.x, grandY))
    if (slot.parentId) edges.push(makeEdge(slot.person.id, slot.parentId))
  }

  // Children (generation -1, below)
  const childY = NODE_H + V_GAP
  const totalChildW = data.children.length * NODE_W + (data.children.length - 1) * H_GAP
  const childStartX = -totalChildW / 2
  data.children.forEach((child, i) => {
    const x = childStartX + i * (NODE_W + H_GAP)
    nodes.push(makeNode(child, x, childY))
    edges.push(makeEdge(data.individual.id, child.id))
  })

  return { nodes, edges }
}
