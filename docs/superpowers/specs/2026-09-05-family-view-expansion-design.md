# Family View with In-Place Expansion — Design Spec

**Date:** 2026-09-05
**Status:** Approved
**Supersedes:** `2026-08-15-ancestry-pedigree-view-design.md` (layout and interaction sections)

## Overview

Replace the fixed three-generation pedigree on `/tree` with Ancestry's Family View: the tree
starts around one family and grows in place as the user clicks chevrons on parent or child
cards. Cards already on screen stay where they are; expanding a branch pushes only the branches
beside it.

The page still loads the whole graph once with `getFullTreeData()` and indexes it with
`buildTreeIndex`. Only the layout and the client interaction change. Card styling, the detail
panel, media signing, auth, and queries are unchanged.

## Goals

- Start from a Family View: focus and spouse, siblings, three generations of ancestors, two
  generations of descendants
- A chevron on a card's right edge expands or collapses that person's parents
- A chevron on a card's left edge expands or collapses that person's spouse and children
- Cards on screen keep their relative order and position as branches expand
- Clicking a card body opens the detail panel; re-rooting is an explicit action from the panel
- Focus stays in the URL (`?focus=<id>`), re-rooting stays client-side

## Non-Goals

- Pedigree, fan, or vertical views, or a view switcher
- Persisting expansion state in the URL
- Placeholder cards for missing relatives
- Choosing between multiple spouses on a card
- Card restyling beyond the two chevrons

## Starting State

On load, and after every re-root, the visible slice is:

| Region | Content |
|---|---|
| Focus column | Focus card, first spouse stacked beneath it with a marriage bar, siblings above and below the couple, collapsed |
| Right | Parents, grandparents, great-grandparents (focus, parents, and grandparents are in `expandedUp`) |
| Left | Children of the focus, each with their first spouse and their children (focus and each child are in `expandedDown`) |

The viewport fits the starting slice with `fitView`, capped at zoom 1, then eases to centre on the
focus when re-rooting.

## Expansion Model

Expansion state is two sets of person ids held in component state:

```ts
interface Expansion {
  up: Set<string>    // draw this person's parents
  down: Set<string>  // draw this person's spouse and children
}
```

- A card whose person has at least one drawable parent shows a chevron on its right edge.
  Clicking toggles the id in `up`.
- A card on the descendant side (focus, siblings, and anyone reached by descending) whose person
  has at least one drawable child shows a chevron on its left edge. Clicking toggles the id in
  `down`.
- Ancestor cards never show a left chevron: aunts, uncles, and cousins are reached by
  re-rooting, not by expansion, which keeps the ancestor side a strict pedigree.
- Collapsing a person removes their whole branch. Ids deeper in the branch stay in the set, so
  re-expanding restores the branch as it was.
- Expansion resets to the starting state on re-root.
- The viewport does not move on expand or collapse.

## Interaction

| Action | Result |
|---|---|
| Click right chevron | Toggle parents of that person |
| Click left chevron | Toggle spouse and children of that person |
| Click card body | Fetch `/api/person/[id]`, open `PersonPanel` |
| "Centre tree here" in panel | Re-root on that person, reset expansion, ease to the focus |
| Click a relative in the panel | Re-root on that relative, as above |
| Browser back/forward | Walks focus history; expansion resets |

Re-rooting calls `window.history.pushState(null, '', '?focus=<id>')` so `useSearchParams` updates
without re-running the server component. `router.push` is not used, for the reason given in the
previous spec: it would reissue the full-tree query on every click.

## Layout Algorithm

### Signature

```ts
export function buildFamilyLayout(
  index: TreeIndex,
  focusId: string,
  expansion: Expansion,
): { nodes: Node<PersonCardData>[]; edges: Edge[] }
```

Pure, DOM-free, no graph solver. `resolveFocusId` and the `NODE_W`, `NODE_H`, `COL_GAP`,
`ROW_GAP`, `MARRIAGE_GAP` constants carry over from `pedigree-layout.ts`.

### Columns

Column `c` has `x = c × (NODE_W + COL_GAP)`. The focus column is 0, ancestors are at `c ≥ 1`,
descendants at `c ≤ −1`.

### Bands

Every drawn person or family unit owns a vertical band. A band is tall enough for everything the
person's expansion draws. Layout is two recursive passes, measure then place, in each direction.

**Ancestor side.** For a person `p` in column `c`:

```
heightUp(p) =
  if p ∉ up or p has no drawable parents:  NODE_H
  else:  sum of heightUp(parent) for each drawn parent, plus ROW_GAP between them
```

Place the drawn parents in column `c + 1`, stacked within `p`'s band, father above mother. `p`
sits at the vertical centre of its band. A person with one drawable parent draws that parent
alone, still in the parent's column.

**Descendant side.** A family unit is a person plus, when `p ∈ down` and a spouse exists, the first
spouse card stacked beneath with `MARRIAGE_GAP`. For a unit rooted at `p` in column `c`:

