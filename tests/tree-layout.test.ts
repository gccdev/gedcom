import { describe, it, expect } from 'vitest'
import { buildHourglassLayout, HourglassData, Individual } from '../src/lib/tree-layout'

function person(id: string, name: string): Individual {
  return {
    id,
    fullName: name,
    sex: 'M',
    birthDate: null,
    birthPlace: null,
    deathDate: null,
    deathPlace: null,
    photoBlobUrl: null,
  }
}

const baseData: HourglassData = {
  individual: person('I001', 'Robert Ward'),
  father: null,
  mother: null,
  paternalGrandfather: null,
  paternalGrandmother: null,
  maternalGrandfather: null,
  maternalGrandmother: null,
  children: [],
  hasGreatGrandparents: false,
  hasGrandchildren: false,
}

describe('buildHourglassLayout', () => {
  it('places selected person at (0, 0)', () => {
    const { nodes } = buildHourglassLayout(baseData)
    const root = nodes.find(n => n.id === 'I001')!
    expect(root.position).toEqual({ x: 0, y: 0 })
  })

  it('places father left and mother right of centre', () => {
    const data: HourglassData = { ...baseData, father: person('I002', 'John Ward'), mother: person('I003', 'Mary Smith') }
    const { nodes } = buildHourglassLayout(data)
    const father = nodes.find(n => n.id === 'I002')!
    const mother = nodes.find(n => n.id === 'I003')!
    expect(father.position.x).toBeLessThan(0)
    expect(mother.position.x).toBeGreaterThan(0)
    expect(father.position.y).toBeLessThan(0)
    expect(mother.position.y).toBeLessThan(0)
  })

  it('places parents higher (more negative y) than selected person', () => {
    const data: HourglassData = { ...baseData, father: person('I002', 'John Ward') }
    const { nodes } = buildHourglassLayout(data)
    expect(nodes.find(n => n.id === 'I002')!.position.y).toBeLessThan(0)
  })

  it('places grandparents higher than parents', () => {
    const data: HourglassData = {
      ...baseData,
      father: person('I002', 'John Ward'),
      paternalGrandfather: person('I004', 'William Ward'),
    }
    const { nodes } = buildHourglassLayout(data)
    const parent = nodes.find(n => n.id === 'I002')!
    const grandparent = nodes.find(n => n.id === 'I004')!
    expect(grandparent.position.y).toBeLessThan(parent.position.y)
  })

  it('creates edge from father to selected person', () => {
    const data: HourglassData = { ...baseData, father: person('I002', 'John Ward') }
    const { edges } = buildHourglassLayout(data)
    expect(edges).toContainEqual(expect.objectContaining({ source: 'I002', target: 'I001' }))
  })

  it('places children below selected person', () => {
    const data: HourglassData = {
      ...baseData,
      children: [person('I005', 'Alice Ward'), person('I006', 'Bob Ward')],
    }
    const { nodes } = buildHourglassLayout(data)
    nodes.filter(n => ['I005', 'I006'].includes(n.id)).forEach(n => {
      expect(n.position.y).toBeGreaterThan(0)
    })
  })

  it('creates edges from selected person to children', () => {
    const data: HourglassData = { ...baseData, children: [person('I005', 'Alice Ward')] }
    const { edges } = buildHourglassLayout(data)
    expect(edges).toContainEqual(expect.objectContaining({ source: 'I001', target: 'I005' }))
  })

  it('assigns type personNode to all nodes', () => {
    const data: HourglassData = { ...baseData, father: person('I002', 'John Ward') }
    const { nodes } = buildHourglassLayout(data)
    nodes.forEach(n => expect(n.type).toBe('personNode'))
  })
})
