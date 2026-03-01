# Codebase Concerns

**Analysis Date:** 2026-03-01

## Dependency Vulnerabilities

**npm Audit Results:**
- Total: 17 vulnerabilities (1 low, 1 moderate, 14 high, 1 critical)
- Files: `package.json`
- Impact: Code execution risk, denial of service in build/dev pipeline
- Critical severity from `opensheetmusicdisplay` dependency chain
- Fix approach: `npm audit fix` available for most issues; some require major version updates
- Recommendation: Run `npm audit fix` and test thoroughly; opensheetmuscicdisplay may need replacement if cannot update

**Specific High-Severity Issues:**
- `@ducanh2912/next-pwa` depends on vulnerable `workbox-build` and `workbox-webpack-plugin` (serialize-javascript)
- `@google-cloud/storage` has transitive vulnerability via `fast-xml-parser`
- `ajv` ReDoS vulnerability when using `$data` option (affects build tools)

---

## Type Safety Issues

**Unsafe Type Assertions - "as any":**
- Files affected: `src/app/(main)/library/page.tsx`, `src/app/(main)/setlists/page.tsx`, `src/app/(main)/tasks/page.tsx`, `src/app/api/scheduling/*`, `src/perform/setlist/[id]/page.tsx`, multiple admin pages
- Pattern: ~30+ instances of `as any` throughout codebase
- Impact: Silences type checker, enables runtime type errors to slip through
- Example locations:
  - `src/app/(main)/setlists/page.tsx:8` - initialSetlists passed as `any`
  - `src/app/api/scheduling/calendar-feed/[token]/route.ts:11` - assignments typed as `any[]`
  - `src/components/admin/LiveServiceSection.tsx` - multiple timestamp conversion casts
- Fix approach: Replace with proper type definitions; use type guards for Firestore Timestamp objects instead of `(value as any).seconds`

**Missing Type Guards:**
- Firestore Timestamp handling across multiple files lacks type safety
- Pattern: `(eventDate as any)?.seconds` instead of proper Timestamp type checking
- Files: `src/app/api/scheduling/remind/route.ts`, `src/app/api/scheduling/calendar-feed/[token]/route.ts`, `src/app/(main)/tasks/page.tsx`
- Fix approach: Create shared utility function for safe Timestamp conversion

---

## Large, Complex Components

**Monolithic Components - Refactoring Needed:**
- `src/components/setlist/v2/MusicianPicker.tsx` - 855 lines
  - Handles: musician selection, email status tracking, scheduling assignments, blockouts, band suggestions
  - Impact: Difficult to test, maintain, and reason about
  - Fragile: Multiple state dependencies on scheduling/blockout subscriptions
  - Fix: Break into smaller presentational and container components

- `src/lib/print-pipeline.ts` - 701 lines
  - Handles: PDF generation, chord caching, transposition, progress tracking
  - Impact: Critical print feature at risk
  - Fix: Extract chord caching logic and result caching into separate modules

- `src/components/setlist/v2/SetlistEditorV2.tsx` - 617 lines
  - Handles: Setlist editing, track management, drag-drop reordering
  - Impact: High test coverage gap for complex UI state

- `src/hooks/use-smart-transposer.ts` - 559 lines
  - Handles: Transposition calculations, musician assignments, preference tracking
  - Impact: Business logic deeply embedded in hook

---

## Error Handling Gaps

**Silent Error Swallowing:**
- Pattern: `.catch(() => {})` used 40+ times throughout codebase
- Files: `src/hooks/use-upcoming-prep.ts`, `src/components/admin/UserRow.tsx`, `src/lib/notification-store.ts`, `src/app/api/auth/qr/route.ts`
- Examples:
  - `src/app/api/auth/qr/route.ts:103` - QR session deletion failure silently ignored
  - `src/hooks/use-upcoming-prep.ts:59` - Firestore write silently fails
  - `src/components/nav/NotificationBell.tsx:56` - Mark as read failures ignored
- Impact: Bugs hidden from monitoring, user state becomes inconsistent
- Fix approach: Log errors even in non-critical paths; implement graceful degradation; reserved silent catches only for intentional cleanup operations

**Unhandled Promise Rejections:**
- `Promise.all()` calls without error boundaries in critical paths:
  - `src/app/(main)/page.tsx:20` - Dashboard data loading
  - `src/app/(main)/setlists/page.tsx:10` - Setlist loading
  - `src/components/setlist/PrintModal.tsx:271` - Print job promises
- Impact: Single failed promise breaks entire data load
- Fix: Wrap in Promise.allSettled() or add individual error handlers

