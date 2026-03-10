# CentralReform.live v1.2 — Codebase Audit Report

**Date:** 2026-03-10
**Scope:** Full codebase bugsweep — 55 API routes, 98 lib files, 173 components, 30 hooks/types files
**Purpose:** Identify bugs, security issues, and backend improvements; prioritize fixes for v1.3

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 8 |
| Medium | 15 |
| Low | 7 |
| **Total** | **33** |

**Top 5 Most Urgent:**
1. **CRIT-001** — QR auth token minting has no session ownership validation
2. **CRIT-002** — AI concurrency semaphore can deadlock permanently
3. **HIGH-001** — Setlist publish fires 6 async notifications without tracking failures
4. **HIGH-002** — `/auth/session` has no rate limiting (brute-force vector)
5. **HIGH-005** — Monitor client throttle race condition can drop fader commands

---

## Critical Findings

### CRIT-001: QR Auth Token Minting Lacks Session Binding
- **File(s):** `src/app/api/auth/qr/route.ts` (PUT handler)
- **Description:** The PUT endpoint mints a Firebase custom token via `getAuth().createCustomToken(decoded.uid)` without verifying that the QR session code belongs to the requesting user. The token is minted solely from the decoded UID with no binding to the QR session state.
- **Impact:** If the PUT request is intercepted or replayed, an attacker could mint tokens. Additionally, there's no check that the QR session hasn't already been approved by a different user, allowing session hijacking.
- **Recommended Fix:** Validate QR session ownership — confirm the session code matches the authenticated user and hasn't already been consumed. Add a one-time-use flag and timestamp binding to prevent replay.
- **Effort:** M (30-120 min)
- **Phase:** 2

### CRIT-002: AI Concurrency Semaphore Deadlock
- **File(s):** `src/lib/ai-concurrency.ts`
- **Description:** The global semaphore (`activeAiCalls` counter with `aiQueue` array) has no timeout mechanism and no error recovery. If an AI call throws an error before `releaseAiSlot()` is called, the slot is permanently consumed. With `AI_MAX_CONCURRENT = 2`, two failed calls deadlock all future AI operations until page reload.
- **Impact:** AI chord detection and validation silently stop working for the entire session. Users see no error — features just hang.
- **Recommended Fix:** Wrap slot acquisition in try/finally to guarantee release. Add a timeout (e.g., 30s) that auto-releases stuck slots. Add `resetAiConcurrency()` call on error recovery paths.
- **Effort:** S (< 30 min)
- **Phase:** 2

### CRIT-003: Bridge Credentials Exposure
- **File(s):** `src/app/api/bridge/setup-code/route.ts` (GET handler)
- **Description:** The setup code redemption endpoint returns service account credentials (email + private key) in the response body for the bridge.exe desktop app to consume. While protected by a one-time code, the credentials are sensitive and transmitted over the wire.
- **Impact:** If the response is logged, cached by a proxy, or intercepted, the Google service account private key is exposed, granting full Drive access.
- **Recommended Fix:** Consider a token-exchange pattern where the bridge receives a scoped, time-limited token instead of raw credentials. At minimum, ensure response includes `Cache-Control: no-store` and the setup code is single-use with short TTL.
- **Effort:** L (> 2 hours)
- **Phase:** 2

---

## High Findings

### HIGH-001: Fire-and-Forget Notification Failures in Setlist Publish
- **File(s):** `src/app/api/setlist/publish/route.ts`
- **Description:** The publish endpoint fires 6 async operations (usage recording, in-app notifications, email, SMS, push, audit log). Most use `.catch()` that silently swallow errors and return fallback objects. There is no transaction — partial failures leave some musicians notified and others not, with no way to know.
- **Impact:** Musicians miss service notifications silently. No admin visibility into which notifications failed.
- **Recommended Fix:** Track notification results per-channel. Store a `notificationResults` object on the published setlist doc with success/failure counts per channel. Surface failures in admin UI.
- **Effort:** M
- **Phase:** 2

