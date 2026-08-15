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
