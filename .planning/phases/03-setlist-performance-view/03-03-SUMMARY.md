---
phase: 03-setlist-performance-view
plan: 03
subsystem: ui
tags: [react, tailwind, firestore, public-access, home-screen, performance-view]

# Dependency graph
requires:
  - phase: 03-setlist-performance-view
    provides: "SetlistView, SetlistRow with isPublicView prop, useSetlistPerformance hook"
provides:
  - "PublicSetlistListing component for unauthenticated visitors at /perform"
  - "NextServiceCard single focused home screen card"
  - "Simplified DashboardClient with one-card-one-action philosophy"
  - "Public /perform landing page"
affects: [04-template-management, 06-notifications]

# Tech tracking
tech-stack:
  added: []
  removed: [recharts]
  patterns:
    - "Public pages use createSetlistService(null, null) for no-auth Firestore reads"
    - "NextServiceCard: single card with isPastSetlist toggle for empty state"
    - "Dashboard complexity commented out (not deleted) for future phase reuse"

key-files:
  created:
    - src/components/performance/PublicSetlistListing.tsx
    - src/app/perform/page.tsx
    - src/components/home/NextServiceCard.tsx
    - src/components/performance/__tests__/public-view.test.tsx
    - src/components/home/__tests__/next-service-card.test.tsx
  modified:
    - src/app/(main)/DashboardClient.tsx
    - src/app/perform/setlist/[id]/page.tsx
  deleted:
    - src/components/admin/analytics/TimelineChart.tsx

key-decisions:
  - "Public back link goes to /perform (public listing) not / (dashboard)"
  - "Dashboard complexity components commented out, not deleted -- retained for Phase 4/6 reuse"
  - "NextServiceCard is a standalone component, not embedded in dashboard barrel export"
  - "Empty state shows most recent past setlist for practice reference"
  - "recharts removed along with orphaned TimelineChart.tsx"

patterns-established:
  - "PublicSetlistListing: self-contained component with own Firestore subscription for public data"
  - "NextServiceCard: date + name + musicians + single action button pattern"

requirements-completed: [PUB-01, PUB-02, PUB-03, HOME-01, HOME-02]

# Metrics
duration: 5min
completed: 2026-03-08
---

# Phase 3 Plan 3: Public Access and Home Screen Redesign Summary

**Public setlist browsing at /perform for unauthenticated visitors, single focused NextServiceCard replacing dashboard complexity, recharts cleanup**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-08T03:08:03Z
- **Completed:** 2026-03-08T03:13:09Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Public visitors can browse setlists at /perform without authentication -- no sign-in prompt
- Public performance view is read-only with concert keys (no transposition, no monitor, no edit)
- Home screen shows single focused card: date, name, musicians, one Perform button
- Empty state shows most recent past setlist with Practice button instead of Perform
- Removed orphaned recharts dependency and TimelineChart.tsx
- Dashboard complexity commented out for future phase reuse (HeroCard, CommandRow, Timeline, etc.)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for public view** - `b5bd75c` (test)
2. **Task 1 GREEN: Public setlist listing and conditional rendering** - `5c95a50` (feat)
3. **Task 2 RED: Failing tests for NextServiceCard** - `afecd5b` (test)
4. **Task 2 GREEN: Home screen redesign and recharts cleanup** - `99acb39` (feat)

## Files Created/Modified
- `src/components/performance/PublicSetlistListing.tsx` - Public setlist listing component with Firestore subscription
- `src/app/perform/page.tsx` - Public landing page at /perform route
- `src/components/home/NextServiceCard.tsx` - Single focused card: date, name, musicians, action button
- `src/app/(main)/DashboardClient.tsx` - Simplified to render NextServiceCard for members
- `src/app/perform/setlist/[id]/page.tsx` - Updated back link to /perform for public users
- `src/components/performance/__tests__/public-view.test.tsx` - 4 tests for public view
- `src/components/home/__tests__/next-service-card.test.tsx` - 4 tests for NextServiceCard
- `src/components/admin/analytics/TimelineChart.tsx` - Deleted (orphaned recharts consumer)
- `package.json` - Removed recharts dependency

## Decisions Made
- Public users navigate back to /perform (public listing) not / (dashboard) -- keeps public flow self-contained
- Dashboard complexity components (HeroCard, CommandRow, UpcomingTimeline, WhatsChangedBanner, PrepRecommendations, TaskCards) commented out but not deleted per plan -- retained for Phase 4 template management or Phase 6 notifications
- NextServiceCard is a standalone component in src/components/home/ rather than in the dashboard barrel export
- Empty state uses most recent past setlist with isPastSetlist flag that changes button to "Practice" and label to "Recent"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 3 plans complete (01: dense setlist, 02: PDF overlay, 03: public access + home)
- 579 tests passing (8 new + 571 existing)
- Public access fully functional for community jam sessions
- Home screen simplified to single focused card
- Ready for Phase 4 (template management) or Phase 5 (admin simplification)

---
*Phase: 03-setlist-performance-view*
*Completed: 2026-03-08*
