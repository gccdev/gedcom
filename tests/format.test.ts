import { describe, expect, it } from 'vitest'
import { formatEvent, formatLifespan, formatPlace, initials, yearOf } from '../src/lib/format'

describe('formatPlace', () => {
  it('keeps the town and region of a five-slot place', () => {
    expect(formatPlace('Leeds,,City and Borough of Leeds,England,United Kingdom')).toBe('Leeds, England')
  })
  it('falls back to the country when the region slot is empty', () => {
    expect(formatPlace('York,,City of York,,England')).toBe('York, England')
    expect(formatPlace('Deerfield,,,,United States')).toBe('Deerfield, United States')
  })
  it('uses the first filled slot when the town is missing', () => {
    expect(formatPlace(',,Ontario,Canada')).toBe('Ontario, Canada')
  })
  it('passes short places through and handles nothing', () => {
    expect(formatPlace('Leeds, England')).toBe('Leeds, England')
    expect(formatPlace('Leeds')).toBe('Leeds')
    expect(formatPlace(null)).toBe('')
  })
})

describe('yearOf and formatLifespan', () => {
  it('finds the year in the date shapes the GEDCOM uses', () => {
    expect(yearOf('06 Sep 1900')).toBe('1900')
    expect(yearOf('abt 1877')).toBe('1877')
    expect(yearOf('20/07/1678')).toBe('1678')
    expect(yearOf(null)).toBeNull()
  })
  it('formats each combination of known years', () => {
    expect(formatLifespan('06 Sep 1900', '1990')).toBe('1900–1990')
    expect(formatLifespan('1932', null)).toBe('b. 1932')
    expect(formatLifespan(null, 'Feb 1879')).toBe('d. 1879')
    expect(formatLifespan(null, null)).toBe('')
  })
})

describe('formatEvent', () => {
  it('joins the date and short place', () => {
    expect(formatEvent('06 Sep 1900', 'Manchester,,Lancashire,England,United Kingdom'))
      .toBe('6 Sep 1900 · Manchester, England')
  })
  it('shows whichever half is known', () => {
    expect(formatEvent('1990', null)).toBe('1990')
    expect(formatEvent(null, 'Bury,,Lancashire,England,United Kingdom')).toBe('Bury, England')
    expect(formatEvent(null, null)).toBe('')
  })
})

describe('formatEvent leading zeros', () => {
  it('drops the zero from a day but never from a year', () => {
    expect(formatEvent('06 Sep 1900', null)).toBe('6 Sep 1900')
    expect(formatEvent('0985', null)).toBe('0985')
    expect(formatEvent('abt 0985', null)).toBe('abt 0985')
  })
})

describe('initials', () => {
  it('takes the first two words', () => {
    expect(initials('William Herbert Brooke')).toBe('WH')
    expect(initials('Brooke')).toBe('B')
  })
  it('ignores doubled, leading and trailing spaces', () => {
    expect(initials('Mary  Brooke')).toBe('MB')
    expect(initials('  Mary Brooke ')).toBe('MB')
    expect(initials('')).toBe('')
  })
})