### HIGH-002: No Rate Limit on /auth/session
- **File(s):** `src/app/api/auth/session/route.ts`
- **Description:** The session creation endpoint (POST) has no rate limiting. An attacker can brute-force session creation at unlimited speed.
- **Impact:** DoS vector — floods the Firebase Auth verification system and can exhaust Upstash Redis connection pool.
- **Recommended Fix:** Add `api` tier rate limit (60 req/min) to the session endpoint. Consider IP-based limiting for unauthenticated requests.
- **Effort:** S
- **Phase:** 2

### HIGH-003: Rate Limit Silent Bypass on Redis Failure
- **File(s):** `src/lib/rate-limit.ts`
- **Description:** The rate limit catch block (around line 146-149) allows all requests through if Redis/Upstash is unavailable. This is a fail-open design.
- **Impact:** If Upstash experiences an outage, all rate limits silently disappear, exposing the API to abuse.
- **Recommended Fix:** Implement fail-closed behavior with in-memory fallback (the dev fallback already exists). If Redis fails, use the in-memory rate limiter rather than allowing unlimited requests.
- **Effort:** S
- **Phase:** 2

### HIGH-004: Uncontrolled Recursive Drive API Calls
- **File(s):** `src/lib/google-drive.ts` (~line 124)
- **Description:** `listAllFiles(folderId)` recursively traverses all subfolders using `Promise.all()` with no concurrency limit. A deeply nested or broadly structured Drive folder could spawn hundreds of parallel API requests.
- **Impact:** Hits Google Drive API rate limits (403 errors), causing sync failures and potential temporary account suspension.
- **Recommended Fix:** Add concurrency control — process subfolders with a bounded semaphore (e.g., 5 concurrent requests) or use sequential iteration with batching.
- **Effort:** M
- **Phase:** 2

### HIGH-005: Monitor Client Throttle Race Condition
- **File(s):** `src/lib/firestore-monitor-client.ts` (~lines 250-276)
- **Description:** Multiple throttled commands for the same fader key are stored in a Map. When a new command arrives while a timer is pending, it updates the `data` field but the existing timer may fire with the old reference. Intermediate values can be dropped.
- **Impact:** Fader adjustments during rapid interaction (common during live sound check) may be silently lost, causing the mixer state to diverge from the UI.
- **Recommended Fix:** Cancel the existing timer and restart when a new value arrives for the same key, or use a write-latest pattern that always sends the most recent value when the throttle window expires.
- **Effort:** M
- **Phase:** 2

### HIGH-006: Async State Updates on Unmounted Components
- **File(s):** `src/hooks/use-smart-transposer.ts` (~lines 149-210), `src/hooks/use-setlist-dashboard.ts` (~line 176), `src/hooks/use-upcoming-prep.ts` (~lines 111-136)
- **Description:** Multiple hooks perform async operations (AI scans, Firestore fetches, transfers) without checking if the component is still mounted. `setState` calls after unmount cause React warnings and potential memory leaks.
- **Impact:** React warnings in console, potential memory leaks in long-running sessions (especially during performance mode transitions).
- **Recommended Fix:** Add `AbortController` or `isMounted` ref pattern to all async hooks. Cancel in-flight requests on cleanup.
- **Effort:** M
- **Phase:** 4

### HIGH-007: Dependency Array Bugs in Critical Hooks
- **File(s):** `src/hooks/use-setlist-logic.ts` (lines 227, 352), `src/hooks/use-smart-transposer.ts` (line 105), `src/hooks/use-setlist-presence.ts` (line 97), `src/hooks/use-offline.ts` (line 51)
- **Description:** Eight hooks have incorrect or missing dependency arrays: circular dependencies (`performSave` in its own effect deps), objects/arrays as deps causing infinite re-renders (`downloading` object, `aiState.scanningPages` array), and missing deps causing stale closures.
- **Impact:** Stale data shown to users, infinite re-render loops, unnecessary Firestore writes, auto-save executing with stale permission state.
- **Recommended Fix:** Audit each hook's dependency array. Extract primitives from objects, use refs for stable callbacks, break circular dependencies.
- **Effort:** L
- **Phase:** 4

