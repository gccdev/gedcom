import { describe, it, expect } from 'vitest'
import { buildTreeIndex } from '../src/lib/tree-index'
import {
  buildFamilyLayout, defaultExpansion, resolveFocusId, toggleExpansion,
  NODE_W, NODE_H, COL_GAP, ROW_GAP, MARRIAGE_GAP, COUPLE_H,
} from '../src/lib/family-layout'
import type { Expansion } from '../src/lib/family-layout'
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

/**
 * I1 <- FA, MO; FA <- FAFA, FAMO; MO <- MOFA, MOMO; FAFA <- P1, P2 (great-grandparents,
 * drawn by default); P1 <- Q1, Q2 (fourth generation, not drawn by default).
 */
function deep(): FullTreeData {
  return {
    individuals: [
      person('I1'),
      person('FA'), person('MO', 'F'),
      person('FAFA'), person('FAMO', 'F'), person('MOFA'), person('MOMO', 'F'),
      person('P1'), person('P2', 'F'),
      person('Q1'), person('Q2', 'F'),
    ],
    families: [
      family('F1', 'FA', 'MO', ['I1']),
      family('F2', 'FAFA', 'FAMO', ['FA']),
      family('F3', 'MOFA', 'MOMO', ['MO']),
      family('F4', 'P1', 'P2', ['FAFA']),
      family('F5', 'Q1', 'Q2', ['P1']),
    ],
  }
}

function layout(data: FullTreeData, focusId: string, expansion?: Expansion) {
  const index = buildTreeIndex(data)
  return buildFamilyLayout(index, focusId, expansion ?? defaultExpansion(index, focusId))
}

type Nodes = ReturnType<typeof layout>['nodes']

function node(nodes: Nodes, id: string) {
  const found = nodes.find(n => n.id === id)
  if (!found) throw new Error(`no node ${id}`)
  return found
}

/** Vertical centre of a card, from its top-left position. */
function centreY(nodes: Nodes, id: string): number {
  return node(nodes, id).position.y + NODE_H / 2
}

function column(nodes: Nodes, id: string): number {
  return node(nodes, id).position.x / (NODE_W + COL_GAP)
}

