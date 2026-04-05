---
phase: 01-teardown-old-live
plan: 01
subsystem: ui, auth, api, firestore
tags: [teardown, live-mode, swap, presence, song-groups]

requires: []
provides:
  - Clean codebase without live mode infrastructure
  - Simplified Firestore rules
  - Performance page without swap/live UI
affects: [02-remove-private-setlists, 03-inline-swap-toast]

key-files:
  modified:
    - src/app/perform/setlist/[id]/page.tsx
    - src/hooks/use-setlist-performance.ts
    - src/components/performance/SetlistView.tsx
    - src/components/performance/SetlistRow.tsx
    - src/app/(main)/manage/ManageClient.tsx
    - src/app/(main)/settings/sound/page.tsx
    - src/components/admin/UserRow.tsx
    - src/lib/auth-context.tsx
    - src/types/models.ts
    - src/types/schemas.ts
    - firestore.rules

key-decisions:
  - "Keep liturgicalSlot on library file metadata (data, not swap system)"
  - "setCurrentPosition becomes no-op (live stepping removed)"
  - "currentTrackIndex always -1 (no live position tracking)"

duration: 20min
completed: 2026-04-04T17:35:00Z
---

# Phase 1 Plan 1: Teardown Old Live System Summary

**Removed entire v3.0-v3.4 live mode infrastructure: 18 files deleted (-2,341 lines), 8 files cleaned.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~20 min |
| Tasks | 3 completed (2 auto + 1 checkpoint) |
| Files deleted | 18 |
| Files modified | 11 |
| Net lines removed | ~2,000 |
| Commit | `f5fc48b` |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: All live mode files deleted | Pass | 18 files removed |
| AC-2: Performance page works without live mode | Pass | Build passes, no live UI |
| AC-3: Admin panel works without live features | Pass | No Groups tab, no LiveService, no canLiveSwap |
| AC-4: Build and lint pass | Pass | 0 errors, 0 warnings |

## Deviations from Plan

None — executed exactly as planned.

---
*Phase: 01-teardown-old-live, Plan: 01*
*Completed: 2026-04-04*
