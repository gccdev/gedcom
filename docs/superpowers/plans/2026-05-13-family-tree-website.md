# Family Tree Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a login-required Next.js website for browsing the Ward/Witts/Brooke/Kennaugh GEDCOM family tree with an interactive hourglass tree, name search, slide-in person panel, full profile pages, and private media via Vercel Blob.

**Architecture:** A GEDCOM importer script parses `Ward Witts Brooke Kennaugh.ged` and populates a Neon Postgres database, then uploads the 1,899 media files as private Vercel Blobs. The Next.js App Router serves the UI with React Flow for the hourglass tree, Auth.js v5 (next-auth@beta) for email magic-link auth, and API routes for tree traversal, search, and signed media URL generation.

**Tech Stack:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, Neon Postgres (`@neondatabase/serverless`), Auth.js v5 (`next-auth@beta`, `@auth/pg-adapter`), React Flow (`reactflow`), Vercel Blob (`@vercel/blob`), Resend (email), Vitest (tests)

---

## File Map

```
gedcom/
├── auth.ts                                    # Auth.js v5 config (root level)
├── src/
│   ├── app/
│   │   ├── layout.tsx                         # Root layout, nav
│   │   ├── page.tsx                           # Redirect / → /tree or /auth/signin
│   │   ├── auth/signin/page.tsx               # Magic-link sign-in UI
│   │   ├── tree/page.tsx                      # Main hourglass tree view
│   │   ├── person/[id]/page.tsx               # Full profile page
│   │   ├── search/page.tsx                    # Search results page
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts    # Auth.js handlers
│   │       ├── tree/[id]/route.ts             # Hourglass data for a person
│   │       ├── person/[id]/route.ts           # Full person detail
│   │       └── search/route.ts               # Name search
│   ├── components/
│   │   ├── nav.tsx                            # Top navigation bar
│   │   ├── search-bar.tsx                     # Debounced search input + dropdown
│   │   ├── person-node.tsx                    # React Flow node component
│   │   ├── hourglass-tree.tsx                 # React Flow canvas (client component)
│   │   ├── person-panel.tsx                   # Slide-in panel (client component)
│   │   └── media-gallery.tsx                  # Lightbox gallery (client component)
│   ├── lib/
│   │   ├── db.ts                              # Neon SQL client singleton
│   │   ├── queries.ts                         # All DB query functions
│   │   ├── tree-layout.ts                     # Converts HourglassData → RF nodes/edges
│   │   └── media.ts                           # generateSignedUrl() wrapper
│   └── middleware.ts                          # Auth route protection
├── scripts/
│   ├── schema.sql                             # DB schema (run once)
│   ├── gedcom-parser.ts                       # Pure GEDCOM 7 parser
│   └── import-gedcom.ts                       # Imports GEDCOM → DB + Blob
└── tests/
    ├── gedcom-parser.test.ts
    └── tree-layout.test.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.env.local`

- [ ] **Step 1: Scaffold Next.js app in project root**

```bash
cd /Users/robertward/Documents/projects/gedcom
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-eslint --yes
```

Expected: Next.js project files created in current directory (alongside existing `7.0.3/` and `docs/` folders).

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install next-auth@beta @auth/pg-adapter @neondatabase/serverless @vercel/blob reactflow resend ws
npm install @types/ws --save-dev
```

- [ ] **Step 3: Install test dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 5: Add test script to `package.json`**

In `package.json`, under `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Create `.env.local` template**

```bash
cat > .env.local << 'EOF'
# Neon Postgres (get from neon.tech dashboard)
DATABASE_URL=

# Auth.js secret (generate with: openssl rand -base64 32)
AUTH_SECRET=

# Resend API key (get from resend.com)
AUTH_RESEND_KEY=
RESEND_FROM=Family Tree <noreply@yourdomain.com>

# Vercel Blob token (get from vercel.com dashboard → Storage → Blob)
BLOB_READ_WRITE_TOKEN=

# Default tree starting person (set after import — use any GEDCOM individual ID, e.g. I1)
DEFAULT_ROOT_PERSON_ID=
EOF
```

- [ ] **Step 7: Verify setup**

```bash
npm run dev
```