function positions(nodes: Nodes): Record<string, { x: number; y: number }> {
  return Object.fromEntries(nodes.map(n => [n.id, n.position]))
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

describe('buildFamilyLayout ancestors', () => {
  it('returns no nodes when the focus person is not in the index', () => {
    expect(layout({ individuals: [person('I1')], families: [] }, 'ghost').nodes).toEqual([])
  })

  it('renders the focus person as a personCard flagged isFocus', () => {
    const { nodes } = layout({ individuals: [person('I1')], families: [] }, 'I1')
    const focus = node(nodes, 'I1')
    expect(focus.type).toBe('personCard')
    expect(focus.data.isFocus).toBe(true)
    expect(focus.data.canExpandUp).toBe(false)
  })

  it('places each ancestor generation in its own column to the right', () => {
    const { nodes } = layout(deep(), 'I1')
    expect(column(nodes, 'I1')).toBe(0)
    expect(column(nodes, 'FA')).toBe(1)
    expect(column(nodes, 'FAFA')).toBe(2)
    expect(column(nodes, 'P1')).toBe(3)
  })

  it('draws three ancestor generations by default and flags the outermost as expandable', () => {
    const { nodes } = layout(deep(), 'I1')
    expect(nodes.find(n => n.id === 'Q1')).toBeUndefined()
    expect(node(nodes, 'P1').data.canExpandUp).toBe(true)
    expect(node(nodes, 'P1').data.expandedUp).toBe(false)
    expect(node(nodes, 'FA').data.expandedUp).toBe(true)
    expect(node(nodes, 'P2').data.canExpandUp).toBe(false)
  })

  it('places the father above the mother', () => {
    const { nodes } = layout(deep(), 'I1')
    expect(centreY(nodes, 'FA')).toBeLessThan(centreY(nodes, 'MO'))
    expect(centreY(nodes, 'MOFA')).toBeLessThan(centreY(nodes, 'MOMO'))
  })

  it('centres a person between unexpanded parents with one row gap between them', () => {
    const { nodes } = layout(deep(), 'I1')
    expect(centreY(nodes, 'MO')).toBe((centreY(nodes, 'MOFA') + centreY(nodes, 'MOMO')) / 2)
    expect(centreY(nodes, 'MOMO') - centreY(nodes, 'MOFA')).toBe(NODE_H + ROW_GAP)
  })

  it("centres a person on their parents' combined band when one parent is expanded", () => {
    const { nodes } = layout(deep(), 'I1')
    // FAFA's band holds P1 and P2; FAMO's band is a single card.
    const fafaBandTop = centreY(nodes, 'FAFA') - (2 * NODE_H + ROW_GAP) / 2
    const famoBandBottom = centreY(nodes, 'FAMO') + NODE_H / 2
    expect(centreY(nodes, 'FA')).toBe((fafaBandTop + famoBandBottom) / 2)
  })

  it('centres the ancestor tree on the focus card', () => {
    const { nodes } = layout(deep(), 'I1')
    const faBandTop = centreY(nodes, 'FA') - (3 * NODE_H + 2 * ROW_GAP) / 2
    const moBandBottom = centreY(nodes, 'MOMO') + NODE_H / 2
    expect(centreY(nodes, 'I1')).toBe((faBandTop + moBandBottom) / 2)
  })

  it('expanding a great-grandparent adds their parents one column further right', () => {
    const index = buildTreeIndex(deep())
    const expansion = toggleExpansion(defaultExpansion(index, 'I1'), 'up', 'P1')
    const { nodes } = buildFamilyLayout(index, 'I1', expansion)
    expect(column(nodes, 'Q1')).toBe(4)
    expect(centreY(nodes, 'P1')).toBe((centreY(nodes, 'Q1') + centreY(nodes, 'Q2')) / 2)
    expect(node(nodes, 'P1').data.expandedUp).toBe(true)
  })

  it('expanding a branch moves the neighbouring branch as a block', () => {
    const index = buildTreeIndex(deep())
    const before = layout(deep(), 'I1').nodes
    const after = buildFamilyLayout(index, 'I1', toggleExpansion(defaultExpansion(index, 'I1'), 'up', 'P1')).nodes
    const shift = centreY(after, 'MO') - centreY(before, 'MO')
    expect(shift).toBeGreaterThan(0)
    expect(centreY(after, 'MOFA') - centreY(before, 'MOFA')).toBe(shift)
    expect(centreY(after, 'MOMO') - centreY(before, 'MOMO')).toBe(shift)
  })

  it('collapsing removes the branch and re-expanding restores every position', () => {
    const index = buildTreeIndex(deep())
    const start = defaultExpansion(index, 'I1')
    const collapsed = buildFamilyLayout(index, 'I1', toggleExpansion(start, 'up', 'FAFA')).nodes
    expect(collapsed.find(n => n.id === 'P1')).toBeUndefined()
    expect(node(collapsed, 'FAFA').data.expandedUp).toBe(false)
    expect(centreY(collapsed, 'FA')).toBe((centreY(collapsed, 'FAFA') + centreY(collapsed, 'FAMO')) / 2)

    const reopened = buildFamilyLayout(index, 'I1', toggleExpansion(toggleExpansion(start, 'up', 'FAFA'), 'up', 'FAFA')).nodes
    expect(positions(reopened)).toEqual(positions(layout(deep(), 'I1').nodes))
  })

  it('places a single drawable parent level with their child', () => {
    const { nodes } = layout(chain(), 'I1')
    expect(centreY(nodes, 'G1')).toBe(centreY(nodes, 'I1'))
    expect(column(nodes, 'G1')).toBe(1)
  })

  it('draws one edge per drawn parent from the child right handle to the parent left handle', () => {
    const { edges } = layout(deep(), 'I1')
    const toFather = edges.find(e => e.source === 'I1' && e.target === 'FA')!
    expect(toFather.sourceHandle).toBe('right')
    expect(toFather.targetHandle).toBe('left')
    expect(toFather.type).toBe('smoothstep')
    expect(edges.filter(e => e.source === 'I1')).toHaveLength(2)
    expect(edges.find(e => e.source === 'P1')).toBeUndefined()
  })

  it('never offers downward expansion on an ancestor card', () => {
    const { nodes } = layout(deep(), 'I1')
    for (const id of ['FA', 'MO', 'FAFA', 'P1']) {
      expect(node(nodes, id).data.canExpandDown).toBe(false)
    }
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
    const { nodes, edges } = layout(data, 'I1')
    expect(nodes.filter(n => n.id === 'SHARED')).toHaveLength(1)
    expect(edges.filter(e => e.target === 'SHARED')).toHaveLength(1)
  })
})

describe('buildFamilyLayout spouse and children', () => {
  /** I1 + SP with children C1 (married to CS, child GC) and C2. */
  function couple(): FullTreeData {
    return {
      individuals: [
        person('I1'), person('SP', 'F'), person('C1'), person('C2', 'F'),
        person('CS', 'F'), person('GC'),
      ],
      families: [
        family('F1', 'I1', 'SP', ['C1', 'C2']),
        family('F2', 'C1', 'CS', ['GC']),
      ],
    }
  }

  it('places the spouse directly below the focus person, flagged isSpouse', () => {
    const { nodes } = layout(couple(), 'I1')
    const spouse = node(nodes, 'SP')
    const focus = node(nodes, 'I1')
    expect(spouse.data.isSpouse).toBe(true)
    expect(spouse.position.x).toBe(focus.position.x)
    expect(spouse.position.y).toBe(focus.position.y + NODE_H + MARRIAGE_GAP)
    expect(spouse.data.canExpandUp).toBe(false)
    expect(spouse.data.canExpandDown).toBe(false)
  })

  it('joins the couple with a straight marriage edge', () => {
    const { edges } = layout(couple(), 'I1')
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
    expect(node(nodes, 'SP').data.spouseCount).toBe(2)
    expect(nodes.find(n => n.id === 'SP2')).toBeUndefined()
  })

  it('draws children one column left and grandchildren two, but not great-grandchildren', () => {
    const { nodes } = layout(chain(), 'I1')
    expect(column(nodes, 'C1')).toBe(-1)
    expect(column(nodes, 'GC1')).toBe(-2)
    expect(nodes.find(n => n.id === 'GGC1')).toBeUndefined()
    expect(node(nodes, 'C1').data.expandedDown).toBe(true)
    expect(node(nodes, 'GC1').data.canExpandDown).toBe(true)
    expect(node(nodes, 'GC1').data.expandedDown).toBe(false)
    expect(node(nodes, 'C1').data.canExpandUp).toBe(false)
  })

  it('draws an expanded child with their spouse beneath them and their children to the left', () => {
    const { nodes, edges } = layout(couple(), 'I1')
    expect(node(nodes, 'CS').data.isSpouse).toBe(true)
    expect(node(nodes, 'CS').position.y).toBe(node(nodes, 'C1').position.y + NODE_H + MARRIAGE_GAP)
    expect(column(nodes, 'GC')).toBe(-2)
    expect(centreY(nodes, 'GC')).toBe(centreY(nodes, 'C1') + (NODE_H + MARRIAGE_GAP) / 2)
    const toParent = edges.find(e => e.source === 'GC' && e.target === 'C1')!
    expect(toParent.sourceHandle).toBe('right')
    expect(toParent.targetHandle).toBe('left')
  })

  it('centres the children band on the couple', () => {
    const { nodes } = layout(couple(), 'I1')
    const coupleCentre = centreY(nodes, 'I1') + (NODE_H + MARRIAGE_GAP) / 2
    // C1's band is a couple (COUPLE_H tall); C2's is a single card.
    const bandTop = centreY(nodes, 'C1') - (NODE_H + MARRIAGE_GAP) / 2 - COUPLE_H / 2
    const bandBottom = centreY(nodes, 'C2') + NODE_H / 2
    expect((bandTop + bandBottom) / 2).toBe(coupleCentre)
  })

  it('collapsing a child hides their spouse and children and pulls the next child up', () => {
    const index = buildTreeIndex(couple())
    const open = layout(couple(), 'I1').nodes
    expect(centreY(open, 'C2') - centreY(open, 'C1')).toBe(COUPLE_H + ROW_GAP)

    const closed = buildFamilyLayout(index, 'I1', toggleExpansion(defaultExpansion(index, 'I1'), 'down', 'C1')).nodes
    expect(closed.find(n => n.id === 'CS')).toBeUndefined()
    expect(closed.find(n => n.id === 'GC')).toBeUndefined()
    expect(centreY(closed, 'C2') - centreY(closed, 'C1')).toBe(NODE_H + ROW_GAP)
    expect(node(closed, 'C1').data.canExpandDown).toBe(true)
    expect(node(closed, 'C1').data.expandedDown).toBe(false)
  })

  it('centres the children on the focus person when there is no spouse', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('C1')],
      families: [family('F1', 'I1', null, ['C1'])],
    }
    const { nodes } = layout(data, 'I1')
    expect(centreY(nodes, 'C1')).toBe(centreY(nodes, 'I1'))
  })

  it('unions children across families in family order', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('SP', 'F'), person('SP2', 'F'), person('C1'), person('C2')],
      families: [family('F1', 'I1', 'SP', ['C1']), family('F2', 'I1', 'SP2', ['C2'])],
    }
    const { nodes } = layout(data, 'I1')
    const children = nodes.filter(n => column(nodes, n.id) === -1).map(n => n.id)
    expect(children).toEqual(['C1', 'C2'])
  })

  it('skips a child whose individual record is missing from the index', () => {
    const data: FullTreeData = {
      individuals: [person('I1')],
      families: [family('F1', 'I1', null, ['GHOST'])],
    }
    const { nodes, edges } = layout(data, 'I1')
    expect(nodes).toHaveLength(1)
    expect(edges).toHaveLength(0)
    expect(node(nodes, 'I1').data.canExpandDown).toBe(false)
  })

  // Defensive: a person married to their own ancestor. The ancestor pass runs
  // first, so the spouse card is skipped and the children stay centred on the focus.
  it('does not double-draw a spouse already placed as an ancestor', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('SP', 'F'), person('FA'), person('C1')],
      families: [
        family('F1', 'FA', 'SP', ['I1']),
        family('F2', 'I1', 'SP', ['C1']),
      ],
    }
    const { nodes } = layout(data, 'I1')
    expect(nodes.filter(n => n.id === 'SP')).toHaveLength(1)
    expect(node(nodes, 'SP').data.isSpouse).toBe(false)
    expect(centreY(nodes, 'C1')).toBe(centreY(nodes, 'I1'))
  })
})

