# Wave 2 — Offline Truthiness Drill-Down

**Status:** Bug confirmed. Severity is worse than Wave 1 flagged: the entire offline
feature is non-functional at the filesystem level, not just mis-reported. Every
"Offline ready" surface in the UI is a lie of varying shape.

---

## 1. The original bug trace (`use-offline.ts:99–116`)

```ts
for (const file of filesToDownload) {
    try {
        const res = await fetch(`/api/drive/file/${file.id}`)
        if (res.ok) {
            setOfflineStatus(prev => ({ ...prev, [file.id]: true }))
        }
    } catch (e) {
        logger.error(`[Offline] Failed to cache ${file.name}:`, e)
    }
    completed++   // <-- increments regardless of success/failure
}
...
toast.success(`${completed} files saved for offline use`)
```

`completed` counts **attempts**, not successes. Even if `res.ok` is false or the
fetch throws, `completed++` runs and the toast claims success. The per-file
`offlineStatus` flag is only set on `res.ok` — so internal state is less wrong
than the toast, but still wrong (see §3).

`downloadFile` (single-file variant, lines 51–75) has the same shape: it sets
`offlineStatus[fileId] = true` purely because the network fetch returned 2xx.
There is **no verification that the response body was ever stored anywhere**.

## 2. The deeper bug: the service worker is gone

The whole offline strategy assumes "fetch it once, the SW intercepts and
Workbox caches it." But Phase **06.1-sw-removal-firestore-recovery** (completed
2026-03-11) deleted `public/sw.js`, `public/workbox-*.js`, uninstalled
`@ducanh2912/next-pwa`, and removed `withPWA` from `next.config.ts`.
`SwCleanup.tsx` actively *unregisters* any remaining SW on every mount.

Evidence: `next.config.ts` has zero PWA config; `grep` for `next-pwa|workbox`
returns only planning docs and the cleanup component. `firebase-messaging-sw.js`
survives but handles push only — it does not cache drive fetches.

**Consequence:** `fetch('/api/drive/file/:id')` hits the network, the response
is consumed and discarded (the code never even reads `res.blob()`), and nothing
enters any Cache Storage bucket. `isFileCached()` walks `caches.keys()` looking
for `/api/drive/file/:id` — it will find nothing, ever, because nothing is
writing there. `getCachedFile()` uses `cache: "only-if-cached"` which
mandates `mode: "same-origin"` and the request will throw.

The entire Cache-API-backed offline feature is dead code pretending to work.

## 3. "Lying" surfaces (all UI that claims offline-ready)

| Surface | File | What it reads | Actual truth |
|---|---|---|---|
| "Offline ready" / "Partial" pill on upcoming setlist card | `src/components/setlist/SetlistCards.tsx:35–43, 123–132` | `isFileCached(fileId)` per track | Always `none` in production (no SW → never cached). Briefly flashes `full` only via hook's in-memory `offlineStatus` map (never persisted). |
| HeroCard offline ratio + "Download" button toast | `src/components/dashboard/HeroCard.tsx:28,60–73` | `cacheSetlistFiles` return count | Counts `res.ok` attempts, not cached files. Same lie shape as `downloadSetlist`. |
| `downloadSetlist` toast "N files saved for offline use" | `use-offline.ts:115` | `completed` counter | Counts attempts including failures. |
| Library row "cached" checkmark | `src/components/library/LibraryFileRow.tsx:48` | `isFileCached` | Always false post-SW-removal. |
| `OfflineIndicator` banner ("using cached data") | `src/components/offline/OfflineIndicator.tsx` | `navigator.onLine` | Honest about network state but misleading — says "using cached data" when no cached data exists. |
| `PerformanceOfflineIndicator` (stage view) | `src/components/performance/PerformanceOfflineIndicator.tsx` | `navigator.onLine` | Same — shows reassurance banner despite nothing being cached. |
| `DesktopHeader` CloudOff "Offline" pill | `src/components/nav/DesktopHeader.tsx:127` | `navigator.onLine` | Honest network pill, no false cache claim. |
| `offline-manager.getOfflineStats().cachedFileCount` / settings panel | `src/lib/offline-manager.ts:58–68` | Cache API scan | Will always be 0. Not currently surfaced (OfflineStorageSection deleted in 06.1). |

