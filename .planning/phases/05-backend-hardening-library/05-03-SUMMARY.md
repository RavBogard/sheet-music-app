---
phase: 05-backend-hardening-library
plan: 03
subsystem: ui
tags: [react, setlist-editor, admin, print-pipeline, email]

requires:
  - phase: 05-backend-hardening-library/05-01
    provides: "sync_runs Firestore collection for sync status tracking"
  - phase: 05-backend-hardening-library/05-02
    provides: "/api/admin/set-upload-permission endpoint for canUpload toggle"
provides:
  - "Gig Packet button in setlist editor action bar with recipient selection"
  - "Simplified admin page with 2 sections: People and Library"
  - "Sound system config at /settings/sound"
  - "Removed 11 duct-tape API routes and 7 duct-tape components"
affects: []

tech-stack:
  added: []
  patterns:
    - "Admin page uses flat section layout instead of tabs for small section counts"
    - "LibraryDataSection reads sync_runs collection for sync status"

key-files:
  created:
    - "src/app/(main)/settings/sound/page.tsx"
    - "src/lib/template-parser.ts"
  modified:
    - "src/components/setlist/PrintModal.tsx"
    - "src/components/setlist/PrintModeSelector.tsx"
    - "src/components/setlist/v2/SetlistTopBar.tsx"
    - "src/components/setlist/v2/SetlistEditorV2.tsx"
    - "src/app/(main)/manage/page.tsx"
    - "src/components/admin/LibraryDataSection.tsx"

key-decisions:
  - "PrintModal uses optional uid field from SetlistMusician to pre-check assigned musicians"
  - "Email packets sends to selected recipients when in select-musicians mode, all when in other modes"
  - "Admin page uses flat section layout (no tabs) since only 2 sections remain"
  - "Sound system settings get their own page at /settings/sound with back button to /manage"
  - "Extracted parseTemplateRequest to shared lib to fix Next.js route export constraint"

patterns-established:
  - "Flat admin layout: When admin has few sections, use scrollable page with dividers instead of tabs"

requirements-completed: [PRINT-01, PRINT-02, CODE-04]

duration: 7min
completed: 2026-03-08
---

# Phase 5 Plan 3: Gig Packet UI + Admin Simplification Summary

**Gig Packet button wired into setlist editor with recipient pre-selection, admin simplified to People + Library sections, 11 duct-tape routes and 7 components deleted**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-08T04:54:11Z
- **Completed:** 2026-03-08T05:01:00Z
- **Tasks:** 3
- **Files modified:** 30 (4 modified, 3 created, 23 deleted)

## Accomplishments
- "Gig Packet" button prominently displayed in setlist editor top bar with label on desktop
- PrintModal pre-checks assigned musicians and sends emails to selected recipients
- Admin page reduced from 4 tabs/7 sections to 2 flat sections (People + Library)
- Sound system config relocated to /settings/sound
- Deleted 11 duct-tape API routes (analytics, migrate-storage, prune, debug-pending, enrich)
- Deleted 7 duct-tape components (SystemSection, DeveloperToolsSection, and sub-directories)
- Fixed 3 pre-existing TypeScript build errors that were blocking compilation

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhance PrintModal with recipient selection and email integration** - `fe41972` (feat)
2. **Task 2: Simplify admin page to People + Library, relocate sound config, remove duct-tape** - `9436e11` (feat)
3. **Task 3: Fix pre-existing build errors blocking compilation** - `dc03f54` (fix)

