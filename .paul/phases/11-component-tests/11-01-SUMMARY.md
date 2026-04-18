# Summary: Plan 11-01 — Simple/Medium Component Tests

## What Was Done
Created 5 new test files and expanded 1 existing file, adding 99 tests total for 7 UI components.

## Test Files Created/Modified

| File | Tests | Component |
|------|-------|-----------|
| `library/__tests__/library-file-row.test.tsx` | 29 | LibraryFileRow |
| `library/__tests__/upload-dialog.test.tsx` | 12 | UploadDialog |
| `scheduling/__tests__/schedule-card.test.tsx` | 18 | ScheduleCard |
| `scheduling/__tests__/rabbi-banner.test.tsx` | 13 | RabbiBanner |
| `dashboard/__tests__/prep-recommendations.test.tsx` | 15 | PrepRecommendations |
| `home/__tests__/next-service-card.test.tsx` | 12 | NextServiceCard (expanded from 4) |

## Key Patterns Used
- `vi.hoisted()` for mock variables referenced in `vi.mock` factories (fixes hoisting errors with sonner/toast and apiFetch)
- `getByLabelText()` over `getByRole("button")` when ContextMenu mock creates extra button elements
- `vi.useFakeTimers()` + `vi.setSystemTime()` for date-dependent tests
- Inline mock objects per file (no shared factories, matching codebase convention)

## Acceptance Criteria Met
- AC-1: LibraryFileRow renders correctly for each file type ✓
- AC-2: LibraryFileRow handles select mode and long-press ✓
- AC-3: UploadDialog validates files and handles upload flow ✓
- AC-4: ScheduleCard displays status and handles accept/decline ✓
- AC-5: RabbiBanner renders conditionally based on rabbi profiles ✓
- AC-6: PrepRecommendations filters and displays urgent items ✓
- AC-7: NextServiceCard expanded coverage ✓

## Deviations
- None

## Files Modified
- 0 source files modified (test-only plan)
- 5 new test files created
- 1 existing test file rewritten with expanded coverage
