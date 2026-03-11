# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 3 planned

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 3 of 8 (Test Infrastructure & Flaky Fix) — Planning
Plan: 03-01 created, awaiting approval
Status: PLAN created, ready for APPLY
Last activity: 2026-03-11 — Created phases/03-test-infrastructure-flaky-fix/03-01-PLAN.md

Progress:
- Milestone: [██░░░░░░░░] 25%
- Phase 3: [░░░░░░░░░░] 0%

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ○        ○     [Plan created, awaiting approval]
```

## Accumulated Context

### Decisions
- CRIT-003 (bridge credentials) accepted as low risk — single venue, single admin, HTTPS delivery, revisit if multi-tenant
- withAuth migration already complete (only 2 intentional holdouts)
- clearSaveTimer already wired at page level — no additional wiring needed (resolved)
- ALLOWED_HOSTNAMES derived from ALLOWED_ORIGINS for hostname validation

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is

### Known Issues
- Session cookie never refreshed after initial login (low priority, 14-day expiry)

### Git State
Last commit: 3d1b993
Branch: master

## Session Continuity

Last session: 2026-03-11
Stopped at: Plan 03-01 created
Next action: Review and approve plan, then run /paul:apply phases/03-test-infrastructure-flaky-fix/03-01-PLAN.md
Resume file: .paul/phases/03-test-infrastructure-flaky-fix/03-01-PLAN.md
Resume context:
- 3 tasks: factories, shared mocks/helpers, refactor route-auth test
- Flaky cause: 367ms cold dynamic import in first publish test
- Fix: beforeAll import pattern
- New files: factories.ts, mock-firebase-admin.ts, api-test-helpers.ts

---
*STATE.md — Updated after every significant action*
