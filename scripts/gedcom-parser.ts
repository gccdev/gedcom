export interface ParsedGedcom {
  individuals: Map<string, RawIndividual>
  families: Map<string, RawFamily>
  mediaObjects: Map<string, RawMediaObject>
}

export interface RawIndividual {
  id: string
  fullName: string
  sex: string
  birth: { date: string; place: string }
  death: { date: string; place: string }
  burial: { date: string; place: string }
  mediaRefs: string[]
  events: Array<{ type: string; date: string; place: string; description: string }>
}

export interface RawFamily {
  id: string
  husbandId: string
  wifeId: string
  childIds: string[]
  marriage: { date: string; place: string }
}

export interface RawMediaObject {
  id: string
  file: string
  title: string
}

interface GedcomLine {
  level: number
  xref: string | null
  tag: string
  value: string
}

function parseLine(raw: string): GedcomLine | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Pattern: LEVEL [XREF] TAG [VALUE]
  const match = trimmed.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\w+)(?:\s+(.*))?$/)
  if (!match) return null
  return {
    level: parseInt(match[1], 10),
    xref: match[2] ? match[2].slice(1, -1) : null,
    tag: match[3],
    value: match[4]?.trim() ?? '',
  }
}

function xrefId(value: string): string {
  return value.replace(/@/g, '')
}

const EVENT_TAGS = new Set([
  'CENS', 'IMMI', 'EMIG', 'OCCU', 'RESI', 'NATU', 'PROB',
  'WILL', 'GRAD', 'RETI', 'EVEN', 'ADOP', 'BAPM', 'CHR',
])

export function parseGedcom(content: string): ParsedGedcom {
  const lines = content.split('\n')
    .map(parseLine)
    .filter((l): l is GedcomLine => l !== null)

  const individuals = new Map<string, RawIndividual>()
  const families = new Map<string, RawFamily>()
  const mediaObjects = new Map<string, RawMediaObject>()

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.level !== 0) { i++; continue }

    if (line.tag === 'INDI' && line.xref) {
      const id = line.xref
      const indi: RawIndividual = {
        id, fullName: '', sex: 'U',
        birth: { date: '', place: '' },
        death: { date: '', place: '' },
        burial: { date: '', place: '' },
        mediaRefs: [], events: [],
      }
      i++
      let inBirth = false, inDeath = false, inBurial = false
      let currentEvent: RawIndividual['events'][0] | null = null

      while (i < lines.length && lines[i].level > 0) {
        const l = lines[i]
        if (l.level === 1) {
          inBirth = false; inDeath = false; inBurial = false; currentEvent = null
          switch (l.tag) {
            case 'NAME':
              indi.fullName = l.value.replace(/\//g, '').replace(/\s+/g, ' ').trim()
              break
            case 'SEX':
              indi.sex = l.value.charAt(0) || 'U'
              break
            case 'BIRT': inBirth = true; break
            case 'DEAT': inDeath = true; break
            case 'BURI': inBurial = true; break
            case 'OBJE':
              if (l.value.startsWith('@')) indi.mediaRefs.push(xrefId(l.value))
              break
            default:
              if (EVENT_TAGS.has(l.tag)) {
                currentEvent = { type: l.tag.toLowerCase(), date: '', place: '', description: l.value }
                indi.events.push(currentEvent)
              }
          }
        } else if (l.level === 2) {
          if (inBirth) {
            if (l.tag === 'DATE') indi.birth.date = l.value
            if (l.tag === 'PLAC') indi.birth.place = l.value
          } else if (inDeath) {
            if (l.tag === 'DATE') indi.death.date = l.value
            if (l.tag === 'PLAC') indi.death.place = l.value
          } else if (inBurial) {
            if (l.tag === 'DATE') indi.burial.date = l.value
            if (l.tag === 'PLAC') indi.burial.place = l.value
          } else if (currentEvent) {
            if (l.tag === 'DATE') currentEvent.date = l.value
            if (l.tag === 'PLAC') currentEvent.place = l.value
          }
        }
        i++
      }
      individuals.set(id, indi)

    } else if (line.tag === 'FAM' && line.xref) {
      const id = line.xref
      const fam: RawFamily = {
        id, husbandId: '', wifeId: '', childIds: [],
        marriage: { date: '', place: '' },
      }
      i++
      let inMarr = false

      while (i < lines.length && lines[i].level > 0) {
        const l = lines[i]
        if (l.level === 1) {
          inMarr = false
          if (l.tag === 'HUSB') fam.husbandId = xrefId(l.value)
          else if (l.tag === 'WIFE') fam.wifeId = xrefId(l.value)
          else if (l.tag === 'CHIL') fam.childIds.push(xrefId(l.value))
          else if (l.tag === 'MARR') inMarr = true
        } else if (l.level === 2 && inMarr) {
          if (l.tag === 'DATE') fam.marriage.date = l.value
          if (l.tag === 'PLAC') fam.marriage.place = l.value
        }
        i++
      }
      families.set(id, fam)

    } else if (line.tag === 'OBJE' && line.xref) {
      const id = line.xref
      const obj: RawMediaObject = { id, file: '', title: '' }
      i++

      while (i < lines.length && lines[i].level > 0) {
        const l = lines[i]
        if (l.level === 1) {
          if (l.tag === 'FILE') obj.file = l.value
          else if (l.tag === 'TITL') obj.title = l.value
        }
        i++
      }
      if (obj.file) mediaObjects.set(id, obj)
    } else {
      i++
    }
  }

  return { individuals, families, mediaObjects }
}
