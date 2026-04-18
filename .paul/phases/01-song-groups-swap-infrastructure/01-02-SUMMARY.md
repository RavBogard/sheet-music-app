---
phase: 01-song-groups-swap-infrastructure
plan: 02
subsystem: ui, admin
tags: [admin-ui, user-management, song-groups, shadcn]

requires:
  - phase: 01-01
    provides: canLiveSwap types, API route, useSongGroups hook
provides:
  - canLiveSwap toggle in admin People section
  - Song Groups tab in Manage page with seed button
affects: [phase-2-swap-ui]

tech-stack:
  added: []
  patterns: [canLiveSwap toggle mirrors soundEngineer toggle exactly]

key-files:
  created:
    - src/components/admin/SongGroupSection.tsx
  modified:
    - src/components/admin/UserRow.tsx
    - src/app/(main)/manage/ManageClient.tsx

key-decisions:
  - "Song Group Manager is view-only + seed (no inline edit/create UI — deferred)"
  - "canLiveSwap toggle uses amber color scheme (distinct from green sound engineer)"

patterns-established:
  - "Permission toggle pattern: state + handler + Button with cn() active/inactive styles"

duration: ~10min
completed: 2026-03-30
---

# Phase 1 Plan 02: Admin UI for Song Groups & canLiveSwap

**Admin toggle for live swap permission + Song Groups tab with template seeding in Manage page.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10 min |
| Completed | 2026-03-30 |
| Tasks | 3 completed (2 auto + 1 checkpoint) |
| Files created | 1 |
| Files modified | 2 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: canLiveSwap toggle in UserRow | Pass | ArrowLeftRight icon, amber active state, badge in both desktop + mobile |
| AC-2: SongGroupSection in admin manage page | Pass | Groups tab with list view + empty state |
| AC-3: Seed from templates | Pass | Button calls seed endpoint, toast shows counts |
| AC-4: Build passes | Pass | tsc --noEmit + next build both clean |

## Accomplishments

- Added canLiveSwap toggle button (ArrowLeftRight icon, amber color) to UserRow alongside sound engineer toggle
- Created SongGroupSection with real-time group list and "Seed from Templates" button
- Added "Groups" tab to ManageClient with ArrowLeftRight icon

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/admin/SongGroupSection.tsx` | Created | Song group list + seed button admin section |
| `src/components/admin/UserRow.tsx` | Modified | canLiveSwap toggle, handler, badge (desktop + mobile) |
| `src/app/(main)/manage/ManageClient.tsx` | Modified | Groups tab trigger + content |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| View-only + seed (no inline editing) | Admin panels unstyled; editing is future work | Simple, functional for launch |
| Amber color for swap toggle | Visually distinct from green sound engineer | Easy to differentiate permissions at a glance |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- Phase 1 complete — all data layer + admin UI in place
- Phase 2 (Swap UI & Confirmation Flow) can begin
- All hooks, types, and API routes ready for performance view components

**Concerns:**
- config/songGroups must be seeded before swap UI will show alternatives
- canLiveSwap must be granted to at least one user before swap buttons appear

**Blockers:** None

---
*Phase: 01-song-groups-swap-infrastructure, Plan: 02*
*Completed: 2026-03-30*