### HIGH-008: Google Drive Query Injection
- **File(s):** `src/lib/google-drive.ts` (~line 158)
- **Description:** `sanitizeQuery()` only escapes single quotes (`replace(/'/g, "\\'")`). The Drive API query language supports operators and other special characters that aren't sanitized.
- **Impact:** A crafted filename or search query could alter the Drive API query semantics, potentially exposing files from other folders.
- **Recommended Fix:** Use parameterized queries where possible, or implement a complete escaping function that handles all Drive API query special characters (backslash, single quote, operators).
- **Effort:** S
- **Phase:** 2

---

## Medium Findings

### MED-001: Inconsistent API Handler Patterns (4 Different Patterns)
- **File(s):** All 55 API route files
- **Description:** Routes use four different auth/handler patterns: `createApiHandler()` wrapper (3 routes), manual `withAuth()` (40 routes), `requireAuth()` throwing pattern (3 routes), and no auth middleware (5 routes). Each has different error handling behavior.
- **Impact:** Maintenance burden, inconsistent error responses, easy to miss auth checks when adding new routes.
- **Recommended Fix:** Migrate all routes to `createApiHandler()` pattern which centralizes auth + validation + error handling.
- **Effort:** L
- **Phase:** 3

### MED-002: Inconsistent Error Response Formats
- **File(s):** All API routes
- **Description:** Four different error response shapes exist: `{ error }`, `{ error, details }`, `{ error, status, details }`, and `{ success, message }`. Clients must handle all variants.
- **Impact:** Frontend error handling is fragile — some errors display correctly, others show raw JSON or nothing.
- **Recommended Fix:** Standardize on `{ error: string, details?: object }` format. Update `createApiHandler` to enforce this.
- **Effort:** M
- **Phase:** 3

### MED-003: Missing Zod Validation on Library/Chat Routes
- **File(s):** `src/app/api/library/*/route.ts`, `src/app/api/chat/route.ts`
- **Description:** Admin and scheduling routes use Zod schemas for request validation, but library routes use manual JSON parsing and the chat route has no body validation at all.
- **Impact:** Malformed requests can cause unhandled errors or unexpected behavior instead of clean 400 responses.
- **Recommended Fix:** Add Zod schemas to all POST/PUT/PATCH routes. Use `createApiHandler` with `schema` option.
- **Effort:** M
- **Phase:** 3

### MED-004: Generic 500 Errors Without Context
- **File(s):** Multiple API routes (at least 15)
- **Description:** Many catch blocks return only `{ error: "Internal Server Error" }` with no route-specific context. Server logs may have details, but the response gives clients nothing to work with.
- **Impact:** Users see unhelpful errors. Debugging production issues requires log correlation.
- **Recommended Fix:** Include route-specific error context: e.g., `{ error: "Failed to publish setlist", details: { step: "notifications" } }`. Never expose stack traces.
- **Effort:** M
- **Phase:** 3

### MED-005: Annotation Store Memory Leak
- **File(s):** `src/lib/annotation-store.ts`
- **Description:** A module-level `saveTimer` variable (`let saveTimer: ReturnType<typeof setTimeout> | null = null`) manages debounced auto-save. This timer is not cleaned up on store destruction or component unmount. Multiple stores can share the timer across hot-reloads.
- **Impact:** Memory leak in long-running sessions. Potential for saves targeting stale annotation data.
- **Recommended Fix:** Tie the timer to the store lifecycle. Clear on store `destroy()` or use a ref-based approach within the consuming component.
- **Effort:** S
- **Phase:** 4

