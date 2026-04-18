---
phase: 01-library-management
plan: 01
subsystem: ui, api
tags: [firestore, react, library, archive, rename]

requires:
  - phase: none
    provides: existing library/archive API infrastructure
provides:
  - Library song rename via displayName field
  - Chart unlink from setlist tracks
  - Archived songs viewer with restore
affects: []

tech-stack:
  added: []
  patterns: [displayName overlay pattern for Firestore metadata]

key-files:
  created:
    - src/app/api/library/rename/route.ts
  modified:
    - src/types/models.ts
    - src/app/api/library/list/route.ts
    - src/components/library/LibraryFileRow.tsx
    - src/components/library/SongChartsLibrary.tsx
    - src/components/setlist/v2/InlineFields.tsx
    - src/components/admin/LibraryDataSection.tsx

key-decisions:
  - "window.prompt for rename input (minimal, no new dialog component)"
  - "displayName stored separately from Drive filename in Firestore"
  - "Archived section lazy-loads on expand (no upfront API call)"

patterns-established:
  - "displayName overlay: Firestore displayName preferred over Drive filename"

duration: ~30min
completed: 2026-03-10
---

# Phase 1 Plan 01: Library Management Summary

**Rename songs, unlink charts from tracks, and view/restore archived songs — three missing library management capabilities shipped.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30min |
| Completed | 2026-03-10 |
| Tasks | 3 completed |
| Files modified | 7 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Rename Song Title in Library | Pass | Context menu + window.prompt + Firestore displayName |
| AC-2: Unlink Chart from Setlist Track | Pass | Unlink button clears fileId/fileName, preserves track |
| AC-3: View and Restore Archived Songs | Pass | Expandable section on manage page with restore buttons |

## Accomplishments

- Songs can be renamed via context menu with displayName persisted to Firestore
- Charts can be unlinked from setlist tracks without deleting the track row
- Archived songs visible and restorable from manage page Library tab

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1-3: Library Management | `7c2583b` | feat | Rename, unlink chart, archive restore |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/types/models.ts` | Modified | Added `displayName` to DriveFile interface |
| `src/app/api/library/rename/route.ts` | Created | PATCH endpoint for renaming songs (band_leader+) |
| `src/app/api/library/list/route.ts` | Modified | Added `?status=archived` filter + displayName in response |
| `src/components/library/LibraryFileRow.tsx` | Modified | Rename context menu item + displayName display |
| `src/components/library/SongChartsLibrary.tsx` | Modified | Rename handler wiring with toast feedback |
| `src/components/setlist/v2/InlineFields.tsx` | Modified | Unlink Chart button between Replace and Delete |
| `src/components/admin/LibraryDataSection.tsx` | Modified | Archived songs expandable section with restore |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| window.prompt for rename | Minimal UI, no new dialog component needed | Simple but functional |
| displayName in Firestore only | Preserves original Drive filename | No Drive API calls needed |
| Lazy-load archived section | No upfront API call on page load | Better manage page performance |

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Library management capabilities complete
- Phase 2 (Setlist & Editor Fixes) can proceed independently

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 01-library-management, Plan: 01*
*Completed: 2026-03-10*
