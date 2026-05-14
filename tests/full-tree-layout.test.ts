import { describe, it, expect } from 'vitest'
import { buildFullTreeLayout } from '../src/lib/full-tree-layout'
import type { FullTreeData, FamilyRecord, Individual } from '../src/lib/queries'

function person(id: string, sex: 'M' | 'F' = 'M'): Individual {
  return { id, fullName: `Person ${id}`, sex, birthDate: null, birthPlace: null, deathDate: null, deathPlace: null, photoBlobUrl: null }
}

function family(id: string, husbandId: string | null, wifeId: string | null, childIds: string[]): FamilyRecord {
  return { id, husbandId, wifeId, childIds }
}

describe('buildFullTreeLayout', () => {
  it('places root person at generation 0 (y = 0)', () => {
    const data: FullTreeData = { individuals: [person('I1')], families: [] }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I1')!.position.y).toBe(0)
  })

  it('places parents above root (negative y)', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2'), person('I3', 'F')],
      families: [family('F1', 'I2', 'I3', ['I1'])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I2')!.position.y).toBeLessThan(0)
    expect(nodes.find(n => n.id === 'I3')!.position.y).toBeLessThan(0)
  })

  it('places children below root (positive y)', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3')],
      families: [family('F1', 'I1', 'I2', ['I3'])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I3')!.position.y).toBeGreaterThan(0)
  })

  it('assigns spouses the same y as their partner', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F')],
      families: [family('F1', 'I1', 'I2', [])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I1')!.position.y).toBe(nodes.find(n => n.id === 'I2')!.position.y)
  })

  it('places spouses at different x positions', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F')],
      families: [family('F1', 'I1', 'I2', [])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I1')!.position.x).not.toBe(nodes.find(n => n.id === 'I2')!.position.x)
  })

  it('creates one familyConnector node per family', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3'), person('I4', 'F')],
      families: [family('F1', 'I1', 'I2', []), family('F2', 'I3', 'I4', [])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.filter(n => n.type === 'familyConnector')).toHaveLength(2)
  })

  it('creates edges from both parents to the connector', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3')],
      families: [family('F1', 'I1', 'I2', ['I3'])],
    }
    const { nodes, edges } = buildFullTreeLayout(data, 'I1')
    const conn = nodes.find(n => n.type === 'familyConnector')!
    expect(edges.some(e => e.source === 'I1' && e.target === conn.id)).toBe(true)
    expect(edges.some(e => e.source === 'I2' && e.target === conn.id)).toBe(true)
  })

  it('creates edges from connector to each child', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F'), person('I3'), person('I4')],
      families: [family('F1', 'I1', 'I2', ['I3', 'I4'])],
    }
    const { nodes, edges } = buildFullTreeLayout(data, 'I1')
    const conn = nodes.find(n => n.type === 'familyConnector')!
    expect(edges.some(e => e.source === conn.id && e.target === 'I3')).toBe(true)
    expect(edges.some(e => e.source === conn.id && e.target === 'I4')).toBe(true)
  })

  it('handles single-parent family (husband only)', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2')],
      families: [family('F1', 'I1', null, ['I2'])],
    }
    const { nodes, edges } = buildFullTreeLayout(data, 'I1')
    const conn = nodes.find(n => n.type === 'familyConnector')!
    expect(conn).toBeDefined()
    expect(edges.some(e => e.source === 'I1' && e.target === conn.id)).toBe(true)
    expect(edges.some(e => e.source === conn.id && e.target === 'I2')).toBe(true)
  })

  it('assigns all individuals personNode type', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2', 'F')],
      families: [family('F1', 'I1', 'I2', [])],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    const personNodes = nodes.filter(n => n.type === 'personNode')
    expect(personNodes).toHaveLength(2)
  })

  it('places unreachable individuals at y = 0', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I999')],
      families: [],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    expect(nodes.find(n => n.id === 'I999')!.position.y).toBe(0)
  })

  it('grandparents are higher (more negative y) than parents', () => {
    const data: FullTreeData = {
      individuals: [person('I1'), person('I2'), person('I3', 'F'), person('I4'), person('I5', 'F')],
      families: [
        family('F1', 'I4', 'I5', ['I2']),
        family('F2', 'I2', 'I3', ['I1']),
      ],
    }
    const { nodes } = buildFullTreeLayout(data, 'I1')
    const parent = nodes.find(n => n.id === 'I2')!
    const grandparent = nodes.find(n => n.id === 'I4')!
    expect(grandparent.position.y).toBeLessThan(parent.position.y)
  })
})
