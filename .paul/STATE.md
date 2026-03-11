# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-10)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v1.6 Stability & Regression Audit

## Current Position

Milestone: v1.6 Stability & Regression Audit
Phase: 4 of 4 (Regression Sweep & Deferred Fixes) — In progress
Plan: 04-01 (partially applied)
Status: Tasks 1-2 complete, Tasks 3-5 remaining
Last activity: 2026-03-11 — Phase 4 partial apply (commit 48c761f)

Progress:
- v1.6 Stability & Regression Audit: [████████░░] 85% (4 phases, 3 complete, 1 in progress)
- Phase 1: COMPLETE
- Phase 2: COMPLETE
- Phase 3: COMPLETE
- Phase 4: IN PROGRESS (test fix + 2 route migrations done)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ◐        ○     [Phase 4 — APPLY in progress]
```

## Accumulated Context

### Decisions
- v1.6 scope: Deep audit of v1.5 regressions — auth/CSP/SW, UI revert, setlist redesign, full sweep
- Phase 3: Removed tablet sidebar toolbar, key-left setlist redesign
- Phase 4: chat + drive/file routes stay on withAuth (comments explain why)
- 23 pre-existing ESLint exhaustive-deps warnings need suppress comments (not yet done)

### Deferred Issues (carried from v1.5)
- LOW-004 (leader → band_leader migration) — Still Low, S effort. Defer to v1.7+.

### Known Issues
- 23 ESLint react-hooks/exhaustive-deps warnings causing CI --max-warnings 0 failure
- These are all intentional (adding deps would cause infinite loops)
- Need // eslint-disable-next-line on each

### Blockers/Concerns
- ESLint CI failure blocks green builds

### Git State
Last commit: 48c761f
Branch: master

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 4 partially applied — test fix + withAuth migration done
Next action: Fix 23 ESLint warnings (add disable comments), then /paul:unify Phase 4
Resume file: .paul/phases/04-regression-sweep/04-01-PLAN.md
Resume context:
- Phase 4 Task 1 DONE: route-auth test fixed (email field added to musician objects)
- Phase 4 Task 2 DONE: test-gemini + bridge/setup-code migrated to createApiHandler
- Phase 4 Task 2 SKIPPED: chat (streaming SSE) + drive/file (mixed auth) stay on withAuth
- Phase 4 Task 3 VERIFIED: clearSaveTimer already wired correctly
- REMAINING: Fix 23 ESLint exhaustive-deps warnings across ~12 files
- REMAINING: Verify PWA/offline, build time investigation (Sentry source maps)
- REMAINING: Write 04-01-SUMMARY.md and unify
- Build passes, 660 tests, 0 new failures (1 flaky next-service-card in full suite only)
- Deployed commits: c49f081 (Phase 3), 48c761f (Phase 4 partial)

---
*STATE.md — Updated after every significant action*
