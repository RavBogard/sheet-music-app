# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-10)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v1.6 Stability & Regression Audit

## Current Position

Milestone: v1.6 Stability & Regression Audit
Phase: 3 of 4 (Performance View Overhaul) — COMPLETE
Plan: 03-01 (Performance View Overhaul)
Status: Phases 1-3 COMPLETE, ready for Phase 4 planning
Last activity: 2026-03-11 — Phase 3 unified (03-01-SUMMARY.md written)

Progress:
- v1.6 Stability & Regression Audit: [███████░░░] 75% (4 phases, 3 complete)
- Phase 1: COMPLETE
- Phase 2: COMPLETE
- Phase 3: COMPLETE

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [Phase 4 — ready for PLAN]
```

## Accumulated Context

### Decisions
- v1.6 scope: Deep audit of v1.5 regressions — auth/CSP/SW, UI revert, setlist redesign, full sweep
- Phase order: auth first, then UI revert, then setlist redesign, then comprehensive sweep
- Auth fixed: signInWithRedirect reverted back to signInWithPopup (commit 89572e5)
- skipWaiting reverted to false (commit 89572e5)
- Email/password auth removed — Google-only sign-in
- COOP console warnings are cosmetic (Firebase SDK known issue) — no fix needed
- Setlist view redesign added as Phase 3 — keys next to tracks, glanceable live view
- Phases 2, 3 (UI work) will use /ui-ux-pro-max skill
- Phase 3: Removed tablet sidebar toolbar entirely — bottom bar on all viewports
- Phase 3: SetlistRow key badge moved left of title for glanceability
- Phase 3: Two-line song rows (title+BPM / lead musician)

### Deferred Issues (carried from v1.5)
- LOW-004 (leader → band_leader migration) — Still Low, S effort. Defer to v1.7+.

### Known Issues
- route-auth.test.ts: POST /api/setlist/publish expects 403 but gets 400 (pre-existing)
- Manifest icon: now uses static PNGs (icon-192.png, icon-512.png) — dynamic /icon route kept for favicon/OG

### Blockers/Concerns
- None active

### Git State
Last commit: cdb5df9 (not yet committed — Phase 3 changes unstaged)
Branch: master
Feature branches merged: none

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 3 complete, changes not yet committed
Next action: Commit Phase 3, then /paul:plan for Phase 4 (Regression Sweep & Deferred Fixes)
Resume file: .paul/ROADMAP.md
Resume context:
- Phase 1 complete: CSP audit + static PWA icons (commit d5245d2)
- Phase 2 complete: Storage-only file serving, removed Drive fallback (commit cdb5df9)
- Phase 3 complete: Sidebar removed, SetlistRow redesigned, 12 new tests
- Build passes, 660 tests total, 1 pre-existing failure (route-auth)
- Changes NOT yet committed — commit + deploy, then start Phase 4

---
*STATE.md — Updated after every significant action*
