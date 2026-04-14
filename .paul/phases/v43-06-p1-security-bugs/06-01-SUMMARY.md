---
phase: v43-06-p1-security-bugs
plan: 01
subsystem: security
tags: [s05, s06, firestore-rules, monitor, wontfix]

requires:
  - phase: v43-01-recursive-research
    provides: S05 + S06 findings

provides:
  - Schema-validated monitor-commands rule (S05 closed)
  - S06 wontfix rationale on search-content route
  - Clean slate for 06-02 (B03-B06) and 06-03 (S04 design)

affects: any future monitor command type — must be added to the rule allowlist before it can be written from a client

tech-stack:
  added: []
  patterns:
    - "Firestore rule schema-validation: enumerate allowed `type` values + shape-check typed fields (is int / is number / is bool) rather than accepting arbitrary client-shaped docs"

key-files:
  created: []
  modified:
    - firestore.rules
    - src/app/api/library/search-content/route.ts

key-decisions:
  - "S04 deferred — needs a design call on whether QR session approval is self-only or intended to allow cross-user approval; not appropriate to bundle with a pure rule tightening"
  - "S06 wontfix — single-congregation shared library is the design; document rationale + revisit triggers"

patterns-established:
  - "Any new monitor command type requires a rules update alongside the client + bridge code"

duration: ~20min
started: 2026-04-15T00:45:00Z
completed: 2026-04-15T01:05:00Z
---

# Phase 6 Plan 01: S05 + S06 Close-Out Summary

**Monitor-command rule now schema-checks `type` and field shapes; S06 documented as wontfix in the codebase.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~20 min |
| Tasks | 2 auto + 1 human-verify — all complete |
| Files modified | 2 |
| New tests | 0 (rule-only change; emulator setup not justified for a single-rule tightening) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Rule requires known type | PASS | Allowlist of 5 types; anything else denied |
| AC-2: Shape-consistent fields enforced | PASS | busIndex/channelIndex/matrixIndex are int; value is number or bool |
| AC-3: Legitimate writes still succeed | PASS | Human-verified on prod monitor UI across bus-master, send-level, send-on, matrix-fader, matrix-on |
| AC-4: S06 wontfix documented | PASS | Block comment above GET export in search-content route |

## Accomplishments

- S05 closed: clients can no longer inject arbitrary `command` / `parameters` shapes
- S06 clearly disposed of: the audit finding is now either silent in the codebase (a comment) or promoted to a real action item if multi-tenancy arrives
- Zero regressions on live monitor operation

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1+2: rule + wontfix comment + plan | `f88f102` | fix(s05,s06) | Single commit bundled rule tightening + documentation + plan |

All on `origin/master`. Rules deployed via `firebase deploy --only firestore:rules`.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `firestore.rules` | Modified | monitor-live/commands/pending gains `type` allowlist + field shape checks |
| `src/app/api/library/search-content/route.ts` | Modified | Block comment explaining S06 wontfix rationale |

## Decisions Made

See PLAN 06-01 §Purpose + §Skills table. S04 deferred to its own plan pending QR-flow intent confirmation; S06 closed as wontfix with explicit revisit triggers (multi-tenant; per-user library tier).

## Deviations from Plan

None. Plan executed as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Phase 6 plan 1 of N complete
- 06-02 can proceed: B03-B06 (monitor-client debounce race, loadLibraryMeta closure, DashboardClient unsub gating, swapTrack tracks-array assertion)
- 06-03 can proceed once we decide S04 intent

**Concerns:** None on 06-01.

**Blockers:** None.

---
*Phase: v43-06-p1-security-bugs, Plan: 01*
*Completed: 2026-04-15*
