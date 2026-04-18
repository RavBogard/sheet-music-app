---
phase: 03-technical-debt-cleanup
plan: 01
subsystem: infra
tags: [firestore, migration, build-tooling]

requires:
  - phase: 02-nextjs-sentry-deprecations
    provides: clean build baseline
provides:
  - leader → band_leader Firestore migration script
  - silent git commands in build-info script
affects: []

tech-stack:
  added: []
  patterns: [silent execSync via stdio option]

key-files:
  created:
    - scripts/migrate-leader-role.js
  modified:
    - scripts/update-build-info.js

key-decisions:
  - "Nested sheet-music-app/ directory already removed — skipped"
  - "stdio pipe/ignore for stderr suppression instead of shell redirect"

duration: ~5min
completed: 2026-03-12T19:40:00Z
---

# Phase 3 Plan 01: Technical Debt Cleanup Summary

**Created Firestore migration script for LOW-004 (leader → band_leader) and silenced git warnings in build-info script.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~5min |
| Completed | 2026-03-12 |
| Tasks | 2 completed |
| Files modified | 2 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Migration script | Pass | Queries role=="leader", batch updates Firestore + Auth claims |
| AC-2: Build-info stderr suppression | Pass | `{ silent: true }` via stdio option, no shell redirects |

## Accomplishments

- Created `scripts/migrate-leader-role.js` for one-time Firestore data migration (LOW-004)
- Updated `scripts/update-build-info.js` to suppress git stderr via Node stdio options

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `scripts/migrate-leader-role.js` | Created | One-time migration: role "leader" → "band_leader" in Firestore + Auth claims |
| `scripts/update-build-info.js` | Modified | Added silent option to run() helper, applied to git fetch/describe calls |

## Deviations from Plan

None — nested sheet-music-app/ directory was already removed (noted in ROADMAP, skipped).

## Next Phase Readiness

**Ready:**
- v2.6 milestone complete after this phase

**Concerns:**
- Migration script must be run manually with service account credentials

**Blockers:**
- None

---
*Phase: 03-technical-debt-cleanup, Plan: 01*
*Completed: 2026-03-12*
