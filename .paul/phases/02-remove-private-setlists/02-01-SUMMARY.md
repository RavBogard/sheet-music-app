---
phase: 02-remove-private-setlists
plan: 01
subsystem: auth, ui, firestore, data
tags: [isPublic, private-setlists, permissions, dashboard]

requires:
  - phase: 01-teardown-old-live
    provides: Clean codebase without live mode
provides:
  - All setlists public — no personal/public distinction
  - Single unified setlist subscription
  - Simplified Firestore rules and access checks

key-decisions:
  - "Keep isPublic field on Setlist type for backwards compat — just don't check it"
  - "Keep ownerId for 'created by' display, not access control"
  - "duplicateSetlist replaces copyToPersonal — creates public copy"

duration: 15min
completed: 2026-04-04T19:30:00Z
---

# Phase 2 Plan 1: Remove Private Setlists Summary

**Eliminated private/public setlist distinction — all setlists public, single unified view.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15 min |
| Files modified | 24 |
| Commit | `b0124f1` |

## Acceptance Criteria Results

| Criterion | Status |
|-----------|--------|
| AC-1: All setlists visible to all signed-in users | Pass |
| AC-2: No public/private toggle in create dialog | Pass |
| AC-3: Firestore rules simplified | Pass |
| AC-4: Build and tests pass | Pass |

---
*Phase: 02-remove-private-setlists, Plan: 01*
*Completed: 2026-04-04*
