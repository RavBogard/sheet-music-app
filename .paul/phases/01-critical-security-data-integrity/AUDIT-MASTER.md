# Codebase Audit: Deduplicated Master List

**Date:** 2026-03-30
**Scope:** 12 research agents across 4 rounds
**Codebase:** sheet-music-app (Next.js + Firebase)

## Summary

- **Total unique issues:** 38
- **P0 (must fix):** 12
- **P1 (should fix):** 16
- **P2 (nice to have):** 10

---

## P0 — Must Fix

| ID | Title | Category | Effort | File(s) | Description | Found By |
|----|-------|----------|--------|---------|-------------|----------|
| BUG-001 | Unauthenticated session DELETE | security | S | `src/app/api/auth/session/route.ts` | DELETE handler clears session cookie without verifying caller identity; any request can log out any user | R2A, R4C |
| BUG-002 | Timing attacks on cron auth (sync, enrich, scheduling-reminder) | security | M | `src/app/api/cron/sync/route.ts`, `enrich/route.ts`, `scheduling-reminder/route.ts` | String `===` comparison of CRON_SECRET is vulnerable to timing attacks; only `backup/route.ts` uses `timingSafeEqual` | R2A, R4A, R4C |
| BUG-003 | Scheduling race conditions (assign/unassign/respond) | reliability | M | `src/app/api/scheduling/assign/route.ts`, `unassign/route.ts`, `respond/route.ts` | Read-modify-write patterns without Firestore transactions; concurrent requests can produce inconsistent state | R2A, R4A |
| BUG-004 | Missing `liveState` on Setlist type | type-safety | S | `src/types/models.ts` | Firestore `setlists` docs have `liveState` field used extensively in code, but the `Setlist` interface lacks it; all access is untyped | R1B, R3C |
| BUG-005 | SwipeToDelete fires without confirmation | ux | S | `src/components/setlist/v2/SwipeToDelete.tsx` | Swiping past threshold calls `onDelete()` immediately with no undo/confirm; easy accidental track removal on mobile | R1C |
| BUG-006 | `config/admins` readable by all authenticated users | security | S | `firestore.rules` (line 178-181) | Any signed-in user can read the admin UID list via `config/admins`, revealing who the admins are | R2B |
| BUG-007 | `set-upload-permission` missing schema validation | security | S | `src/app/api/admin/set-upload-permission/route.ts` | Body is used directly (`ctx.body!`) without Zod validation; attacker could pass unexpected fields to Firestore update | R2A |
| BUG-008 | Memory leak: alert-store Firestore listener never unsubscribed | reliability | S | `src/lib/alert-store.ts` | `onSnapshot` subscription is created but the unsubscribe function is never returned or called; listener persists for app lifetime | R3B |
| BUG-009 | Memory leak: congregation-store listener may leak | reliability | S | `src/lib/congregation-store.ts` | `init()` returns an unsubscribe function but callers may not invoke it; `isInitialized` guard prevents re-subscribe but never cleans up | R3B |
| BUG-010 | 11 HIGH npm vulnerabilities (Next.js needs 16.2.1+) | security | M | `package.json` | `npm audit` reports 21 vulnerabilities (11 high) including transitive deps from Next.js, node-gyp chain, and yaml | R3A |
| BUG-011 | Missing `maxDuration` on scheduling-reminder cron | reliability | S | `src/app/api/cron/scheduling-reminder/route.ts` | No `maxDuration` export; Vercel default (10s on Hobby, 15s on Pro) may be too short for email+SMS sends | R4A |
| BUG-012 | 3 failing tests (stale assertions) | testing | S | Various test files | 3 of 1090 tests fail due to stale assertions that don't match current implementation | R2C, R3A |

## P1 — Should Fix

