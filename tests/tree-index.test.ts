import { describe, it, expect } from 'vitest'
import { buildTreeIndex, getParents, getChildIds, getSpouseIds, getSiblingGroup } from '../src/lib/tree-index'
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

describe('buildTreeIndex', () => {
  it('indexes individuals by id', () => {
    const data: FullTreeData = { individuals: [person('I1')], families: [] }
    expect(buildTreeIndex(data).byId.get('I1')!.fullName).toBe('Person I1')
  })

  it('maps a child to its father and mother', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2'), person('I3', 'F')],
      families: [family('F1', 'I2', 'I3', ['I1'])],
    }
    const index = buildTreeIndex(data)
    expect(getParents(index, 'I1')).toEqual({ fatherId: 'I2', motherId: 'I3' })
  })

  it('keeps the first family when a person is a child in two families', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2'), person('I9')],
      families: [family('F1', 'I2', null, ['I1']), family('F2', 'I9', null, ['I1'])],
    }
    expect(getParents(buildTreeIndex(data), 'I1').fatherId).toBe('I2')
  })

  it('unions children across every spouse family', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3', 'F'), person('I4'), person('I5')],
      families: [family('F1', 'I1', 'I2', ['I4']), family('F2', 'I1', 'I3', ['I5'])],
    }
    expect(getChildIds(buildTreeIndex(data), 'I1')).toEqual(['I4', 'I5'])
  })

  it('de-duplicates a child recorded in two of the same person\'s families', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I4')],
      families: [family('F1', 'I1', 'I2', ['I4']), family('F2', 'I1', null, ['I4'])],
    }
    expect(getChildIds(buildTreeIndex(data), 'I1')).toEqual(['I4'])
  })

  it('lists spouses in family order without repeats', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3', 'F')],
      families: [family('F1', 'I1', 'I2', []), family('F2', 'I1', 'I3', []), family('F3', 'I1', 'I2', [])],
    }
    expect(getSpouseIds(buildTreeIndex(data), 'I1')).toEqual(['I2', 'I3'])
  })

  it('returns empty results for a person with no family records', () => {
    const index = buildTreeIndex({ individuals: [person('I1')], families: [] })
    expect(getParents(index, 'I1')).toEqual({ fatherId: null, motherId: null })
    expect(getChildIds(index, 'I1')).toEqual([])
    expect(getSpouseIds(index, 'I1')).toEqual([])
  })
})

describe('getSiblingGroup', () => {
  it('returns the child ids of the family the person is a child of, in order, including them', () => {
    const data: FullTreeData = {
      individuals: [person('FA'), person('MO', 'F'), person('S1'), person('I1'), person('S2', 'F')],
      families: [family('F1', 'FA', 'MO', ['S1', 'I1', 'S2'])],
    }
    expect(getSiblingGroup(buildTreeIndex(data), 'I1')).toEqual(['S1', 'I1', 'S2'])
  })

  it('returns just the person when they are a child of no family', () => {
    const data: FullTreeData = { individuals: [person('I1')], families: [] }
    expect(getSiblingGroup(buildTreeIndex(data), 'I1')).toEqual(['I1'])
  })

  it('uses the first family when a person is a child in more than one', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('A'), person('B')],
      families: [family('F1', 'A', null, ['I1']), family('F2', 'B', null, ['X', 'I1'])],
    }
    expect(getSiblingGroup(buildTreeIndex(data), 'I1')).toEqual(['I1'])
  })
})