```
unitHeight(p) = NODE_H, or 2 × NODE_H + MARRIAGE_GAP when the spouse is drawn

heightDown(p) =
  if p ∉ down or p has no drawable children:  unitHeight(p)
  else:  max(unitHeight(p), sum of heightDown(child) for each drawn child, plus ROW_GAP between them)
```

Place the drawn children in column `c − 1`, stacked within `p`'s band in family order. The unit
sits at the centre of its band.

**Focus column.** The focus's parents form a family unit whose children are the focus and its
siblings, in family order. The focus column is that unit's children band, laid out by the
descendant rule with the parents' unit itself not drawn on the left. Siblings are therefore
ordinary descendant-side roots and need no special case. The ancestor pass hangs off the focus
card only, centred on the focus card itself (not the couple or the sibling stack), so ancestors and the sibling stack never compete
for vertical space: they occupy different columns.

When the focus has no recorded parents, the focus column is just the focus's own unit.

### De-duplication

A `placed` set records every id drawn. A person reached a second time (cousin marriage, pedigree
collapse, a sibling who is also the spouse of a child) is skipped, and the chevron that would
reach them draws nothing. Recursion is bounded by set membership and the `placed` set, so a
malformed GEDCOM with an ancestry loop cannot hang the layout.

### Node data

```ts
export interface PersonCardData {
  individual: Individual
  isFocus: boolean
  isSpouse: boolean          // drawn as the lower half of a couple
  spouseCount: number        // badge on a spouse card when > 1
  canExpandUp: boolean       // right chevron shown
  expandedUp: boolean        // right chevron points inward (collapse)
  canExpandDown: boolean     // left chevron shown
  expandedDown: boolean
}
```

### Edges

- Parent edges: from the child's `right` handle to each drawn parent's `left` handle, type
  `smoothstep`. Two edges from one source render as a bracket with a shared vertical bar.
- Child edges: from the unit's person `left` handle to each drawn child's `right` handle,
  `smoothstep`.
- Marriage bar: from the person's `bottom` handle to the spouse's `top` handle, `straight`.

## Components

| File | Change |
|---|---|
| `src/lib/family-layout.ts` (new) | `buildFamilyLayout`, `Expansion`, `defaultExpansion`, constants and `resolveFocusId` moved from `pedigree-layout.ts` |
| `src/lib/pedigree-layout.ts` | Removed |
| `src/components/family-tree.tsx` (renamed from `pedigree-tree.tsx`) | Holds `expansion` state; resets it when `focusId` changes; passes chevron handlers; `fitView` on load, `setCenter` on re-root |
| `src/components/person-node.tsx` | Two chevron buttons, `data-expand-up` / `data-expand-down`, replacing `data-detail-button` and the `hasMore` marker |
| `src/components/person-panel.tsx` | "Centre tree here" button calling `onNavigate(individual.id)` |
| `src/app/tree/page.tsx` | Renders `FamilyTree` |
| `CLAUDE.md` | Tree paragraph describes bands and expansion instead of Ahnentafel slots |

`defaultExpansion(index, focusId)` builds the starting sets: `up` = focus, parents, grandparents;
`down` = focus and each child of the focus.

Click routing stays in the tree component's `onNodeClick`, recovering intent from the clicked
element's `data-*` attribute exactly as the current code does with `data-detail-button`.

## Edge Cases

| Case | Behaviour |
|---|---|
| `?focus` missing or unknown | `resolveFocusId` falls back to `DEFAULT_ROOT_PERSON_ID` |
| Focus has no parents | No sibling stack, no right chevron on the focus |
| Person is a child in more than one family | First family wins, as in `tree-index.ts` |
| Person has more than one spouse | First spouse drawn, badged `+N`; children are the union across families |
| Spouse of a descendant is also drawn elsewhere | Spouse card skipped; children still drawn under the person |
| Collapse then re-expand | Branch returns exactly as it was |
| Expanding into a very tall branch | Neighbouring bands are pushed; the viewport stays put and the user pans |

## Testing

`tests/family-layout.test.ts` replaces `tests/pedigree-layout.test.ts`. All cases are pure and run
in the existing vitest `node` environment.

- Starting state draws focus, spouse, siblings, three ancestor generations, children and
  grandchildren, and nothing further
- Father is above mother; a person's card is centred on its parents' combined band
- Expanding a great-grandparent adds a column-4 card and shifts only cards in that branch's band;
  cards in other bands keep their positions
- Collapsing removes the branch; re-expanding restores identical positions
- Expanding a child draws their spouse beneath them and their children one column further left,
  and pushes the sibling below them down by the added height
- Siblings sit in column 0 in family order with the focus among them
- Ancestor cards never get `canExpandDown`; descendant cards get it only when children exist
- A person reachable twice is drawn once
- `resolveFocusId` behaviour carries over

Existing `tests/tree-index.test.ts` is unchanged.

## Knock-On Changes

`CLAUDE.md`'s architecture paragraph on the tree and the single-test examples in its Commands
section reference `pedigree-layout` and must be updated in the same change.
