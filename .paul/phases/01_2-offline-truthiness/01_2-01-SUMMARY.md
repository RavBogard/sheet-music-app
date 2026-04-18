# Phase 1.2 — Offline Truthiness — SUMMARY

**Completed:** 2026-04-13
**Status:** Code + tests shipped. Production browser-offline smoke test pending.

## What shipped

### New IndexedDB blob store (`src/lib/offline-idb.ts`)
Database `crc-offline`, store `files` keyed by `fileId`. Exports:
- `putFile(id, blob)` / `getFile(id)` / `hasFile(id)` / `deleteFile(id)`
- `listFileIds()` / `clearAll()` / `totalBytes()`

SSR/old-browser safe — every function degrades to the "empty" answer; `putFile` no-ops.

### `use-offline.ts` — rewritten against IDB
- `downloadFile`: `res.blob()` → `putFile(id, blob)`. Only sets `offlineStatus[id] = true` if the blob actually landed in IDB.
- `downloadSetlist`: honest outcomes — all-success / partial / all-failure report different toasts. No more "counted failed fetches as success."
- `getCachedFile`: returns `getFile(id)` (drops the `cache: 'only-if-cached'` fetch pattern entirely).
- `checkOfflineStatus`: consults `hasFile(id)`.

### `cache-utils.ts` + `offline-manager.ts` — IDB ground truth
- `isFileCached(id)` → `hasFile(id)`.
- `cacheSetlistFiles` writes bodies through `putFile`.
- `getOfflineStats.cachedFileCount = (await listFileIds()).length`.
- If `navigator.storage.estimate` is unavailable, `getOfflineStats.usageBytes` falls back to `totalBytes()` so the UI still has a real number.
- `clearAllOfflineData` clears the IDB blob store + library index.
- `getCachedFileIds` reads `listFileIds()`.

### PDFOverlay prefers local blob
- The chart URL resolves to `URL.createObjectURL(blob)` when the file is in IDB, falling back to `/api/drive/file/{id}` otherwise.
- Object URLs are revoked on fileId change / unmount.
- The background prefetcher in the overlay now writes bodies into IDB instead of warming a dead Cache Storage.

### Tests
- **New** `src/lib/__tests__/offline-idb.test.ts` — 7 tests, uses `fake-indexeddb/auto`.
- **Rewrote** `src/hooks/__tests__/use-offline.test.ts` — 13 tests, mocks `offline-idb` directly. Covers: success, `!res.ok`, fetch throw, empty blob, all-success toast, partial-failure toast, all-failure toast, already-cached short-circuit, silent mode, `getCachedFile` present/absent.
- **Updated** `src/lib/prefetch.test.ts` — 10 tests, asserts `putFile` fires on 200 and NOT on 500.
- Added `fake-indexeddb` to devDependencies.
- **Full suite: 1102/1102 pass** (+13 new). Typecheck clean.

### Audit
- `rg "caches\\." sheet-music-app/src` → **zero hits**.
- `rg "only-if-cached" sheet-music-app/src` → **zero hits**.

## Deviations from plan

- `SmartScoreViewer` (for MusicXML scores) was in the plan file list but didn't need changes — it already loads from a URL prop and doesn't interact with the offline system. The real PDF viewer path is `PDFOverlay` → `PDFViewer` (dynamic import); we updated `PDFOverlay` to resolve the URL via IDB first.

## Not yet done (Task 8 — needs human verification)

**Fresh-browser smoke test.**
1. Open the app in a new incognito window.
2. Sign in. Confirm no "offline ready" pills appear anywhere.
3. Click "Pre-load setlist" on one setlist. Wait for the completion toast.
4. Open DevTools → Application → IndexedDB → `crc-offline` → `files`. Confirm the blobs are there.
5. Enable DevTools "Offline" throttling. Navigate into that setlist's performance view. Confirm charts render from the local blob.
6. Open a different (non-preloaded) setlist while offline. Confirm charts do NOT pretend to work — PDF viewer should show a clean empty/error state.

## Files changed

Code:
- `src/lib/offline-idb.ts` (new)
- `src/hooks/use-offline.ts`
- `src/lib/cache-utils.ts`
- `src/lib/offline-manager.ts`
- `src/lib/prefetch.ts`
- `src/components/performance/PDFOverlay.tsx`

Tests:
- `src/lib/__tests__/offline-idb.test.ts` (new)
- `src/hooks/__tests__/use-offline.test.ts` (rewritten)
- `src/lib/prefetch.test.ts` (rewritten)

Dep:
- `fake-indexeddb` added to `devDependencies`.

## Commit

`755cf4f` pushed to `origin/master`. Vercel auto-deploys.
