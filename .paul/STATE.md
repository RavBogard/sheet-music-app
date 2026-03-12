# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 6 in progress

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 6 of 9 (Hook Tests) — In progress
Plan: 06-02 complete, ready for 06-03
Status: Plans 01-02 loop closed — 87 new tests for 12 hooks
Last activity: 2026-03-11 — Plan 06-02 UNIFY complete

Progress:
- Milestone: [██████░░░░] 56% (5 of 9 phases complete)
- Phase 6: [█████░░░░░] 50% — Plans 01-02 complete, plans 03-04 remaining

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [Plan 06-02 loop closed — ready for 06-03]
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
Stopped at: Plan 06-02 loop closed
Next action: /paul:plan (Plan 06-03: large hooks — use-upcoming-prep, useMonitorConnection, use-creation-wizard, use-setlist-dashboard)
Resume file: .paul/phases/06-hook-tests/06-02-SUMMARY.md
Resume context:
- Plan 06-01: 39 tests for 6 simple hooks (media-query, wake-lock, metronome, library, batch-selection, monitor-access)
- Plan 06-02: 48 tests for 6 medium hooks (content-search, setlist-presence, setlist-performance, safe-firestore-sync, offline, calendar-data)
- 166 total hook tests passing, 0 TS errors
- Plans 03-04 remaining: 6 large/complex hooks
  - Plan 03: use-upcoming-prep (205), useMonitorConnection (238), use-creation-wizard (255), use-setlist-dashboard (380)
  - Plan 04: use-setlist-logic (622), use-smart-transposer (583)
- PDF worker mobile issue: user accessing www.centralreform.live — needs www domain in Vercel or redirect

---
*STATE.md — Updated after every significant action*
