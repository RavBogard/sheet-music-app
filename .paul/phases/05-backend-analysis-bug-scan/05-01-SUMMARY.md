# Phase 5 Summary: Backend Analysis & Bug Scan

**Completed:** 2026-03-10
**Scope:** Full codebase audit — 401 source files, 55 API routes, 95 lib modules, 18 hooks

---

## Executive Summary

**Overall Health: B+** — The app has solid fundamentals (Firebase Auth, role-based access, widespread rate limiting, Zod validation). However, the audit uncovered **7 critical issues**, **11 high-priority bugs**, **17 medium issues**, and **8 low-priority items**. The most urgent concerns are: AI slot resource leak, lost annotation data on navigation, npm vulnerabilities, and missing security headers.

### Top 5 Priorities
1. **AI slot leak** — early returns in `use-smart-transposer.ts` bypass `releaseAiSlot()`, eventually blocking all AI scans
2. **clearSaveTimer() never called** — annotations lost when navigating away before 800ms debounce
3. **npm audit vulnerabilities** — 3 high/critical CVEs in transitive deps (fast-xml-parser, @tootallnate/once, ajv)
4. **Missing security headers** — No CSP, HSTS, or Permissions-Policy configured
5. **Bridge credentials exposure** — Full service account private key returned in JSON response

---

## Bug Inventory

### Critical (7)

| ID | File | Description | Recommendation |
|----|------|-------------|----------------|
| CRIT-001 | `src/hooks/use-smart-transposer.ts` | AI slot leak: multiple early returns bypass `finally` block, `releaseAiSlot()` never called. Over time exhausts AI concurrency lock, blocks all scans. | Restructure control flow — move all early returns after try/catch or use explicit cleanup before each return |
| CRIT-002 | `src/lib/annotation-store.ts` | `clearSaveTimer()` exported but **never called** by any consuming component. Unsaved annotations lost on unmount before 800ms debounce completes. | Wire `clearSaveTimer()` into `useEffect` cleanup in `perform/[id]/page.tsx` |
| CRIT-003 | `src/hooks/use-musician-transposition.ts` | Race condition: `cancelled` flag checked after `await`, stale state update can fire on unmounted component. | Use AbortController or check `cancelled` before every `setState` call |
| CRIT-004 | `package.json` (transitive) | 3 npm audit vulnerabilities: `fast-xml-parser` (entity encoding bypass, DoS), `@tootallnate/once` (control flow scoping), `ajv` (ReDoS). | Run `npm audit fix`; firebase-admin transitive dep needs major version assessment |
| CRIT-005 | `next.config.ts` | Missing security headers: no `Strict-Transport-Security`, `Content-Security-Policy`, or `Permissions-Policy`. XSS and SSL stripping possible. | Add HSTS, CSP, Permissions-Policy headers (S effort) |
| CRIT-006 | `src/app/api/bridge/setup-code/route.ts` | Full Firebase Admin service account private key returned in JSON response. No credential rotation, no per-session keys. | Implement short-lived tokens or service account impersonation instead of raw key exposure |
| CRIT-007 | `src/lib/firebase-admin.ts` + callers | `initAdmin()` returns boolean but callers never check return value. If credentials missing, subsequent `getFirestore()` calls fail silently. | Throw on `initAdmin()` failure or wrap all callers with explicit checks |

### High (11)

| ID | File | Description | Recommendation |
|----|------|-------------|----------------|
| HIGH-001 | `src/hooks/use-setlist-logic.ts` | Fire-and-forget notification with `.catch(() => {})` silently suppresses all errors. | Add error reporting to catch block |
| HIGH-002 | `src/hooks/use-metronome.ts` | Stale closure risk: `bpm` captured in `setInterval` callback, fragile memoization. | Verify memoization or use ref for latest bpm |
| HIGH-003 | `src/app/api/bridge/setup-code/route.ts` | Race condition: batch invalidation of existing codes is NOT atomic. Two concurrent POSTs can create duplicate active codes. | Wrap in `runTransaction()` |
| HIGH-004 | `src/app/api/admin/set-role/route.ts:49` | Unindexed composite query: `where("createdBy.uid") + where("isPublic")` — will fail without manually created Firestore index. | Verify index exists in Firebase Console |
| HIGH-005 | `src/lib/sync-engine.ts` | Batch size = 450, close to Firestore 500-operation limit. Nested updates could exceed. | Reduce to 400 for safety margin |
| HIGH-006 | `vitest.config.ts` | Environment set to `'node'` but tests are React components needing DOM APIs. Tests may fail silently or behave unexpectedly. | Change to `'jsdom'` and add setup file |
| HIGH-007 | 23 API routes | `withAuth` → `createApiHandler` migration incomplete. 23/55 routes still on legacy pattern with inconsistent error handling. | Batch migrate remaining routes |
| HIGH-008 | Multiple scheduling/setlist routes | Fire-and-forget notification promises with no error tracking. Delivery failures silently lost. | Add `.catch(err => logger.error(...))` |
| HIGH-009 | `src/app/api/auth/qr/route.ts` | QR code expiry not enforced at redemption. Expired code still grants auth token. | Add `session.expiresAt < Date.now()` check before `createCustomToken()` |
| HIGH-010 | `src/app/api/cron/sync/route.ts` | No rate limiting despite being callable from outside cron (only protected by `CRON_SECRET`). | Add `checkRateLimit(req, 'sync')` |
| HIGH-011 | `src/lib/google-drive.ts` | Dual credential sources (JSON vs env vars) with silent fallback. If JSON is malformed, falls back without error. | Log which credential source is used, validate both paths |