### MED-006: Monitor Connection Global Singleton Leak
- **File(s):** `src/hooks/use-monitor-connection.ts`
- **Description:** Module-level state manages a global singleton connection. If multiple components mount/unmount, `authUnsub` and `configUnsub` Firestore subscriptions are never unsubscribed on individual component unmount (by design), but can leak on re-auth cycles.
- **Impact:** Duplicate Firestore listeners accumulate, doubling read costs and causing stale data conflicts.
- **Recommended Fix:** Add reference counting. Track mount/unmount count and only teardown when last consumer unmounts.
- **Effort:** M
- **Phase:** 4

### MED-007: Loose Type Definitions
- **File(s):** `src/types/monitor.ts`, `src/types/models.ts`, `src/types/schemas.ts`
- **Description:** Several type issues: `MonitorConfig.busAssignments` is `Record<string, BusAssignment | BusAssignment[] | null>` (consumers must check `Array.isArray()` everywhere), `FirestoreDate` has optional `toDate?` method (runtime errors if code assumes it exists), `SetlistTrack.transposition` is optional but used in math without null checks.
- **Impact:** Runtime errors from null access, defensive code proliferating across consumers, type safety undermined.
- **Recommended Fix:** Normalize `busAssignments` to single type. Make `FirestoreDate.toDate` required or use the `toDate()` helper consistently. Make `transposition` default to `0` instead of `undefined`.
- **Effort:** M
- **Phase:** 4

### MED-008: Silent Failures in Firebase Storage
- **File(s):** `src/lib/firebase-storage.ts`
- **Description:** All error paths in `uploadToStorage()`, `downloadFromStorage()`, `fileExistsInStorage()` catch errors and return `false` or `null`. Wrong MIME type, file missing, and network error are all indistinguishable.
- **Impact:** Failed uploads/downloads are silently ignored. Files may appear "synced" when they're not, causing broken PDF links in performance mode.
- **Recommended Fix:** Return discriminated error objects: `{ success: false, reason: 'not_found' | 'network' | 'invalid_type' }`. Let callers decide how to handle each case.
- **Effort:** M
- **Phase:** 3

### MED-009: Firestore Timestamp Handling Inconsistency
- **File(s):** Multiple API routes and components
- **Description:** At least 4 different patterns for handling Firestore timestamps: `a.toDate?.()`, `a.seconds ? a.seconds * 1000 : new Date(a)`, `typeof a === 'object' && a.seconds`, and raw `firestore-helpers.ts` `toDate()` helper. Not all code uses the centralized helper.
- **Impact:** Date comparison bugs, timezone issues, potential crashes when a field is unexpectedly a different type.
- **Recommended Fix:** Mandate use of `firestore-helpers.ts` `toDate()` across entire codebase. Lint rule to catch raw `.seconds` access.
- **Effort:** M
- **Phase:** 3

### MED-010: Chat Route Silent Context Failures
- **File(s):** `src/app/api/chat/route.ts` (~line 289)
- **Description:** The chat route fetches 5 context sources (setlists, users, calendar, liturgical, library). Any failure is silently caught with `// best-effort` comments. The AI model receives no indication that context is missing.
- **Impact:** AI responses degrade silently — it may give wrong answers about scheduling because calendar context failed to load, with no indication to the user.
- **Recommended Fix:** Track which contexts loaded successfully. Include a system message to the AI listing missing contexts. Optionally show a "partial context" indicator in the chat UI.
- **Effort:** M
- **Phase:** 3

### MED-011: Missing Error Boundaries on Key Components
- **File(s):** `src/components/admin/SoundSystemSection.tsx`, `src/components/admin/AccessAuditLog.tsx`, `src/components/setlist/SetlistEditorV2.tsx`, `src/components/music/MusicianPicker.tsx`
- **Description:** Complex components with multiple Firestore queries and async operations lack granular error boundaries. A single failed query crashes the entire feature panel.
- **Impact:** Users see a full-page error instead of a degraded section with a retry option.
- **Recommended Fix:** Wrap each major feature section in an error boundary component that shows an inline error state with retry button.
- **Effort:** M
- **Phase:** 4

