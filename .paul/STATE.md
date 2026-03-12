# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 8 (Performance UX Fixes) next

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 8 of 12 (Performance UX Fixes)
Plan: Not started
Status: Ready to plan
Last activity: 2026-03-11 — Phase 7 complete, transitioned to Phase 8

Progress:
- Milestone: [██████░░░░] 62% (8 of 13 phases complete, counting 6.1)
- Phase 7: Complete (1/1 plans — annotation feature removed)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [Ready for new PLAN]
```

## Accumulated Context

### Decisions
- CRIT-003 (bridge credentials) accepted as low risk — single venue, single admin, HTTPS delivery, revisit if multi-tenant
- withAuth migration already complete (only 2 intentional holdouts)
- ALLOWED_HOSTNAMES derived from ALLOWED_ORIGINS for hostname validation
- Phase 5 scope: scheduling routes (plans 01-02) + library routes (plan 03); setlist publish/print/email-packets deferred
- Phase 6.1: clearFirestoreIndexedDB() for IDB recovery; PWA/SW fully removed, next-pwa uninstalled
- Phase 7: Annotation feature fully removed; react-pdf AnnotationLayer.css preserved (PDF.js built-in)

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is

### Known Issues
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper (minor design gap)

### Git State
Last commit: 6f08129
Branch: master

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 7 complete, ready to plan Phase 8
Next action: /paul:plan for Phase 8
Resume file: .paul/ROADMAP.md
Resume context:
- Phase 7 removed all annotation code (5 deleted, 6 edited)
- PerformanceToolbar simplified, ready for Phase 8 UX fixes
- Phase 8 scope: monitor popup in setlist view, relabel Metronome→BPM / Audio→Monitor, fix broken setlist popup

---
*STATE.md — Updated after every significant action*
