# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev              # Next.js dev server (localhost:3000)
npm run build            # production build
npm test                 # vitest, single run
npm run test:watch       # vitest watch mode
npx vitest run tests/pedigree-layout.test.ts           # one test file
npx vitest run -t 'renders the focus person as a personCard flagged isFocus' # one test by name
npm run import-gedcom    # wipe + reimport GEDCOM into Postgres and Blob
```

There is no lint script and no lint config; `npm run build` (type-check + Next build) is the gate.

One-time DB setup (no script wraps it):
`npx dotenv -e .env.local -- bash -c 'psql "$DATABASE_URL" -f scripts/schema.sql'`, or paste
`scripts/schema.sql` into the Neon SQL editor.

Env lives in `.env.local`; see `.env.example` for the required keys
(`DATABASE_URL`, `AUTH_SECRET`, `AUTH_RESEND_KEY`, `RESEND_FROM`, `BLOB_READ_WRITE_TOKEN`,
`DEFAULT_ROOT_PERSON_ID`).

## Architecture

Genealogy site for a Brooke family GEDCOM: Next.js App Router + React 19, Neon Postgres,
Auth.js v5 magic links, private Vercel Blob for media, React Flow for the tree.

**Import is one-way and destructive.** `scripts/import-gedcom.ts` parses `7.0.3/Brooke/Brooke.ged`
with `scripts/gedcom-parser.ts` (dependency-free, pure function — the parser is the unit-tested
part), TRUNCATEs `individuals`, `families`, and `users`, uploads `7.0.3/Brooke/Brooke Media` to
Vercel Blob with `access: 'private'`, then inserts. GEDCOM IDs are the primary keys throughout, so
`DEFAULT_ROOT_PERSON_ID` is a raw GEDCOM ID. The scripts run under `tsconfig.scripts.json`
(CommonJS + ts-node) and need `neonConfig.webSocketConstructor = ws` — anything touching `Pool`
outside the Next runtime does.

**Data access is centralised in `src/lib/queries.ts`.** It is the only module that imports `sql`
from `src/lib/db.ts`, and it maps snake_case rows to camelCase interfaces (`Individual`,
`PersonDetail`, `FullTreeData`) via `rowToIndividual`. Pages and route handlers call these
functions; they never write SQL inline. `src/lib/db.ts` exports two clients: `sql` (Neon HTTP
tagged template) for app queries and `pool` (WebSocket pool) solely for the Auth.js pg-adapter.

**Media never reaches the client as a raw blob URL.** Blobs are private, and `@vercel/blob` v2 has
no signed-URL API, so `src/lib/media.ts` rewrites every `photoBlobUrl` to
`/api/media?url=...`. `src/app/api/media/route.ts` is the session-gated proxy and validates the
hostname against `*.public.blob.vercel-storage.com` to block SSRF. Any new surface that returns
media must pass values through `signIndividual` / `signBlobUrl`.

**Auth is split for the Edge.** `auth.config.ts` is the Node-free config (providers, pages,
callbacks) consumed by `src/middleware.ts`; `auth.ts` adds the Postgres adapter and JWT sessions
and is imported as `@auth` (path alias, distinct from `@/*` → `src/*`). Middleware redirects
unauthenticated non-`/auth`, non-`/api` requests to `/auth/signin`; `/api` routes are excluded
there and must therefore check `await auth()` themselves, as every existing route does.

**The tree loads whole, then draws a slice.** `src/app/tree/page.tsx` fetches the entire graph with
`getFullTreeData()` (~690 individuals) server-side, signs photos, and hands it to the `PedigreeTree`
client component. `src/lib/tree-index.ts` builds parent/spouse/child lookup maps once;
`src/lib/pedigree-layout.ts` then draws only the cards around the current focus person — the focus
and spouse, their children to the left, and three ancestor generations to the right in fixed
Ahnentafel slots (person *n*'s father is *2n*, mother *2n+1*), so positions are arithmetic rather
than solved. Both modules are pure and unit-tested without a DOM. Re-rooting is client-side only:
it calls `window.history.pushState` to set `?focus=<id>`, because `router.push` would re-run the
server component and reissue the 690-row query on every click.

Design notes and step-by-step plans for both features live in `docs/superpowers/`.
