---
phase: 05-nav-schedule-hygiene
plan: 01
subsystem: ui
tags: [mobile-nav, calendar, firestore-indexes, schedule]

requires:
  - phase: 01_2-offline-truthiness
    provides: IDB ground truth the Schedule tab should eventually surface
provides:
  - Mobile bottom-bar Schedule tab
  - Corrected UnifiedCalendar JSDoc (viewer|planning only)
  - Removed dead musician_availability Firestore composite indexes
affects: [05-02-orphan-cleanup, future-schedule-ux]

tech-stack:
  added: []
  patterns:
    - "Mobile tab IIFE for inline active-state computation (mirrors Search/Monitor glow treatment)"

key-files:
  created: []
  modified:
    - src/components/nav/MobileTabBar.tsx
    - src/components/calendar/UnifiedCalendar.tsx
    - firestore.indexes.json

key-decisions:
  - "Schedule tab placed between Setlist (center-primary) and Monitor — matches ROADMAP P5 spec"
  - "firestore.indexes.json edit only; remote Firebase index deletion left as manual follow-up (non-destructive for current prod)"

patterns-established:
  - "Mobile tab active-state: brand glow + bold brand label when pathname.startsWith(route)"

duration: ~15min
started: 2026-04-14T09:40:00Z
completed: 2026-04-14T09:55:00Z
---

# Phase 5 Plan 01: Navigation + Schedule Hygiene (part 1) Summary

**Shipped a Schedule tab on the mobile bottom bar and cleaned stale blockout/availability residue from UnifiedCalendar JSDoc + Firestore indexes.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15 min |
| Tasks | 3 of 3 completed |
| Files modified | 3 |
| Commits | 3 atomic + push to origin/master |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Mobile Schedule tab | Pass | 4-slot layout, brand glow on active, routes to /schedule |
| AC-2: Schedule page read-only | Pass | No blockout/availability UI existed in the rendered page; confirmed via grep |
| AC-3: UnifiedCalendar has no availability/blockout code paths | Pass | Code was already clean; stale JSDoc corrected |
| AC-4: Dead composite index removed | Pass | 2 musician_availability indexes dropped from firestore.indexes.json |
| AC-5: Quality gates | Pass | tsc clean; 1153/1153 tests (only pre-existing env-vars failure, untouched) |

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| T1: Add Schedule tab | `3a1f105` | feat | 4th mobile tab, Calendar icon, active-state glow |
| T2: UnifiedCalendar cleanup | `99cbd1c` | docs | Corrected stale JSDoc; code already clean |
| T3: Drop dead indexes | `6179037` | chore | Removed 2 musician_availability composite indexes |

All pushed to `origin/master` (Vercel auto-deploying to prod).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/nav/MobileTabBar.tsx` | Modified | Added Schedule tab (4th slot) |
| `src/components/calendar/UnifiedCalendar.tsx` | Modified | JSDoc reflects actual two-mode API |
| `firestore.indexes.json` | Modified | Removed 2 dead indexes |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Schedule placed between Setlist and Monitor | Setlist stays center-primary; Schedule is secondary nav | Monitor placeholder still preserves 4-slot balance |
| Local-only index removal (no Firebase deploy) | Non-destructive; user's normal deploy flow will reconcile later | Remote index still exists but is unused; zero runtime cost |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Scope reductions | 1 | Task 2 smaller than planned |
| Deferred | 0 | — |

**Total impact:** Task 2 reduced to a JSDoc correction because the blockout/availability code was already gone (likely removed in earlier v4.x refactors). Plan scope was written against ROADMAP assumptions; actual code state was cleaner. No AC affected.

### Scope Reductions

**1. Task 2: UnifiedCalendar cleanup**
- **Found during:** Task 2 exploration
- **Expected:** Remove "availability" from `CalendarMode`; delete `musician_availability` read branch; strip blockout aggregation from `CalendarGrid`/`CalendarHeader`
- **Actual:** `CalendarMode` already was `viewer | 'planning'`; `use-calendar-data` never read `musician_availability`; grid/header had no blockout-count renderers. Only the JSDoc on UnifiedCalendar still referenced the dead "availability" mode.
- **Fix:** Corrected JSDoc to describe the real two-mode API.
- **Verification:** `grep musician_availability src/` → 0 hits; grep `availability|blockout` in `src/components/calendar/` + `src/hooks/use-calendar-data*` → 0 hits.

### Deferred Items

None from this plan. Phase 5 ROADMAP scope still-to-plan:
- Orphan routes `/settings/users` and `/settings/sound`
- `SetlistDrawer` dead-check + removal
- `monitor-live/commands/pending` trace + removal (if dead)

These are intentionally deferred to Plan 05-02.

## Skill Audit

Required per SPECIAL-FLOWS.md:
- `/ui-ux-pro-max` ✓ invoked before APPLY

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Grep showed scope largely already clean | Narrowed Task 2 to JSDoc fix; documented as scope reduction |

## Next Phase Readiness

**Ready:**
- Mobile navigation now exposes Schedule to the band
- No blockout/availability residue in calendar code path
- Firestore index file is honest about what's actually used

**Concerns:**
- Remote Firebase `musician_availability` indexes still exist; harmless but should be dropped next deploy that runs `firebase deploy --only firestore:indexes`

**Blockers:** None

**Next plan:** 05-02 (orphan route + dead-code cleanup — `/settings/users`, `/settings/sound`, `SetlistDrawer`, `monitor-live/commands/pending`)

---
*Phase: 05-nav-schedule-hygiene, Plan: 01*
*Completed: 2026-04-14*