### MED-012: Setlist Presence Race Condition
- **File(s):** `src/hooks/use-setlist-presence.ts` (lines 54, 89-96)
- **Description:** The `write()` heartbeat callback checks `gigModeActive` after the write is already scheduled. Cleanup removes event listeners but `intervalRef.current` is cleared inside the interval callback rather than in the cleanup function, creating a race if unmount happens before the interval fires.
- **Impact:** Presence entries flicker or persist as stale after user leaves performance mode.
- **Recommended Fix:** Move interval cleanup to the effect's return function. Check `gigModeActive` before scheduling the write, not after.
- **Effort:** S
- **Phase:** 4

### MED-013: No Timeout on Google Drive API Calls
- **File(s):** `src/lib/google-drive.ts`
- **Description:** API calls to Google Drive have retry logic but no request timeout. A hanging request on a slow network will wait indefinitely.
- **Impact:** Cron sync jobs can hang forever, blocking the next scheduled run. Manual sync UI shows infinite spinner.
- **Recommended Fix:** Add `AbortController` with a 30-second timeout to all Drive API requests.
- **Effort:** S
- **Phase:** 2

### MED-014: Dangerous Type Assertions in Hooks
- **File(s):** `src/hooks/use-setlist-dashboard.ts` (line 153), `src/hooks/use-creation-wizard.ts` (line 168)
- **Description:** `{} as unknown as Setlist` creates an empty object cast as a full Setlist type. `(context as any).rabbi = rabbi` bypasses type checking entirely.
- **Impact:** Runtime errors when code accesses expected Setlist properties that don't exist on the empty object.
- **Recommended Fix:** Use proper type constructors or factory functions. Replace `as any` with typed context interface.
- **Effort:** S
- **Phase:** 4

### MED-015: Library Cache Not Invalidated After Sync
- **File(s):** `src/lib/library-cache.ts`
- **Description:** The IndexedDB library cache has no invalidation mechanism triggered by library sync operations. After a Drive sync adds/removes files, the cache serves stale data until its TTL expires.
- **Impact:** Users don't see newly synced files until they hard-refresh or wait for cache expiry.
- **Recommended Fix:** Trigger cache invalidation from the sync completion handler. Broadcast a cache-bust event via `BroadcastChannel` for multi-tab support.
- **Effort:** S
- **Phase:** 3

---

## Low Findings

### LOW-001: Inconsistent Ref Naming Convention
- **File(s):** Various hooks and components
- **Description:** Refs are named inconsistently: `saveTimeoutRef`, `intervalRef`, `unsubRef` (with Ref suffix) vs `isMounted`, `hasBackfilled` (without).
- **Impact:** Code readability and grep-ability.
- **Recommended Fix:** Standardize on `*Ref` suffix for all `useRef` variables.
- **Effort:** S
- **Phase:** 4

### LOW-002: Inconsistent Error Logging
- **File(s):** Various hooks and components
- **Description:** Some code uses `logger.error()`, some uses `console.error()`, some silently catch. No consistent rule.
- **Impact:** Production debugging is harder — some errors are captured by Sentry, others aren't.
- **Recommended Fix:** Always use `logger.error()` which routes to Sentry in production. Reserve `console.error` for dev-only debugging.
- **Effort:** S
- **Phase:** 3

### LOW-003: Inconsistent Toast Notification Patterns
- **File(s):** Various hooks
- **Description:** Some hooks toast errors to the user, some don't. No consistent rule for when to show user-facing error vs silently log.
- **Impact:** Inconsistent user experience — some failures are visible, others aren't.
- **Recommended Fix:** Define a policy: toast for user-initiated actions, log silently for background operations.
- **Effort:** S
- **Phase:** 3

