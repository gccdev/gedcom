import type { Node, Edge } from 'reactflow'
import type { FullTreeData } from './queries'
import dagre from '@dagrejs/dagre'

export const NODE_W = 200
export const NODE_H = 80
const CONNECTOR_SIZE = 8

export function buildFullTreeLayout(
  data: FullTreeData,
  _rootPersonId: string,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 48, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const ind of data.individuals) {
    g.setNode(ind.id, { width: NODE_W, height: NODE_H })
  }

  for (const fam of data.families) {
    const connId = `conn-${fam.id}`
    g.setNode(connId, { width: CONNECTOR_SIZE, height: CONNECTOR_SIZE })
    if (fam.husbandId) g.setEdge(fam.husbandId, connId)
    if (fam.wifeId) g.setEdge(fam.wifeId, connId)
    for (const cid of fam.childIds) g.setEdge(connId, cid)
  }

  dagre.layout(g)

  const nodes: Node[] = []
  const edges: Edge[] = []

  for (const ind of data.individuals) {
    const pos = g.node(ind.id) as { x: number; y: number }
    nodes.push({
      id: ind.id,
      type: 'personNode',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { individual: ind },
    })
  }

  for (const fam of data.families) {
    const connId = `conn-${fam.id}`
    const pos = g.node(connId) as { x: number; y: number }
    nodes.push({
      id: connId,
      type: 'familyConnector',
      position: { x: pos.x - CONNECTOR_SIZE / 2, y: pos.y - CONNECTOR_SIZE / 2 },
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
