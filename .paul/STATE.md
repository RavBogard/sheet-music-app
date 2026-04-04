# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-04-04)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v4.0 Live Swap Redesign

## Current Position

Milestone: v4.0 Live Swap Redesign
Phase: 1 of 3 (Teardown Old Live System) — Planning
Plan: 01-01 created, awaiting approval
Status: PLAN created, ready for APPLY
Last activity: 2026-04-04 — Created .paul/phases/01-teardown-old-live/01-01-PLAN.md

Progress:
- Milestone: [░░░░░░░░░░] 0%
- Phase 1: [░░░░░░░░░░] 0%

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ○        ○     [Plan created, awaiting approval]
```

## Accumulated Context

### Decisions
- Old live system (v3.0-v3.4) being completely replaced — over-engineered for the use case
- No separate "live mode" — normal performance view IS the live experience
- Swap = inline editing from performance view, not a separate flow
- Fuzzy name matching for swap suggestions (most swaps are between similarly-named songs like Barechu variants)
- All setlists public — no private/public distinction
- Fuse.js already available for fuzzy search
- Firestore real-time sync handles "everyone sees changes" — no new infrastructure

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- BUG-022 (rate limits on all API routes) — Large effort, deferred
- BUG-020 (108 non-null assertions) — Large effort, deferred

### Git State
Last commit: 6db33cd
Branch: master

## Session Continuity

Last session: 2026-04-04
Stopped at: Milestone v4.0 created, ready to plan Phase 1
Next action: /paul:plan for Phase 1 (Teardown Old Live System)
Resume file: .paul/ROADMAP.md

---
*STATE.md — Updated after every significant action*
