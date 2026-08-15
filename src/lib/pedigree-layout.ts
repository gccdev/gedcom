import type { Node, Edge } from 'reactflow'
import type { Individual } from './queries'
import type { TreeIndex } from './tree-index'
import { getChildIds, getParents, getSpouseIds } from './tree-index'

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
}
