import { describe, it, expect } from 'vitest'
import { parseGedcom } from '../scripts/gedcom-parser'

const SAMPLE = `0 HEAD
1 GEDC
2 VERS 7.0.3
0 @I001@ INDI
1 NAME Robert /Ward/
1 SEX M
1 BIRT
2 DATE 15 JAN 1952
2 PLAC Liverpool, England
1 DEAT
2 DATE 3 MAR 2018
2 PLAC Manchester, England
1 OBJE @M001@
1 OCCU
2 DATE 1970
2 PLAC Liverpool, England
0 @I002@ INDI
1 NAME Jane /Brooke/
1 SEX F
1 BIRT
2 DATE 20 APR 1955
2 PLAC Leeds, England
0 @I003@ INDI
1 NAME Alice /Ward/
1 SEX F
0 @F001@ FAM
1 HUSB @I001@
1 WIFE @I002@
1 MARR
2 DATE 12 JUN 1975
2 PLAC Liverpool, England
1 CHIL @I003@
0 @M001@ OBJE
1 FILE photos/robert.jpg
1 TITL Robert Ward 1965
0 TRLR`

describe('parseGedcom', () => {
  it('parses individual count', () => {
    const { individuals } = parseGedcom(SAMPLE)
    expect(individuals.size).toBe(3)
  })

  it('parses individual name stripping slashes', () => {
    const { individuals } = parseGedcom(SAMPLE)
    expect(individuals.get('I001')!.fullName).toBe('Robert Ward')
  })

  it('parses individual sex', () => {
    const { individuals } = parseGedcom(SAMPLE)
    expect(individuals.get('I001')!.sex).toBe('M')
  })

  it('parses birth date and place', () => {
    const { individuals } = parseGedcom(SAMPLE)
    const robert = individuals.get('I001')!
    expect(robert.birth.date).toBe('15 JAN 1952')
    expect(robert.birth.place).toBe('Liverpool, England')
  })

  it('parses death date and place', () => {
    const { individuals } = parseGedcom(SAMPLE)
    const robert = individuals.get('I001')!
    expect(robert.death.date).toBe('3 MAR 2018')
    expect(robert.death.place).toBe('Manchester, England')
  })

  it('parses media references on individual', () => {
    const { individuals } = parseGedcom(SAMPLE)
    expect(individuals.get('I001')!.mediaRefs).toEqual(['M001'])
  })

  it('parses occupation event', () => {
    const { individuals } = parseGedcom(SAMPLE)
    const robert = individuals.get('I001')!
    expect(robert.events).toHaveLength(1)
    expect(robert.events[0].type).toBe('occu')
    expect(robert.events[0].date).toBe('1970')
  })

  it('handles individual with empty death', () => {
    const { individuals } = parseGedcom(SAMPLE)
    const jane = individuals.get('I002')!
    expect(jane.death.date).toBe('')
    expect(jane.death.place).toBe('')
  })

  it('parses family count', () => {
    const { families } = parseGedcom(SAMPLE)
    expect(families.size).toBe(1)
  })

  it('parses family husband and wife IDs', () => {
    const { families } = parseGedcom(SAMPLE)
    const fam = families.get('F001')!
    expect(fam.husbandId).toBe('I001')
    expect(fam.wifeId).toBe('I002')
  })

  it('parses family children', () => {
    const { families } = parseGedcom(SAMPLE)
    expect(families.get('F001')!.childIds).toEqual(['I003'])
  })

  it('parses family marriage date and place', () => {
    const { families } = parseGedcom(SAMPLE)
    const fam = families.get('F001')!
    expect(fam.marriage.date).toBe('12 JUN 1975')
    expect(fam.marriage.place).toBe('Liverpool, England')
  })

  it('parses media object file and title', () => {
    const { mediaObjects } = parseGedcom(SAMPLE)
    const obj = mediaObjects.get('M001')!
    expect(obj.file).toBe('photos/robert.jpg')
    expect(obj.title).toBe('Robert Ward 1965')
  })
})