`useSetlistPerformance` does **not** call `checkOfflineStatus` and does not use
the hook — it relies on the network being up. So the stage view has no
file-level pre-check before musicians step on the platform. The green pill on
the dashboard card is the only signal Rabbi Daniel or the band would see.

## 4. Ground truth vs. displayed signal

Ground truth for "is this chart available offline" requires either (a) a SW
caching strategy that actually writes bodies to `caches`, or (b) explicit blob
storage in IndexedDB. **Neither exists** post-06.1. So every "Offline ready"
pill today is structurally unable to be true.

## 5. Fix options

- **Option A — strict per-file validation.** Keep current UI, but after each
  fetch, verify via `caches.match(url)` and body length. Blocked: there is no
  SW writing to caches. Would require re-adding a SW or changing `downloadFile`
  to explicitly `await res.blob()` and write to a custom `caches.open('pdfs')`
  bucket. Medium-plus effort; reintroduces the exact class of SW bug 06.1 was
  written to exterminate.

- **Option B — fan-out visible errors.** Report "3 of 5 cached, 2 failed."
  Useless if 0 of 5 are actually cached — it just makes the lie more detailed.

- **Option C — remove the pre-cache feature, replace with honest reactive
  caching.** Delete `downloadSetlist`, the Download button, the "Offline ready"
  pill, and `isFileCached`. On chart open in the stage view, fetch the PDF as a
  blob, store in IndexedDB keyed by `fileId`, and have `SmartScoreViewer`
  prefer the IDB blob when offline. Show a pill only for files actually in IDB.

**Recommendation: Option C**, with a small twist — add an explicit
"Pre-load setlist" action that iterates the tracks *using the same IDB blob
path* so Rabbi Daniel can deliberately warm the cache before Shabbat. This
preserves his workflow ("tap Download before I drive to shul") while making
the success signal ground-truth (blob present in IDB with non-zero byteLength).

## 6. Effort estimate (Option C)

- New `src/lib/pdf-blob-store.ts` (IDB wrapper, ~80 lines): 1h
- Rewrite `use-offline.ts` to read/write IDB, count true successes: 1.5h
- Update `SmartScoreViewer` to prefer IDB blob when present: 45m
- Update `SetlistCards`, `HeroCard`, `LibraryFileRow` pills to query IDB:
  30m each = 1.5h
- Kill dead Cache API code paths in `cache-utils.ts` and `offline-manager.ts`: 30m
- Tests (vitest fake IDB, verify count-only-successes): 1.5h
- Manual verify on device in airplane mode: 30m

**Total: ~7 hours** of focused work, single developer, no UX redesign needed.

## 7. Routing proposal

This is a P0 trust-breaker and must not wait for Phase 3 (stage-UX polish).
Propose inserting a decimal phase **01.2-offline-truthiness** immediately
after the current Wave-2 research phase and before any band onboarding work.
Phase 3 can keep its scope (toolbar polish). The deferred v1.3 issues
(CRIT-003 bridge creds, LOW-004 band_leader migration) are unrelated and
stay where they are.

Suggested phase deliverables:
1. IDB blob store + honest `useOffline` rewrite
2. All "Offline ready" UI reading from IDB ground truth
3. Delete SW-era dead code (`cache-utils.ts` Cache API paths,
   `offline-manager.getCachedFileIds`, unused `getCachedFile`)
4. vitest coverage asserting counter-of-successes semantics
5. Physical device airplane-mode smoke test checklist in SUMMARY

Block the band-onboarding milestone gate on 01.2 landing green.
