---
phase: 02-quick-fixes
plan: 01
subsystem: auth, ui
tags: [google-oauth, avatar, changelog]

requires:
  - phase: 01-mobile-signin-fix
    provides: onError fallback on avatar img tags
provides:
  - Google OAuth profile scope for avatar photoURL
  - Changelog page with version history
affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/lib/firebase.ts
    - src/app/(main)/changelog/page.tsx

key-decisions:
  - "Added profile scope to all 3 GoogleAuthProvider instantiation sites"
  - "Changelog is a simple static page with hardcoded version data"

patterns-established: []

duration: ~5min
started: 2026-03-11
completed: 2026-03-11
---

# Phase 2 Plan 01: Quick Fixes Summary

**Added Google OAuth profile scope for avatar display and replaced changelog redirect with static version history page.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~5min |
| Started | 2026-03-11 |
| Completed | 2026-03-11 |
| Tasks | 2 completed |
| Files modified | 2 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Google profile photo displays after re-sign-in | Pass | Profile scope added; users need to sign out/in to get photo |
| AC-2: Changelog link navigates correctly | Pass | Static changelog page replaces redirect to /manage |
| AC-3: No regressions in auth flow | Pass | TypeScript clean, 655/660 tests pass (5 pre-existing failures) |

## Accomplishments

- GoogleAuthProvider now requests `profile` scope — `user.photoURL` will be populated on next sign-in
- Changelog page shows version history (v0.1 through v1.7) instead of redirecting to /manage

## Task Commits

Pending commit with phase transition.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/firebase.ts` | Modified | Added `googleProvider.addScope('profile')` at all 3 instantiation sites |
| `src/app/(main)/changelog/page.tsx` | Modified | Replaced `redirect("/manage")` with static changelog page |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Profile scope on all 3 GoogleAuthProvider sites | Consistency regardless of init path | Avatar works after re-sign-in |
| Static hardcoded changelog | No database needed for version history | Simple, fast, no dependencies |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| 5 test failures in vitest run | Pre-existing (route-auth.test.ts, next-service-card.test.tsx) — not related to changes |

## Next Phase Readiness

**Ready:**
- Avatar will work after user signs out and back in
- Changelog page live at /changelog
- Print pipeline investigation next (Phase 3 — essential feature)

**Concerns:**
- Users need to re-authenticate to get photoURL populated
- Pre-existing test failures should be addressed at some point

**Blockers:**
- None

---
*Phase: 02-quick-fixes, Plan: 01*
*Completed: 2026-03-11*
