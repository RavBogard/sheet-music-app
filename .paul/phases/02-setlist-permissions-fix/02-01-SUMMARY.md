---
phase: 02-setlist-permissions-fix
plan: 01
subsystem: auth, ui, print
tags: [permissions, firestore-rules, print-pipeline, rabbi]

requires: []
provides:
  - Admin/band_leader can delete any public setlist
  - Print cover page includes all items
  - Rabbi shown as service leader on print
affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/hooks/use-setlist-dashboard.ts
    - src/components/setlist/SetlistDashboard.tsx
    - firestore.rules
    - src/lib/print-pipeline.ts
    - src/components/setlist/PrintModal.tsx
    - src/hooks/use-setlist-performance.ts
    - src/app/perform/setlist/[id]/page.tsx
    - src/components/setlist/v2/SetlistEditorV2.tsx

key-decisions:
  - "Band leaders can delete public setlists only (not private)"
  - "Print cover page shows ALL items, not just songs with charts"
  - "Rabbi field rendered as 'Led by:' above 'Prepared for:'"

duration: 15min
started: 2026-04-04T14:15:00Z
completed: 2026-04-04T14:30:00Z
---

# Phase 2 Plan 1: Setlist Permissions Fix + Print Outline Summary

**Admin/band_leader can now delete any public setlist; print cover page shows full order of service with rabbi as "Led by:" leader.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15 min |
| Tasks | 3 completed (2 auto + 1 checkpoint) |
| Files modified | 8 |
| Commit | `e40bc4c` |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Admin/band_leader can delete public setlists | Pass | UI guard + Firestore rule both broadened |
| AC-2: Admin/band_leader can duplicate/clone | Pass | canDuplicate was already `!!user` — no change needed |
| AC-3: Non-song items on print cover page | Pass | Removed filter, all tracks now rendered on outline |
| AC-4: Rabbi shown as service leader | Pass | "Led by:" line added, rabbi wired through all callers |

## Accomplishments

- Broadened delete guard in `use-setlist-dashboard.ts` and `SetlistDashboard.tsx` to include isAdmin/isBandLeader
- Updated Firestore delete rule: `isBandLeader() && resource.data.isPublic == true`
- Removed `printableTracks` filter — cover page now shows all items in order
- Added `rabbi` field to `PrintRequest` interface and "Led by:" rendering in `buildCoverPage()`
- Wired `rabbi` through `useSetlistPerformance` → performance page → PrintModal, and editor → PrintModal

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

**Ready:** Phase 3 (Print Outline Fix) was partially absorbed into this phase — non-song items on cover page is done. Phase 3 may need to be re-scoped or marked complete.

---
*Phase: 02-setlist-permissions-fix, Plan: 01*
*Completed: 2026-04-04*
