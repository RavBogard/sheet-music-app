---
phase: 03-inline-swap-toast
plan: 01
subsystem: ui, data
tags: [swap, fuse, toast, performance-view, inline-edit]

requires:
  - phase: 01-teardown-old-live
  - phase: 02-remove-private-setlists
provides:
  - Inline song swap from performance view
  - Fuzzy search picker with library songs
  - Toast notifications on track changes

key-files:
  created:
    - src/components/performance/SwapPicker.tsx
    - src/components/performance/SwapChangeToast.tsx
  modified:
    - src/app/perform/setlist/[id]/page.tsx
    - src/components/performance/SetlistView.tsx
    - src/components/performance/SetlistRow.tsx
    - src/lib/setlist-firebase.ts

key-decisions:
  - "Fuse.js with threshold 0.4 for broader matches on song names"
  - "Direct Firestore updateDoc for swap — no API route needed"
  - "lastOwnSwapRef to suppress toast for own swaps"
  - "No confirmation dialog — immediate swap for speed during live services"

duration: 10min
completed: 2026-04-04T20:00:00Z
---

# Phase 3 Plan 1: Inline Swap + Toast Summary

**Leaders can swap songs inline during performance with fuzzy search picker; all musicians see toast notifications.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10 min |
| Files created | 2 |
| Files modified | 4 |
| Commit | `912ee2e` |

## Acceptance Criteria Results

| Criterion | Status |
|-----------|--------|
| AC-1: Leaders can initiate swap | Pass |
| AC-2: Fuzzy search finds similar songs | Pass |
| AC-3: Selecting replacement updates setlist | Pass |
| AC-4: Toast notification on track change | Pass |

---
*Phase: 03-inline-swap-toast, Plan: 01*
*Completed: 2026-04-04*
