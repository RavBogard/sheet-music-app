# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-04-04)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** Milestone complete — ready for next milestone discussion

## Current Position

Milestone: v3.4 Fixes & Live Mode Activation — Complete
Phase: 3 of 3 — All complete
Status: Milestone complete
Last activity: 2026-04-04 — v3.4 milestone completed

Progress:
- Milestone: [██████████] 100% ✓

## Loop Position

No active loop — milestone complete.

## Accumulated Context

### Decisions
- v3.3 absorbed into v3.4 as Phase 1 (LeaderConsole mounting)
- Collapsible panel pattern for LeaderConsole (not always-visible)
- Band leaders can delete public setlists only (not private)
- Print cover page shows ALL items, not just songs with charts
- Rabbi field rendered as "Led by:" above "Prepared for:" on print cover
- CSP updated to allow hebcal.com for liturgical calendar fetch
- Spread operator to omit undefined rabbi field (Firestore rejects undefined)

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is
- BUG-022 (rate limits on all API routes) — Large effort, deferred
- BUG-020 (108 non-null assertions) — Large effort, deferred
- BUG-030 (track array content validation in rules) — Large effort, deferred

### Known Issues
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper

### Git State
Last commit: 30f809c
Branch: master

## Session Continuity

Last session: 2026-04-04
Stopped at: v3.4 milestone complete
Next action: /paul:discuss-milestone for next milestone
Resume file: .paul/ROADMAP.md

---
*STATE.md — Updated after every significant action*
