# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-10)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v1.5 Codebase & UI/UX Hardening

## Current Position

Milestone: v1.5 Codebase & UI/UX Hardening
Phase: 3 of 6 (Architecture Cleanup) — Planning
Plan: 03-02 complete, evaluating if 03-03 needed
Status: Ready for next PLAN (or phase transition)
Last activity: 2026-03-10 — Unified 03-02 (MusicianPicker split)

Progress:
- v1.5 Codebase & UI/UX Hardening: [███░░░░░░░] 33%
- Phase 3: [██████░░░░] 60%

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [Loop complete - ready for next PLAN or phase transition]
```

## Accumulated Context

### Decisions
- v1.5 scope: All high+medium codebase and UI/UX improvements from full project audit. No new features.
- Phase order: bugs → security → architecture → quality → UI/UX → monitoring (dependency-driven)
- Phase 1: stripUndefined/Deep for Firestore sanitization (not JSON roundtrip)
- Phase 1: cancelled-flag before every state update after async boundaries
- Phase 2: All standard auth routes use createApiHandler; withAuth reserved for complex patterns
- Phase 2: 18 routes migrated, 4 remain on withAuth (justified)

### Deferred Issues (carried from v1.4)
- LOW-004 (leader → band_leader migration) — Still Low, S effort. Defer to v1.6+.

### Deferred Issues (resolved in v1.5)
- CRIT-003 (bridge credentials) — Phase 2 ✅
- withAuth → createApiHandler migration — Phase 2 ✅
- clearSaveTimer() wiring — Phase 1 ✅

### Blockers/Concerns
- None

### Git State
Last commit: 05c3b01
Branch: master
Feature branches merged: none

## Session Continuity

Last session: 2026-03-10
Stopped at: Plans 03-01 and 03-02 complete. Context limit reached.
Next action: Decide if Phase 3 needs 03-03 (SongChartsLibrary 473, TransposerMenu 411, useMusicStore 279 LOC) or mark phase complete.
Resume file: .paul/phases/03-architecture-cleanup-v15/03-02-SUMMARY.md
Resume context: Dead code removed, SetlistEditorV2 708→667, MusicianPicker 824→612. Remaining candidates are moderate-sized — diminishing returns. Recommend evaluating whether to split or skip.

---
*STATE.md — Updated after every significant action*