### LOW-004: Backward-Compatible 'leader' Role Mapping
- **File(s):** `src/lib/api-auth.ts`
- **Description:** The `leader` role still maps to `band_leader` for backward compatibility. This creates ambiguity in role checks.
- **Impact:** Minor — works correctly but adds cognitive overhead.
- **Recommended Fix:** Migrate all Firestore user docs from `leader` to `band_leader`, then remove the mapping.
- **Effort:** M
- **Phase:** 3

### LOW-005: Logger Silent in Production
- **File(s):** `src/lib/logger.ts`
- **Description:** All log levels except `error` are no-ops in production (`isDev` check). This is secure but makes production debugging difficult.
- **Impact:** Cannot diagnose non-error issues in production without deploying a debug build.
- **Recommended Fix:** Consider adding a `warn` level that logs in production, or add structured logging to an external service.
- **Effort:** M
- **Phase:** 3

### LOW-006: Hardcoded CORS Domains
- **File(s):** `src/app/api/drive/file/[fileId]/route.ts`
- **Description:** CORS whitelist domains are hardcoded in the route file rather than pulled from environment variables.
- **Impact:** Adding new deployment domains requires code changes and redeployment.
- **Recommended Fix:** Move to `ALLOWED_ORIGINS` env var (comma-separated).
- **Effort:** S
- **Phase:** 3

### LOW-007: Test Endpoint in Production
- **File(s):** `src/app/api/test-gemini/route.ts`
- **Description:** A test endpoint for Gemini API exists and is deployed to production.
- **Impact:** Minor attack surface — exposes Gemini API availability status.
- **Recommended Fix:** Gate behind `NODE_ENV === 'development'` check or remove entirely.
- **Effort:** S
- **Phase:** 2

---

## Positive Highlights

These patterns are well-implemented and should be preserved:

| Pattern | Location | Notes |
|---------|----------|-------|
| **Rate limiting infrastructure** | `src/lib/rate-limit.ts` | Upstash + in-memory fallback, per-user tracking |
| **`createApiHandler` wrapper** | `src/lib/api-wrapper.ts` | Excellent DRY pattern for auth + validation |
| **Audit logging** | Admin API routes | Delete/role changes tracked with timestamps |
| **Cron authentication** | Cron routes | `timingSafeEqual()` for secret verification |
| **Webhook HMAC verification** | `/webhooks/resend` | Svix signature verification |
| **Firestore helpers** | `src/lib/firestore-helpers.ts` | Robust timestamp conversion |
| **Fader throttling** | `FaderStrip.tsx`, `VerticalFaderStrip.tsx` | Sophisticated optimistic UI with 100ms throttle |
| **Offline support** | `src/lib/offline-manager.ts` | Dual cache (Service Worker + IndexedDB) |
| **Zod validation** | Admin/scheduling routes | Clean schema-based validation |
| **PWA caching** | Service Worker config | 30-day offline with CDN headers |

---

## Recommended Fix Order

### Phase 2: Critical Fixes (Security & Data Integrity)

| ID | Title | Effort | Priority |
|----|-------|--------|----------|
| CRIT-001 | QR auth token session binding | M | P0 |
| CRIT-002 | AI concurrency deadlock fix | S | P0 |
| CRIT-003 | Bridge credentials exposure | L | P0 |
| HIGH-001 | Notification failure tracking | M | P1 |
| HIGH-002 | Rate limit /auth/session | S | P1 |
| HIGH-003 | Rate limit fail-closed | S | P1 |
| HIGH-004 | Drive API concurrency control | M | P1 |
| HIGH-005 | Monitor throttle race condition | M | P1 |
| HIGH-008 | Drive query injection | S | P1 |
| MED-013 | Drive API timeout | S | P2 |
| LOW-007 | Remove test endpoint | S | P3 |

