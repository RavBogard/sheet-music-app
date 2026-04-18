---
phase: 04-setlist-editor
plan: 02
subsystem: ui
tags: [liturgical-templates, fuse-js, react, wizard, duplicate-workflow]

requires:
  - phase: 04-setlist-editor/01
    provides: inline editing, flow items, search overlay, add bar
provides:
  - 16 liturgical templates (7 regular, 9 holiday stubs) accessible via getTemplate
  - Rabbi variant filtering via onlyFor conditionals on shared templates
  - TEMPLATE_LABELS metadata registry for template picker UI
  - getAllTemplateKeys utility for dynamic template enumeration
  - Simplified 2-step creation wizard (template picker + details)
  - Prominent "Duplicate for Next Week" one-tap button on dashboard cards
  - cloneForNextWeek tests verifying date advance, track copy, auto-naming
affects: [04-setlist-editor/03, 06-notifications]

tech-stack:
  added: []
  patterns: [shared-slot-sequences, onlyFor-rabbi-conditionals, template-labels-registry]

key-files:
  created: []
  modified:
    - src/lib/liturgical-templates.ts
    - src/lib/liturgical-templates.test.ts
    - src/lib/setlist-firebase.test.ts
    - src/hooks/use-creation-wizard.ts
    - src/hooks/use-setlist-dashboard.ts
    - src/components/setlist/wizard/CreationWizard.tsx
    - src/components/setlist/SetlistCards.tsx
    - src/components/setlist/SetlistDashboard.tsx

key-decisions:
  - "Shared slot sequences (TORAH_SERVICE_SLOTS, CLOSING_SLOTS, BNEI_MITZVAH_CEREMONY_SLOTS) for DRY template composition under 500 lines"
  - "Rabbi variants via onlyFor conditionals on shared templates rather than separate template arrays"
  - "Saturday morning Daniel/Karen and Randy variants use single SHABBAT_MORNING_TEMPLATE with onlyFor slots"
  - "Wizard simplified to 2 steps: template picker then name/date (auto-generated from template + date)"
  - "Duplicate for Next Week promoted from overflow menu to visible button on all card types"

patterns-established:
  - "Template composition: shared slot arrays spread into templates to avoid copy-paste"
  - "TEMPLATE_LABELS registry: centralized metadata for UI display (label, category, slotCount)"

requirements-completed: [EDIT-01, EDIT-02]

duration: 8min
completed: 2026-03-08
---

# Phase 4 Plan 2: Templates & Duplicate Workflow Summary

**16 liturgical templates (7 regular with rabbi variants, 9 holiday stubs) with DRY shared slot sequences, simplified 2-step creation wizard, and prominent one-tap "Duplicate for Next Week" on dashboard cards**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-08T03:55:31Z
- **Completed:** 2026-03-08T04:03:55Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- All 16 templates defined and accessible via getTemplate (5 regular + 9 holiday stubs = 14 keys; Saturday morning variants via rabbi filtering on base template)
- Rabbi variant filtering via onlyFor conditionals -- daniel_karen gets meditation moments, randy gets responsive readings/niggun
- Creation wizard simplified from 3 steps (details, songs, musicians) to 2 steps (template picker, details with auto-generated name)
- "Duplicate for Next Week" is now a visible primary button on UpcomingSetlistCard and SetlistCard, no longer buried in overflow menu
- From Template dropdown shows all 14 templates with slot count, not just Friday Night and Shabbat Morning
- 48 new/updated tests pass (36 template + 12 firebase including 6 cloneForNextWeek tests)
- Full test suite: 614 tests pass across 39 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Complete all 16 liturgical templates** - `8dacb73` (feat, TDD)
2. **Task 2: Enhance duplicate workflow and simplify creation** - `55b1ac8` (feat)

## Files Created/Modified
- `src/lib/liturgical-templates.ts` - 16 templates with shared slot sequences, TEMPLATE_LABELS registry, getAllTemplateKeys, updated rabbi filtering in buildSetlistFromTemplate
- `src/lib/liturgical-templates.test.ts` - 36 tests covering all template types, rabbi variants, engine output
- `src/lib/setlist-firebase.test.ts` - 6 new cloneForNextWeek tests (date advance, track copy, auto-name, musician copy, different ID, clonedFrom)
- `src/hooks/use-creation-wizard.ts` - Rewritten for 2-step flow: template picker with auto-fill then details
- `src/hooks/use-setlist-dashboard.ts` - handleCreateFromTemplate accepts any template key
- `src/components/setlist/wizard/CreationWizard.tsx` - 2-step UI: template grid (regular/holiday categories) then name/date/rabbi/public
- `src/components/setlist/SetlistCards.tsx` - Prominent "Duplicate for Next Week" button on both card types
- `src/components/setlist/SetlistDashboard.tsx` - From Template dropdown shows all 14 templates with metadata

## Decisions Made
- Used shared slot sequences (TORAH_SERVICE_SLOTS, CLOSING_SLOTS, BNEI_MITZVAH_CEREMONY_SLOTS) spread into templates to keep total code under 500 lines
- Saturday morning Daniel/Karen and Randy variants use single SHABBAT_MORNING_TEMPLATE with onlyFor slots rather than separate arrays
- Wizard simplified to 2 steps (per Claude's Discretion in CONTEXT.md) -- musicians step removed from wizard (add after creation in editor)
- Template picker organized by category (Regular Services / Holiday Services) with slot count preview

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated buildSetlistFromTemplate rabbi filtering to use context.rabbi instead of context.type**
- **Found during:** Task 1 (template implementation)
- **Issue:** Original onlyFor filtering used context.type (service type), but rabbi variants need to filter by context.rabbi
- **Fix:** Changed filtering to check (context as any).rabbi against slot.onlyFor, keeping backward compatibility when no rabbi is set
- **Files modified:** src/lib/liturgical-templates.ts
- **Verification:** Rabbi variant filtering tests pass
- **Committed in:** 8dacb73

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for rabbi variant feature to work correctly. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 16 templates ready for AI chat integration (Plan 03)
- Creation wizard and dashboard ready for use
- Template picker shows all available templates for phone-first selection
- Duplicate workflow is one-tap from dashboard for weekly "copy last week, swap 2-3 songs" flow

---
*Phase: 04-setlist-editor*
*Completed: 2026-03-08*