describe('buildFamilyLayout siblings', () => {
  /** FA + MO with children S1, I1, S2; S2 has a child N1. */
  function withSiblings(): FullTreeData {
    return {
      individuals: [
        person('FA'), person('MO', 'F'), person('S1'), person('I1'), person('S2', 'F'), person('N1'),
      ],
      families: [
        family('F1', 'FA', 'MO', ['S1', 'I1', 'S2']),
        family('F2', null, 'S2', ['N1']),
      ],
    }
  }

  it('stacks the sibling group in column 0 in family order', () => {
    const { nodes } = layout(withSiblings(), 'I1')
    for (const id of ['S1', 'I1', 'S2']) expect(column(nodes, id)).toBe(0)
    expect(centreY(nodes, 'S1')).toBeLessThan(centreY(nodes, 'I1'))
    expect(centreY(nodes, 'I1')).toBeLessThan(centreY(nodes, 'S2'))
    expect(centreY(nodes, 'I1') - centreY(nodes, 'S1')).toBe(NODE_H + ROW_GAP)
    expect(node(nodes, 'S1').data.isFocus).toBe(false)
  })

  it('leaves siblings collapsed but expandable when they have children', () => {
    const { nodes } = layout(withSiblings(), 'I1')
    expect(nodes.find(n => n.id === 'N1')).toBeUndefined()
    expect(node(nodes, 'S2').data.canExpandDown).toBe(true)
    expect(node(nodes, 'S2').data.expandedDown).toBe(false)
    expect(node(nodes, 'S1').data.canExpandDown).toBe(false)
    expect(node(nodes, 'S2').data.canExpandUp).toBe(false)
  })

  it('expanding a sibling draws their children to the left and pushes nothing above them', () => {
    const index = buildTreeIndex(withSiblings())
    const before = layout(withSiblings(), 'I1').nodes
    const after = buildFamilyLayout(index, 'I1', toggleExpansion(defaultExpansion(index, 'I1'), 'down', 'S2')).nodes
    expect(column(after, 'N1')).toBe(-1)
    expect(centreY(after, 'N1')).toBe(centreY(after, 'S2'))
    expect(centreY(after, 'I1') - centreY(after, 'S1')).toBe(centreY(before, 'I1') - centreY(before, 'S1'))
  })

  it('joins every sibling to the drawn parents', () => {
    const { edges } = layout(withSiblings(), 'I1')
    for (const id of ['S1', 'I1', 'S2']) {
      expect(edges.find(e => e.source === id && e.target === 'FA')).toBeDefined()
      expect(edges.find(e => e.source === id && e.target === 'MO')).toBeDefined()
    }
  })

  it('centres the ancestors on the focus card, not the sibling stack', () => {
    const { nodes } = layout(withSiblings(), 'I1')
    expect((centreY(nodes, 'FA') + centreY(nodes, 'MO')) / 2).toBe(centreY(nodes, 'I1'))
  })

  it('draws only the focus in column 0 when they have no recorded parents', () => {
    const { nodes } = layout({ individuals: [person('I1')], families: [] }, 'I1')
    expect(nodes.map(n => n.id)).toEqual(['I1'])
  })
})
