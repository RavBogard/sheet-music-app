# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-12)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 16 complete, ready to plan Phase 17

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 16 of 22 (Design Token Cleanup & Accessibility) — Complete
Plan: 16-01 complete
Status: Phase 16 complete, ready for Phase 17
Last activity: 2026-03-12 — Phase 16 complete (design tokens + accessibility)

Progress:
- Milestone: [████████░░] 73% (16 of 22 phases complete)
- Phase 16: [██████████] 100%

## Loop Position

Plan 16-01:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [16-01 COMPLETE — tokens + 20 aria-labels, 1117 tests pass]
```

## Accumulated Context

### Decisions
- Phase 16: bg-background/40 for semi-transparent overlays; aria-label preferred over sr-only for icon buttons; UserRow already had title attrs
- Phase 15: coverOnly early-return in print pipeline skips all PDF fetch/merge; included in content hash for cache isolation
- Phase 14: use-offline test assertion too strict for new AbortController signal — 1 test expects `fetch(url)` but code now correctly passes `fetch(url, { signal })`. Test update needed in UNIFY.
- Phase 13: Three-tier responsive (phone→tablet→desktop), kept prevQueueIndexRef (plan wrong about dead code), swipe 1.5x threshold, 15s auto-hide
- Phase 10.1: MobileTabBar rewritten as action bar — Fuse.js search over library store, sessionStorage for setlist tracking, hidden placeholder for balanced layout
- Phase 10: Public setlist access already working — no code changes needed
- Phase 9: Print cover page filters to chart-bearing tracks only; sticky keys via library_index lastUsedKey
- Phase 8: Monitor tab on mobile opens popover instead of navigating to /monitor

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is

### Known Issues
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper (minor design gap)

### Git State
Last commit: 263883c
Branch: master

## Session Continuity

Last session: 2026-03-12
Stopped at: Phase 16 complete
Next action: /paul:plan for Phase 17
Resume file: .paul/phases/16-design-token-accessibility/16-01-SUMMARY.md
Resume context: Phase 16 done (design tokens + a11y). Continue autonomously through 17-19.

---
*STATE.md — Updated after every significant action*
