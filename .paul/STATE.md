# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-12)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.6 Deprecation Cleanup, Tech Debt & Setlist UX

## Current Position

Milestone: v2.6 Deprecation Cleanup, Tech Debt & Setlist UX
Phase: 2 of 3 (Next.js & Sentry Deprecation Cleanup)
Plan: Not started
Status: Ready to plan
Last activity: 2026-03-12 — Phase 1 complete, transitioned to Phase 2

Progress:
- v2.6 Deprecation Cleanup, Tech Debt & Setlist UX: [███░░░░░░░] 33%

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [Fresh loop — ready to PLAN]
```

## Accumulated Context

### Decisions
- bg-white/[opacity] for dark-mode alternating rows (not bg-muted which has baked-in alpha)
- Dual-tint rows (0.03/0.07) instead of tint/pure-black for readability

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is

### Known Issues
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper (minor design gap)

### Git State
Last commit: a1ccfa9
Branch: master

## Session Continuity

Last session: 2026-03-12
Stopped at: Phase 1 complete, ready to plan Phase 2
Next action: /paul:plan for Phase 2 (Next.js & Sentry Deprecation Cleanup)
Resume file: .paul/ROADMAP.md

---
*STATE.md — Updated after every significant action*