**Incomplete Request Validation:**
- `src/app/api/setlist/publish/route.ts:38-44` - Musicians array type-checked at runtime but no schema validation
- `src/app/api/setlist/publish/route.ts:69` - Tracks array may contain invalid objects without schema enforcement
- Fix: Use Zod schemas for all request payloads; validate musicianPayload and track structure

---

## Security Concerns

**Firebase Admin Credential Handling:**
- Files: `src/lib/firebase-admin.ts`
- Issue: Private key loaded from `FIREBASE_PRIVATE_KEY` env var without validation
- Line 21: `.replace(/\\n/g, '\n')` - relies on format assumption; could fail silently with malformed keys
- Impact: Silent initialization failure in build environments (logs warning but continues)
- Risk: Unauthenticated requests in staging/preview deployments could bypass auth
- Fix: Add explicit validation of all three credential fields; fail fast if any missing; add monitoring for failed initializations

**QR Code Session Security:**
- `src/app/api/auth/qr/route.ts` - Minimal expiry validation, code format validation could be stronger
- Line 26: Alphanumeric filtering removes some base64 chars - collision risk with 6 chars
- Line 50: Code format validated at input but not against replay attacks
- Fix: Add session deduplication; track used codes; add CSRF protection

**API Rate Limiting:**
- `src/lib/rate-limit.ts` - checking exists but inconsistent application
- Files like `src/app/api/admin/*` lack rate limit checks
- Impact: Admin endpoints could be abused at scale
- Fix: Standardize rate limiting via API wrapper; different limits for different endpoints

**Missing CORS/CSRF Protection:**
- `src/app/api/setlist/publish/route.ts` - accepts requests from any origin
- No CSRF tokens on state-changing operations
- Fix: Add CSRF middleware; validate Origin header

---

## Data Validation Issues

**Incomplete Input Validation:**
- `src/app/api/setlist/publish/route.ts:38` - setlistId string-checked but no length validation
- `src/app/api/setlist/publish/route.ts:44` - musicians array validated for length but elements not validated
- `src/lib/setlist-firebase.ts:50` - JSON.parse/stringify used for "sanitization" (not safe)
- Impact: Invalid data persisted to Firestore; downstream errors from bad data

**Schema Drift Risk:**
- `src/types/schemas.ts` - Zod schemas exist but not used consistently in API routes
- Some routes validate via `withAuth` wrapper but skip schema validation
- Example: `src/app/api/tasks/update/route.ts` - no request body schema
- Fix: Enforce schema validation in all API routes; use createApiHandler wrapper consistently

**Null Safety:**
- Files across API routes use non-null assertions without checks:
  - `src/app/api/setlist/publish/route.ts:60` - `const setlist = setlistDoc.data()!`
  - `src/app/api/auth/qr/route.ts:98` - `const data = doc.data()!`
- If document corrupted or missing fields, runtime errors occur
- Fix: Check data shape before asserting; validate required fields

---

## Performance Bottlenecks

**Unbounded Firestore Queries:**
- `src/lib/setlist-firebase.ts:66` - limit(50) exists but pagination not enforced client-side
- `src/lib/users-firebase.ts` - subscribeToAllUsers may load all users without pagination
- Impact: Memory leak in long-running sessions; network bandwidth waste
- Fix: Implement cursor-based pagination; add query size limits

**Inefficient Data Fetching:**
- `src/components/setlist/v2/MusicianPicker.tsx:59-78` - subscribeToSetlistAssignments, subscribeToAllBlockouts, subscribeToAllUsers all subscribed simultaneously
- Each subscription rebuilds state; no deduplication
- Impact: Slow musician picker load; wasted Firestore reads
- Fix: Batch subscriptions; use collection queries with where clauses instead of subscribeToAll

**N+1 Chord Extraction:**
- `src/lib/print-pipeline.ts:94-100` - For each track, checks Firestore chordData subcollection
- If 20 tracks → 20 Firestore reads before print starts
- Fix: Batch-load all chord data in single query

**Heavy Synchronous PDF Generation:**
- `src/lib/print-pipeline.ts` - PDF library (pdf-lib) operations are synchronous
- Large setlists (20+ tracks) block main thread
- Fix: Use worker threads or move to background job queue (consider Inngest better)

---

## Fragile Areas

**Musician Picker State Management:**
- `src/components/setlist/v2/MusicianPicker.tsx` - 855 lines with multiple inter-dependent useState calls
- Complex scheduling assignment logic intertwined with email tracking
- Multiple firestore subscriptions (musicians, assignments, blockouts, email events)
- Test coverage: Likely insufficient for all state combinations
- Risk: Adding new musician status (e.g., "tentative") requires changes across multiple state arrays
- Safe modification: Extract scheduling logic to separate service/hook; add integration tests

