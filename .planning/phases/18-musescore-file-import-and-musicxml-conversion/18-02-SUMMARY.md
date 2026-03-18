---
phase: 18-musescore-file-import-and-musicxml-conversion
plan: 02
subsystem: upload-pipeline
tags: [musescore, musicxml, upload, conversion, firebase-storage]
dependency_graph:
  requires:
    - phase: 18-01
      provides: processMuseScoreFile, extractMscx, convertMscxToMusicXml
  provides:
    - MuseScore file upload support in upload route and UploadDialog
    - Dual storage of original MuseScore files and converted MusicXML
    - Library index entries with sourceFormat and originalStorageUrl
  affects: [osmd-rendering, library-ui]
tech_stack:
  added: []
  patterns: [dual-storage-for-conversion, extension-based-detection]
key_files:
  created:
    - src/app/api/library/__tests__/upload-musescore.test.ts
    - src/components/library/__tests__/upload-dialog-musescore.test.ts
  modified:
    - src/app/api/library/upload/route.ts
    - src/components/library/UploadDialog.tsx
key_decisions:
  - "Extension-based MuseScore detection (not MIME) since browsers send generic MIME for .mscz"
  - "Original stored at library/originals/{fileId}.{ext} to separate from converted files"
  - "Conversion failure returns 422 instead of 500 for clear client-side error handling"
patterns_established:
  - "Dual storage pattern: original file at library/originals/, converted at library/"
  - "sourceFormat field on index entry to track file origin"
requirements_completed: [MS-03, MS-04, MS-06]
metrics:
  duration: 377s
  completed: "2026-03-18T22:41:40Z"
  tasks_completed: 1
  tasks_total: 2
  tests_added: 14
  tests_passing: 14
---

# Phase 18 Plan 02: Upload Pipeline Integration Summary

**MuseScore upload integration with auto-conversion to MusicXML, dual file storage, and 14 passing tests across upload route and dialog.**

## Performance

- **Duration:** 6 min 17s
- **Started:** 2026-03-18T22:35:23Z
- **Completed:** 2026-03-18T22:41:40Z
- **Tasks:** 1 of 2 (Task 2 is human-verify checkpoint)
- **Files modified:** 4

## Accomplishments
- Upload route detects .mscz/.mscx files by extension and converts via processMuseScoreFile
- Both original MuseScore file and converted MusicXML stored in Firebase Storage
- Library index entry includes mimeType: application/xml for OSMD rendering, plus originalStorageUrl and sourceFormat
- UploadDialog accepts .mscz/.mscx with updated help text and validation
- 422 response on conversion failure with descriptive error message
- 8 upload route integration tests + 6 dialog unit tests all passing

## Task Commits

Each task was committed atomically (TDD flow):

1. **Task 1 RED: Failing tests** - `99fbbb7` (test)
2. **Task 1 GREEN: Implementation** - `141be1f` (feat)

_Task 2 is a human-verify checkpoint (push to main, verify MuseScore upload renders in OSMD)._

## Files Created/Modified
- `src/app/api/library/__tests__/upload-musescore.test.ts` - 8 integration tests for MuseScore upload flow
- `src/components/library/__tests__/upload-dialog-musescore.test.ts` - 6 unit tests for file type acceptance
- `src/app/api/library/upload/route.ts` - Extended with MuseScore detection, conversion, dual storage, 422 error handling
- `src/components/library/UploadDialog.tsx` - Updated ACCEPTED_TYPES, validExt regex, help text

## Decisions Made
1. **Extension-based detection over MIME**: Browsers send `application/octet-stream` for .mscz files, so we detect by file extension rather than MIME type. MIME types `application/x-musescore` and `application/x-musescore+xml` are still in ALLOWED_TYPES for completeness.
2. **Original stored in `library/originals/` prefix**: Keeps converted files in the standard `library/` path for compatibility with existing serving logic, while preserving originals for potential re-conversion.
3. **422 for conversion failure**: Distinguishes "your file is invalid" (422) from "our server broke" (500), enabling better client-side error UX.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Node test environment FormData/File incompatibility**
- **Found during:** Task 1 (test creation)
- **Issue:** Node.js test environment does not support `NextRequest` with `FormData` body (Content-Type error) and `File.arrayBuffer()` not available
- **Fix:** Created mock File objects with explicit `arrayBuffer()` method and mocked `req.formData()` via `vi.spyOn`
- **Files modified:** src/app/api/library/__tests__/upload-musescore.test.ts
- **Verification:** All 8 tests pass
- **Committed in:** 141be1f

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test infrastructure fix only. No scope creep.

## Issues Encountered
- Pre-existing failure in `song-charts-library.test.tsx` ("shows file count in header") confirmed not caused by these changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Task 2 (human-verify checkpoint) requires pushing to main and testing MuseScore upload on deployed Vercel site
- After verification, Phase 18 is complete and Phase 19 (native transposition) can proceed

---
*Phase: 18-musescore-file-import-and-musicxml-conversion*
*Completed: 2026-03-18 (Task 1 only; Task 2 pending human verification)*
