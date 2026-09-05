import { describe, it, expect } from 'vitest'
import { buildTreeIndex } from '../src/lib/tree-index'
import {
  defaultExpansion, resolveFocusId, toggleExpansion,
} from '../src/lib/family-layout'
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

/** I1 with a single paternal line G1 <- G2 <- G3 <- G4 and children C1 -> GC1 -> GGC1. */
function chain(): FullTreeData {
  return {
    individuals: [
      person('I1'), person('G1'), person('G2'), person('G3'), person('G4'),
      person('C1'), person('GC1'), person('GGC1'),
    ],
    families: [
      family('F1', 'G1', null, ['I1']),
      family('F2', 'G2', null, ['G1']),
      family('F3', 'G3', null, ['G2']),
      family('F4', 'G4', null, ['G3']),
      family('F5', 'I1', null, ['C1']),
      family('F6', 'C1', null, ['GC1']),
      family('F7', 'GC1', null, ['GGC1']),
    ],
  }
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

describe('defaultExpansion', () => {
  it('expands the focus, parents and grandparents upward so three generations are drawn', () => {
    const { up } = defaultExpansion(buildTreeIndex(chain()), 'I1')
    expect([...up].sort()).toEqual(['G1', 'G2', 'I1'])
  })

  it('expands the focus and their children downward so grandchildren are drawn', () => {
    const { down } = defaultExpansion(buildTreeIndex(chain()), 'I1')
    expect([...down].sort()).toEqual(['C1', 'I1'])
  })

  it('is empty for an unknown focus', () => {
    const expansion = defaultExpansion(buildTreeIndex(chain()), 'ghost')
    expect(expansion.up.size).toBe(0)
    expect(expansion.down.size).toBe(0)
  })
})

describe('toggleExpansion', () => {
  it('adds an absent id and removes a present one, without mutating the input', () => {
    const start = defaultExpansion(buildTreeIndex(chain()), 'I1')
    const opened = toggleExpansion(start, 'up', 'G3')
    expect(opened.up.has('G3')).toBe(true)
    expect(start.up.has('G3')).toBe(false)
    expect(opened.down).toBe(start.down)

    const closed = toggleExpansion(opened, 'up', 'G3')
    expect(closed.up.has('G3')).toBe(false)
  })
})
