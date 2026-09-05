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
