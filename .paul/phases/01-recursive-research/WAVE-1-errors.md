# Wave 1 — Error Handling & Failure Modes

## Summary

The app generally has decent surface-level error handling: `createApiHandler` (`src/lib/api-wrapper.ts`) wraps all API routes with a top-level try/catch that returns a standardized 500 `INTERNAL_ERROR`; there is a `global-error.tsx` with Sentry capture; and save/publish flows use `toast.error(...)` to surface failures. However, there is a systemic pattern of **silent `.catch(() => {})`** on writes that *should* be user-visible — notifications, session refresh, usage tracking, push registration, last-used key persistence, cloud-storage cleanup, and cross-tab session cookie sync. Several of these can leave the app in a subtly bad state (wrong read-state, missed push registration, orphaned Storage files, stale Next cache) with no signal to the user or developer. There is also no `fetch` timeout anywhere in the client (no `AbortSignal.timeout`), PDF fetches have no retry budget, and the `(main)/page.tsx` / layout swallow auth errors to `null`, which is fine for anonymous viewers but hides real Firestore outages. Offline handling is inconsistent: `useOffline.downloadSetlist` (`src/hooks/use-offline.ts:106-111`) claims `N files saved for offline use` regardless of individual failures. Publish's downstream email/SMS/FCM failures are aggregated into a toast, but in-app notification batch failures are not surfaced in the returned UI.

## Findings

### ERR-001 Silent swallow of `notifySetlistUpdated` after save (P1)
- **Category**: error handling
- **File**: `src/hooks/use-setlist-logic.ts:309-312`
- **What's wrong**: Notification fire is `.catch(() => {})` with comment "don't break save flow." The notification may fail (permission denied, rules change, offline) and neither the user nor the logger is informed.
- **Why it matters**: Band members silently miss "setlist updated" pings even though the editor thinks they were notified.
- **Suspected fix**: At minimum `logger.warn`, ideally a deferred retry queue.

### ERR-002 Session cookie refresh swallow (P1)
- **File**: `src/lib/auth-context.tsx:196, 247`
- **What's wrong**: `syncSessionCookie(user).catch(() => {})` and sign-out `fetch("/api/auth/session", {method:"DELETE"}).catch(()=>{})` swallow all errors. If cookie refresh fails, middleware will start redirecting to `/login` even though Firebase client auth is still valid (this is the exact failure mode called out in the surrounding comment).
- **Why it matters**: Users see a surprise login page, PDF worker gets served as login HTML (documented in same file), and there is no telemetry.
- **Suspected fix**: Log + surface a soft banner when >N consecutive failures, or force a hard reauth on known 401.

### ERR-003 Push registration swallow (P1)
- **File**: `src/lib/auth-context.tsx:213-214`
- **What's wrong**: `registerPushNotifications(user.uid).catch(()=>{})` plus outer `.catch(()=>{})` on the dynamic import. A user who previously opted-in silently loses push if the SW token refresh fails.
- **Suspected fix**: Track `lastPushRegisterError` in localStorage; surface in Settings.

### ERR-004 `.catch(() => {})` on sticky-key Firestore writes (P2)
- **File**: `src/hooks/use-setlist-logic.ts:533`, `src/hooks/use-upcoming-prep.ts:61-62`, `src/components/performance/RehearsalToolbar.tsx:75,178`, `src/components/setlist/v2/TrackSheet.tsx:99`, `src/components/music/TransposerMenu.tsx:77`
- **What's wrong**: Preference writes (`preferredSpeed`, `lastVisitedAt`, `lastUsedKey`, transposition) dropped silently on permission/offline error. User's "sticky" state won't stick and they won't know.
- **Suspected fix**: Route through a small offline-write queue (IndexedDB) with a "unsynced changes" indicator.

### ERR-005 Sync engine swallows Storage cleanup + failure-record writes (P1)
- **File**: `src/lib/sync-engine.ts:239, 268, 300`
- **What's wrong**: `.catch(()=>{})` on (a) marking a file as `storageFailed` in Firestore, (b) deleting orphaned Storage blobs across `.pdf/.xml/''` extensions, and (c) the terminal `syncRun` failure update. If the failure-mark fails, the retry loop cannot tell which items need retry; if Storage delete fails, orphaned blobs accumulate (cost + data-leak risk); if the final `syncRun` write fails, the admin sees a "running" sync forever.
- **Suspected fix**: Emit Sentry breadcrumbs and keep a local `pendingCleanup` list.

### ERR-006 Bulk offline download reports success on all failures (P0)
- **File**: `src/hooks/use-offline.ts:100-116`
- **What's wrong**: Inner `try/catch` logs but still `completed++`, so the final toast `${completed} files saved for offline use` fires the same number regardless of how many actually succeeded. There is no per-file status check after `res.ok`, and the state update only happens inside `if (res.ok)`, but `completed` counts failed fetches too.
- **Why it matters**: User goes on stage thinking all charts are cached, then experiences missing PDFs mid-service — exactly the nightmare scenario the project flags as "bulletproof" requirement.
- **Suspected fix**: Track `succeeded` and `failed` separately; show `N/M` with a warning style when `failed > 0`.

### ERR-007 Client PDF fetch has no timeout or retry budget (P1)
- **File**: `src/components/music/PDFViewer.tsx:43-93`
- **What's wrong**: `await fetch(fetchUrl)` with no `AbortSignal.timeout(...)`. On a flaky mobile/iPad connection the spinner can hang indefinitely. Retry is only manual (button).
- **Suspected fix**: Wrap in `AbortSignal.timeout(20_000)` and auto-retry once on `TypeError`/timeout before surfacing the failure UI.