## Files Created/Modified
- `src/components/setlist/PrintModal.tsx` - Added assignedMusicians prop, pre-check logic, recipient-targeted email
- `src/components/setlist/PrintModeSelector.tsx` - Updated labels: "Generic (concert pitch)" and "Personalized (transposed)"
- `src/components/setlist/v2/SetlistTopBar.tsx` - Changed print button to "Gig Packet" with visible label
- `src/components/setlist/v2/SetlistEditorV2.tsx` - Pass assignedMusicians prop to PrintModal
- `src/app/(main)/manage/page.tsx` - Rewritten: 2 sections (People, Library), no tabs
- `src/app/(main)/settings/sound/page.tsx` - New: Sound system config page (SoundSystemSection + LiveServiceSection)
- `src/components/admin/LibraryDataSection.tsx` - Simplified: sync status card from sync_runs + file count + sync button
- `src/lib/template-parser.ts` - Extracted parseTemplateRequest from chat route

### Deleted Routes (11)
- `src/app/api/admin/analytics/route.ts`, `analytics/export/route.ts`, `analytics/songs/route.ts`
- `src/app/api/admin/migrate-storage/route.ts`, `migrate-storage/reset/route.ts`
- `src/app/api/admin/prune-orphans/route.ts`
- `src/app/api/admin/prune/scan/route.ts`, `prune/execute/route.ts`
- `src/app/api/admin/debug-pending/route.ts`
- `src/app/api/admin/enrich/route.ts`, `enrich/failures/route.ts`

### Deleted Components (7)
- `src/components/admin/SystemSection.tsx`
- `src/components/admin/DeveloperToolsSection.tsx`
- `src/components/admin/developer/DataIntegrityCard.tsx`
- `src/components/admin/developer/FirebaseMigrationCard.tsx`
- `src/components/admin/system/BackupCard.tsx`
- `src/components/admin/system/GlobalAlertCard.tsx`
- `src/components/admin/library/AiEnrichmentCard.tsx`, `ChordCacheCard.tsx`, `OrphanedFilePruner.tsx`

## Decisions Made
- Used optional uid from SetlistMusician type (uid is optional for guest musicians) to pre-check recipients
- Email sends to selectedUids only when in "select-musicians" mode; sends to all band members otherwise
- Admin page uses flat scrollable layout with section headings instead of tab navigation
- Sound settings page includes both LiveServiceSection and SoundSystemSection with a back button

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing parseTemplateRequest export in chat route**
- **Found during:** Task 3 (build verification)
- **Issue:** `parseTemplateRequest` was exported from a Next.js route file, which Next.js forbids (only HTTP methods + config can be exported)
- **Fix:** Extracted to `src/lib/template-parser.ts`, updated route and test imports
- **Files modified:** `src/app/api/chat/route.ts`, `src/lib/template-parser.ts`, `src/lib/chat-store.test.ts`
- **Verification:** Build passes
- **Committed in:** dc03f54

**2. [Rule 1 - Bug] Fixed HebrewDate type mismatch in chat route**
- **Found during:** Task 3 (build verification)
- **Issue:** `month` and `year` fields initialized as `0` (number) but typed as `string`
- **Fix:** Changed to empty strings to match interface
- **Files modified:** `src/app/api/chat/route.ts`
- **Verification:** TypeScript compiles clean
- **Committed in:** dc03f54

**3. [Rule 1 - Bug] Fixed ServiceType comparison in liturgical-templates.ts**
- **Found during:** Task 3 (build verification)
- **Issue:** `'shir_shabbat'` compared against `ServiceType` union which doesn't include it
- **Fix:** Cast to `string` for the comparison
- **Files modified:** `src/lib/liturgical-templates.ts`
- **Verification:** Build passes
- **Committed in:** dc03f54

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes were pre-existing build errors unrelated to plan scope. Required to verify build success.

## Issues Encountered
- `.next/types/` cache contained stale references to deleted route files, needed manual cleanup of cache directories

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Gig packet workflow is fully wired from setlist editor to print/email APIs
- Admin page is clean with 2 sections, ready for production use
- Sound system config accessible at /settings/sound
- All duct-tape code removed; remaining admin routes are essential (set-role, delete-user, set-sound-engineer, band-prep, set-upload-permission, migrations)

---
*Phase: 05-backend-hardening-library*
*Completed: 2026-03-08*
