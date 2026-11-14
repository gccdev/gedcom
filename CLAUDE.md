# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run import-gedcom    # wipe + reimport GEDCOM into Postgres and Blob
```

There is no lint script and no lint config; `npm run build` (type-check + Next build) is the gate.

One-time DB setup (no script wraps it):
`npx dotenv -e .env.local -- bash -c 'psql "$DATABASE_URL" -f scripts/schema.sql'`, or paste
`scripts/schema.sql` into the Neon SQL editor. The file is idempotent and also carries the
additive column migrations, so re-running it brings an existing database up to date.

Env lives in `.env.local`; see `.env.example` for the required keys
(`DATABASE_URL`, `AUTH_SECRET`, `AUTH_ALLOWED_EMAILS`, `AUTH_RESEND_KEY`, `RESEND_FROM`, `BLOB_READ_WRITE_TOKEN`,
`DEFAULT_ROOT_PERSON_ID`).

## Architecture

Genealogy site for a Brooke family GEDCOM: Next.js App Router + React 19, Neon Postgres,
Auth.js v5 magic links, private Vercel Blob for media, React Flow for the tree.

**Import is one-way and destructive.** `scripts/import-gedcom.ts` parses `7.0.3/Brooke/Brooke.ged`
with `scripts/gedcom-parser.ts` (dependency-free, pure function — the parser is the unit-tested
part), TRUNCATEs `individuals`, `families`, and `users`, uploads `7.0.3/Brooke/Brooke Media` to
Vercel Blob with `access: 'private'`, then inserts. GEDCOM IDs are the primary keys throughout, so
`DEFAULT_ROOT_PERSON_ID` is a raw GEDCOM ID. Family and child order from the GEDCOM is persisted
in `families.seq` and `family_members.position`; the tree relies on it. The scripts run under
`tsx` (type-checked by `tsconfig.scripts.json`) and need `neonConfig.webSocketConstructor = ws` —
anything touching `Pool` outside the Next runtime does.

**Data access is centralised in `src/lib/queries.ts`.** It is the only module that imports `sql`
from `src/lib/db.ts`, and it maps snake_case rows to camelCase interfaces (`Individual`,
`PersonDetail`, `FullTreeData`) via `rowToIndividual`. Pages and route handlers call these
functions; they never write SQL inline. `src/lib/db.ts` exports two clients: `sql` (Neon HTTP
tagged template) for app queries and `pool` (WebSocket pool) solely for the Auth.js pg-adapter.

**Media never reaches the client as a raw blob URL.** Blobs are private, and `@vercel/blob` v2 has
no signed-URL API, so `src/lib/media.ts` rewrites every `photoBlobUrl` to
`/api/media?url=...`. `src/app/api/media/route.ts` is the session-gated proxy and validates the
URL against the Vercel Blob store hosts (`*.private.` and `*.public.blob.vercel-storage.com`) to
block SSRF, then serves only image and PDF types inline; `src/lib/media-response.ts` holds both rules. Any new surface that returns
media must pass values through `signIndividual` / `signBlobUrl`.

**Auth is split for the Edge.** `auth.config.ts` is the Node-free config (providers, pages,
callbacks) consumed by `src/proxy.ts` (Next 16 name for middleware); `auth.ts` adds the Postgres adapter and JWT sessions
and is imported as `@auth` (path alias, distinct from `@/*` → `src/*`). Middleware redirects
unauthenticated non-`/auth`, non-`/api` requests to `/auth/signin`; `/api` routes are excluded
there and must therefore check `await getSession()` (from `src/lib/session.ts`, which wraps
`auth()` and the local-only bypass in `src/lib/auth-bypass.ts`) themselves, as every existing
route does. Sign-in is closed by default: `src/lib/allowlist.ts` reads
`AUTH_ALLOWED_EMAILS`, and the `signIn` callback, the proxy and `getSession()` all check it, so an
unlisted address gets no email and an existing session for a removed address stops working. The
bypass only activates under `npm run dev` / `npm start`, which bind to 127.0.0.1 and set
`AUTH_BYPASS_BIND=loopback`; its Host check is not a network boundary.

**The tree loads whole, then draws a slice that grows in place.** `src/app/tree/page.tsx` fetches
the entire graph with `getFullTreeData()` (~690 individuals) server-side, signs photos, and hands
it to the `FamilyTree` client component. `src/lib/tree-index.ts` builds parent/spouse/child/sibling
lookup maps once; `src/lib/family-layout.ts` then draws only the cards around the current focus
person, driven by an `Expansion` (two sets of ids: whose parents to draw, whose spouse and
children to draw). Positions come from a recursive band layout: an expanded person owns a
vertical band tall enough for what their expansion draws, father above mother on the right,
children stacked on the left, so expanding one branch pushes only its neighbours. The starting
state is Ancestry's Family View (siblings, three ancestor generations, two descendant
generations). Each card shows name, lifespan, and birth and death date and place (shortened by `src/lib/format.ts`), with a Parents button that toggles a person's parents, a Children button that opens their spouse
and children (expand-only: they stay until Reset or a new focus) and a Focus button that re-roots; a toolbar opens all ancestors or descendants of the focus at once. Both modules are pure and unit-tested
without a DOM. Re-rooting (from the detail panel) is client-side only: it calls
`window.history.pushState` to set `?focus=<id>`, because `router.push` would re-run the server
component and reissue the 690-row query.

Design notes and step-by-step plans for both features live in `docs/superpowers/`.
