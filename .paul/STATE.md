# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 7 (Component Tests) next

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 7 of 10 (Component Tests)
Plan: Not started
Status: Ready to plan
Last activity: 2026-03-11 — Phase 6 complete (221 hook tests), transitioned to Phase 7

Progress:
- Milestone: [███████░░░] 70% (7 of 10 phases complete, counting 6.1)
- Phase 6: Complete (3/3 plans — 221 hook tests)
- Phase 6.1: Complete (2/2 plans — crash fix + SW removal)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [Phase 6 loop complete - ready for next PLAN]
```

## Accumulated Context

### Decisions
- CRIT-003 (bridge credentials) accepted as low risk — single venue, single admin, HTTPS delivery, revisit if multi-tenant
- withAuth migration already complete (only 2 intentional holdouts)
- clearSaveTimer already wired at page level — no additional wiring needed (resolved)
- ALLOWED_HOSTNAMES derived from ALLOWED_ORIGINS for hostname validation
- Typed mock fn signatures: vi.fn((_opts?: unknown) => ...) avoids TS spread errors
- Phase 5 scope: scheduling routes (plans 01-02) + library routes (plan 03); setlist publish/print/email-packets deferred
- Added Phase 9: Public Setlist Access — unauthenticated viewing of public setlists and their PDFs
- Phase 6.1: clearFirestoreIndexedDB() for IDB recovery; PWA/SW fully removed, next-pwa uninstalled
- Phase 6: singleton hook testing via dynamic re-import, ref-count testing with multiple renderHook instances

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is

### Known Issues
- ~~Session cookie never refreshed after initial login~~ — Fixed: daily refresh via visibilitychange (commit 5724201)
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper (minor design gap)
- ~~Firestore INTERNAL ASSERTION FAILED on mobile after sign-in~~ — Fixed: auto-recovery via clearFirestoreIndexedDB() (plan 06.1-01)

### Git State
Last commit: (pending phase 6 commit)
Branch: master

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 6 complete, ready to plan Phase 7
Next action: /paul:plan for Phase 7
Resume file: .paul/ROADMAP.md
Resume context:
- Phase 6 complete: 221 hook tests across 17 hooks
- User requested new phases to add (monitor popup, print view, sticky keys, labels, setlist popup fix, remove annotations)
- Ready to add new phases then plan Phase 7

---
*STATE.md — Updated after every significant action*
