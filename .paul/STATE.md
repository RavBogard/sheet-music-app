# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v1.7 Critical Bug Fixes

## Current Position

Milestone: v1.7 Critical Bug Fixes
Phase: 4 of 5 (Key Signature Position)
Plan: Not started
Status: Ready to plan
Last activity: 2026-03-11 — Phase 3 complete, transitioned to Phase 4

Progress:
- v1.7 Critical Bug Fixes: [██████░░░░] 60% (5 phases, 3 complete)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [Phase 4 — ready to plan]
```

## Accumulated Context

### Decisions
- v1.7 scope restructured: 5 phases (quick fixes, print pipeline overhaul, key sig, monitor buses)
- Phase 1 combined first 3 bugs into single plan (sign-in, SW banner, avatar) — all applied
- Avatar root cause: GoogleAuthProvider missing `profile` scope → user.photoURL always null
- COOP header set to same-origin-allow-popups for Google popup sign-in
- signInWithRedirect as fallback when popup blocked (mobile)
- Print 500 root cause: Inngest not configured on Vercel → inngest.send() fails
- Solution: Bypass Inngest entirely, generate PDFs synchronously
- PrintModal simplified: direct blob fetch, no Firestore onSnapshot polling
- Modal overlay lightened from bg-black/90 to bg-black/60

### Deferred Issues (carried from v1.5)
- LOW-004 (leader → band_leader migration) — Still Low, S effort. Defer to v1.8+.

### Known Issues
- None currently blocking

### User Requests Pending
- Monitor buses: User thought 5 buses should show, only 4 are visible (Phase 5)
- Key signature position (Phase 4): Move key from left to right of song title

### Blockers/Concerns
- None

### Git State
Last commit: ecae2dd
Branch: master

## Session Continuity

Last session: 2026-03-11
Stopped at: Phase 3 complete, ready to plan Phase 4
Next action: /paul:plan for Phase 4
Resume file: .paul/ROADMAP.md
Resume context:
- Phase 1 COMPLETE: sign-in redirect fallback, SW banner suppress, avatar onError fallback
- Phase 2 COMPLETE: Google OAuth profile scope + changelog page
- Phase 3 COMPLETE: Sync PDF generation, simplified PrintModal
- Phase 4 NEXT: Key signature position (move key from left to right of song title)
- Phase 5: Monitor buses investigation
- IMPORTANT: Push to main — user wants all changes deployed

---
*STATE.md — Updated after every significant action*
