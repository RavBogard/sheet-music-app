# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 8 (Performance UX Fixes) next

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 8.1 of 14 (Setlist Access Bug Fixes)
Plan: 08.1-01 complete
Status: Phase 8.1 complete, ready for Phase 8
Last activity: 2026-03-11 — Phase 8.1 complete (UNIFY done)

Progress:
- Milestone: [██████░░░░] 64% (9 of 14 phases complete, counting 6.1 and 8.1)
- Phase 8.1: Complete (1/1 plans)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [Loop complete — Phase 8.1 done]
```

## Accumulated Context

### Decisions
- CRIT-003 (bridge credentials) accepted as low risk — single venue, single admin, HTTPS delivery, revisit if multi-tenant
- withAuth migration already complete (only 2 intentional holdouts)
- ALLOWED_HOSTNAMES derived from ALLOWED_ORIGINS for hostname validation
- Phase 5 scope: scheduling routes (plans 01-02) + library routes (plan 03); setlist publish/print/email-packets deferred
- Phase 6.1: clearFirestoreIndexedDB() for IDB recovery; PWA/SW fully removed, next-pwa uninstalled
- Phase 7: Annotation feature fully removed; react-pdf AnnotationLayer.css preserved (PDF.js built-in)
- Phase 8.1 inserted: urgent production bug fixes before Phase 8 UX work
- All existing setlists owned by Rabbi Daniel — backfill ownerId to admin UID
- Band leaders should be able to read non-public setlists (add isBandLeader() to read rule)

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is

### Known Issues
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper (minor design gap)

### Git State
Last commit: 84a99ef
Branch: master

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 8.1 complete, loop closed
Next action: Commit, deploy, run backfill script, then resume Phase 8 with existing plan 08-01
Resume file: .paul/phases/08.1-setlist-access-bug-fixes/08.1-01-SUMMARY.md
Resume context:
- Phase 8.1 complete — Firestore rules + server page + backfill script + error messaging
- Must deploy and run `node scripts/backfill-owner-id.js` against production
- Phase 8 plan 08-01 already exists at .paul/phases/08-performance-ux-fixes/08-01-PLAN.md

---
*STATE.md — Updated after every significant action*
