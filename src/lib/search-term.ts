/** Search text handling, kept free of the database client so it is unit-testable. */

/** Longest search text sent to the database. */
export const MAX_SEARCH_LENGTH = 100

/** Trims and caps search text, and escapes the ILIKE wildcards so they match literally. */
export function toLikeTerm(query: string): string {
  return query.trim().slice(0, MAX_SEARCH_LENGTH).replace(/[\\%_]/g, '\\$&')
}