### Medium (17)

| ID | File | Description |
|----|------|-------------|
| MED-001 | `src/hooks/use-library.ts` | Missing error state exposure from `useQuery` |
| MED-002 | `src/hooks/use-safe-firestore-sync.ts` | Effect thrashing if Firestore `ref` is unstable (new instance each render) |
| MED-003 | `src/hooks/use-offline.ts` | No AbortSignal for fetch cancellation in bulk download |
| MED-004 | `src/lib/monitor-store.ts` | Shallow copy pattern may miss deep mutations in nested bus/send objects |
| MED-005 | `src/hooks/use-creation-wizard.ts` | `customTemplates` may cause stale logic in memoized callback |
| MED-006 | `src/lib/setlist-firebase.ts` | No schema validation before Firestore writes — invalid track objects can be persisted |
| MED-007 | `src/lib/live-session-firebase.ts` | `toMillis()` could throw on malformed Timestamp, crashing entire subscription |
| MED-008 | `src/lib/setlist-firebase.ts` | Orphaned tasks collection — client can't delete due to rules, no server-side cleanup |
| MED-009 | `src/app/api/library/list/route.ts` | `parseInt("abc")` returns NaN, `Math.min(NaN, 500)` = NaN — query fails |
| MED-010 | `src/app/api/admin/set-role/route.ts:39` | Missing null check on `userDoc.data()` — admin lockout if profile missing |
| MED-011 | `src/lib/sync-engine.ts` | Date comparison: `modifiedTime` could be object vs string, always evaluates as modified |
| MED-012 | `src/app/api/admin/set-role/route.ts:50` | Nested field query `createdBy.uid` — if setlist has string `createdBy`, query returns nothing |
| MED-013 | Multiple routes | Error messages expose internal details (Firebase bucket names, query errors) to client |
| MED-014 | `src/app/api/library/upload/route.ts` | Levenshtein threshold 0.85 too permissive — may deduplicate different versions of same song |
| MED-015 | `src/lib/env.ts` | `GOOGLE_GENERATIVE_AI_API_KEY` vs `GEMINI_API_KEY` naming mismatch |
| MED-016 | `src/app/api/scheduling/calendar-feed/` | Missing CORS headers on public calendar endpoint |
| MED-017 | `eslint.config.mjs` | `react-hooks/exhaustive-deps: "off"` — hook dependency bugs won't be caught by linter |

### Low (8)

| ID | File | Description |
|----|------|-------------|
| LOW-001 | `src/hooks/use-wake-lock.ts` | No state exposed for wake lock unavailability |
| LOW-002 | `src/lib/annotation-store.ts` | No error state on load failure — loading goes false silently |
| LOW-003 | `src/hooks/use-upcoming-prep.ts` | Fire-and-forget `setDoc` for lastVisitedAt |
| LOW-004 | `src/hooks/use-monitor-connection.ts` | Verbose logging in hot paths (ref counting, visibility changes) |
| LOW-005 | Multiple routes | HTTP 200 returned for creation (should be 201) and async dispatch (should be 202) |
| LOW-006 | `src/app/api/admin/set-sound-engineer/route.ts` | No audit log for soundEngineer flag change |
| LOW-007 | `src/app/api/setlist/publish/route.ts` | Sends emails without checking notification preferences |
| LOW-008 | `src/app/api/drive/save/route.ts` | No XML structure validation on `xmlContent` input |

---

## Architecture Assessment

### Auth Patterns
- **Strong foundation:** Firebase Auth + custom claims, role hierarchy properly enforced
- **Migration gap:** 23 of 55 routes still on legacy `withAuth` pattern vs modern `createApiHandler`
- **Rate limiting:** 94% coverage, per-user limiting via JWT sub claim (well-implemented)
- **Session security:** Cookie security solid, but QR code expiry not enforced at redemption

### Error Handling
- **Inconsistent:** `createApiHandler` routes auto-catch errors; `withAuth` routes have variable try/catch coverage
- **Fire-and-forget pattern:** Notifications, audit logs sent without error tracking in ~6 routes
- **Error exposure:** Several routes return raw error messages to clients instead of generic messages

