---
phase: 02-security-api-consistency-v15
plan: 02
subsystem: api
tags: [createApiHandler, withAuth-migration, zod-validation, error-sanitization]

requires:
  - phase: 02-security-api-consistency-v15 plan 01
    provides: error sanitization pattern established
provides:
  - 11 routes migrated to createApiHandler (admin + library)
  - Zod schemas for body validation on admin and library routes
  - HTTP 201 status codes for creation endpoints
affects: [phase-02 remaining plans (21 routes still on withAuth)]

tech-stack:
  added: []
  patterns: [createApiHandler-for-all-routes, zod-body-schemas-per-route]

key-files:
  created: []
  modified:
    - src/app/api/admin/set-sound-engineer/route.ts
    - src/app/api/admin/set-upload-permission/route.ts
    - src/app/api/library/archive/route.ts
    - src/app/api/library/chord-cache/route.ts
    - src/app/api/library/detect-key/route.ts
    - src/app/api/library/rename/route.ts
    - src/app/api/library/save-generated/route.ts
    - src/app/api/library/search-content/route.ts
    - src/app/api/library/sync/route.ts
    - src/app/api/library/upload/route.ts
    - src/app/api/library/usage/route.ts

key-decisions:
  - "Rate limiting stays inside handler (createApiHandler doesn't handle it)"
  - "FormData routes (upload) skip schema option — manual validation inside handler"
  - "search-content migrated from requireAuth to createApiHandler (withAuth internally)"

patterns-established:
  - "Each HTTP method = separate createApiHandler export (const GET, const POST, etc.)"
  - "Zod schemas defined at module level, shared via options.schema"
  - "GET routes skip schema (createApiHandler only validates POST/PUT/PATCH bodies)"

duration: ~8min
completed: 2026-03-10
---

# Phase 2 Plan 02: withAuth → createApiHandler Migration (Admin + Library) Summary

**Migrated 11 API routes from manual withAuth pattern to standardized createApiHandler wrapper with Zod body validation, reducing direct withAuth usage from 32 to 21 routes.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 min |
| Completed | 2026-03-10 |
| Tasks | 2 completed |
| Files modified | 11 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: All 11 Routes Use createApiHandler | Pass | All 11 files export via createApiHandler; 0 direct withAuth imports |
| AC-2: Rate Limiting Preserved | Pass | All routes that had checkRateLimit still call it as first handler line |
| AC-3: Error Responses Sanitized | Pass | createApiHandler catches all errors with generic "Internal server error" |
| AC-4: HTTP Status Codes Correct | Pass | save-generated and upload return 201 for creation |

## Accomplishments

- Migrated 2 admin routes (set-sound-engineer, set-upload-permission) with Zod schemas
- Migrated 9 library routes including chord-cache (4 HTTP methods), search-content (requireAuth→createApiHandler), and upload (FormData)
- Added Zod body validation schemas to 7 routes that previously had inline validation
- Fixed error message leaks in set-upload-permission and search-content (previously exposed error.message)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/admin/set-sound-engineer/route.ts` | Modified | createApiHandler + Zod schema (band_leader) |
| `src/app/api/admin/set-upload-permission/route.ts` | Modified | createApiHandler (admin), fixed error leak |
| `src/app/api/library/archive/route.ts` | Modified | createApiHandler + Zod schema (band_leader) |
| `src/app/api/library/chord-cache/route.ts` | Modified | createApiHandler × 4 methods (GET/POST/PATCH/DELETE) |
| `src/app/api/library/detect-key/route.ts` | Modified | createApiHandler + Zod schema |
| `src/app/api/library/rename/route.ts` | Modified | createApiHandler + Zod schema (band_leader) |
| `src/app/api/library/save-generated/route.ts` | Modified | createApiHandler + Zod schema, status 201 |
| `src/app/api/library/search-content/route.ts` | Modified | createApiHandler (replaced requireAuth) |
| `src/app/api/library/sync/route.ts` | Modified | createApiHandler (admin) |
| `src/app/api/library/upload/route.ts` | Modified | createApiHandler (no schema — FormData), status 201 |
| `src/app/api/library/usage/route.ts` | Modified | createApiHandler (GET, no schema) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Rate limiting inside handler | createApiHandler doesn't support it; adding would change stable wrapper | Consistent pattern for all migrated routes |
| No schema for upload route | Uses FormData not JSON; createApiHandler's schema calls req.json() | Manual validation preserved inside handler |
| search-content: requireAuth → createApiHandler | createApiHandler uses withAuth internally; cleaner pattern | One fewer auth pattern in codebase |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- 21 routes remain on withAuth (drive, AI, setlist, bridge, chat, etc.)
- Pattern well-established for future migration batches
- Zod schema pattern ready for remaining routes

**Concerns:**
- Some remaining routes have complex auth (drive/file dual auth, bridge mixed auth, chat streaming)
- These may need createApiHandler modifications or should stay on withAuth

**Blockers:**
- None

---
*Phase: 02-security-api-consistency-v15, Plan: 02*
*Completed: 2026-03-10*
