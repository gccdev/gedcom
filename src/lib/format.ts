/**
 * Short display forms for the raw GEDCOM strings on a tree card. Pure, so
 * they are unit-tested without a DOM.
 */

/**
 * GEDCOM places here follow `Place,District,County,Region,Country` with
 * empty slots left in ("Leeds,,City and Borough of Leeds,England,United Kingdom").
 * A card has room for the town and the region, so that is what this keeps.
 */
export function formatPlace(place: string | null | undefined): string {
  if (!place) return ''
  const slots = place.split(',').map(s => s.trim())
  const filled = slots.filter(Boolean)
  if (filled.length <= 2) return filled.join(', ')

  const first = filled[0]
  const region = slots.length === 5
    ? slots[3] || slots[4] || filled[filled.length - 1]
    : filled[filled.length - 1]
  return region === first ? first : `${first}, ${region}`
}

/** The year in a GEDCOM date ("06 Sep 1900", "abt 1877", "20/07/1678"), or null. */
export function yearOf(date: string | null | undefined): string | null {
  return date?.match(/\b(\d{4})\b/)?.[1] ?? null
}

/** "1900–1990", "b. 1900", "d. 1990", or "" when neither year is known. */
export function formatLifespan(birthDate: string | null, deathDate: string | null): string {
  const birth = yearOf(birthDate)
  const death = yearOf(deathDate)
  if (birth && death) return `${birth}–${death}`
  if (birth) return `b. ${birth}`
  if (death) return `d. ${death}`
  return ''
}

/** One card line for a life event: "6 Sep 1900 · Manchester, England". */
export function formatEvent(date: string | null, place: string | null): string {
  return [date?.trim().replace(/^0(\d)(?=\s)/, '$1'), formatPlace(place)].filter(Boolean).join(' · ')
}

/** Up to two initials for the photo placeholder, ignoring stray whitespace. */
export function initials(fullName: string): string {
  return fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('')
}