### ERR-008 No ErrorBoundary around PDFOverlay/PDFViewer (P1)
- **File**: `src/components/performance/PDFOverlay.tsx:1-50`
- **What's wrong**: Dynamic `PDFViewer` and `SmartScoreViewer` are rendered without an ErrorBoundary wrapper. A runtime error in `react-pdf` or `pdfjs` worker (mismatched version after deploy, OOM on huge score) will crash the whole performance route. `react-error-boundary` is imported in the editor (`SetlistEditorV2.tsx:59`) but not here.
- **Suspected fix**: Wrap the overlay render in `<ErrorBoundary FallbackComponent={FallbackError}>`.

### ERR-009 Client `apiFetch` throws "Authentication expired" without caller-side handling guarantee (P1)
- **File**: `src/lib/api-client.ts:11-39`
- **What's wrong**: If `getIdToken(true)` fails, the wrapper throws. Many call sites (grep of `.catch(()=>{})` around `apiFetch`) swallow this error. `apiFetch` does not set any timeout/abort — long CF/Next stall hangs UI.
- **Suspected fix**: Add `signal: AbortSignal.timeout(30_000)`; centralize 401 handling (redirect or token-refresh modal).

### ERR-010 PublishDialog shows aggregated success even when in-app batch fails (P1)
- **File**: `src/app/api/setlist/publish/route.ts:138-146, 281-335`
- **What's wrong**: In-app notification batch failures increment `inAppResults.failed` but the returned `PublishResult` in `src/components/setlist/PublishDialog.tsx:30-39` does not include `inAppResults` (only `notified`, which is the raw `registeredMusicians.length`, not the real send count). Dialog always claims `N notified` even when Firestore batch commits rejected.
- **Suspected fix**: Surface `notificationResults.inApp.failed` in the dialog.

### ERR-011 `revalidatePath` failure silently swallowed (P2)
- **File**: `src/app/api/setlist/publish/route.ts:310-316`
- **What's wrong**: Logged only; no client hint. Users may see stale `/setlists` list after publish.
- **Suspected fix**: Return `cacheRevalidated: false` flag and have the dialog force a router.refresh() as a fallback.

### ERR-012 `handleDeleteSetlist` / `handleDuplicateSetlist` swallow error detail (P1)
- **File**: `src/components/setlist/v2/SetlistEditorV2.tsx:242-258`
- **What's wrong**: Bare `catch {}` → generic toast. User sees "Failed to delete setlist" with no indication of permission vs. network; no logger call either, so devs can't triage.
- **Suspected fix**: `catch (e) { logger.error(...); toast.error(...,{description:msg})}` matching the save flow.

### ERR-013 Server layout/page swallow to `null` hides Firestore outages (P2)
- **File**: `src/app/(main)/layout.tsx:12`, `src/app/(main)/page.tsx:21-22`
- **What's wrong**: `getServerUser().catch(() => null)` and `getServerCongregationConfig().catch(() => null)`. Total Firestore/Admin SDK outage renders the app as "unauthenticated" with default config — confusing, and the error never reaches Sentry.
- **Suspected fix**: Distinguish expected `no-user` from thrown errors; call `Sentry.captureException` before returning null.

### ERR-014 Setlist transfer reads `res.text()` as error but also as body (P2)
- **File**: `src/hooks/use-setlist-dashboard.ts:191`
- **What's wrong**: `throw new Error(await res.text())` — API returns JSON `{error}`, so users see stringified JSON in the toast.
- **Suspected fix**: Parse JSON, fall back to text.

### ERR-015 Unhandled promise at module scope in `useOffline.getCachedFile` (P2)
- **File**: `src/hooks/use-offline.ts:120-128`
- **What's wrong**: Uses `fetch(..., { cache: "only-if-cached" })` which throws on cross-origin or uncached; the comment correctly notes this, but code relies on browser-specific "throws on miss" behavior that differs across WebKit/Blink and may log CORS errors to the console.
- **Suspected fix**: Feature-detect and use Cache API directly (`caches.match`) instead.

### ERR-016 No offline-write indication for autosave (P1)
- **File**: `src/hooks/use-setlist-logic.ts:245-327`
- **What's wrong**: `performSave` fails with toast on permission/not-found, but offline failures will raise a generic Firestore error and the UI shows "Failed to save changes." There is no offline-detection path that queues the edit — users lose edits if they close the tab.
- **Suspected fix**: Use `navigator.onLine` and Firestore's offline persistence explicitly; show a "working offline — changes will sync" badge.

## Uncertainties (for Wave 2)

- Is Firestore offline persistence actually enabled (`enableIndexedDbPersistence`)? If yes, many of the silent catches are safer than they look. Need to confirm in `src/lib/firebase.ts`.
- Does Sentry (`sentry.client.config.ts`) have `beforeSend` filtering that drops the `.catch(()=>{})` gap-fill noise? Unknown whether swallowed errors would have been captured anyway.
- PDF worker version mismatch handling after a deploy rolls to an older SW — is there a forced reload path, or do users get permanently broken PDFViewer? Need to audit `src/app/register-sw.ts` (if it exists) and SW caching strategy.
- `use-safe-firestore-sync.ts` has `onError` wiring — are consumers actually passing `onError`, or is it silently swallowed there too? Wave 2 should grep consumers.
- PublishDialog's `onPublished` callback runs before awaiting anything — if the server returns partial success, does the editor state update regardless?
- `apiFetch` lacks global 401 handling — does any layer detect "token expired mid-session" and force a Firebase token refresh + retry?
