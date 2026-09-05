import type { Node, Edge } from 'reactflow'
import type { Individual } from './queries'
import type { TreeIndex } from './tree-index'
import { getChildIds, getParents, getSiblingGroup, getSpouseIds } from './tree-index'

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
