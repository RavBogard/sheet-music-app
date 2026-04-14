# 04-07 Triple-Modal Chain — investigated, intentionally not consolidated

## What the roadmap said
> Consolidate triple modal chain (SearchOverlay + AddSongsModal + AddToSetlistSheet)

## What I found after reading all three

The three components are NOT a chain — they are three modals serving three distinct intents:

| Component | Direction | Use case | Trigger |
|-----------|-----------|----------|---------|
| `AddSongsModal` | songs → current setlist | Bulk multi-select + smart suggestions to populate a setlist that's empty or being expanded | Editor "Add Songs" button |
| `SearchOverlay` | single song → setlist slot | "Tap to link a chart" inline action; replace-track flow | Tapping an unlinked row, Replace action |
| `AddToSetlistSheet` | song → some setlist (inverse direction) | From the library, pick which setlist to add the song to | LibraryCard action; also chained from SearchOverlay's "Add to Setlist…" subtype |

The three differ in:
- **Direction of addition** (songs→one setlist vs song→many setlists)
- **Selection model** (bulk multi-select vs single click vs setlist pick)
- **Result behaviour** (in-place track update vs cross-setlist write vs onAdd callback)
- **Surrounding UX** (Sheet right-side vs full-screen overlay vs bottom Sheet)

The only duplication is library-search-list rendering — and even that is small enough that the right cure is a shared `LibrarySearchList` component, not collapsing the modals. That extraction is **valuable but has high regression risk** (touching all three flows at once) and would deserve its own dedicated plan with /ui-ux-pro-max review.

## Recommendation
- Keep the three modals as-is; rename "consolidation" to "extract LibrarySearchList" in the next milestone's roadmap.
- Track this as a deferred item in PROJECT.md / next milestone planning.

## Decision
**Skip 04-07 in this milestone.** The premise was wrong — there's no chain to break. Premature consolidation here would worsen UX and increase regression surface for negligible code-reduction gains.

— 2026-04-14
