# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 6 (Hook Tests) resuming

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 6 of 10 (Hook Tests) — Resuming at plan 03
Plan: Not started
Status: Ready to plan
Last activity: 2026-03-11 — Phase 6.1 complete, transitioned back to Phase 6

Progress:
- Milestone: [██████░░░░] 60% (6 of 10 phases complete, counting 6.1)
- Phase 6: Plans 01-02 complete (166 hook tests), plan 03 next
- Phase 6.1: Complete (2/2 plans — crash fix + SW removal)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [Ready to plan Phase 6 plan 03]
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
- Inserted Phase 6.1: SW Removal & Firestore Recovery — production crash on mobile, corrupted IndexedDB from old SW
- Phase 6.1: clearFirestoreIndexedDB() for IDB recovery; PWA/SW fully removed, next-pwa uninstalled
- Kept all actively-used offline code (cache-utils, prefetch, use-offline, OfflineIndicator, offline-manager)

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is

### Known Issues
- ~~Session cookie never refreshed after initial login~~ — Fixed: daily refresh via visibilitychange (commit 5724201)
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper (minor design gap)

### Git State
Last commit: 5724201
Branch: master

### Known Issues
- ~~Firestore INTERNAL ASSERTION FAILED on mobile after sign-in~~ — Fixed: auto-recovery via clearFirestoreIndexedDB() (plan 06.1-01)

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 6.1 complete, transitioned back to Phase 6
Next action: /paul:plan for Phase 6 plan 03 (remaining hook tests)
Resume file: .paul/ROADMAP.md
Resume context:
- Phase 6.1 complete: Firestore crash fix + SW dead code removal
- Phase 6 (Hook Tests): plans 01-02 complete (166 hook tests), plan 03 next
- 877 tests passing, build clean

---
*STATE.md — Updated after every significant action*