### Phase 3: Backend Hardening (Error Handling & Consistency)

| ID | Title | Effort | Priority |
|----|-------|--------|----------|
| MED-001 | Migrate to createApiHandler | L | P2 |
| MED-002 | Standardize error responses | M | P2 |
| MED-003 | Add Zod validation | M | P2 |
| MED-004 | Add error context to 500s | M | P2 |
| MED-008 | Firebase storage error discrimination | M | P2 |
| MED-009 | Timestamp handling consistency | M | P2 |
| MED-010 | Chat context failure tracking | M | P2 |
| MED-015 | Library cache invalidation | S | P2 |
| LOW-002 | Standardize error logging | S | P3 |
| LOW-003 | Toast notification policy | S | P3 |
| LOW-004 | Remove leader role mapping | M | P3 |
| LOW-005 | Production logging levels | M | P3 |
| LOW-006 | CORS env vars | S | P3 |

### Phase 4: Frontend Robustness (Hooks, Types, Cleanup)

| ID | Title | Effort | Priority |
|----|-------|--------|----------|
| HIGH-006 | Async unmount safety | M | P1 |
| HIGH-007 | Hook dependency array fixes | L | P1 |
| MED-005 | Annotation store memory leak | S | P2 |
| MED-006 | Monitor connection ref counting | M | P2 |
| MED-007 | Normalize type definitions | M | P2 |
| MED-011 | Error boundaries on key components | M | P2 |
| MED-012 | Presence race condition | S | P2 |
| MED-014 | Remove dangerous type assertions | S | P2 |
| LOW-001 | Ref naming convention | S | P3 |

---

## Appendix: Files Affected

| File/Directory | Issue Count | Severities |
|----------------|-------------|------------|
| `src/app/api/auth/qr/route.ts` | 1 | CRIT |
| `src/lib/ai-concurrency.ts` | 1 | CRIT |
| `src/app/api/bridge/setup-code/route.ts` | 1 | CRIT |
| `src/app/api/setlist/publish/route.ts` | 1 | HIGH |
| `src/app/api/auth/session/route.ts` | 1 | HIGH |
| `src/lib/rate-limit.ts` | 1 | HIGH |
| `src/lib/google-drive.ts` | 3 | HIGH, HIGH, MED |
| `src/lib/firestore-monitor-client.ts` | 1 | HIGH |
| `src/hooks/use-smart-transposer.ts` | 2 | HIGH, MED |
| `src/hooks/use-setlist-logic.ts` | 1 | HIGH |
| `src/hooks/use-setlist-dashboard.ts` | 1 | HIGH, MED |
| `src/hooks/use-setlist-presence.ts` | 1 | HIGH, MED |
| `src/hooks/use-offline.ts` | 1 | HIGH |
| `src/hooks/use-upcoming-prep.ts` | 1 | HIGH |
| `src/lib/annotation-store.ts` | 1 | MED |
| `src/hooks/use-monitor-connection.ts` | 1 | MED |
| `src/types/monitor.ts` | 1 | MED |
| `src/types/models.ts` | 1 | MED |
| `src/types/schemas.ts` | 1 | MED |
| `src/lib/firebase-storage.ts` | 1 | MED |
| `src/app/api/chat/route.ts` | 1 | MED |
| `src/lib/library-cache.ts` | 1 | MED |
| `src/hooks/use-creation-wizard.ts` | 1 | MED |
| All API routes (55) | 4 | MED |
| `src/lib/logger.ts` | 1 | LOW |
| `src/lib/api-auth.ts` | 1 | LOW |
| `src/app/api/drive/file/[fileId]/route.ts` | 1 | LOW |
| `src/app/api/test-gemini/route.ts` | 1 | LOW |
| Various hooks/components | 3 | LOW |

---

*Audit completed: 2026-03-10*
*Auditor: Claude Opus 4.6 via PAUL framework*
*Next: Phase 2 — Critical Fixes*