**Transposer Logic:**
- `src/hooks/use-smart-transposer.ts` - 559 lines
- Complex music theory calculations (capo, transposition, flats/sharps)
- Multiple musician preference dependencies
- Risk: Musicians reporting incorrect transpositions
- Safe modification: Add property-based tests with music theory validation; extract music-math functions to testable library

**Print Pipeline Result Caching:**
- `src/lib/print-pipeline.ts:73-86` - Content hash for result caching
- If hash collides or computation order changes, wrong PDF returned
- Cache stored in Firebase Storage without lifecycle management
- Risk: Stale PDFs, storage bloat
- Safe modification: Add expiry to cached PDFs; validate hash includes all settings; add cache invalidation endpoint

**Firebase Cloud Functions/Inngest Reliability:**
- Bridge server integration (`src/bridge/*`) - purpose unclear, may be out of sync
- Inngest task definitions (`src/inngest/functions.ts`) - fire-and-forget patterns may silently fail
- Risk: Scheduled emails, band prep tasks, enrichment crons may not execute
- Safe modification: Add monitoring; implement retry logic; add dead-letter queue

---

## Test Coverage Gaps

**Untested Critical Paths:**
- `src/app/api/setlist/publish/route.ts` - No visible tests for multi-step publish flow (db update → email → usage recording)
- `src/lib/print-pipeline.ts` - No tests for chord caching logic, cache miss scenarios
- `src/components/setlist/v2/MusicianPicker.tsx` - No tests for scheduling assignment subscriptions
- Risk: Publish flow could silently fail at email step without alerting user

**Missing E2E Tests:**
- `e2e/smoke.spec.ts` - Only smoke tests; no user workflows tested
- Missing: Create setlist → Add musicians → Publish → Verify emails sent
- Missing: Transpose and print workflow
- Fix: Add comprehensive E2E tests in Playwright for core user journeys

**Untested Error Scenarios:**
- Firestore offline scenarios
- Failed email deliveries (Resend webhook failures)
- PDF generation timeouts
- Firebase Admin initialization failures in preview deployments
- Fix: Add error injection tests; mock Resend failures

**Integration Test Gaps:**
- API routes tested in isolation without full auth context
- Bridge communication not tested
- Database transaction atomicity not verified
- Fix: Add integration test suite with test Firebase instance

---

## Deprecated/At-Risk Dependencies

**Outdated Packages:**
- `papaparse@5.5.3` - CSV parsing, may have security issues
- `react-day-picker@9.13.0` - Calendar component, consider replacing with native solution
- `opensheetmusicdisplay@1.9.4` - Critical vulnerability; may need replacement
- Fix approach: Audit each for security updates; plan replacements for high-vulnerability packages

**Firebase SDK Major Version:**
- `firebase@12.9.0` - Recent major version, ensure compatibility with all client code
- `firebase-admin@13.6.0` - Server SDK, ensure not accidentally exposed to client
- Risk: API breaking changes in next major versions

---

## Missing Critical Features

**No Offline Sync:**
- Offline capability exists (`src/lib/offline-manager.ts`) but sync strategy incomplete
- Setlist edits offline may conflict with server state
- Fix: Implement conflict resolution; add sync status UI

**No Backup/Restore:**
- No user-initiated backup export
- Database backup strategy unclear
- Fix: Add export functionality for setlists/musician data; implement database backup retention

**Limited Audit Logging:**
- `src/lib/setlist-audit.ts` tracks changes but missing musician assignment changes
- Admin actions partially logged
- Risk: Difficult to debug permission issues
- Fix: Extend audit logging to all state changes; add access audit trail

---

## Known Limitations

**PDF Handling:**
- `pdfjs-dist@5.4.530` and `react-pdf@10.3.0` work together but have stability issues with complex PDFs
- Large PDFs (100+ pages) may timeout in browser
- Workaround: Print complex setlists via email PDF generation instead

**Real-Time Collaboration:**
- No multi-user editing of same setlist
- Last-write-wins on conflicts
- Risk: Band leader and musician editing simultaneously causes data loss
- Fix: Implement conflict-free replicated data type or pessimistic locking

**Email Delivery Reliability:**
- `resend@6.9.2` webhook may miss bounce notifications
- Silent catch in email status handling could miss delivery failures
- Fix: Add retry queue for failed email notifications; implement audit trail
