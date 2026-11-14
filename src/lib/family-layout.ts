import type { Node, Edge } from 'reactflow'
import type { Individual } from './queries'
import type { TreeIndex } from './tree-index'
import { getChildIds, getParents, getSiblingGroup, getSpouseIds } from './tree-index'

export const NODE_W = 264
export const NODE_H = 136
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

/** Every ancestor of `focusId` expanded upward, on top of what is already open. */
export function expandAllAncestors(index: TreeIndex, focusId: string, expansion: Expansion): Expansion {
  const up = new Set(expansion.up)
  const seen = new Set<string>()
  const queue = index.byId.has(focusId) ? [focusId] : []
  while (queue.length > 0) {
    const id = queue.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    const parents = drawableParents(index, id)
    if (parents.length > 0) up.add(id)
    queue.push(...parents)
  }
  return { ...expansion, up }
}

/** Every descendant of `focusId` expanded downward, on top of what is already open. */
export function expandAllDescendants(index: TreeIndex, focusId: string, expansion: Expansion): Expansion {
  const down = new Set(expansion.down)
  const seen = new Set<string>()
  const queue = index.byId.has(focusId) ? [focusId] : []
  while (queue.length > 0) {
    const id = queue.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    down.add(id)
    queue.push(...drawableChildren(index, id))
  }
  return { ...expansion, down }
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
  /** Parents button shown. */
  canExpandUp: boolean
  expandedUp: boolean
  /** Children button shown. */
  canExpandDown: boolean
  expandedDown: boolean
  /** Children this person has in the tree, for the button label. */
  childCount: number
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
      childCount: drawableChildren(b.index, id).length,
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
