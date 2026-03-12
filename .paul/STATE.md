# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 8 (Performance UX Fixes) next

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 8 of 14 (Performance UX Fixes)
Plan: 08-01 APPLY in progress (3/4 tasks done, checkpoint pending)
Status: APPLY in progress — awaiting human verification
Last activity: 2026-03-11 — Fixed drawer scroll + speaker icon visibility

Progress:
- Milestone: [██████░░░░] 64% (9 of 14 phases complete, counting 6.1 and 8.1)
- Phase 8.1: Complete (1/1 plans)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ◐        ○     [APPLY in progress — checkpoint pending]
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
Last commit: 31d5185
Branch: master

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 8 APPLY — fixes deployed, awaiting human verification
Next action: Verify drawer scroll + speaker icon on production, then complete checkpoint
Resume file: .paul/HANDOFF-2026-03-11-phase8b.md
Resume context:
- Drawer scroll fix: added min-h-0 + virtualizer.measure() after animation (31d5185)
- Speaker icon fix: bumped to h-5 w-5 + explicit text-foreground (31d5185)
- Both fixes pushed to master, deployed on Vercel
- If verification passes: complete checkpoint → /paul:unify → Phase 9

---
*STATE.md — Updated after every significant action*
