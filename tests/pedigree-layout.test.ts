import { describe, it, expect } from 'vitest'
import { buildTreeIndex } from '../src/lib/tree-index'
import {
  buildPedigreeLayout, resolveFocusId, NODE_W, NODE_H, COL_GAP, ROW, MARRIAGE_GAP, MAX_GEN,
} from '../src/lib/pedigree-layout'
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

function layout(data: FullTreeData, focusId: string) {
  return buildPedigreeLayout(buildTreeIndex(data), focusId)
}

/** Vertical centre of a card, from its top-left position. */
function centreY(nodes: ReturnType<typeof layout>['nodes'], id: string): number {
  return nodes.find(n => n.id === id)!.position.y + NODE_H / 2
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

describe('buildPedigreeLayout ancestors', () => {
  const threeGenerations: FullTreeData = {
    individuals: [
      person('I1'),
      person('FA'), person('MO', 'F'),
      person('FAFA'), person('FAMO', 'F'), person('MOFA'), person('MOMO', 'F'),
    ],
    families: [
      family('F1', 'FA', 'MO', ['I1']),
      family('F2', 'FAFA', 'FAMO', ['FA']),
      family('F3', 'MOFA', 'MOMO', ['MO']),
    ],
  }

  it('returns no nodes when the focus person is not in the index', () => {
    expect(layout({ individuals: [person('I1')], families: [] }, 'ghost').nodes).toEqual([])
  })

  it('renders the focus person as a personCard flagged isFocus', () => {
    const { nodes } = layout({ individuals: [person('I1')], families: [] }, 'I1')
    const focus = nodes.find(n => n.id === 'I1')!
    expect(focus.type).toBe('personCard')
    expect(focus.data.role).toBe('focus')
    expect(focus.data.isFocus).toBe(true)
  })

  it('places each ancestor generation in its own column to the right', () => {
    const { nodes } = layout(threeGenerations, 'I1')
    expect(nodes.find(n => n.id === 'I1')!.position.x).toBe(0)
    expect(nodes.find(n => n.id === 'FA')!.position.x).toBe(NODE_W + COL_GAP)
    expect(nodes.find(n => n.id === 'FAFA')!.position.x).toBe(2 * (NODE_W + COL_GAP))
  })

  it('places the father above the mother', () => {
    const { nodes } = layout(threeGenerations, 'I1')
    expect(centreY(nodes, 'FA')).toBeLessThan(centreY(nodes, 'MO'))
  })

  it('centres a person between the two slots their parents occupy', () => {
    const { nodes } = layout(threeGenerations, 'I1')
    expect(centreY(nodes, 'FA')).toBe((centreY(nodes, 'FAFA') + centreY(nodes, 'FAMO')) / 2)
    expect(centreY(nodes, 'I1')).toBe((centreY(nodes, 'FA') + centreY(nodes, 'MO')) / 2)
  })

  it('uses a fixed slot pitch in the deepest generation', () => {
    const { nodes } = layout(threeGenerations, 'I1')
    expect(centreY(nodes, 'FAMO') - centreY(nodes, 'FAFA')).toBe(ROW * 2 ** (MAX_GEN - 2))
  })

  it('leaves a missing ancestor as an empty slot without shifting their partner', () => {
    const withFather: FullTreeData = {
      individuals: [person('I1'), person('FA'), person('MO', 'F')],
      families: [family('F1', 'FA', 'MO', ['I1'])],
    }
    const withoutFather: FullTreeData = {
      individuals: [person('I1'), person('MO', 'F')],
      families: [family('F1', null, 'MO', ['I1'])],
    }
    expect(layout(withoutFather, 'I1').nodes.find(n => n.id === 'FA')).toBeUndefined()
    expect(centreY(layout(withoutFather, 'I1').nodes, 'MO'))
      .toBe(centreY(layout(withFather, 'I1').nodes, 'MO'))
  })

  it('stops at MAX_GEN and flags cards whose parents are off-screen', () => {
    const individuals = [person('I1')]
    const families: FamilyRecord[] = []
    // A single paternal line I1 <- G1 <- G2 <- G3 <- G4
    let childId = 'I1'
    for (let g = 1; g <= MAX_GEN + 1; g++) {
      const parentId = `G${g}`
      individuals.push(person(parentId))
      families.push(family(`F${g}`, parentId, null, [childId]))
      childId = parentId
    }
    const { nodes } = layout({ individuals, families }, 'I1')

    expect(nodes.find(n => n.id === `G${MAX_GEN}`)!.data.hasMore).toBe(true)
    expect(nodes.find(n => n.id === `G${MAX_GEN + 1}`)).toBeUndefined()
    expect(nodes.find(n => n.id === 'G1')!.data.hasMore).toBe(false)
  })

  it('draws one descendant-to-ancestor edge per known parent', () => {
    const { edges } = layout(threeGenerations, 'I1')
    const toFather = edges.find(e => e.source === 'I1' && e.target === 'FA')!
    expect(toFather.sourceHandle).toBe('right')
    expect(toFather.targetHandle).toBe('left')
    expect(edges.filter(e => e.source === 'I1')).toHaveLength(2)
  })

  it('places a person who appears twice in the pedigree only once', () => {
    // Cousin marriage: I1's father and mother share a father.
    const data: FullTreeData = {
      individuals: [person('I1'), person('FA'), person('MO', 'F'), person('SHARED')],
      families: [
        family('F1', 'FA', 'MO', ['I1']),
        family('F2', 'SHARED', null, ['FA']),
        family('F3', 'SHARED', null, ['MO']),
      ],
    }
    const { nodes } = layout(data, 'I1')
    expect(nodes.filter(n => n.id === 'SHARED')).toHaveLength(1)
  })
})

describe('buildPedigreeLayout spouse and children', () => {
  const couple: FullTreeData = {
    individuals: [person('I1'), person('SP', 'F'), person('C1'), person('C2', 'F')],
    families: [family('F1', 'I1', 'SP', ['C1', 'C2'])],
  }

  it('places the spouse directly below the focus person', () => {
    const { nodes } = layout(couple, 'I1')
    const spouse = nodes.find(n => n.id === 'SP')!
    const focus = nodes.find(n => n.id === 'I1')!
    expect(spouse.data.role).toBe('spouse')
    expect(spouse.position.x).toBe(focus.position.x)
    expect(spouse.position.y).toBe(focus.position.y + NODE_H + MARRIAGE_GAP)
  })

  it('joins the couple with a straight marriage edge', () => {
    const { edges } = layout(couple, 'I1')
    const marriage = edges.find(e => e.source === 'I1' && e.target === 'SP')!
    expect(marriage.type).toBe('straight')
    expect(marriage.sourceHandle).toBe('bottom')
    expect(marriage.targetHandle).toBe('top')
  })

  it('shows the first spouse and counts the rest', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('SP', 'F'), person('SP2', 'F')],
      families: [family('F1', 'I1', 'SP', []), family('F2', 'I1', 'SP2', [])],
    }
    const { nodes } = layout(data, 'I1')
    expect(nodes.find(n => n.id === 'SP')!.data.spouseCount).toBe(2)
    expect(nodes.find(n => n.id === 'SP2')).toBeUndefined()
  })

  it('puts children in a column to the left of the focus person', () => {
    const { nodes } = layout(couple, 'I1')
    const child = nodes.find(n => n.id === 'C1')!
    expect(child.data.role).toBe('child')
    expect(child.position.x).toBe(-(NODE_W + COL_GAP))
  })

  it('centres the children column on the couple', () => {
    const { nodes } = layout(couple, 'I1')
    const coupleY = centreY(nodes, 'I1') + (NODE_H + MARRIAGE_GAP) / 2
    expect((centreY(nodes, 'C1') + centreY(nodes, 'C2')) / 2).toBe(coupleY)
    expect(centreY(nodes, 'C2') - centreY(nodes, 'C1')).toBe(ROW)
  })

  it('centres the children on the focus person when there is no spouse', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('C1')],
      families: [family('F1', 'I1', null, ['C1'])],
    }
    const { nodes } = layout(data, 'I1')
    expect(centreY(nodes, 'C1')).toBe(centreY(nodes, 'I1'))
  })

  it('unions children across families and draws each one edge to the focus', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('SP', 'F'), person('SP2', 'F'), person('C1'), person('C2')],
      families: [family('F1', 'I1', 'SP', ['C1']), family('F2', 'I1', 'SP2', ['C2'])],
    }
    const { nodes, edges } = layout(data, 'I1')
    expect(nodes.filter(n => n.data.role === 'child').map(n => n.id)).toEqual(['C1', 'C2'])
    const childEdge = edges.find(e => e.source === 'C1' && e.target === 'I1')!
    expect(childEdge.sourceHandle).toBe('right')
    expect(childEdge.targetHandle).toBe('left')
  })

  it('skips a child whose individual record is missing from the index', () => {
    const data: FullTreeData = {
      individuals: [person('I1')],
      families: [family('F1', 'I1', null, ['GHOST'])],
    }
    const { nodes, edges } = layout(data, 'I1')
    expect(nodes.filter(n => n.data.role === 'child')).toHaveLength(0)
    expect(edges).toHaveLength(0)
  })
})
