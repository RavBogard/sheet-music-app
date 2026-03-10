---
phase: 03-backend-hardening
plan: 01
subsystem: api
tags: [error-handling, firebase-storage, cors, api-wrapper]

requires:
  - phase: 01-codebase-audit
    provides: AUDIT-REPORT.md findings MED-001, MED-002, MED-004, MED-008, LOW-006
provides:
  - Discriminated StorageResult type for all Firebase Storage reads
  - Route-specific error context in createApiHandler catch block
  - CORS domains configurable via ALLOWED_ORIGINS env var
  - Chat route no longer leaks internal error messages
affects: []

tech-stack:
  added: []
  patterns: [discriminated union result types for Storage, standardized error shape { error, details? }]

key-files:
  modified:
    - src/lib/api-wrapper.ts
    - src/lib/firebase-storage.ts
    - src/lib/file-fetcher.ts
    - src/app/api/drive/health/route.ts
    - src/app/api/drive/file/[fileId]/route.ts
    - src/app/api/chat/route.ts

key-decisions:
  - "uploadToStorage keeps throwing (callers already handle throws) — only read functions get StorageResult"
  - "Extracted getCandidatePaths helper to DRY the path-probing logic across functions"

patterns-established:
  - "StorageResult<T> discriminated union: { success: true, data: T } | { success: false, reason, message }"
  - "API error shape: { error: string, details?: object } with route context in details"

duration: ~8min
started: 2026-03-10T00:40:00Z
completed: 2026-03-10T00:48:00Z
---

# Phase 3 Plan 01: Error Responses & Storage Discrimination Summary

**createApiHandler returns route-specific error context, Firebase Storage reads return discriminated results, CORS moved to env var, chat route stops leaking errors — 6 files patched, 640 tests passing.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 min |
| Tasks | 2 completed |
| Files modified | 6 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Standardized Error Responses | Pass | createApiHandler includes `{ route: "METHOD /path" }` in details; chat route returns generic message |
| AC-2: Firebase Storage Error Discrimination | Pass | StorageResult<T> with not_found / network / invalid_input reasons |
| AC-3: CORS Env Var | Pass | ALLOWED_ORIGINS env var with fallback to hardcoded production domains |

## Accomplishments

- Added `StorageResult<T>` discriminated union to Firebase Storage — callers can now distinguish not_found from network errors
- Extracted `getCandidatePaths()` helper to DRY repeated path-probing logic across 3 functions
- createApiHandler catch block now logs and returns route context (`METHOD /pathname`)
- Chat route no longer leaks `error.message` to clients — returns `"Chat request failed"` with server-side logging
- CORS domains configurable via `ALLOWED_ORIGINS` env var (comma-separated), with localhost and .vercel.app still pattern-matched

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Essential — missed caller |

**Total impact:** Minimal — one additional file needed updating.

### Auto-fixed Issues

**1. Missed caller: drive/health/route.ts**
- **Found during:** Task 1 (TypeScript check)
- **Issue:** `drive/health/route.ts` dynamically imports `downloadFromStorage` — wasn't caught by static grep for import statements
- **Fix:** Updated to use `storageResult.success` / `storageResult.data` pattern
- **Verification:** `npx tsc --noEmit` passes

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `fileExistsInStorage` and `getStorageUrl` have zero external callers | Updated signatures anyway for consistency — they're exported public API |
| `jq` not installed on system (broke statusline) | Rewrote statusline script with `sed` (unrelated to plan) |

## Next Phase Readiness

**Ready:**
- Plan 03-02 can proceed — no blockers
- StorageResult pattern established for any future Storage callers

**Concerns:**
- 30 routes still use manual `withAuth` — full migration tracked but not in scope for v1.3

**Blockers:**
- None

---
*Phase: 03-backend-hardening, Plan: 01*
*Completed: 2026-03-10*
