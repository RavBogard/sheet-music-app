---
phase: 01-mobile-signin-fix
plan: 01
subsystem: auth, ui
tags: [firebase-auth, signInWithRedirect, COOP, service-worker, avatar]

requires:
  - phase: none
    provides: n/a
provides:
  - Mobile sign-in via signInWithRedirect fallback
  - COOP header (same-origin-allow-popups) for desktop popup sign-in
  - SW update banner suppression during first 10s of page load
  - Avatar img onError fallback to UserCircle icon
affects: []

tech-stack:
  added: []
  patterns:
    - signInWithPopup → signInWithRedirect fallback pattern
    - pageLoadTime guard for suppressing early SW events

key-files:
  created: []
  modified:
    - src/lib/auth-context.tsx
    - next.config.ts
    - src/components/offline/UpdatePrompt.tsx
    - src/components/nav/DesktopHeader.tsx
    - src/components/nav/MobileMenuDrawer.tsx

key-decisions:
  - "COOP set to same-origin-allow-popups (not same-origin) to allow popup sign-in"
  - "signInWithRedirect as fallback when popup blocked (not primary method)"
  - "10-second suppress window for SW banner (covers normal activation race)"
  - "Simple onError fallback for avatar (no state tracking needed)"

patterns-established:
  - "Auth popup-to-redirect fallback pattern for cross-browser compatibility"

duration: ~45min
started: 2026-03-11
completed: 2026-03-11
---

# Phase 1 Plan 01: Mobile Sign-In Fix Summary

**Fixed three user-reported bugs: mobile sign-in redirect fallback, false SW update banner suppression, and avatar onError fallback.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~45min |
| Started | 2026-03-11 |
| Completed | 2026-03-11 |
| Tasks | 3 completed |
| Files modified | 5 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Mobile sign-in works | Pass | signInWithRedirect fallback when popup blocked |
| AC-2: No false update banner on fresh loads | Pass | 10s pageLoadTime suppress window |
| AC-3: User avatar displays Google profile photo | Pass | onError fallback to UserCircle |
| AC-4: Desktop sign-in still works | Pass | COOP header enables popup, redirect fallback if needed |

## Accomplishments

- Mobile sign-in now works via signInWithRedirect fallback when popups are blocked (iOS Safari, Android Chrome)
- False "Update available" banners suppressed during first 10 seconds of page load
- Avatar gracefully falls back to UserCircle icon when Google photo URL fails to load

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Sign-in redirect fallback | `66e17d3` | fix | signInWithPopup→signInWithRedirect fallback + COOP header |
| Task 2: SW banner suppress | `66e17d3` | fix | pageLoadTime guard in UpdatePrompt |
| Task 3: Avatar fallback | `66e17d3` | fix | onError handler on avatar img tags |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/auth-context.tsx` | Modified | Added signInWithRedirect fallback + getRedirectResult on mount |
| `next.config.ts` | Modified | Added COOP: same-origin-allow-popups header |
| `src/components/offline/UpdatePrompt.tsx` | Modified | Added pageLoadTime guard (10s suppress window) |
| `src/components/nav/DesktopHeader.tsx` | Modified | Added onError fallback on avatar img |
| `src/components/nav/MobileMenuDrawer.tsx` | Modified | Added onError fallback on avatar img |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| COOP: same-origin-allow-popups | Allows popup sign-in while maintaining some isolation | Desktop sign-in works without console errors |
| signInWithRedirect as fallback only | Popup is better UX (no full-page redirect) | Mobile gets working sign-in, desktop keeps popup |
| 10s suppress window | Covers normal SW activation race without blocking real updates | No false positives, real mid-session updates still shown |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Auth flow robust across desktop and mobile
- SW update prompt correctly distinguishes fresh load from mid-session update
- Avatar display has graceful degradation

**Concerns:**
- Phases 2 (SW update notification) and 3 (user avatar) may already be fully addressed by this phase's Tasks 2 and 3 — user should confirm after testing deployed version

**Blockers:**
- None

---
*Phase: 01-mobile-signin-fix, Plan: 01*
*Completed: 2026-03-11*
