# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v1.7 Critical Bug Fixes

## Current Position

Milestone: v1.7 Critical Bug Fixes
Phase: 3 of 5 (Print Pipeline & Gig Packet Overhaul)
Plan: Not started
Status: Ready to plan
Last activity: 2026-03-11 — Phase 2 complete, transitioned to Phase 3

Progress:
- v1.7 Critical Bug Fixes: [████░░░░░░] 40% (5 phases, 2 complete)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [Phase 3 — ready to plan]
```

## Accumulated Context

### Decisions
- v1.7 scope restructured: 5 phases (quick fixes, print pipeline overhaul, key sig, monitor buses)
- Phase 1 combined first 3 bugs into single plan (sign-in, SW banner, avatar) — all applied
- Avatar root cause: GoogleAuthProvider missing `profile` scope → user.photoURL always null
- Changelog page redirects to /manage instead of showing content
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
- Gig packet print (Phase 3): 500 error from /api/setlist/print, black bg overlay, print menu buried below scroll. User: "bulletproof and simple" — essential feature. Full pipeline + UI/UX review with /ui-ux-pro-max.

### Blockers/Concerns
- None

### Git State
Last commit: 66e17d3
Branch: master

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 2 complete, transitioned to Phase 3
Next action: /paul:plan for Phase 3 (Print Pipeline & Gig Packet Overhaul)
Resume file: .paul/ROADMAP.md
Resume context:
- Phase 1 COMPLETE: sign-in redirect fallback, SW banner suppress, avatar onError fallback
- Phase 2: Quick fixes — avatar OAuth scope, changelog redirect, SW banner verification
- Phase 3: Print pipeline overhaul — 500 error, black bg, UI/UX review (ESSENTIAL feature)
- Phase 4: Key sig position
- Phase 5: Monitor buses investigation
- User confirms: all issues important, print pipeline is essential/critical

---
*STATE.md — Updated after every significant action*
