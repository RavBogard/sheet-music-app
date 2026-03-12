# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 5 complete, Phase 6 next

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 5 of 9 (API Route Tests) — Complete
Plan: All 3 plans complete
Status: Phase 5 complete, ready for Phase 6
Last activity: 2026-03-11 — Phase 5 transition complete

Progress:
- Milestone: [██████░░░░] 56% (5 of 9 phases)
- Phase 5: [██████████] 100% — 56 tests across 10 routes

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [Phase 5 complete — ready for Phase 6]
```

## Accumulated Context

### Decisions
- CRIT-003 (bridge credentials) accepted as low risk — single venue, single admin, HTTPS delivery, revisit if multi-tenant
- withAuth migration already complete (only 2 intentional holdouts)
- clearSaveTimer already wired at page level — no additional wiring needed (resolved)
- ALLOWED_HOSTNAMES derived from ALLOWED_ORIGINS for hostname validation
- Chainable query mock kept local per test file (not added to shared helpers)
- Remind route "no setlistId" 48-hour filtering path is unreachable through API wrapper; tested reachable paths only
- Typed mock fn signatures: vi.fn((_opts?: unknown) => ...) avoids TS spread errors
- Phase 5 scope: scheduling routes (plans 01-02) + library routes (plan 03); setlist publish/print/email-packets deferred
- Added Phase 9: Public Setlist Access — unauthenticated viewing of public setlists and their PDFs

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is

### Known Issues
- ~~Session cookie never refreshed after initial login~~ — Fixed: daily refresh via visibilitychange (commit 5724201)
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper (minor design gap)

### Git State
Last commit: 5724201
Branch: master

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 5 transition complete
Next action: /paul:plan (Phase 6: Hook Tests)
Resume file: .paul/phases/05-api-route-tests/05-03-SUMMARY.md
Resume context:
- Phase 5 complete: 56 tests across 10 API routes (scheduling + library)
- 790 total tests passing, 0 TS errors
- Bugfixes deployed: PDF worker mobile loading, session cookie refresh, new-user spinner
- Phase 6 (Hook Tests) is next — 19 untested hooks
- Phase 9 (Public Setlist Access) added to roadmap

---
*STATE.md — Updated after every significant action*
