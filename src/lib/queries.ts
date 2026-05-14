import { sql } from '@/lib/db'

export interface Individual {
  id: string
  fullName: string
  sex: string
  birthDate: string | null
  birthPlace: string | null
  deathDate: string | null
  deathPlace: string | null
  photoBlobUrl: string | null
}

export interface HourglassData {
  individual: Individual
  father: Individual | null
  mother: Individual | null
  paternalGrandfather: Individual | null
  paternalGrandmother: Individual | null
  maternalGrandfather: Individual | null
  maternalGrandmother: Individual | null
  children: Individual[]
  hasGreatGrandparents: boolean
  hasGrandchildren: boolean
}

export interface PersonDetail {
  id: string
  fullName: string
  sex: string
  birthDate: string | null
  birthPlace: string | null
  deathDate: string | null
  deathPlace: string | null
  burialDate: string | null
  burialPlace: string | null
  notes: string | null
  events: Array<{ type: string; date: string | null; place: string | null; description: string | null }>
  father: Individual | null
  mother: Individual | null
  spouses: Individual[]
  children: Individual[]
  media: Array<{ id: number; blobUrl: string; mediaType: string; title: string | null }>
}

export interface FamilyRecord {
  id: string
  husbandId: string | null
  wifeId: string | null
  childIds: string[]
}

export interface FullTreeData {
  individuals: Individual[]
  families: FamilyRecord[]
}

type Row = Record<string, unknown>

function rowToIndividual(row: Row): Individual {
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    sex: row.sex as string,
    birthDate: row.birth_date as string | null,
    birthPlace: row.birth_place as string | null,
    deathDate: row.death_date as string | null,
    deathPlace: row.death_place as string | null,
    photoBlobUrl: row.photo_blob_url as string | null,
  }
}

async function fetchIndividual(id: string): Promise<Individual | null> {
  const rows = await sql`
    SELECT i.id, i.full_name, i.sex, i.birth_date, i.birth_place, i.death_date, i.death_place,
           (SELECT m.blob_url FROM media m WHERE m.individual_id = i.id AND m.media_type = 'photo' LIMIT 1) AS photo_blob_url
    FROM individuals i
    WHERE i.id = ${id}
  `
  if (!rows[0]) return null
  return rowToIndividual(rows[0] as Row)
}

async function getParents(individualId: string): Promise<{ father: Individual | null; mother: Individual | null }> {
  const rows = await sql`
    SELECT f.husband_id, f.wife_id
    FROM families f
    JOIN family_members fm ON fm.family_id = f.id
    WHERE fm.individual_id = ${individualId} AND fm.role = 'child'
    LIMIT 1
  `
  if (!rows[0]) return { father: null, mother: null }
  const row = rows[0] as Row
  const [father, mother] = await Promise.all([
    row.husband_id ? fetchIndividual(row.husband_id as string) : null,
    row.wife_id ? fetchIndividual(row.wife_id as string) : null,
  ])
  return { father, mother }
}

async function getChildren(individualId: string): Promise<Individual[]> {
  const rows = await sql`
    SELECT DISTINCT fm.individual_id
    FROM family_members fm
    JOIN families f ON f.id = fm.family_id
    WHERE (f.husband_id = ${individualId} OR f.wife_id = ${individualId})
      AND fm.role = 'child'
    ORDER BY fm.individual_id
  `
  const results = await Promise.all(rows.map(r => fetchIndividual((r as Row).individual_id as string)))
  return results.filter((r): r is Individual => r !== null)
}

export async function getHourglassData(individualId: string): Promise<HourglassData | null> {
  const individual = await fetchIndividual(individualId)
  if (!individual) return null

  const { father, mother } = await getParents(individualId)

  const [paternalParents, maternalParents, children] = await Promise.all([
    father ? getParents(father.id) : Promise.resolve({ father: null, mother: null }),
    mother ? getParents(mother.id) : Promise.resolve({ father: null, mother: null }),
    getChildren(individualId),
  ])

  const hasGreatGrandparents = await (async () => {
    const grandparents = [
      paternalParents.father, paternalParents.mother,
      maternalParents.father, maternalParents.mother,
    ].filter((g): g is Individual => g !== null)
    const checks = await Promise.all(grandparents.map(gp => getParents(gp.id)))
    return checks.some(p => p.father || p.mother)
  })()

  const hasGrandchildren = await (async () => {
    const childChecks = await Promise.all(children.map(c => getChildren(c.id)))
    return childChecks.some(gc => gc.length > 0)
  })()

  return {
    individual,
    father,
    mother,
    paternalGrandfather: paternalParents.father,
    paternalGrandmother: paternalParents.mother,
    maternalGrandfather: maternalParents.father,
    maternalGrandmother: maternalParents.mother,
    children,
    hasGreatGrandparents,
    hasGrandchildren,
  }
}

