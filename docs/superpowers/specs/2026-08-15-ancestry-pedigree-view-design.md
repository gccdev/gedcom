# Ancestry-Style Pedigree View — Design Spec

**Date:** 2026-08-15
**Status:** Approved

## Overview

Replace the whole-graph dagre tree on `/tree` with a horizontal pedigree chart modelled on
Ancestry's default family view: a focus person on the left, ancestors fanning out to the right,
children in a column to the left, and re-rooting by clicking any card.

The page still loads the entire tree once via `getFullTreeData()`. Only the rendering changes:
instead of laying out all 690 individuals, the client indexes them once and draws only the cards
around the current focus person (up to 15 ancestors, plus spouse and children), recomputing that
slice on every re-root.

## Goals

- Horizontal pedigree: focus at the left, three ancestor generations to the right
- Focus person shown with spouse; focus person's children in a column to the left
- Clicking a card makes that person the new focus; the view eases to re-centre
- A chevron on each card opens the existing `PersonPanel` with full details
- Focus person lives in the URL (`?focus=<id>`) so back/forward and links work
- No server round-trip when re-rooting

## Non-Goals

- Fan chart, vertical view, or a view switcher
- "Add person" placeholder cards for empty ancestor slots — the data is read-only from a GEDCOM import
- Descendant charts beyond the immediate children column

## Architecture

### Modules

| File | Role |
|---|---|
| `src/lib/tree-index.ts` (new, pure) | `buildTreeIndex(data)` → lookup maps |
| `src/lib/pedigree-layout.ts` (new, pure) | `buildPedigreeLayout(index, focusId)` → React Flow nodes/edges |
| `src/components/pedigree-tree.tsx` (new) | Client component: focus state, re-root, panel fetch |
| `src/components/person-node.tsx` (rewritten) | Horizontal card, left/right handles, detail chevron |
| `src/app/tree/page.tsx` (edited) | Reads initial `?focus` from `searchParams` |

Removed: `src/lib/full-tree-layout.ts`, `src/components/full-tree.tsx`,
`src/components/family-connector-node.tsx`, `tests/full-tree-layout.test.ts`, and the
`@dagrejs/dagre` dependency. Ancestor cards connect directly to their child, so the family
connector node has no role in a pedigree.

Unchanged: `src/lib/queries.ts`, `src/lib/media.ts`, all API routes, `PersonPanel`, auth.

### `tree-index.ts`

```ts
export interface TreeIndex {
  byId: Map<string, Individual>
  parentsOf: Map<string, { fatherId: string | null; motherId: string | null }>
  spouseFamiliesOf: Map<string, FamilyRecord[]>
  childrenOf: Map<string, string[]>
}

export function buildTreeIndex(data: FullTreeData): TreeIndex
```

Built once from `FullTreeData` with `useMemo` in `pedigree-tree.tsx`. Without it, every re-root
would rescan all individuals and families; with it, a re-root costs only the cards drawn.

`parentsOf` is derived from the first family in which a person appears as a child.
`childrenOf` is the union of children across all of a person's spouse families.

### `pedigree-layout.ts`

```ts
export function resolveFocusId(
  index: TreeIndex,
  requested: string | null,
  fallback: string,
): string

export function buildPedigreeLayout(
  index: TreeIndex,
  focusId: string,
): { nodes: Node[]; edges: Edge[] }
```

`resolveFocusId` returns `requested` when it names someone in the index and `fallback` otherwise,
keeping the unknown-id rule in a pure, testable place rather than inside the component.

Pure function, no graph solver. Ancestors are numbered as a binary heap (Ahnentafel): the focus
person is 0, and person *n*'s father is *2n*, mother *2n+1*. Generation *g* therefore has exactly
2^g slots, and positions are arithmetic:

```
x(g)    = g × (NODE_W + COL_GAP)
y(g, i) = (i + 0.5) × ROW × 2^(MAX_GEN − g)
```

where `ROW = NODE_H + ROW_GAP`, `MAX_GEN = 3`, `g` is the generation and `i` the slot index within
it. The `y` formula covers the ancestor generations only (`g` from 0 to `MAX_GEN`); the spouse and
children cards are positioned relative to the focus card, as described below. Great-grandparents occupy a plain 8-row grid; each earlier generation sits
centred between the two slots it feeds. Father-above-mother ordering falls out of the numbering.

Columns: children at `g = −1`, focus at 0, parents 1, grandparents 2, great-grandparents 3.

A missing ancestor contributes no node and its slot stays empty — the grid must not collapse, so
that cards hold position as the user navigates.

Node types and data:

- `personCard` — `{ individual, role, isFocus, hasMore, spouseCount }` where `role` is
  `'focus' | 'spouse' | 'ancestor' | 'child'`
- `hasMore` is true when a card at `MAX_GEN` has at least one parent in the index, driving the
  chevron that indicates further ancestry
- The spouse card sits immediately below the focus card, joined by a marriage bar; ancestor edges
  originate from the focus card only, and child edges from the couple
- The children column is centred vertically on the couple

Edges are React Flow `smoothstep`, drawn from descendant (source, right handle) to ancestor
(target, left handle).

### Focus state

The page reads `?focus` from `searchParams` for the initial render only. Re-rooting calls
`window.history.pushState(null, '', '?focus=<id>')` from the client. Next.js integrates native
history calls into its router and syncs `useSearchParams`, so the URL and history stack update
without a server round-trip. `router.push` is deliberately **not** used: it would re-run the
server component and reissue `getFullTreeData()` — a 690-row query — on every click.

Reference: `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` §"Shallow
routing on the client".

## Interaction

| Action | Result |
|---|---|
| Click card body | That person becomes the focus; `setCenter` eases to the new focus position |
| Click card chevron | Fetch `/api/person/[id]`, open `PersonPanel` |
| Click a relative in `PersonPanel` | Re-roots the tree onto them (reaches descendants past the children column) |
| Browser back/forward | Walks focus history |

## Edge Cases

| Case | Behaviour |
|---|---|
| `?focus` missing, unknown, or not in the index | `resolveFocusId` falls back to `DEFAULT_ROOT_PERSON_ID` |
| Person is a child in more than one family | First family wins; a pedigree shows one ancestral line |
| Person has more than one spouse | Spouse card shows the first, badged `+N`; children column is the union across all families, so no child is hidden |
| Person has no recorded parents | Slot left empty, no placeholder card |
| Malformed GEDCOM with an ancestry loop | Depth cap of `MAX_GEN` bounds the walk; cannot hang |
| Focus person has many children | Column grows downward; user pans. No cap. |

## Testing

Both new modules are pure and DOM-free, so they run in the existing vitest `node` environment.

`tests/tree-index.test.ts`
- Parents resolved from the child family; father and mother mapped correctly
- `childrenOf` unions children across multiple spouse families
- A person absent from any family yields empty entries, not undefined

`tests/pedigree-layout.test.ts`
- Father sits above mother; grandparent centred between the two slots it feeds
- A missing ancestor leaves a gap without shifting its siblings
- `hasMore` set only when an off-screen parent exists at `MAX_GEN`
- Children column centred on the couple
- Spouse card present with correct `spouseCount` badge for multi-spouse focus
- `resolveFocusId` returns the requested id when present and the fallback when absent or unknown

## Knock-On Changes

`CLAUDE.md`'s architecture section describes the dagre bipartite layout and must be updated to
describe the pedigree layout in the same change.
