# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-12)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 19 complete, milestone at 86%

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 19 of 22 (Final Audit & Clean Sweep) — Complete
Plan: 19-01 complete
Status: Phase 19 complete, ready for next phase
Last activity: 2026-03-12 — Phase 19 complete (zero warnings, full verification)

Progress:
- Milestone: [█████████░] 86% (19 of 22 phases complete)
- Phase 19: [██████████] 100%

## Loop Position

Plan 19-01:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [19-01 COMPLETE — zero warnings, 1117 tests, build verified]
```

## Accumulated Context

### Decisions
- Phase 19: All 22 eslint-disable comments audited and confirmed valid (ref-based callback pattern)
- Phase 18: WriteBatch for delete-user, runTransaction for set-role; ApiErrorResponse standard shape; config/admins replaces hardcoded UID; CRON_SECRET in env.mjs
- Phase 17: viewport-fit: cover added for safe area insets; p-0 for custom-content popovers; CSS custom properties for brand glow shadows
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
Last commit: e94617d
Branch: master

## Session Continuity

Last session: 2026-03-12
Stopped at: Phase 18 complete, ready to plan Phase 19
Next action: /paul:plan for remaining phases (20-22 are removed — milestone has 22 phases but only 19 defined in ROADMAP)
Resume file: .paul/ROADMAP.md
Resume context: Phase 19 done. Codebase is totally clean: 0 tsc errors, 0 ESLint warnings, 1117 tests, build verified. ROADMAP shows phases 18-19 complete, phases 20-22 don't exist in roadmap table (milestone originally had 22 phases but was scoped to 19). Context window low — handoff needed.

---
*STATE.md — Updated after every significant action*
