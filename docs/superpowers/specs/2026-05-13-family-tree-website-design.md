# Family Tree Website — Design Spec
_2026-05-13_

## Overview

A password-free, login-required website for browsing and exploring the Ward/Witts/Brooke/Kennaugh family tree. Family members self-register with their email and can navigate an interactive hourglass tree, search for individuals by name, and view photos and documents linked to each person.

---

## Data Source

- **GEDCOM file:** `7.0.3/Ward Witts Brooke Kennaugh/Ward Witts Brooke Kennaugh.ged` (~4.3 MB, GEDCOM 7.0.3 format)
- **Media folder:** `7.0.3/Ward Witts Brooke Kennaugh/Ward Witts Brooke Kennaugh Media/` (~1,899 files: photos, documents)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Database | Neon Postgres |
| Auth | NextAuth.js (Email magic-link provider) |
| Tree visualisation | React Flow |
| Deployment | Vercel |
| Media hosting | Vercel Blob (or `public/media/` for smaller sets) |

---

## Architecture

```
GEDCOM file
    │
    ▼
GEDCOM Importer (one-off Node.js script)
    │  Parses individuals, families, events, media refs
    ▼
Neon Postgres
    │
    ├── Next.js API Routes (search, tree traversal, person detail)
    │
    └── Next.js App (React, React Flow)
            │
            ├── Auth gate (NextAuth.js — magic link email)
            ├── Tree page (hourglass, pan/zoom)
            ├── Search (live debounced name query)
            ├── Slide-in panel (summary + media thumbnails)
            └── Full profile page (all details + media gallery)
```

---

## Database Schema

### `individuals`
| Column | Type | Notes |
|--------|------|-------|
| id | text (GEDCOM xref) | primary key |
| full_name | text | |
| sex | char(1) | M / F / U |
| birth_date | text | freeform as in GEDCOM |
| birth_place | text | |
| death_date | text | |
| death_place | text | |
| burial_date | text | |
| burial_place | text | |
| notes | text | |

### `families`
| Column | Type | Notes |
|--------|------|-------|
| id | text | primary key |
| husband_id | text | FK → individuals |
| wife_id | text | FK → individuals |
| marriage_date | text | |
| marriage_place | text | |

### `family_members`
| Column | Type | Notes |
|--------|------|-------|
| family_id | text | FK → families |
| individual_id | text | FK → individuals |
| role | text | "child" |

### `events`
| Column | Type | Notes |
|--------|------|-------|
| id | serial | primary key |
| individual_id | text | FK → individuals |
| type | text | e.g. census, immigration, occupation |
| date | text | |
| place | text | |
| description | text | |

### `media`
| Column | Type | Notes |
|--------|------|-------|
| id | serial | primary key |
| individual_id | text | FK → individuals |
| filename | text | relative path from media folder |
| media_type | text | photo / document / other |
| title | text | |
| description | text | |

### NextAuth tables
Standard NextAuth schema: `users`, `accounts`, `sessions`, `verification_tokens`.

---

## Pages & Routes

| Route | Description |
|-------|-------------|
| `/` | Landing / home — redirects to `/tree` if logged in, otherwise to `/auth/signin` |
| `/auth/signin` | Magic-link sign-in / self-registration page |
| `/tree` | Main tree view — hourglass centred on a default or last-viewed person |
| `/tree?id=I001` | Hourglass centred on a specific individual |
| `/person/[id]` | Full profile page for an individual |
| `/search` | Search results page (also surfaced inline from nav) |

---

## UI Layout

- **Top navigation bar:** site name/logo, nav links (Home, Tree, Search), user email + sign-out menu
- **Search bar:** below the nav on tree/search pages, debounced live query, shows name + birth year + birth place
- **Tree canvas:** full-width React Flow canvas, pan and zoom, nodes show name + birth–death years + optional photo thumbnail; the default starting person is configured via `DEFAULT_ROOT_PERSON_ID` env var (set to the root ancestor of the tree)
- **Slide-in panel:** appears on the right when a tree node is clicked; shows full name, dates, birth/death places, immediate family (parents, spouse, children as clickable links), and a 3-thumbnail media preview; includes a "View full profile →" button
- **Full profile page:** header with name and dates; sections for vital events, family relationships (each person is a link that recentres the tree), and a full media gallery (lightbox on click)

---

## Hourglass Tree

- **Centred person:** rendered in the middle of the canvas
- **Ancestors:** parents (generation +1) and grandparents (generation +2) rendered above with connecting lines
- **Descendants:** children (generation −1) rendered below
- **Expand controls:** "Show great-grandparents" / "Show grandchildren" buttons appear when further generations exist
- **Node click:** opens the slide-in panel; double-click or "Centre on this person" button recentres the tree on that node
- **Navigation:** clicking a person's name in the slide-in panel recentres the tree on them

---

## Authentication

- **Provider:** NextAuth.js Email provider (magic link, passwordless)
- **Flow:**
  1. Unauthenticated users are redirected to `/auth/signin`
  2. User enters their email and submits
  3. NextAuth sends a one-time sign-in link via email (requires an SMTP or transactional email service, e.g. Resend)
  4. Clicking the link creates a session; first-time users have an account auto-created
- **Access revocation:** delete the user's row from the NextAuth `users` table
- **Route protection:** Next.js middleware redirects all non-`/auth/*` routes to sign-in if no session is present

---

## GEDCOM Importer

A standalone Node.js script (`scripts/import-gedcom.ts`) using the `gedcom-parser` npm package (or a lightweight custom parser for GEDCOM 7.0.3). Run once to populate the database; re-running truncates and reimports cleanly.

Steps:
1. Parse the `.ged` file into individuals, families, events, and media references
2. Upsert into Postgres tables
3. Log import stats (individual count, family count, media count, any unrecognised tags)

---

## Media Handling

Media files are referenced by filename in the GEDCOM. The default approach is **private Vercel Blob** — the importer uploads each file with `access: 'private'` and stores the resulting Blob pathname in `media.filename`. This avoids committing large binary files to the repository and keeps media inaccessible without a valid session.

At render time, the app generates a short-lived signed URL (`generateSignedUrl()`) for each media item. Signed URLs expire after 5 minutes, so a copied URL becomes a 403 shortly after. Only authenticated users ever receive a signed URL.

---

## Search

- **Input:** name (full or partial), case-insensitive
- **Query:** `ILIKE '%query%'` on `individuals.full_name`, ordered by relevance (exact prefix match first); a GIN index (`pg_trgm`) on `full_name` is required for acceptable performance at this data size
- **Result card:** full name, birth year, birth place, death year (if applicable)
- **On select:** navigate to `/tree?id=<id>` which centres the hourglass on that person and opens their slide-in panel

---

## Error Handling & Edge Cases

- Individuals with unknown parents show the hourglass with empty ancestor slots (not an error)
- Media files referenced in GEDCOM but missing from disk are silently skipped during import and logged
- Living individuals: GEDCOM 7.0.3 uses `LIVING` tag — these are imported normally (the site is behind auth so privacy is protected by login)
- Long names or places are truncated in tree nodes with full text shown in the panel
