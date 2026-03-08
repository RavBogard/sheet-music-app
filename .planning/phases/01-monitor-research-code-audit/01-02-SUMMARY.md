---
phase: 01-monitor-research-code-audit
plan: 02
subsystem: codebase-cleanup
tags: [dead-code, audit, zustand, admin]
dependency_graph:
  requires: []
  provides: [docs/codebase-audit.md, clean-codebase]
  affects: [all-phases]
tech_stack:
  added: []
  patterns:
    - Aggressive dead code deletion with build verification at each step
    - Cascading import cleanup via TypeScript compiler as safety net
    - Structured audit document as planning artifact for future phases
key_files:
  created:
    - docs/codebase-audit.md
  modified:
    - src/types/models.ts
    - src/middleware.ts
    - src/app/(main)/manage/page.tsx
    - src/app/perform/setlist/[id]/page.tsx
    - src/hooks/use-calendar-data.ts
    - src/hooks/use-creation-wizard.ts
    - src/components/calendar/CalendarDayCell.tsx
    - src/components/setlist/wizard/CreationWizard.tsx
    - src/lib/setlist-store.ts
  deleted:
    - src/app/(main)/tasks/page.tsx
    - src/app/(main)/leader/page.tsx
    - src/app/api/tasks/create/route.ts
    - src/app/api/tasks/delete/route.ts
    - src/app/api/tasks/update/route.ts
    - src/components/setlist/tasks/TaskSheet.tsx
    - src/components/admin/UsageAnalyticsSection.tsx
decisions:
  - "setlist-store.ts retained with TODO comment: still used as staging buffer for library-to-setlist workflow (Phase 4 to replace)"
  - "dashboard/TaskCards.tsx retained: will silently show 0 tasks, clean up in Phase 5"
  - "Store consolidation documented but NOT implemented: plan-now-execute-later per CONTEXT.md"
  - "Audit covers all 8 required sections with per-phase cleanup roadmap"
metrics:
  duration: "~45 minutes"
  completed_date: "2026-03-07"
  tasks_completed: 2
  files_deleted: 7
  files_modified: 8
  lines_deleted: 1041
  lines_added: 451
---

# Phase 1 Plan 2: Codebase Audit + Dead Code Deletion Summary

**One-liner:** Deleted 1,041 lines of dead task management, analytics, and legacy routing code; produced 451-line codebase audit document with per-phase cleanup roadmap covering all 7 Zustand stores, 155 components, 66 API routes, and admin feature triage.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Delete confirmed dead code with build verification | 85f6326 | 7 deleted, 8 modified |
| 1a | Cascade fix: creation wizard calling deleted tasks API | a413ae6 | use-creation-wizard.ts, CreationWizard.tsx |
| 2 | Write comprehensive codebase audit document | 6771969 | docs/codebase-audit.md (451 lines) |

## What Was Deleted

### Task System (Completely Cut from v2 Scope)
- `src/app/(main)/tasks/page.tsx` — 290 lines
- `src/app/api/tasks/create/route.ts`, `delete/route.ts`, `update/route.ts` — ~150 lines
- `src/components/setlist/tasks/TaskSheet.tsx` — ~200 lines
- `TaskStatus` type and `SetlistTask` interface from `models.ts` — ~25 lines

### Analytics (Cut from v2 Scope)
- `src/components/admin/UsageAnalyticsSection.tsx` — 377 lines

### Legacy Routing
- `src/app/(main)/leader/page.tsx` — redirect page, middleware now handles the sole remaining `/admin → /manage` redirect

### Cascade Fixes (Auto-Fixed via Rule 1)
- `src/hooks/use-calendar-data.ts` — removed SetlistTask subscription (was querying tasks collection)
- `src/app/perform/setlist/[id]/page.tsx` — removed TaskSheet integration and ListTodo icon
- `src/components/calendar/CalendarDayCell.tsx` — removed task count indicator
- `src/hooks/use-creation-wizard.ts` — removed tasks step (was calling deleted /api/tasks/create)
- `src/components/setlist/wizard/CreationWizard.tsx` — removed TasksStep component, wizard now has 3 steps

## What Was NOT Deleted (and Why)

| Item | Reason | Plan |
|------|--------|------|
| `src/lib/setlist-store.ts` | Active staging buffer for library-to-setlist workflow | Phase 4 |
| `src/components/dashboard/TaskCards.tsx` | Renders but silently shows 0 tasks | Phase 5 |
| `src/components/admin/analytics/TimelineChart.tsx` | Orphaned but low risk to leave | Phase 3 |

## Audit Document Coverage

The `docs/codebase-audit.md` document covers:

1. **Dead Code Removed** — full inventory with line counts and cascade fix documentation
2. **Additional Dead Code Candidates** — 7 safe-to-delete + 6 needs-investigation items
3. **Zustand Store Architecture Plan** — 8 stores analyzed, target architecture for 7 stores, migration schedule by phase
4. **Component Audit** — 155 components by directory, 9 oversized components (>300 lines) identified, rebuild schedule
5. **Admin Feature Triage** — 7 essential, 7 duct-tape, 4 simplify-in-Phase-5 features
6. **API Route Audit** — 66 routes cataloged, 3 analytics routes orphaned, 6 duct-tape admin routes
7. **Dependency Health** — `recharts` identified as orphaned after analytics deletion
8. **Cleanup by Phase** — actionable list for Phases 2-5

## Verification

- `npm run build` passes after all deletions
- `npx vitest run` passes: 502 tests, 25 test files
- No orphaned imports remain (grep verified)
- Audit document: 451 lines, all 6 required sections present

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cascade cleanup: use-calendar-data.ts queried deleted tasks collection**
- **Found during:** Task 1, Group 1 cleanup
- **Issue:** After removing SetlistTask type, use-calendar-data.ts still subscribed to the tasks Firestore collection and used SetlistTask type
- **Fix:** Removed task subscription, SetlistTask import, CalendarDayData.tasks field, and CalendarDayCell task count indicator
- **Files modified:** use-calendar-data.ts, CalendarDayCell.tsx
- **Commit:** 85f6326

**2. [Rule 1 - Bug] Cascade cleanup: use-creation-wizard.ts called deleted /api/tasks/create**
- **Found during:** Post-Task 1 orphaned import scan
- **Issue:** use-creation-wizard.ts had a 'tasks' step that called /api/tasks/create (now deleted)
- **Fix:** Removed tasks step from wizard (3-step wizard: details, songs, musicians), deleted TasksStep component, removed WizardTask type and all task-related state
- **Files modified:** use-creation-wizard.ts, CreationWizard.tsx
- **Commit:** a413ae6

**3. [Rule 1 - Bug] setlist-store.ts retained (not deleted) due to active usage**
- **Found during:** Task 1, Group 4 analysis
- **Issue:** Plan expected setlist-store.ts to be deletable, but it's still the staging buffer for library-to-setlist workflow (SongChartsLibrary → SetlistEditorV2)
- **Fix:** Added TODO comment explaining retention reason and Phase 4 removal target
- **Commit:** 85f6326

## Self-Check: PASSED

- docs/codebase-audit.md: FOUND
- Commit 85f6326 (dead code deletion): FOUND
- Commit 6771969 (audit document): FOUND
- Commit a413ae6 (cascade fix): FOUND
- src/app/(main)/tasks/page.tsx: CONFIRMED DELETED
- src/components/admin/UsageAnalyticsSection.tsx: CONFIRMED DELETED
- src/app/(main)/leader/page.tsx: CONFIRMED DELETED
