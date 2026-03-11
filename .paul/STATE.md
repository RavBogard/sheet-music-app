# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v1.7 Critical Bug Fixes

## Current Position

Milestone: v1.7 Critical Bug Fixes
Phase: 2 of 4 (Service Worker Update Notification)
Plan: Not started
Status: Ready to plan
Last activity: 2026-03-11 — Phase 1 complete, transitioned to Phase 2

Progress:
- v1.7 Critical Bug Fixes: [███░░░░░░░] 25% (4 phases, 1 complete)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [Phase 2 — ready to plan]
```

## Accumulated Context

### Decisions
- v1.7 scope: 3 user-reported bugs + 1 UX fix + potentially monitor buses + print pipeline fix
- Phase 1 combined first 3 bugs into single plan (sign-in, SW banner, avatar) — all fixed
- COOP header set to same-origin-allow-popups for Google popup sign-in
- signInWithRedirect as fallback when popup blocked (mobile)
- SW banner suppressed during first 10s of page load
- Avatar img tags have onError fallback to show UserCircle

### Deferred Issues (carried from v1.5)
- LOW-004 (leader → band_leader migration) — Still Low, S effort. Defer to v1.8+.

### Known Issues
- None currently blocking

### User Requests Pending
- Monitor buses: User thought 5 buses should show, only 4 are visible. Needs investigation — may need new phase.
- Key signature position (Phase 4): Move key from left to right of song title
- Gig packet print: Black background on print page, 500 error from /api/setlist/print, print menu buried below scroll. User wants full print pipeline + UI/UX review. Needs new phase.

### Blockers/Concerns
- None

### Git State
Last commit: 66e17d3
Branch: master

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 1 complete, transitioned to Phase 2
Next action: /paul:plan for Phase 2
Resume file: .paul/ROADMAP.md
Resume context:
- Phase 1 COMPLETE: sign-in redirect fallback, SW banner suppress, avatar fallback
- Phases 2 (SW update) and 3 (avatar) may already be addressed by Phase 1 — user should confirm
- NEW USER REPORT: Gig packet print broken (500 error on /api/setlist/print, black background, buried print menu) — needs new phase with /ui-ux-pro-max
- Monitor buses still pending investigation

---
*STATE.md — Updated after every significant action*
