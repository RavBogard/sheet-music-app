# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-03-11)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v2.5 Bugsweep & Test Coverage — Phase 10.1 (Mobile Action Bar Redesign) next

## Current Position

Milestone: v2.5 Bugsweep & Test Coverage
Phase: 10.1 of 15 (Mobile Action Bar Redesign)
Plan: None yet
Status: Ready to plan
Last activity: 2026-03-12 — Phase 10.1 design finalized with user

Progress:
- Milestone: [████████░░] 80% (12 of 15 phases complete, counting 6.1 and 8.1)

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ○        ○        ○     [New phase — needs planning]
```

## Accumulated Context

### Decisions
- Phase 8: Monitor tab on mobile opens popover instead of navigating to /monitor
- Phase 9: Print cover page filters to chart-bearing tracks only; sticky keys via library_index lastUsedKey
- Phase 10: Already implemented — no code changes needed
- Phase 10.1: Mobile bottom bar redesign — Search (popover) | Setlist (navigate, slightly larger) | Monitor (popover)
  - Setlist button: navigate to perform mode, session-opened setlist priority, else nearest eventDate
  - Search: library-wide song search popup
  - Monitor: QuickMonitorPanel (already built)
  - Mobile only, hidden during PDF view
  - Aesthetic consistency with PerformanceToolbar (material-thick, border-brand/10)
  - Setlist center button gets subtle glow/elevation

### Deferred Issues
- CRIT-003 (bridge credentials) — Accepted risk, revisit if multi-tenant
- LOW-005 (logger levels) — Accepted as-is

### Known Issues
- Remind route: "no setlistId" 48-hour filter code is unreachable via API wrapper (minor design gap)

### Git State
Last commit: 8650480
Branch: master

## Session Continuity

Last session: 2026-03-12
Stopped at: Phase 10.1 design discussion complete, ready to plan
Next action: /paul:plan for Phase 10.1 (Mobile Action Bar Redesign)
Resume file: .paul/HANDOFF-2026-03-12-session.md
Resume context:
- Phases 8, 9, 10 completed this session
- Fixed 2 flaky urgency label tests
- Phase 10.1 fully designed with user input — see ROADMAP.md for spec
- Key files: MobileTabBar.tsx (rewrite), PerformanceToolbar.tsx (aesthetic alignment)

---
*STATE.md — Updated after every significant action*
