# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v1.9 Auth Stability & Deferred Cleanup

## Current Position

Milestone: v1.9 Auth Stability & Deferred Cleanup
Phase: 1 of 5 (Auth & Routing Regression Audit) — Complete
Plan: 01-01 complete
Status: Phase 1 complete, ready for Phase 2
Last activity: 2026-03-11 — Phase 1 loop closed, audit report and summary created

Progress:
- v1.9 Auth Stability & Deferred Cleanup: [██░░░░░░░░] 20%
- Phase 1: [██████████] 100%

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [Loop complete — ready for next phase]
```

## Accumulated Context

### Decisions
- v1.9 restructured: auth stability is primary focus, deferred items secondary
- withAuth migration already complete (only 2 intentional holdouts)

### Deferred Issues
- CRIT-003 (bridge credentials) — Targeted for Phase 4
- LOW-004 (leader → band_leader migration) — Targeted for Phase 5

### Known Issues
- Monitor page redirects to homepage after fresh login — ROOT CAUSE: async fire-and-forget session cookie (auth-context.tsx:97-103)
- Login flow buggy — ROOT CAUSE: no platform detection, silent popup-to-redirect fallback, misleading button text
- Avatars not displaying — ROOT CAUSE: 3 of 4 implementations use fragile manual DOM manipulation instead of Radix Avatar
- Session cookie never refreshed after initial login (low priority, 14-day expiry)
- ESLint 9 standalone `npm run lint` broken — Targeted for Phase 5

### User Requests Pending
- None

### Blockers/Concerns
- None — Phase 1 audit complete, root causes identified

### Git State
Last commit: 572d198
Branch: master

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 1 complete — loop closed
Next action: /paul:plan for Phase 2 (Auth Flow Rebuild)
Resume file: .paul/phases/01-auth-routing-audit/01-01-SUMMARY.md

---
*STATE.md — Updated after every significant action*
