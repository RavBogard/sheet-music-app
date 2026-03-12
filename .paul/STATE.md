# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 10 (Public Setlist Access) next

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 10 of 14 (Public Setlist Access)
Plan: None yet
Status: Ready to plan
Last activity: 2026-03-12 — Phase 9 complete (print filtering + sticky keys)

Progress:
- Milestone: [████████░░] 79% (11 of 14 phases complete, counting 6.1 and 8.1)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [New phase — needs planning]
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
- Phase 8: Monitor tab on mobile opens popover (QuickMonitorPanel) instead of navigating to /monitor
- Phase 9: Print cover page filters to chart-bearing tracks only; sticky keys via library_index lastUsedKey

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is

### Known Issues
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper (minor design gap)

### Git State
Last commit: 3c6a372
Branch: master

## Session Continuity

Last session: 2026-03-12
Stopped at: Phase 9 complete, starting Phase 10
Next action: /paul:plan for Phase 10
Resume file: —
Resume context: Phase 10 focus is public setlist access — allow unauthenticated users to view public setlists and their PDFs

---
*STATE.md — Updated after every significant action*