export async function getPersonDetail(individualId: string): Promise<PersonDetail | null> {
  const rows = await sql`
    SELECT id, full_name, sex, birth_date, birth_place, death_date, death_place,
           burial_date, burial_place, notes
    FROM individuals WHERE id = ${individualId}
  `
  if (!rows[0]) return null
  const row = rows[0] as Row

  const [events, parents, spouseRows, children, mediaRows] = await Promise.all([
    sql`SELECT type, date, place, description FROM events WHERE individual_id = ${individualId} ORDER BY date NULLS LAST`,
    getParents(individualId),
    sql`
      SELECT DISTINCT i.id, i.full_name, i.sex, i.birth_date, i.birth_place, i.death_date, i.death_place,
             (SELECT m.blob_url FROM media m WHERE m.individual_id = i.id AND m.media_type = 'photo' LIMIT 1) AS photo_blob_url
      FROM individuals i
      JOIN families f ON (f.husband_id = i.id OR f.wife_id = i.id)
      WHERE (f.husband_id = ${individualId} OR f.wife_id = ${individualId})
        AND i.id != ${individualId}
    `,
    getChildren(individualId),
    sql`SELECT id, blob_url, media_type, title FROM media WHERE individual_id = ${individualId} ORDER BY id`,
  ])

  return {
    id: row.id as string,
    fullName: row.full_name as string,
    sex: row.sex as string,
    birthDate: row.birth_date as string | null,
    birthPlace: row.birth_place as string | null,
    deathDate: row.death_date as string | null,
    deathPlace: row.death_place as string | null,
    burialDate: row.burial_date as string | null,
    burialPlace: row.burial_place as string | null,
    notes: row.notes as string | null,
    events: events.map(e => {
      const ev = e as Row
      return {
        type: ev.type as string,
        date: ev.date as string | null,
        place: ev.place as string | null,
        description: ev.description as string | null,
      }
    }),
    father: parents.father,
    mother: parents.mother,
    spouses: spouseRows.map(r => rowToIndividual(r as Row)),
    children,
    media: mediaRows.map(m => {
      const mr = m as Row
      return {
        id: mr.id as number,
        blobUrl: mr.blob_url as string,
        mediaType: mr.media_type as string,
        title: mr.title as string | null,
      }
    }),
  }
}

export async function searchIndividuals(query: string): Promise<Individual[]> {
  if (!query.trim()) return []
  const rows = await sql`
    SELECT i.id, i.full_name, i.sex, i.birth_date, i.birth_place, i.death_date, i.death_place,
           (SELECT m.blob_url FROM media m WHERE m.individual_id = i.id AND m.media_type = 'photo' LIMIT 1) AS photo_blob_url
    FROM individuals i
    WHERE i.full_name ILIKE ${'%' + query + '%'}
    ORDER BY
      CASE WHEN i.full_name ILIKE ${query + '%'} THEN 0 ELSE 1 END,
      i.full_name
    LIMIT 20
  `
  return rows.map(r => rowToIndividual(r as Row))
}

export async function getFullTreeData(): Promise<FullTreeData> {
  const [individualRows, familyRows, memberRows] = await Promise.all([
    sql`
      SELECT i.id, i.full_name, i.sex, i.birth_date, i.birth_place,
             i.death_date, i.death_place,
             (SELECT m.blob_url FROM media m
              WHERE m.individual_id = i.id AND m.media_type = 'photo' LIMIT 1) AS photo_blob_url
      FROM individuals i
    `,
    sql`SELECT id, husband_id, wife_id FROM families`,
    sql`SELECT family_id, individual_id FROM family_members WHERE role = 'child'`,
  ])

  const childIds = new Map<string, string[]>()
  for (const r of memberRows) {
    const row = r as Row
    const famId = row.family_id as string
    const indId = row.individual_id as string
    childIds.set(famId, [...(childIds.get(famId) ?? []), indId])
  }

  return {
    individuals: individualRows.map(r => rowToIndividual(r as Row)),
    families: familyRows.map(r => {
      const row = r as Row
      return {
        id: row.id as string,
        husbandId: row.husband_id as string | null,
        wifeId: row.wife_id as string | null,
        childIds: childIds.get(row.id as string) ?? [],
      }
    }),
  }
}
