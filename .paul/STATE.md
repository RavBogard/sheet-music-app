# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-12)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v3.0 Live Setlist Sync

## Current Position

Milestone: v3.0 Live Setlist Sync
Phase: 1 of 3 (Song Groups & Swap Infrastructure)
Plan: 01-02 complete
Status: APPLY complete, ready for UNIFY
Last activity: 2026-03-30 — Plan 01-02 executed successfully

Progress:
- v3.0 Live Setlist Sync: [██░░░░░░░░] 17%
- Phase 1: [██████████] 100%

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ○     [APPLY complete, run UNIFY]
```

## Accumulated Context

### Decisions
- Hybrid song grouping: liturgicalSlot tag on songs + config/songGroups for display metadata
- canLiveSwap custom claim mirrors soundEngineer pattern exactly
- Single updateDoc for atomic swap (tracks + liveState in one write)
- Field-level security via affectedKeys().hasOnly()
- 2s rate limit via Firestore rules + client debounce
- TEMPLATES exported from liturgical-templates.ts for seed endpoint
- Admin panels left unstyled per project convention
- Song Group Manager is view-only + seed (no edit/create UI yet)

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is

### Known Issues
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper

### Git State
Branch: master

## Session Continuity

Last session: 2026-03-30
Stopped at: Plan 01-02 APPLY complete
Next action: /paul:unify to close loop and transition Phase 1
Resume file: .paul/phases/01-song-groups-swap-infrastructure/01-02-PLAN.md

---
*STATE.md — Updated after every significant action*
