# Track B: Old Editor Archaeology

**Phase:** v53-01-recursive-research
**Track:** B
**Date:** 2026-05-02

## Executive Summary

Git spelunk of v50-02 deletion (d8c0442) recovered inventory of pre-spreadsheet-editor UI patterns from SetlistEditorV2.tsx and support ecosystem (use-setlist-logic.ts 818 LOC). Three distinct UI patterns: (1) polymorphic Add menu with 6 tiles, (2) inline chart-binding flow with Replace/Unlink buttons, (3) inline chart preview (file name in collapsed row).

**Verdict:** Add menu RECOMMENDED for v53-03. Chart preview DEFERRED to v53-04. Replace/Unlink REJECTED.

## Deletion Commit: d8c0442 (2026-04-26 v50-05-02)

Files deleted:
- AddBar.tsx - Pattern 1: Polymorphic Add Menu
- SongRow.tsx + InlineFields.tsx - Patterns 2 & 3: Chart binding + preview
- use-setlist-logic.ts (818 LOC) - Anti-Pattern: Optimistic-write divergence

## Pattern 1: Polymorphic Add Menu (AddBar.tsx)

Single "Add Item" button (44-56px, indigo) with 6-tile dropdown:
1. Song from Library (Music, indigo)
2. Section Header (Minus, muted)
3. Reading (BookOpen, amber)
4. Prayer (BookOpen, blue)
5. Transition (ArrowLeftRight, emerald)
6. Stage Note (StickyNote, muted)

Divider separates Song from flow items. Sticky bottom on mobile, hidden when keyboard open.

**Why Missed:** Icon colors (amber=Reading, blue=Prayer, emerald=Transition) were discoverable. Current plus-button + cmdk requires reading text.

**Verdict: RECOMMENDED**
- No architectural risk
- Port to v53-03
- Refactor AddRowPlaceholder for desktop dropdown + mobile variant

## Pattern 2: Inline Chart Binding (InlineFields + SongRow)

Collapsed: Title + Key + Lead + file name link OR "Tap to link" hint
Expanded: Title | Key + Tempo | Lead | Notes + Replace | Unlink | Move | Delete

**Verdict: REJECTED**

v5h-01 risk: Multiple entry points to binding mutation caused split-brain. Missing firestore.rules on tracks/{id} meant writes failed silently. UI showed cleared binding locally but server never got write. Next mount: hydrator restored binding. User thought unlinked but still bound server-side.

Modern solution: ChartBindPopover serializes mutations through applyEdit(). Re-adding Replace/Unlink buttons tempts old fragility.

## Pattern 3: Chart Preview (SongRow Collapsed)

File name as clickable link + reference badge. Verify binding without expanding row.

**Verdict: DEFERRED to v53-04**

Safe if ChartCell reads from Dexie. Cosmetic polish, not blocker.

## Anti-Patterns

### #1: Dual-Write (Embedded Array + Top-Level)

v5h-01: Missing firestore.rules on tracks/{id} caused silent write failures. Dexie edits stuck in outbox. Hydrator re-primed from stale embedded array, overwrote pending edits. Result: "key disappears after navigate-away."

If porting Add menu: Keep applyEdit('set','tracks') single path.

### #2: Optimistic-Write State Divergence

Old hook had 3 parallel state machines (React, localStorage draft, Firestore write) with race conditions. Also had optimistic writes skipping outbox.

v5h-01-03: perf-view took 4 iterations because editor + perf-view read from different stores with different freshness.

If porting: Route all edits through applyEdit() > outbox > engine > Firestore.

### #3: Replace/Unlink as Dedicated Paths

Multiple entry points cause split-brain. Keep binding single path: ChartBindPopover > applyEdit().

## Summary

| Pattern | Verdict | Target |
|---------|---------|--------|
| Add Menu (6-tile) | RECOMMENDED | v53-03 |
| Inline Chart Binding | REJECTED | None |
| Chart Preview | DEFERRED | v53-04 |

## References

- Deletion: d8c0442 (2026-04-26 v50-05-02)
- Postmortem: .paul/postmortems/v5h-01-save-loss.md
- v50-05-02: .paul/phases/v50-05-spreadsheet-editor/v50-05-02-SUMMARY.md