Expected: Next.js dev server starts on http://localhost:3000.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with dependencies"
```

---

## Task 2: Database Schema and Connection

**Files:**
- Create: `scripts/schema.sql`
- Create: `src/lib/db.ts`

- [ ] **Step 1: Write `scripts/schema.sql`**

```sql
-- Enable trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS individuals (
  id          TEXT PRIMARY KEY,
  full_name   TEXT NOT NULL,
  sex         CHAR(1) NOT NULL DEFAULT 'U',
  birth_date  TEXT,
  birth_place TEXT,
  death_date  TEXT,
  death_place TEXT,
  burial_date TEXT,
  burial_place TEXT,
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_individuals_name_trgm
  ON individuals USING GIN (full_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS families (
  id             TEXT PRIMARY KEY,
  husband_id     TEXT REFERENCES individuals(id),
  wife_id        TEXT REFERENCES individuals(id),
  marriage_date  TEXT,
  marriage_place TEXT
);

CREATE TABLE IF NOT EXISTS family_members (
  family_id     TEXT NOT NULL REFERENCES families(id),
  individual_id TEXT NOT NULL REFERENCES individuals(id),
  role          TEXT NOT NULL DEFAULT 'child',
  PRIMARY KEY (family_id, individual_id)
);

CREATE TABLE IF NOT EXISTS events (
  id            SERIAL PRIMARY KEY,
  individual_id TEXT NOT NULL REFERENCES individuals(id),
  type          TEXT NOT NULL,
  date          TEXT,
  place         TEXT,
  description   TEXT
);

CREATE TABLE IF NOT EXISTS media (
  id            SERIAL PRIMARY KEY,
  individual_id TEXT NOT NULL REFERENCES individuals(id),
  blob_url      TEXT NOT NULL,
  media_type    TEXT NOT NULL DEFAULT 'photo',
  title         TEXT,
  description   TEXT
);

-- Auth.js v5 tables (pg adapter)
CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT        NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  token      TEXT        NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS accounts (
  id                  TEXT NOT NULL PRIMARY KEY,
  "userId"            TEXT NOT NULL,
  type                TEXT NOT NULL,
  provider            TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          BIGINT,
  id_token            TEXT,
  scope               TEXT,
  session_state       TEXT,
  token_type          TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT        NOT NULL PRIMARY KEY,
  "userId"       TEXT        NOT NULL,
  expires        TIMESTAMPTZ NOT NULL,
  "sessionToken" TEXT        NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT        NOT NULL PRIMARY KEY,
  name            TEXT,
  email           TEXT        UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image           TEXT
);
```

- [ ] **Step 2: Run the schema against your Neon database**

First, fill in `DATABASE_URL` in `.env.local`. Then:

```bash
npx dotenv -e .env.local -- bash -c 'psql "$DATABASE_URL" -f scripts/schema.sql'
```

If `psql` is not installed, use the Neon SQL editor in the dashboard to paste and run `scripts/schema.sql`.

Expected: Tables created with no errors.

- [ ] **Step 3: Write `src/lib/db.ts`**

```typescript
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

export default sql
```

- [ ] **Step 4: Verify connection**

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);
sql\`SELECT COUNT(*) FROM individuals\`.then(r => console.log('Connected. Rows:', r[0].count));
"
```

Expected: `Connected. Rows: 0`

- [ ] **Step 5: Commit**

```bash
git add scripts/schema.sql src/lib/db.ts
git commit -m "feat: add database schema and Neon connection"
```

---

## Task 3: GEDCOM Parser

**Files:**
- Create: `scripts/gedcom-parser.ts`
- Create: `tests/gedcom-parser.test.ts`

- [ ] **Step 1: Write failing tests in `tests/gedcom-parser.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: All tests FAIL with "Cannot find module '../scripts/gedcom-parser'"

- [ ] **Step 3: Implement `scripts/gedcom-parser.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected: All 14 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/gedcom-parser.ts tests/gedcom-parser.test.ts
git commit -m "feat: add GEDCOM 7 parser with tests"
```

---

## Task 4: GEDCOM Importer

**Files:**
- Create: `scripts/import-gedcom.ts`

- [ ] **Step 1: Write `scripts/import-gedcom.ts`**

```typescript
import { readFileSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { neonConfig, Pool } from '@neondatabase/serverless'
import { put } from '@vercel/blob'
import { parseGedcom } from './gedcom-parser'
import ws from 'ws'

// Required for Neon serverless in Node.js
neonConfig.webSocketConstructor = ws

const GEDCOM_FILE = join(__dirname, '../7.0.3/Ward Witts Brooke Kennaugh/Ward Witts Brooke Kennaugh.ged')
const MEDIA_DIR = join(__dirname, '../7.0.3/Ward Witts Brooke Kennaugh/Ward Witts Brooke Kennaugh Media')

const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'])
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
  '.tiff': 'image/tiff', '.bmp': 'image/bmp',
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  console.log('Truncating existing data...')
  await pool.query('TRUNCATE individuals CASCADE')
  await pool.query('TRUNCATE families CASCADE')

  console.log('Parsing GEDCOM...')
  const content = readFileSync(GEDCOM_FILE, 'utf-8')
  const { individuals, families, mediaObjects } = parseGedcom(content)
  console.log(`  ${individuals.size} individuals, ${families.size} families, ${mediaObjects.size} media objects`)

  // Upload media files to Vercel Blob
  const blobUrls = new Map<string, string>()
  let uploaded = 0, skipped = 0
  console.log('Uploading media to Vercel Blob...')

  for (const [objId, obj] of mediaObjects) {
    const filePath = join(MEDIA_DIR, obj.file)
    if (!existsSync(filePath)) {
      console.warn(`  Skipping missing file: ${obj.file}`)
      skipped++
      continue
    }
    const ext = extname(obj.file).toLowerCase()
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'
    const fileContent = readFileSync(filePath)
    const { url } = await put(`media/${basename(obj.file)}`, fileContent, {
      access: 'private',
      contentType,
      addRandomSuffix: true,
    })
    blobUrls.set(objId, url)
    uploaded++
    if (uploaded % 100 === 0) console.log(`  ${uploaded} uploaded...`)
  }
  console.log(`  ${uploaded} uploaded, ${skipped} skipped`)

  // Insert individuals
  console.log('Inserting individuals...')
  for (const [, ind] of individuals) {
    await pool.query(
      `INSERT INTO individuals (id, full_name, sex, birth_date, birth_place, death_date, death_place, burial_date, burial_place)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ind.id, ind.fullName || '(unknown)', ind.sex,
       ind.birth.date || null, ind.birth.place || null,
       ind.death.date || null, ind.death.place || null,
       ind.burial.date || null, ind.burial.place || null]
    )

    for (const evt of ind.events) {
      await pool.query(
        `INSERT INTO events (individual_id, type, date, place, description) VALUES ($1,$2,$3,$4,$5)`,
        [ind.id, evt.type, evt.date || null, evt.place || null, evt.description || null]
      )
    }

    for (const mediaRef of ind.mediaRefs) {
      const blobUrl = blobUrls.get(mediaRef)
      if (!blobUrl) continue
      const obj = mediaObjects.get(mediaRef)!
      const ext = extname(obj.file).toLowerCase()
      const mediaType = PHOTO_EXTS.has(ext) ? 'photo' : 'document'
      await pool.query(
        `INSERT INTO media (individual_id, blob_url, media_type, title) VALUES ($1,$2,$3,$4)`,
        [ind.id, blobUrl, mediaType, obj.title || null]
      )
    }
  }

  // Insert families
  console.log('Inserting families...')
  for (const [, fam] of families) {
    await pool.query(
      `INSERT INTO families (id, husband_id, wife_id, marriage_date, marriage_place) VALUES ($1,$2,$3,$4,$5)`,
      [fam.id, fam.husbandId || null, fam.wifeId || null,
       fam.marriage.date || null, fam.marriage.place || null]
    )
    for (const childId of fam.childIds) {
      await pool.query(
        `INSERT INTO family_members (family_id, individual_id, role) VALUES ($1,$2,'child')`,
        [fam.id, childId]
      )
    }
  }

  await pool.end()
  console.log('Import complete.')
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Add `ts-node` for running scripts**

```bash
npm install -D ts-node tsconfig-paths
```

- [ ] **Step 3: Add `tsconfig.scripts.json` so ts-node can find scripts**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "outDir": "./dist-scripts"
  },
  "include": ["scripts/**/*"]
}
```

- [ ] **Step 4: Add import script to `package.json`**

```json
"scripts": {
  "import-gedcom": "dotenv -e .env.local -- ts-node --project tsconfig.scripts.json scripts/import-gedcom.ts"
}
```

Install dotenv-cli: `npm install -D dotenv-cli`

- [ ] **Step 5: Run the importer**

```bash
npm run import-gedcom
```

Expected output:
```
Truncating existing data...
Parsing GEDCOM...
  XXXX individuals, XXXX families, XXXX media objects
Uploading media to Vercel Blob...
  100 uploaded...
  ...
Import complete.
```

Note: This will take several minutes for 1,899 media files. Run it once; re-run anytime the GEDCOM changes.

- [ ] **Step 6: Verify the import**

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);
Promise.all([
  sql\`SELECT COUNT(*) FROM individuals\`,
  sql\`SELECT COUNT(*) FROM families\`,
  sql\`SELECT COUNT(*) FROM media\`,
]).then(([i,f,m]) => console.log('individuals:', i[0].count, 'families:', f[0].count, 'media:', m[0].count));
"
```

Expected: Non-zero counts for all three tables.

- [ ] **Step 7: Set `DEFAULT_ROOT_PERSON_ID` in `.env.local`**

```bash
# Find the earliest ancestor's ID (lowest-numbered individual):
node -e "
const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);
sql\`SELECT id, full_name FROM individuals ORDER BY id LIMIT 10\`.then(r => r.forEach(i => console.log(i.id, i.full_name)));
"
```

Pick the ID of a suitable root ancestor and add it to `.env.local`:
```
DEFAULT_ROOT_PERSON_ID=I1
```

- [ ] **Step 8: Commit**

```bash
git add scripts/import-gedcom.ts tsconfig.scripts.json
git commit -m "feat: add GEDCOM importer with Blob upload"
```

---

## Task 5: Authentication

**Files:**
- Create: `auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/middleware.ts`
- Create: `src/app/auth/signin/page.tsx`

- [ ] **Step 1: Write `auth.ts` at project root**

```typescript
import NextAuth from 'next-auth'
import PostgresAdapter from '@auth/pg-adapter'
import { Pool } from '@neondatabase/serverless'
import Resend from 'next-auth/providers/resend'
import { neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

neonConfig.webSocketConstructor = ws

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.RESEND_FROM,
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    verifyRequest: '/auth/signin?check-email=1',
  },
  session: { strategy: 'database' },
})
```

Note: `@auth/pg-adapter` expects a `pg`-compatible pool. `@neondatabase/serverless` `Pool` is compatible.

- [ ] **Step 2: Write `src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from '@/../../auth'

export const { GET, POST } = handlers
```

Note: The `auth.ts` is at the project root (above `src/`), so the import path is `@/../../auth`. Alternatively, add `"auth"` to `tsconfig.json` paths.

Better approach — add path alias in `tsconfig.json`:
```json
"paths": {
  "@/*": ["./src/*"],
  "@auth": ["./auth"]
}
```

Then use:
```typescript
import { handlers } from '@auth'
export const { GET, POST } = handlers
```

- [ ] **Step 3: Write `src/middleware.ts`**

```typescript
import { auth } from '../auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isAuthed = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth')
  const isApi = req.nextUrl.pathname.startsWith('/api')

  if (!isAuthed && !isAuthPage && !isApi) {
    return NextResponse.redirect(new URL('/auth/signin', req.url))
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 4: Write `src/app/auth/signin/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

export default function SignInPage({
  searchParams,
}: {
  searchParams: { 'check-email'?: string; error?: string }
}) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const checkEmail = searchParams['check-email'] === '1'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await signIn('resend', { email, callbackUrl: '/tree', redirect: false })
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-slate-800 mb-1">Family Tree</h1>
        <p className="text-slate-500 text-sm mb-6">Ward · Witts · Brooke · Kennaugh</p>

        {checkEmail ? (
          <div className="text-center">
            <p className="text-slate-700 font-medium mb-2">Check your email</p>
            <p className="text-slate-500 text-sm">
              A sign-in link has been sent to <strong>{email || 'your email'}</strong>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {searchParams.error && (
              <p className="text-red-600 text-sm">Sign-in failed. Please try again.</p>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify auth setup manually**

```bash
npm run dev
```

Visit http://localhost:3000. Expected: Redirected to `/auth/signin`. Fill in an email — expected: "Check your email" message (Resend sends the link). Click the link in the email — expected: Redirected to `/tree` (404 for now, that's fine).

- [ ] **Step 6: Commit**

```bash
git add auth.ts src/app/api/auth src/middleware.ts src/app/auth
git commit -m "feat: add Auth.js v5 email magic-link auth"
```

---

## Task 6: Query Layer and API Routes

**Files:**
- Create: `src/lib/queries.ts`
- Create: `src/lib/media.ts`
- Create: `src/app/api/tree/[id]/route.ts`
- Create: `src/app/api/person/[id]/route.ts`
- Create: `src/app/api/search/route.ts`

- [ ] **Step 1: Write `src/lib/media.ts`**

```typescript
import { generateSignedDownloadUrl } from '@vercel/blob'

export async function signBlobUrl(blobUrl: string): Promise<string> {
  const { url } = await generateSignedDownloadUrl(blobUrl, {
    expiresIn: 300,  // 5 minutes
  })
  return url
}

export async function signBlobUrls(blobUrls: (string | null)[]): Promise<(string | null)[]> {
  return Promise.all(
    blobUrls.map(url => (url ? signBlobUrl(url) : Promise.resolve(null)))
  )
}
```

Note: Verify the exact `@vercel/blob` API in the [Vercel Blob docs](https://vercel.com/docs/storage/vercel-blob). If `generateSignedDownloadUrl` is not the correct export, it may be `createSignedDownloadUrl`. Adjust the import accordingly.

- [ ] **Step 2: Write `src/lib/queries.ts`**

```typescript
import sql from '@/lib/db'

export interface Individual {
  id: string
  fullName: string
  sex: string
  birthDate: string | null
  birthPlace: string | null
  deathDate: string | null
  deathPlace: string | null
  photoBlobUrl: string | null  // raw blob URL, signed in API layer
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

async function rowToIndividual(row: Record<string, unknown>): Promise<Individual> {
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

// Fetch one individual with their first photo blob URL
async function fetchIndividual(id: string): Promise<Individual | null> {
  const rows = await sql`
    SELECT i.id, i.full_name, i.sex, i.birth_date, i.birth_place, i.death_date, i.death_place,
           (SELECT m.blob_url FROM media m WHERE m.individual_id = i.id AND m.media_type = 'photo' LIMIT 1) AS photo_blob_url
    FROM individuals i
    WHERE i.id = ${id}
  `
  if (!rows[0]) return null
  return rowToIndividual(rows[0])
}

// Get parents of an individual (the family where they are a child)
async function getParents(individualId: string): Promise<{ father: Individual | null; mother: Individual | null }> {
  const rows = await sql`
    SELECT f.husband_id, f.wife_id
    FROM families f
    JOIN family_members fm ON fm.family_id = f.id
    WHERE fm.individual_id = ${individualId} AND fm.role = 'child'
    LIMIT 1
  `
  if (!rows[0]) return { father: null, mother: null }
  const [father, mother] = await Promise.all([
    rows[0].husband_id ? fetchIndividual(rows[0].husband_id as string) : null,
    rows[0].wife_id ? fetchIndividual(rows[0].wife_id as string) : null,
  ])
  return { father, mother }
}

// Get children of an individual
async function getChildren(individualId: string): Promise<Individual[]> {
  const rows = await sql`
    SELECT fm.individual_id
    FROM family_members fm
    JOIN families f ON f.id = fm.family_id
    WHERE (f.husband_id = ${individualId} OR f.wife_id = ${individualId})
      AND fm.role = 'child'
    ORDER BY fm.individual_id
  `
  return Promise.all(rows.map(r => fetchIndividual(r.individual_id as string))) as Promise<Individual[]>
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

  // Check for great-grandparents
  const hasGreatGrandparents = await (async () => {
    const grandparents = [
      paternalParents.father, paternalParents.mother,
      maternalParents.father, maternalParents.mother,
    ].filter(Boolean) as Individual[]
    const checks = await Promise.all(grandparents.map(gp => getParents(gp.id)))
    return checks.some(p => p.father || p.mother)
  })()

  // Check for grandchildren
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
  const row = rows[0]

  const [events, { father, mother }, spouses, children, media] = await Promise.all([
    sql`SELECT type, date, place, description FROM events WHERE individual_id = ${individualId} ORDER BY date NULLS LAST`,
    getParents(individualId),
    sql`
      SELECT DISTINCT i.id, i.full_name, i.sex, i.birth_date, i.birth_place, i.death_date, i.death_place,
             (SELECT m.blob_url FROM media m WHERE m.individual_id = i.id AND m.media_type = 'photo' LIMIT 1) AS photo_blob_url
      FROM individuals i
      JOIN families f ON (f.husband_id = i.id OR f.wife_id = i.id)
      WHERE (f.husband_id = ${individualId} OR f.wife_id = ${individualId})
        AND i.id != ${individualId}
    `.then(rows => Promise.all(rows.map(rowToIndividual))),
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
    events: events.map(e => ({ type: e.type as string, date: e.date as string | null, place: e.place as string | null, description: e.description as string | null })),
    father,
    mother,
    spouses: spouses as Individual[],
    children,
    media: media.map(m => ({ id: m.id as number, blobUrl: m.blob_url as string, mediaType: m.media_type as string, title: m.title as string | null })),
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
  return Promise.all(rows.map(rowToIndividual))
}
```

- [ ] **Step 3: Write `src/app/api/tree/[id]/route.ts`**

```typescript
import { auth } from '@auth'
import { getHourglassData, Individual } from '@/lib/queries'
import { signBlobUrl } from '@/lib/media'

async function signIndividual(ind: Individual | null): Promise<Individual | null> {
  if (!ind) return null
  return {
    ...ind,
    photoBlobUrl: ind.photoBlobUrl ? await signBlobUrl(ind.photoBlobUrl) : null,
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const data = await getHourglassData(params.id)
  if (!data) return new Response('Not found', { status: 404 })

  const signed = {
    individual: await signIndividual(data.individual),
    father: await signIndividual(data.father),
    mother: await signIndividual(data.mother),
    paternalGrandfather: await signIndividual(data.paternalGrandfather),
    paternalGrandmother: await signIndividual(data.paternalGrandmother),
    maternalGrandfather: await signIndividual(data.maternalGrandfather),
    maternalGrandmother: await signIndividual(data.maternalGrandmother),
    children: await Promise.all(data.children.map(signIndividual)),
    hasGreatGrandparents: data.hasGreatGrandparents,
    hasGrandchildren: data.hasGrandchildren,
  }

  return Response.json(signed)
}
```

- [ ] **Step 4: Write `src/app/api/person/[id]/route.ts`**

```typescript
import { auth } from '@auth'
import { getPersonDetail } from '@/lib/queries'
import { signBlobUrl } from '@/lib/media'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const detail = await getPersonDetail(params.id)
  if (!detail) return new Response('Not found', { status: 404 })

  // Sign all media URLs and photo thumbnails
  const signIndividual = async (ind: (typeof detail.father)) => {
    if (!ind) return null
    return { ...ind, photoBlobUrl: ind.photoBlobUrl ? await signBlobUrl(ind.photoBlobUrl) : null }
  }

  const signedMedia = await Promise.all(
    detail.media.map(async m => ({ ...m, blobUrl: await signBlobUrl(m.blobUrl) }))
  )

  return Response.json({
    ...detail,
    father: await signIndividual(detail.father),
    mother: await signIndividual(detail.mother),
    spouses: await Promise.all(detail.spouses.map(signIndividual)),
    children: await Promise.all(detail.children.map(signIndividual)),
    media: signedMedia,
  })
}
```

- [ ] **Step 5: Write `src/app/api/search/route.ts`**

```typescript
import { auth } from '@auth'
import { searchIndividuals } from '@/lib/queries'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''

  const results = await searchIndividuals(q)
  // Don't sign photos in search results (thumbnails not shown here, only name/dates)
  return Response.json(results.map(r => ({
    id: r.id,
    fullName: r.fullName,
    birthDate: r.birthDate,
    birthPlace: r.birthPlace,
    deathDate: r.deathDate,
  })))
}
```

- [ ] **Step 6: Smoke test the API routes**

With the dev server running and a valid session (sign in first):

```bash
# In browser: visit http://localhost:3000/api/tree/I1
# Expected: JSON with individual, parents, grandparents, children
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries.ts src/lib/media.ts src/app/api
git commit -m "feat: add query layer and API routes"
```

---

## Task 7: Tree Layout Algorithm

**Files:**
- Create: `src/lib/tree-layout.ts`
- Create: `tests/tree-layout.test.ts`

- [ ] **Step 1: Write failing tests in `tests/tree-layout.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { buildHourglassLayout, HourglassData, Individual } from '../src/lib/tree-layout'

function person(id: string, name: string): Individual {
  return { id, fullName: name, sex: 'M', birthDate: null, birthPlace: null, deathDate: null, deathPlace: null, photoBlobUrl: null }
}

const baseData: HourglassData = {
  individual: person('I001', 'Robert Ward'),
  father: null, mother: null,
  paternalGrandfather: null, paternalGrandmother: null,
  maternalGrandfather: null, maternalGrandmother: null,
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
    const data: HourglassData = { ...baseData, children: [person('I005', 'Alice Ward'), person('I006', 'Bob Ward')] }
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test tests/tree-layout.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/tree-layout.ts`**

```typescript
import type { Node, Edge } from 'reactflow'
import type { HourglassData as QueryHourglassData, Individual } from './queries'

export type { Individual }
export type { QueryHourglassData as HourglassData }

const NODE_W = 200
const NODE_H = 80
const H_GAP = 48
const V_GAP = 120

function node(individual: Individual, x: number, y: number): Node {
  return {
    id: individual.id,
    type: 'personNode',
    position: { x, y },
    data: { individual },
  }
}

function edge(sourceId: string, targetId: string): Edge {
  return {
    id: `${sourceId}→${targetId}`,
    source: sourceId,
    target: targetId,
    type: 'smoothstep',
  }
}

export function buildHourglassLayout(data: QueryHourglassData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Selected person
  nodes.push(node(data.individual, 0, 0))

  // Parents (generation +1)
  const parentY = -(NODE_H + V_GAP)
  const halfSlot = NODE_W / 2 + H_GAP / 2
  if (data.father) {
    nodes.push(node(data.father, -halfSlot, parentY))
    edges.push(edge(data.father.id, data.individual.id))
  }
  if (data.mother) {
    nodes.push(node(data.mother, halfSlot, parentY))
    edges.push(edge(data.mother.id, data.individual.id))
  }

  // Grandparents (generation +2)
  const grandY = -2 * (NODE_H + V_GAP)
  const grandSlots: Array<{ person: Individual | null; x: number; parentId?: string }> = [
    { person: data.paternalGrandfather, x: -(NODE_W * 1.5 + H_GAP * 1.5), parentId: data.father?.id },
    { person: data.paternalGrandmother, x: -(NODE_W * 0.5 + H_GAP * 0.5), parentId: data.father?.id },
    { person: data.maternalGrandfather, x: NODE_W * 0.5 + H_GAP * 0.5,   parentId: data.mother?.id },
    { person: data.maternalGrandmother, x: NODE_W * 1.5 + H_GAP * 1.5,   parentId: data.mother?.id },
  ]
  for (const slot of grandSlots) {
    if (!slot.person) continue
    nodes.push(node(slot.person, slot.x, grandY))
    if (slot.parentId) edges.push(edge(slot.person.id, slot.parentId))
  }

  // Children (generation −1)
  const childY = NODE_H + V_GAP
  const totalW = data.children.length * NODE_W + (data.children.length - 1) * H_GAP
  const startX = -totalW / 2
  data.children.forEach((child, i) => {
    const x = startX + i * (NODE_W + H_GAP)
    nodes.push(node(child, x, childY))
    edges.push(edge(data.individual.id, child.id))
  })

  return { nodes, edges }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected: All tests pass (GEDCOM parser tests + tree layout tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tree-layout.ts tests/tree-layout.test.ts
git commit -m "feat: add hourglass tree layout algorithm with tests"
```

---

## Task 8: PersonNode Component

**Files:**
- Create: `src/components/person-node.tsx`

- [ ] **Step 1: Write `src/components/person-node.tsx`**

```typescript
'use client'

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { Individual } from '@/lib/queries'

interface PersonNodeData {
  individual: Individual
  isSelected?: boolean
}

function formatYears(birthDate: string | null, deathDate: string | null): string {
  const birth = birthDate ? birthDate.split(' ').pop() : '?'
  const death = deathDate ? deathDate.split(' ').pop() : ''
  return death ? `${birth}–${death}` : `b. ${birth}`
}

function PersonNode({ data, selected }: { data: PersonNodeData; selected: boolean }) {
  const { individual } = data
  const bgColor = individual.sex === 'M' ? 'bg-blue-50 border-blue-200' :
                  individual.sex === 'F' ? 'bg-pink-50 border-pink-200' :
                  'bg-slate-50 border-slate-200'
  const selectedRing = selected ? 'ring-2 ring-indigo-500' : ''

  return (
    <div className={`w-[200px] rounded-lg border px-3 py-2 shadow-sm cursor-pointer ${bgColor} ${selectedRing}`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />

      <div className="flex items-center gap-2">
        {individual.photoBlobUrl ? (
          <img
            src={individual.photoBlobUrl}
            alt={individual.fullName}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-500 flex-shrink-0">
            {individual.fullName.split(' ').map(w => w[0]).slice(0, 2).join('')}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate leading-tight">{individual.fullName}</p>
          <p className="text-[10px] text-slate-500 leading-tight">
            {formatYears(individual.birthDate, individual.deathDate)}
          </p>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  )
}

export default memo(PersonNode)
```

- [ ] **Step 2: Commit**

```bash
git add src/components/person-node.tsx
git commit -m "feat: add PersonNode React Flow component"
```

---

## Task 9: PersonPanel Component

**Files:**
- Create: `src/components/person-panel.tsx`

- [ ] **Step 1: Write `src/components/person-panel.tsx`**

```typescript
'use client'

import { useRouter } from 'next/navigation'
import type { Individual } from '@/lib/queries'

interface PanelMedia {
  id: number
  blobUrl: string
  mediaType: string
  title: string | null
}

interface PersonPanelData {
  individual: Individual
  father: Individual | null
  mother: Individual | null
  spouses: Individual[]
  children: Individual[]
  media: PanelMedia[]  // first 3 only
}

interface PersonPanelProps {
  data: PersonPanelData | null
  onClose: () => void
  onNavigate: (id: string) => void
}

function FamilyLink({ person, label, onNavigate }: { person: Individual | null; label: string; onNavigate: (id: string) => void }) {
  if (!person) return null
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-slate-500 w-14 shrink-0">{label}</span>
      <button
        onClick={() => onNavigate(person.id)}
        className="text-xs text-indigo-600 hover:underline truncate text-right"
      >
        {person.fullName}
      </button>
    </div>
  )
}

export default function PersonPanel({ data, onClose, onNavigate }: PersonPanelProps) {
  const router = useRouter()

  if (!data) return null
  const { individual, father, mother, spouses, children, media } = data

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl border-l border-slate-200 z-20 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800 text-sm truncate">{individual.fullName}</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none ml-2">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Dates */}
        <div>
          {individual.birthDate && (
            <p className="text-xs text-slate-600">
              <span className="font-medium">Born</span> {individual.birthDate}
              {individual.birthPlace && ` · ${individual.birthPlace}`}
            </p>
          )}
          {individual.deathDate && (
            <p className="text-xs text-slate-600 mt-0.5">
              <span className="font-medium">Died</span> {individual.deathDate}
              {individual.deathPlace && ` · ${individual.deathPlace}`}
            </p>
          )}
        </div>

        {/* Family */}
        {(father || mother || spouses.length > 0 || children.length > 0) && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Family</p>
            <FamilyLink person={father} label="Father" onNavigate={onNavigate} />
            <FamilyLink person={mother} label="Mother" onNavigate={onNavigate} />
            {spouses.map(s => <FamilyLink key={s.id} person={s} label="Spouse" onNavigate={onNavigate} />)}
            {children.slice(0, 5).map(c => <FamilyLink key={c.id} person={c} label="Child" onNavigate={onNavigate} />)}
            {children.length > 5 && (
              <p className="text-xs text-slate-400 text-right">+{children.length - 5} more</p>
            )}
          </div>
        )}

        {/* Media thumbnails */}
        {media.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Photos & Documents ({media.length})
            </p>
            <div className="flex gap-2">
              {media.slice(0, 3).map(m => (
                <img
                  key={m.id}
                  src={m.blobUrl}
                  alt={m.title ?? ''}
                  className="w-20 h-20 rounded object-cover border border-slate-200"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-100">
        <button
          onClick={() => router.push(`/person/${individual.id}`)}
          className="w-full text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          View full profile →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/person-panel.tsx
git commit -m "feat: add PersonPanel slide-in component"
```

---

## Task 10: HourglassTree Component

**Files:**
- Create: `src/components/hourglass-tree.tsx`

- [ ] **Step 1: Write `src/components/hourglass-tree.tsx`**

```typescript
'use client'

import { useCallback, useEffect, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  NodeMouseHandler,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'
import PersonNode from './person-node'
import PersonPanel from './person-panel'
import { buildHourglassLayout } from '@/lib/tree-layout'
import type { HourglassData, Individual } from '@/lib/queries'

const nodeTypes = { personNode: PersonNode }

interface PanelData {
  individual: Individual
  father: Individual | null
  mother: Individual | null
  spouses: Individual[]
  children: Individual[]
  media: Array<{ id: number; blobUrl: string; mediaType: string; title: string | null }>
}

interface HourglassTreeProps {
  initialData: HourglassData
  defaultRootId: string
}

function HourglassTreeInner({ initialData, defaultRootId }: HourglassTreeProps) {
  const [currentData, setCurrentData] = useState<HourglassData>(initialData)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [panelData, setPanelData] = useState<PanelData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  // Rebuild layout when data changes
  useEffect(() => {
    const { nodes: n, edges: e } = buildHourglassLayout(currentData)
    setNodes(n)
    setEdges(e)
  }, [currentData])

  const fetchTree = useCallback(async (id: string) => {
    setLoadingId(id)
    const res = await fetch(`/api/tree/${id}`)
    if (res.ok) {
      const data: HourglassData = await res.json()
      setCurrentData(data)
    }
    setLoadingId(null)
  }, [])

  const fetchPanel = useCallback(async (id: string) => {
    const res = await fetch(`/api/person/${id}`)
    if (res.ok) {
      const detail = await res.json()
      setPanelData({
        individual: detail,
        father: detail.father,
        mother: detail.mother,
        spouses: detail.spouses,
        children: detail.children,
        media: detail.media.slice(0, 3),
      })
      setSelectedId(id)
    }
  }, [])

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    fetchPanel(node.id)
  }, [fetchPanel])

  const handleNavigate = useCallback((id: string) => {
    setPanelData(null)
    setSelectedId(null)
    fetchTree(id)
    fetchPanel(id)
  }, [fetchTree, fetchPanel])

  const nodesWithSelection = nodes.map(n => ({
    ...n,
    data: { ...n.data, isSelected: n.id === selectedId },
  }))

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background />
        <Controls />
      </ReactFlow>

      {/* Expand buttons */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {currentData.hasGreatGrandparents && (
          <button
            onClick={() => currentData.paternalGrandfather && fetchTree(currentData.paternalGrandfather.id)}
            className="text-xs bg-white border border-slate-300 rounded-full px-3 py-1 shadow-sm hover:bg-slate-50"
          >
            Show great-grandparents ↑
          </button>
        )}
        {currentData.hasGrandchildren && (
          <button
            onClick={() => currentData.children[0] && fetchTree(currentData.children[0].id)}
            className="text-xs bg-white border border-slate-300 rounded-full px-3 py-1 shadow-sm hover:bg-slate-50"
          >
            Show grandchildren ↓
          </button>
        )}
      </div>

      {loadingId && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-full px-4 py-1 shadow text-xs text-slate-600">
          Loading…
        </div>
      )}

      <PersonPanel
        data={panelData}
        onClose={() => { setPanelData(null); setSelectedId(null) }}
        onNavigate={handleNavigate}
      />
    </div>
  )
}

export default function HourglassTree(props: HourglassTreeProps) {
  return (
    <ReactFlowProvider>
      <HourglassTreeInner {...props} />
    </ReactFlowProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/hourglass-tree.tsx
git commit -m "feat: add HourglassTree React Flow component"
```

---

## Task 11: Nav and SearchBar Components

**Files:**
- Create: `src/components/nav.tsx`
- Create: `src/components/search-bar.tsx`

- [ ] **Step 1: Write `src/components/search-bar.tsx`**

```typescript
'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface SearchResult {
  id: string
  fullName: string
  birthDate: string | null
  birthPlace: string | null
  deathDate: string | null
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const debouncedQuery = useDebounce(query, 300)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!debouncedQuery.trim()) { setResults([]); return }
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then(r => r.json())
      .then(data => { setResults(data); setOpen(true) })
  }, [debouncedQuery])

  const select = useCallback((id: string) => {
    setQuery('')
    setResults([])
    setOpen(false)
    router.push(`/tree?id=${id}`)
  }, [router])

  return (
    <div className="relative w-64">
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search family members…"
        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
      {open && results.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
          {results.map(r => (
            <li key={r.id}>
              <button
                onMouseDown={() => select(r.id)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
              >
                <span className="font-medium text-slate-800">{r.fullName}</span>
                <span className="text-slate-400 text-xs ml-2">
                  {r.birthDate?.split(' ').pop()}
                  {r.birthPlace && ` · ${r.birthPlace.split(',')[0]}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write `src/components/nav.tsx`**

```typescript
import Link from 'next/link'
import { auth, signOut } from '@auth'
import SearchBar from './search-bar'

export default async function Nav() {
  const session = await auth()

  return (
    <nav className="h-14 border-b border-slate-200 bg-white flex items-center px-6 gap-6 shrink-0">
      <Link href="/tree" className="font-semibold text-slate-800 text-sm whitespace-nowrap">
        🌳 Ward Family Tree
      </Link>

      <div className="flex items-center gap-4 flex-1">
        <Link href="/tree" className="text-sm text-slate-600 hover:text-slate-900">Tree</Link>
        <Link href="/search" className="text-sm text-slate-600 hover:text-slate-900">Search</Link>
      </div>

      <SearchBar />

      {session?.user && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-500 hidden sm:block">{session.user.email}</span>
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/auth/signin' }) }}>
            <button type="submit" className="text-xs text-slate-500 hover:text-slate-800">Sign out</button>
          </form>
        </div>
      )}
    </nav>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/nav.tsx src/components/search-bar.tsx
git commit -m "feat: add Nav and SearchBar components"
```

---

## Task 12: Root Layout and Core Pages

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/app/tree/page.tsx`
- Create: `src/app/search/page.tsx`

- [ ] **Step 1: Write `src/app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Nav from '@/components/nav'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Ward Family Tree',
  description: 'Explore the Ward, Witts, Brooke and Kennaugh family history',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex flex-col h-screen bg-slate-50`}>
        <Nav />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Write `src/app/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@auth'

export default async function Home() {
  const session = await auth()
  if (session) redirect('/tree')
  redirect('/auth/signin')
}
```

- [ ] **Step 3: Write `src/app/tree/page.tsx`**

```typescript
import { auth } from '@auth'
import { redirect } from 'next/navigation'
import { getHourglassData } from '@/lib/queries'
import { signBlobUrl } from '@/lib/media'
import HourglassTree from '@/components/hourglass-tree'
import type { HourglassData, Individual } from '@/lib/queries'

async function signIndividual(ind: Individual | null): Promise<Individual | null> {
  if (!ind) return null
  return { ...ind, photoBlobUrl: ind.photoBlobUrl ? await signBlobUrl(ind.photoBlobUrl) : null }
}

async function signHourglassData(data: HourglassData): Promise<HourglassData> {
  const [individual, father, mother, pgf, pgm, mgf, mgm, children] = await Promise.all([
    signIndividual(data.individual),
    signIndividual(data.father),
    signIndividual(data.mother),
    signIndividual(data.paternalGrandfather),
    signIndividual(data.paternalGrandmother),
    signIndividual(data.maternalGrandfather),
    signIndividual(data.maternalGrandmother),
    Promise.all(data.children.map(c => signIndividual(c))),
  ])
  return {
    ...data,
    individual: individual!,
    father, mother,
    paternalGrandfather: pgf, paternalGrandmother: pgm,
    maternalGrandfather: mgf, maternalGrandmother: mgm,
    children: children.filter(Boolean) as Individual[],
  }
}

export default async function TreePage({
  searchParams,
}: {
  searchParams: { id?: string }
}) {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  const id = searchParams.id ?? process.env.DEFAULT_ROOT_PERSON_ID ?? ''
  if (!id) return <div className="p-8 text-slate-500">Set DEFAULT_ROOT_PERSON_ID in .env.local</div>

  const rawData = await getHourglassData(id)
  if (!rawData) return <div className="p-8 text-slate-500">Person not found: {id}</div>

  const data = await signHourglassData(rawData)

  return (
    <div className="w-full h-full">
      <HourglassTree initialData={data} defaultRootId={id} />
    </div>
  )
}
```

- [ ] **Step 4: Write `src/app/search/page.tsx`**

```typescript
import { auth } from '@auth'
import { redirect } from 'next/navigation'
import { searchIndividuals } from '@/lib/queries'
import Link from 'next/link'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  const q = searchParams.q ?? ''
  const results = q ? await searchIndividuals(q) : []

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-800 mb-6">Search</h1>
      <form method="GET" action="/search" className="mb-6">
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name…"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit"
            className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700"
          >
            Search
          </button>
        </div>
      </form>

      {results.length === 0 && q && (
        <p className="text-slate-500 text-sm">No results for "{q}"</p>
      )}

      <ul className="space-y-2">
        {results.map(r => (
          <li key={r.id}>
            <Link
              href={`/tree?id=${r.id}`}
              className="block bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition"
            >
              <p className="font-medium text-slate-800 text-sm">{r.fullName}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {r.birthDate && `b. ${r.birthDate}`}
                {r.birthPlace && ` · ${r.birthPlace}`}
                {r.deathDate && ` · d. ${r.deathDate}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Test the tree page**

```bash
npm run dev
```

Sign in, then visit http://localhost:3000/tree. Expected: Hourglass tree renders with the default root person. Click a node — expected: slide-in panel opens. Click "View full profile →" — expected: navigates to `/person/[id]` (404 for now).

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx src/app/tree/page.tsx src/app/search/page.tsx
git commit -m "feat: add root layout, tree page, and search page"
```

---

## Task 13: Full Profile Page and MediaGallery

**Files:**
- Create: `src/components/media-gallery.tsx`
- Create: `src/app/person/[id]/page.tsx`

- [ ] **Step 1: Write `src/components/media-gallery.tsx`**

```typescript
'use client'

import { useState } from 'react'

interface MediaItem {
  id: number
  blobUrl: string
  mediaType: string
  title: string | null
}

export default function MediaGallery({ items }: { items: MediaItem[] }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  if (items.length === 0) return null

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {items.map(item =>
          item.mediaType === 'photo' ? (
            <button
              key={item.id}
              onClick={() => setLightboxUrl(item.blobUrl)}
              className="aspect-square overflow-hidden rounded-lg border border-slate-200 hover:border-indigo-300 transition"
            >
              <img src={item.blobUrl} alt={item.title ?? ''} className="w-full h-full object-cover" />
            </button>
          ) : (
            <a
              key={item.id}
              href={item.blobUrl}
              target="_blank"
              rel="noreferrer"
              className="aspect-square flex flex-col items-center justify-center rounded-lg border border-slate-200 hover:border-indigo-300 bg-slate-50 gap-1 transition"
            >
              <span className="text-2xl">📄</span>
              <span className="text-[10px] text-slate-500 px-1 text-center truncate w-full">{item.title ?? 'Document'}</span>
            </a>
          )
        )}
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="" className="max-h-full max-w-full rounded object-contain" />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white text-3xl leading-none"
          >
            ×
          </button>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Write `src/app/person/[id]/page.tsx`**

```typescript
import { auth } from '@auth'
import { redirect, notFound } from 'next/navigation'
import { getPersonDetail } from '@/lib/queries'
import { signBlobUrl } from '@/lib/media'
import Link from 'next/link'
import MediaGallery from '@/components/media-gallery'
import type { Individual } from '@/lib/queries'

async function signIndividual(ind: Individual | null): Promise<Individual | null> {
  if (!ind) return null
  return { ...ind, photoBlobUrl: ind.photoBlobUrl ? await signBlobUrl(ind.photoBlobUrl) : null }
}

export default async function PersonPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  const raw = await getPersonDetail(params.id)
  if (!raw) notFound()

  // Sign all media URLs
  const signedMedia = await Promise.all(
    raw.media.map(async m => ({ ...m, blobUrl: await signBlobUrl(m.blobUrl) }))
  )

  const [father, mother, ...signedSpouses] = await Promise.all([
    signIndividual(raw.father),
    signIndividual(raw.mother),
    ...raw.spouses.map(signIndividual),
    ...raw.children.map(signIndividual),
  ])
  const signedChildren = await Promise.all(raw.children.map(signIndividual))

  function FamilyRow({ person, label }: { person: Individual | null; label: string }) {
    if (!person) return null
    return (
      <div className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
        <span className="text-sm text-slate-500">{label}</span>
        <Link href={`/tree?id=${person.id}`} className="text-sm text-indigo-600 hover:underline">
          {person.fullName}
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      {/* Back link */}
      <Link href="/tree" className="text-sm text-slate-500 hover:text-slate-800">← Back to tree</Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        {signedMedia.find(m => m.mediaType === 'photo') && (
          <img
            src={signedMedia.find(m => m.mediaType === 'photo')!.blobUrl}
            alt={raw.fullName}
            className="w-20 h-20 rounded-full object-cover border border-slate-200"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{raw.fullName}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {raw.birthDate && `Born ${raw.birthDate}`}
            {raw.birthPlace && ` · ${raw.birthPlace}`}
          </p>
          {raw.deathDate && (
            <p className="text-sm text-slate-500">
              Died {raw.deathDate}
              {raw.deathPlace && ` · ${raw.deathPlace}`}
            </p>
          )}
          {raw.burialDate && (
            <p className="text-sm text-slate-500">
              Buried {raw.burialDate}
              {raw.burialPlace && ` · ${raw.burialPlace}`}
            </p>
          )}
        </div>
      </div>

      {/* Events */}
      {raw.events.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Life Events</h2>
          <ul className="space-y-1.5">
            {raw.events.map((e, i) => (
              <li key={i} className="flex gap-4 text-sm">
                <span className="text-slate-500 capitalize w-20 shrink-0">{e.type}</span>
                <span className="text-slate-800">
                  {e.date}{e.place && ` · ${e.place}`}
                  {e.description && e.description !== e.type && ` — ${e.description}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Family */}
      {(father || mother || raw.spouses.length > 0 || raw.children.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Family</h2>
          <div className="bg-white border border-slate-200 rounded-lg px-4 divide-y divide-slate-100">
            <FamilyRow person={father} label="Father" />
            <FamilyRow person={mother} label="Mother" />
            {signedSpouses.map((s, i) => s && <FamilyRow key={i} person={s} label="Spouse" />)}
            {signedChildren.map((c, i) => c && <FamilyRow key={i} person={c} label="Child" />)}
          </div>
        </section>
      )}

      {/* Notes */}
      {raw.notes && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Notes</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{raw.notes}</p>
        </section>
      )}

      {/* Media */}
      {signedMedia.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Photos & Documents ({signedMedia.length})
          </h2>
          <MediaGallery items={signedMedia} />
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Test the profile page**

```bash
npm run dev
```

Sign in → visit `/tree` → click a person → click "View full profile →". Expected: Full profile page with name, dates, family links, and media gallery. Click a photo — expected: lightbox opens.

- [ ] **Step 4: Commit**

```bash
git add src/components/media-gallery.tsx src/app/person
git commit -m "feat: add full profile page and media gallery"
```

---

## Task 14: Deploy to Vercel

**Files:**
- No new files; configure Vercel project and env vars

- [ ] **Step 1: Install Vercel CLI**

```bash
npm install -g vercel
```

- [ ] **Step 2: Link the project to Vercel**

```bash
vercel link
```

Follow prompts: create new project named `family-tree` (or similar). Choose your Vercel account.

- [ ] **Step 3: Add environment variables in Vercel dashboard**

Go to vercel.com → your project → Settings → Environment Variables. Add:

| Key | Value | Environments |
|-----|-------|-------------|
| `DATABASE_URL` | your Neon connection string | Production, Preview, Development |
| `AUTH_SECRET` | your 32-char secret | Production, Preview, Development |
| `AUTH_RESEND_KEY` | your Resend API key | Production, Preview, Development |
| `RESEND_FROM` | `Family Tree <noreply@yourdomain.com>` | Production, Preview, Development |
| `BLOB_READ_WRITE_TOKEN` | your Vercel Blob token | Production, Preview, Development |
| `DEFAULT_ROOT_PERSON_ID` | e.g. `I1` | Production, Preview, Development |
| `NEXTAUTH_URL` | your production URL, e.g. `https://family-tree.vercel.app` | Production |

- [ ] **Step 4: Deploy to preview**

```bash
vercel
```

Expected: Deployment succeeds, preview URL printed.

- [ ] **Step 5: Verify the deployment**

Open the preview URL. Expected:
- Redirected to `/auth/signin`
- Sign in with email — receive magic link — click link — see tree page
- Tree renders with the default root person
- Clicking a node opens the slide-in panel
- "View full profile →" shows the profile page with media

- [ ] **Step 6: Deploy to production**

```bash
vercel --prod
```

Expected: Production URL (e.g. `https://family-tree.vercel.app`) is live.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: production deployment ready"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] GEDCOM importer → Task 3 (parser) + Task 4 (importer)
- [x] Database schema → Task 2
- [x] Auth (email magic-link, self-register, route protection) → Task 5
- [x] Hourglass tree (ancestors above, descendants below, pan/zoom) → Tasks 7–10
- [x] Search (debounced, name ILIKE, GIN index) → Task 6 (queries) + Task 11 (SearchBar) + Task 12 (search page)
- [x] Slide-in panel with family + media thumbnails → Task 9
- [x] Full profile page with media gallery + lightbox → Task 13
- [x] Private Vercel Blob with signed URLs (5 min expiry) → Task 6 (media.ts)
- [x] "View full profile →" button on panel → Task 9
- [x] Deploy to Vercel → Task 14
- [x] `DEFAULT_ROOT_PERSON_ID` env var → Task 4 (step 7) + Task 12

**Types/method consistency:**
- `Individual.photoBlobUrl` used consistently across queries.ts, tree-layout.ts, person-node.tsx, tree/page.tsx, person/[id]/page.tsx
- `HourglassData` type exported from queries.ts, re-exported from tree-layout.ts
- `signBlobUrl()` imported from `@/lib/media` in API routes and server pages
- `buildHourglassLayout()` called with `HourglassData` in hourglass-tree.tsx

**Placeholder check:** No TBDs or incomplete steps found.
