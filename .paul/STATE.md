# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-10)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v1.6 Stability & Regression Audit

## Current Position

Milestone: v1.6 Stability & Regression Audit
Phase: 1 of 4 (Auth & CSP Hardening) — Planning
Plan: 01-01 created, awaiting approval
Status: PLAN created, ready for APPLY
Last activity: 2026-03-10 — Created .paul/phases/01-auth-csp-hardening/01-01-PLAN.md

Progress:
- v1.6 Stability & Regression Audit: [░░░░░░░░░░] 0% (4 phases)
- Phase 1: [░░░░░░░░░░] 0%

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ○        ○     [Plan created, awaiting approval]
```

## Accumulated Context

### Decisions
- v1.6 scope: Deep audit of v1.5 regressions — auth/CSP/SW, UI revert, setlist redesign, full sweep
- Phase order: auth first, then UI revert, then setlist redesign, then comprehensive sweep
- Auth fixed: signInWithRedirect reverted back to signInWithPopup (commit 89572e5)
- skipWaiting reverted to false (commit 89572e5)
- Email/password auth removed — Google-only sign-in
- COOP console warnings are cosmetic (Firebase SDK known issue) — no fix needed
- Setlist view redesign added as Phase 3 — keys next to tracks, glanceable live view
- Phases 2, 3 (UI work) will use /ui-ux-pro-max skill

### Deferred Issues (carried from v1.5)
- LOW-004 (leader → band_leader migration) — Still Low, S effort. Defer to v1.7+.

### Known Issues
- route-auth.test.ts: POST /api/setlist/publish expects 403 but gets 400 (pre-existing)
- Manifest icon: /icon dynamic route may not serve in all PWA install contexts
- PDF health scanner: all scans failing with 429 Too Many Requests from /api/drive/file (3rd attempt at fix)

### Blockers/Concerns
- PDF health scan 429s — rate limiting issue, needs investigation

### Git State
Last commit: 89572e5
Branch: master
Feature branches merged: none

## Session Continuity

Last session: 2026-03-10
Stopped at: Executing Phase 1 APPLY — Task 1 (CSP audit) in progress
Next action: /paul:apply .paul/phases/01-auth-csp-hardening/01-01-PLAN.md (resume mid-execution)
Resume file: .paul/phases/01-auth-csp-hardening/01-01-PLAN.md
Resume context:
- Plan approved, APPLY started
- Task 1 (CSP audit): audit complete, CSP is actually correct for client-side — server-side APIs (Twilio, Resend, Inngest, hebcal) don't need CSP entries. Only cleanup: add accounts.google.com to connect-src, add comments documenting each domain.
- Task 2 (static PWA icons): not started
- Task 3 (checkpoint: human-verify): not started
- Milestone finalized at 4 phases (was 5, combined UI revert + setlist redesign into Phase 3)

---
*STATE.md — Updated after every significant action*