| ID | Title | Category | Effort | File(s) | Description | Found By |
|----|-------|----------|--------|---------|-------------|----------|
| BUG-013 | `useSafeFirestoreSync<any>` in production hooks | type-safety | M | `src/hooks/use-setlist-performance.ts`, `src/components/admin/LiveServiceSection.tsx`, `src/components/admin/people/AccessAuditLog.tsx` | 3 call sites use `<any>` generic defeating type safety on real-time Firestore data | R3C |
| BUG-014 | Incomplete `newTrack` object in live swap | reliability | S | `src/hooks/use-setlist-logic.ts` or swap handler | When swapping a track during live mode, the replacement track object may be missing fields present on the original | R1B |
| BUG-015 | Stale tracks array race condition | reliability | M | `src/hooks/use-setlist-logic.ts` | Concurrent edits to the `tracks` array can overwrite each other because the update is not based on the latest snapshot | R1B |
| BUG-016 | Fire-and-forget notifications in cron routes | reliability | S | `src/app/api/cron/scheduling-reminder/route.ts` | Email/SMS sends are not awaited or error-handled individually; one failure can silently drop remaining notifications | R4A |
| BUG-017 | Missing error boundary for ChatPanel | reliability | M | `src/components/chat/ChatPanel.tsx` | No React error boundary wrapping the chat panel; a render error crashes the entire page instead of being contained | R1A |
| BUG-018 | Missing null check on `resolvedSetlistId` | reliability | S | `src/hooks/use-setlist-performance.ts` or related | Code dereferences `resolvedSetlistId` without checking for null, risking runtime crash | R1B |
| BUG-019 | 6 `as any` casts in production code | type-safety | M | `src/lib/api-auth.ts`, `src/lib/api-wrapper.ts`, `src/components/setlist/SetlistDashboard.tsx`, `src/app/(main)/DashboardClient.tsx`, + 2 more | Type-unsafe casts that mask real type errors | R3C |
| BUG-020 | 108 non-null assertions (`!`) in codebase | type-safety | L | Various | Widespread use of `!` operator risks runtime null errors; should be replaced with proper guards | R3C |
| BUG-021 | 8 unsafe double-casts (`as unknown as X`) | type-safety | M | Various | Casts bypass the type checker entirely; indicates missing or incorrect types | R3C |
| BUG-022 | Missing rate limits on most API routes | security | L | `src/app/api/` (most routes) | Only a few admin routes call `checkRateLimit`; unauthenticated or low-privilege routes are unprotected | R2A |
| BUG-023 | 3 ESLint errors in use-song-groups.ts | tech-debt | S | `src/hooks/use-song-groups.ts` | Lint errors that should be fixed to maintain CI green | R3A |
| BUG-024 | `auth-context` unguarded async in effect | reliability | S | `src/contexts/auth-context.tsx` | Async call in useEffect without cleanup/cancellation guard; can set state on unmounted component | R3B |
| BUG-025 | `use-setlist-logic` pending detections not cleared | reliability | S | `src/hooks/use-setlist-logic.ts` | Pending state from key detection is not cleared on unmount or setlist change, causing stale UI | R3B |
| BUG-026 | Unhandled error in `handleConfirmSwap` | reliability | S | `src/hooks/use-setlist-logic.ts` or swap flow | Swap confirmation handler lacks try/catch; a Firestore write failure surfaces as unhandled rejection | R1B |
| BUG-027 | Missing confirmation on role changes | ux | S | Admin panel components | Changing a user's role has no confirmation dialog; accidental clicks take effect immediately | R1C |
| BUG-028 | Template editor unsaved changes warning | ux | M | Template editor components | No "unsaved changes" prompt when navigating away from the template editor | R1C |

## P2 — Nice to Have