### Data Flow & Firebase
- **Firestore operations:** Mostly correct, but missing transactions for multi-document updates (setlist deletion + task cleanup)
- **Index gaps:** At least 2 composite queries may lack Firestore indexes
- **Batch writes:** Sync engine at 450/500 limit, needs safety margin
- **Orphaned data:** Tasks collection grows unbounded when setlists are deleted

### API Design
- **Response consistency:** Most routes use `{ error, status }` or `{ success, data }` format, but 2-3 routes return bare objects
- **Status codes:** Several POST routes return 200 instead of 201 Created
- **Validation:** Zod schemas used in 76% of routes with request bodies — good coverage

---

## Deferred Issues Reassessment

| Issue | Original Priority | Updated Assessment | Recommendation |
|-------|------------------|-------------------|----------------|
| **CRIT-003: Bridge credentials** | Critical | **Still Critical** — Agent confirmed raw private key exposure. No rotation, no per-session tokens. | Fix in next milestone. Implement service account impersonation or short-lived tokens. Effort: **L** |
| **LOW-004: leader → band_leader migration** | Low | **Still Low** — Code handles both values. No user-facing impact until new role features added. | Defer to v1.6+. Effort: **S** |
| **withAuth → createApiHandler** | Medium | **Upgraded to High** — 23 routes still on legacy pattern. Inconsistent error handling is a maintainability risk. | Batch migrate in next milestone. Effort: **M** (30 routes, mechanical) |
| **clearSaveTimer() wiring** | Medium | **Upgraded to Critical** — Confirmed: never called by any component. Annotations silently lost. | Fix immediately. Effort: **S** |

---

## Upgrade Recommendations

| Recommendation | Category | Effort | Priority | Impact |
|----------------|----------|--------|----------|--------|
| Run `npm audit fix` (fast-xml-parser, ajv) | Security | **S** | 1 | Closes known CVEs |
| Add HSTS + CSP + Permissions-Policy headers | Security | **S** | 2 | Prevents XSS, SSL stripping |
| Fix AI slot leak in use-smart-transposer | Bug | **S** | 3 | Unblocks AI chord scanning |
| Wire clearSaveTimer() into component cleanup | Bug | **S** | 4 | Prevents annotation data loss |
| Fix QR code expiry enforcement | Security | **S** | 5 | Prevents expired code auth |
| Migrate 23 routes to createApiHandler | Consistency | **M** | 6 | Unified error handling |
| Fix race condition in use-musician-transposition | Bug | **S** | 7 | Prevents stale state |
| Add initAdmin() return value checks | Reliability | **S** | 8 | Prevents silent failures |
| Redesign bridge credential flow | Security | **L** | 9 | Eliminates key exposure |
| Bump @types/node, jsdom, pdfjs-dist | Dependencies | **M** | 10 | Modern features, fixes |
| Fix vitest environment (node → jsdom) | Quality | **S** | 11 | Tests work correctly |
| Sanitize error messages across routes | Security | **M** | 12 | No internal details leaked |
| Add Firestore composite indexes | Data | **S** | 13 | Prevents query failures |
| Subset fonts (Poppins weights) | Performance | **S** | 14 | ~50KB savings |
| Enable exhaustive-deps ESLint rule | Quality | **M** | 15 | Catches hook dep bugs |

---

## Recommended Next Milestone Phases

Based on findings, here's a suggested phase breakdown for **v1.5**:

| Phase | Name | Scope | Effort |
|-------|------|-------|--------|
| 1 | **Security Hardening** | npm audit fix, security headers (CSP/HSTS), QR expiry, error message sanitization, bridge credential redesign | M |
| 2 | **Critical Bug Fixes** | AI slot leak, clearSaveTimer wiring, musician-transposition race condition, initAdmin checks | S |
| 3 | **API Consistency** | Migrate 23 withAuth routes to createApiHandler, fix HTTP status codes, add missing CORS | M |
| 4 | **Data Integrity** | Firestore index verification, transaction wrapping for multi-doc ops, orphaned task cleanup, schema validation | M |
| 5 | **Quality & Deps** | Vitest environment fix, dependency updates, font subsetting, ESLint rule re-enablement | S |

---

## Files Scanned

- **55 API route files** — all checked (see full list in agent report)
- **18 hooks** — all checked
- **8 Zustand stores** — all checked
- **6 auth/security lib files** — api-auth, api-wrapper, api-client, server-auth, rate-limit, roles
- **12 Firebase/data lib files** — firebase-admin, firebase, firebase-storage, google-drive, firestore-helpers, firestore-utils, firestore-monitor-client, sync-engine, server-library, server-setlists, setlist-firebase, live-session-firebase
- **Config files** — package.json, next.config.ts, tsconfig.json, vitest.config.ts, eslint.config.mjs, env.ts

---
*Phase 5 Plan 01 — Research complete*
*Generated: 2026-03-10*
