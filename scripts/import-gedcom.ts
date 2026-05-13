import { readFileSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { neonConfig, Pool } from '@neondatabase/serverless'
import { put } from '@vercel/blob'
import { parseGedcom } from './gedcom-parser'
import ws from 'ws'

// Required for Neon serverless in Node.js
neonConfig.webSocketConstructor = ws

const GEDCOM_FILE = join(__dirname, '../7.0.3/Brooke/Brooke.ged')
const MEDIA_DIR = join(__dirname, '../7.0.3/Brooke/Brooke Media')

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
  await pool.query('TRUNCATE users CASCADE')

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