| ID | Title | Category | Effort | File(s) | Description | Found By |
|----|-------|----------|--------|---------|-------------|----------|
| BUG-029 | 5 collections missing explicit Firestore rules | security | S | `firestore.rules` | `print_jobs`, `digitized_charts`, `sync_runs`, `system`, `migrations_state` have no rules; currently safe (Admin SDK only) but should have explicit `allow read, write: if false` for defense-in-depth | R2B |
| BUG-030 | Track array content not validated in Firestore rules | security | L | `firestore.rules` | Setlist update rules check `affectedKeys()` but don't validate the shape of items within the `tracks` array | R2B |
| BUG-031 | 12 new v3.0 files with zero test coverage | testing | L | Various v3.0 feature files | New live-swap, song-groups, and swap-UI files have no tests | R2C |
| BUG-032 | PrintModal / jsPDF not lazy-loaded | performance | M | `src/components/setlist/PrintModal.tsx` | jsPDF (~280KB) is bundled eagerly; should use `next/dynamic` to reduce initial JS payload | R4B |
| BUG-033 | ChatPanel could be further code-split | performance | M | `src/components/chat/ChatPanel.tsx` | Chat is not on the critical path but loads with the main bundle | R4B |
| BUG-034 | `console.error` used instead of logger in some files | tech-debt | S | `src/lib/congregation-store.ts` + others | Inconsistent error logging; some files use `console.error` instead of the structured `logger` | R1A |
| BUG-035 | Missing `onSnapshot` error handlers in some listeners | reliability | M | Various Firestore listener files | Some `onSnapshot` calls omit the error callback; Firestore permission errors silently swallowed | R1A |
| BUG-036 | CSV drag-drop disabled | ux | M | Setlist import UI | Drag-and-drop for CSV import is disabled/non-functional | R1C |
| BUG-037 | Empty catch blocks (non-critical paths) | tech-debt | S | Various | A few catch blocks swallow errors silently; should at minimum log | R1A |
| BUG-038 | `system` collection has no Firestore rules | security | S | `firestore.rules` | The `system/globalAlert` doc is read by `alert-store.ts` client-side but there are no rules for the `system` collection; reads will fail or succeed unpredictably based on default deny | R2B |

---

## Issues Investigated and Dismissed

| Claim | Verdict | Reason |
|-------|---------|--------|
| Firestore long-polling enabled (200-500ms penalty) | **FIXED** | `src/lib/firebase.ts` comments confirm long-polling was removed; using default WebChannel streaming |
| `print_jobs`/`digitized_charts`/`sync_runs`/`migrations_state` exposed to clients | **Not a risk** | All accessed via Admin SDK only; adding explicit deny rules (BUG-029) is defense-in-depth |
| Delete setlist has no confirmation | **FIXED** | `SetlistDashboard.tsx` has `DeleteSetlistDialog` with confirmation flow |

---

## Recommended Fix Order

**Quick wins (< 30 min each, high impact):**
1. BUG-001 — Add auth check to session DELETE
2. BUG-004 — Add `liveState` to Setlist type
3. BUG-005 — Add confirmation to SwipeToDelete
4. BUG-006 — Restrict `config/admins` read to admins only
5. BUG-007 — Add Zod schema to set-upload-permission
6. BUG-008 — Fix alert-store listener cleanup
7. BUG-011 — Add `maxDuration` to scheduling-reminder
8. BUG-012 — Fix 3 stale test assertions
9. BUG-029 — Add explicit deny rules for server-only collections
10. BUG-038 — Add rules for `system` collection

**Medium effort (30 min - 2 hrs, important):**
11. BUG-002 — Apply `timingSafeEqual` to all cron routes
12. BUG-003 — Wrap scheduling mutations in Firestore transactions
13. BUG-010 — Run `npm audit fix` and update Next.js
14. BUG-013 — Replace `<any>` with proper generics
15. BUG-015 — Fix tracks array race condition with optimistic locking or transactions

**Larger efforts (2-8 hrs):**
16. BUG-022 — Add rate limiting to remaining API routes
17. BUG-031 — Write tests for v3.0 features
18. BUG-020 — Audit and reduce non-null assertions
