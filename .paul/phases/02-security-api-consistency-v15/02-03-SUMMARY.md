---
phase: 02-security-api-consistency-v15
plan: 03
subsystem: api
tags: [createApiHandler, withAuth-migration, zod-validation, error-sanitization]

requires:
  - phase: 02-security-api-consistency-v15 plan 02
    provides: createApiHandler pattern established for admin + library routes
provides:
  - 11 routes migrated to createApiHandler (setlist, print, push, remaining library)
  - Zod schemas for 7 POST body routes
  - Error sanitization via createApiHandler catch for all 11 routes
affects: [phase-02 remaining plans (10 routes still on withAuth: drive/4, AI/4, bridge/1, chat/1)]

tech-stack:
  added: []
  patterns: [createApiHandler-for-all-routes, zod-body-schemas-per-route]

key-files:
  created: []
  modified:
    - src/app/api/setlist/publish/route.ts
    - src/app/api/setlist/print/route.ts
    - src/app/api/setlist/print/personal/route.ts
    - src/app/api/setlist/print/prepare/route.ts
    - src/app/api/setlist/email-packets/route.ts
    - src/app/api/setlists/matrix/route.ts
    - src/app/api/setlists/import/parse/route.ts
    - src/app/api/setlists/import/execute/route.ts
    - src/app/api/library/list/route.ts
    - src/app/api/library/file/[id]/route.ts
    - src/app/api/push/send/route.ts

key-decisions:
  - "import/parse: plain Zod schema + inline refine instead of z.refine() (avoids TS void type issue)"
  - "print/route: cast ctx.body as PrintRequest (passthrough schema doesn't carry full type)"
  - "push/send: Zod handles all input validation (replaces inline length/format checks)"
  - "import/execute: returns 201 for creation (was 200)"

patterns-established:
  - "GET routes: no schema option, query params validated inline"
  - "Non-JSON responses (PDF, XML) work fine with createApiHandler — only errors wrapped as JSON"
  - "Role enforcement via options.role (band_leader for import/parse, import/execute, push/send)"

duration: ~6min
completed: 2026-03-10
---

# Phase 2 Plan 03: withAuth → createApiHandler Migration (Setlist, Print, Push, Library) Summary

**Migrated 11 API routes from manual withAuth pattern to standardized createApiHandler wrapper with Zod body validation, reducing direct withAuth usage from 21 to 10 routes.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~6 min |
| Completed | 2026-03-10 |
| Tasks | 3 completed |
| Files modified | 11 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: All 11 Routes Use createApiHandler | Pass | All 11 files export via createApiHandler; 0 direct withAuth imports |
| AC-2: Zod Schemas for POST/PATCH Bodies | Pass | 7 POST routes have Zod schemas (publish, print, prepare, email-packets, import/parse, import/execute, push/send) |
| AC-3: Rate Limiting Preserved | Pass | All routes that had checkRateLimit still call it as first handler line |
| AC-4: Error Responses Sanitized | Pass | createApiHandler catches all errors with generic "Internal server error"; matrix route no longer leaks e.message |
| AC-5: GET Routes Skip Schema | Pass | 4 GET routes (list, file/[id], matrix, print/personal) have no schema option |
| AC-6: Correct HTTP Status Codes | Pass | import/execute returns 201 for setlist creation |

## Accomplishments

- Migrated 5 setlist routes (publish, print, print/personal, print/prepare, email-packets) with Zod schemas for POST bodies
- Migrated 4 setlists/push routes (matrix, import/parse, import/execute, push/send) including role-restricted routes
- Migrated 2 remaining library routes (list, file/[id]) completing all library route migrations
- push/send Zod schema replaces 3 inline validation checks (targetUids.length, title.length, link.startsWith)
- Fixed error leaks in matrix (console.error + e.message), import/parse (error.message), import/execute (error.message), library/file/[id] (error.message)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/setlist/publish/route.ts` | Modified | createApiHandler + Zod schema (musicians, emailRecipients, note, subject) |
| `src/app/api/setlist/print/route.ts` | Modified | createApiHandler + Zod schema (title, tracks) |
| `src/app/api/setlist/print/personal/route.ts` | Modified | createApiHandler (GET, no schema) |
| `src/app/api/setlist/print/prepare/route.ts` | Modified | createApiHandler + Zod schema (fileIds) |
| `src/app/api/setlist/email-packets/route.ts` | Modified | createApiHandler + Zod schema (setlistId, recipientUids) |
| `src/app/api/setlists/matrix/route.ts` | Modified | createApiHandler (GET, no schema), fixed error leak |
| `src/app/api/setlists/import/parse/route.ts` | Modified | createApiHandler + Zod schema (url, csvText), role: band_leader |
| `src/app/api/setlists/import/execute/route.ts` | Modified | createApiHandler + Zod schema, role: band_leader, status 201 |
| `src/app/api/library/list/route.ts` | Modified | createApiHandler (GET, no schema) |
| `src/app/api/library/file/[id]/route.ts` | Modified | createApiHandler (GET, no schema, uses ctx.params.id) |
| `src/app/api/push/send/route.ts` | Modified | createApiHandler + Zod schema (replaces inline validation), role: band_leader |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Plain schema + inline refine for import/parse | z.refine() returns void type breaking ctx.body TS inference | Consistent with original inline validation |
| Cast ctx.body for print route | PrintRequest has more fields than Zod schema; passthrough lets them through but TS doesn't know | Type-safe at runtime via passthrough |
| Zod replaces push/send inline validation | Zod handles max(500), max(200), startsWith('/') natively | Cleaner, earlier validation before handler executes |

## Deviations from Plan

None — plan executed exactly as written. Two TS type issues (Papa.parse undefined arg, PrintRequest cast) resolved during verification.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| z.refine() makes Zod output type `void` | Used plain schema + inline validation instead |
| PrintRequest type mismatch with passthrough schema | Cast ctx.body as unknown as PrintRequest |

## Next Phase Readiness

**Ready:**
- 10 routes remain on withAuth (drive/4, AI/4, bridge/1, chat/1 + test-gemini)
- These are the complex routes: streaming (chat), dual auth (drive/file), FormData (AI/omr), bridge credentials
- Pattern well-established for straightforward migrations

**Concerns:**
- Remaining routes have complex patterns that may need createApiHandler modifications or should stay on withAuth
- chat/route.ts uses streaming (ReadableStream) — may not fit createApiHandler
- drive/file/[fileId] has dual auth (user token OR service account)
- test-gemini is a dev-only route — may not need migration

**Blockers:**
- None

---
*Phase: 02-security-api-consistency-v15, Plan: 03*
*Completed: 2026-03-10*
