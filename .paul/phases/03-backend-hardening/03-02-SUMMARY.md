---
phase: 03-backend-hardening
plan: 02
subsystem: api
tags: [zod, chat, logger, broadcast-channel, cache]

requires:
  - phase: 03-backend-hardening/01
    provides: StorageResult pattern, error format standardization
provides:
  - Zod-validated chat route with context failure tracking
  - Production warn logging
  - Library cache cross-tab invalidation via BroadcastChannel
affects: [04-frontend-resilience]

tech-stack:
  added: []
  patterns: [missing-context tracking in AI prompts, BroadcastChannel cache sync]

key-files:
  created: []
  modified:
    - src/app/api/chat/route.ts
    - src/lib/logger.ts
    - src/lib/library-cache.ts
    - src/components/admin/library/LibrarySyncCard.tsx

key-decisions:
  - "Zod validation before template detection — parse raw JSON first, then validate"
  - "Missing context appended to prompt tail, not injected into system prompt"
  - "BroadcastChannel is fire-and-forget with graceful fallback"

patterns-established:
  - "Context failure tracking: collect missingContexts[], append note to AI prompt"
  - "Cross-tab cache invalidation: broadcastCacheInvalidation() after clearLibraryCache()"

duration: ~8min
completed: 2026-03-10
---

# Phase 3 Plan 02: Chat Validation, Warn Logging & Cache Invalidation Summary

**Zod body validation on chat route, AI context failure tracking, production warn logging, and BroadcastChannel cache invalidation after library sync.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 min |
| Completed | 2026-03-10 |
| Tasks | 2 completed |
| Files modified | 4 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Chat Route Validation and Context Tracking | Pass | Zod schema validates body; missingContexts[] tracks failed context sources and appends note to prompt |
| AC-2: Production Logger Warn Level | Pass | `logger.warn` now always outputs via `console.warn`; log/info/debug remain dev-only |
| AC-3: Library Cache Invalidation | Pass | `clearLibraryCache()` + `broadcastCacheInvalidation()` called after sync in LibrarySyncCard; `listenForCacheInvalidation()` exported for consumers |

## Accomplishments

- Chat route now rejects malformed requests with Zod validation errors (400 + structured details)
- Silent "best-effort" context failures replaced with explicit `[Missing: ...]` indicators in AI prompt
- `logger.warn` outputs in production, giving visibility into rate limit fallbacks and notification failures
- Library cache invalidation broadcasts to other tabs via BroadcastChannel after sync

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/chat/route.ts` | Modified | Zod body schema, context failure tracking with missingContexts[], standardized error messages |
| `src/lib/logger.ts` | Modified | `warn` always logs (removed isDev guard) |
| `src/lib/library-cache.ts` | Modified | Added `broadcastCacheInvalidation()` and `listenForCacheInvalidation()` |
| `src/components/admin/library/LibrarySyncCard.tsx` | Modified | Calls `clearLibraryCache()` + `broadcastCacheInvalidation()` after successful sync |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Zod validation before template detection | Both need parsed body; validate early for clean errors | Template detection works on validated data |
| Missing context appended to prompt tail | Non-intrusive; AI sees it as supplemental info | AI can still respond, just notes missing sources |
| LOW-002/003/004 documented, not coded | Policy decisions and data migration — not code changes | Tracked in deferred issues |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed as written.

### Deferred Items

Per plan scope:
- LOW-002 (error logging policy) — ongoing enforcement, not a code change
- LOW-003 (toast policy) — ongoing enforcement, not a code change
- LOW-004 (leader → band_leader) — Firestore data migration, deferred

## Issues Encountered

None

## Next Phase Readiness

**Ready:**
- Phase 3 complete (2/2 plans done)
- All backend hardening items addressed or documented as deferred
- Clean TypeScript, 640/640 tests passing

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 03-backend-hardening, Plan: 02*
*Completed: 2026-03-10*
