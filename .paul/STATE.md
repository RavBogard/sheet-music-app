# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-30)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v3.4 Fixes & Live Mode Activation

## Current Position

Milestone: v3.4 Fixes & Live Mode Activation
Phase: 1 of 3 (Mount LeaderConsole) — Planning
Plan: 01-01 created, awaiting approval
Status: PLAN created, ready for APPLY
Last activity: 2026-04-04 — Milestone v3.4 created (absorbs v3.3)

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
- v3.3 absorbed into v3.4 as Phase 1 (LeaderConsole mounting)
- LeaderConsole component exists but was never mounted (orphaned since v3.0)
- All swap infrastructure (SwapButton, SwapBottomSheet, SwapToast, /live/[id], API routes, Firestore rules) is complete
- Live mode gated on isLeader — only leaders/admins see the console
- Swap buttons gated on canLiveSwap + isLiveMode + hasAlternatives
- Close/duplicate on public setlists is a permissions bug, not a new feature
- Non-song items excluded from PDF charts (correct) but should appear on printed outline/cover page

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is
- BUG-022 (rate limits on all API routes) — Large effort, deferred
- BUG-020 (108 non-null assertions) — Large effort, deferred
- BUG-030 (track array content validation in rules) — Large effort, deferred

### Known Issues
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper

### Git State
Last commit: d37476c
Branch: master

## Session Continuity

Last session: 2026-04-04
Stopped at: Milestone v3.4 created, Phase 1 plan ready
Next action: Review and approve plan, then run /paul:apply .paul/phases/01-mount-leader-console/01-01-PLAN.md
Resume file: .paul/phases/01-mount-leader-console/01-01-PLAN.md

---
*STATE.md — Updated after every significant action*
