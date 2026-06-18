# v11.6-03 Off-site resilience — residual offline-gap verification (against deployed master)

**Date:** 2026-06-18 · **Plan:** v11.6-03-01 Task 1 (verify-first; NO prod code) · **Method:** read each Phase-01 citation on master, classify, assess camp-weekend relevance.

## Baseline (re-confirmed in code, not assumed)
Offline reading **works**. Present and wired on master:
- Scoped Perform service worker `public/perform-shell-sw.js` — `networkFirst` (122-147) falls back to `caches.match` on network failure; `cacheFirst` (150+) for static.
- IndexedDB offline store `@/lib/offline-idb` (`getFile`) consumed by the viewers (Audio confirmed below; PDF/Text per Phase-01 live sweep).
- Mount-time precache `usePerformEntryPrecache` → `prefetchSetlistPDFs` (fires via `queueMicrotask`, online-gated at `navigator.onLine===false`).
- Phase-01 live sweep: open-chart-offline + offline next/prev nav PASSED on a PDF set and a text set; "All charts saved for offline use" indicator rendered.

⇒ Phase 03 is **verify + close narrow residual gaps**, NOT re-introduce offline.

## Gap table

| WS | Pri | Status | Current file:line | Evidence | Camp-relevant? | Cheapest correct fix |
|----|-----|--------|-------------------|----------|----------------|----------------------|
| WS-10 | P1 | **CONFIRMED** | `src/components/music/SmartScoreViewer.tsx:251-253` | OSMD load path does `const res = await fetch(contentToLoad)` for `http`/`blob:`/`/`-prefixed sources — the exact non-IDB-first fetch PDF/Text/Audio were rebuilt away from. Offline → "Failed to fetch score file from URL". | **No** — no `.musicxml/.xml/.mxl` row in the 3 weekend sets (Phase-01). **Forward-risk** (MusicXML is the strategic preferred format, so it'll matter eventually). | Resolve the score bytes IDB-first (`offline-idb getFile(fileId)` → Blob) before falling back to `fetch`, mirroring the AudioViewer/PDF pattern. Then pass the Blob to `osmd.load`. |
| WS-12 | P2 | **CONFIRMED** | `src/app/perform/setlist/[id]/SetlistPerformClient.tsx:190-222` | `errorMessage` (190-200) + the early-return error screen (213-222) have NO `tracks.length > 0` (already-loaded) guard. An offline `onSnapshot` error in incognito/memory-cache mode → the generic "check your connection" screen REPLACES an already-open set. | **Yes** — text sets, offline, mid-service. | Guard the error-screen return: if `tracks.length > 0` (set already hydrated), keep rendering the set (optionally a small non-blocking "reconnecting…" banner) instead of returning the full-screen error. |
| WS-13 | P2 | **CONFIRMED** | `src/hooks/use-perform-entry-precache.ts:72-76` (+ `src/lib/prefetch.ts`) | Precache is best-effort and silently swallowed (`logger.warn`, `.catch` → no surface). Only signal is the soft `PERFORM_PRECACHE_DONE_EVENT` → `SaveOfflineButton` "saved" indicator. No HARD "all N charts saved for offline" pre-departure confirmation. | **Yes** — "know before you leave wifi that every chart is cached." | Surface a definitive readiness count (N-of-N cached) — e.g. promote the SaveOfflineButton state to a clear "All N saved ✓ / M of N saved ⚠" affordance gating confident off-site departure. (UI → /ui-ux-pro-max.) |
| WS-29 | P3 | **MITIGATED (best-effort)** | `src/components/music/AudioViewer.tsx:62-93` | Already tries IDB blob offline (`getFile` → `createObjectURL`) with network fallback; comment acknowledges WebKit may still reject `<audio src=blob:>`. Not "online-only" anymore — residual is the WebKit blob: rejection itself. | **No** — no audio rows in the 3 sets. **Edge.** | None cheap/reliable (WebKit blob:-audio limitation). Leave as best-effort; revisit only if audio rows go off-site. |
| WS-30 | P3 | **CONFIRMED (by design)** | `public/perform-shell-sw.js:122-147` | `networkFirst` offline fallback is `caches.match(request)` — only resolves if that exact URL was cached during the online session; else `Response.error()` (intentional: "no synthesized recovery shell"). | **Partial** — full-reload-while-offline is an uncommon mid-service action; open-set nav already works offline. **Edge.** | Optional: widen what gets cached during the online session (e.g. cache the perform shell + visited track URLs more aggressively). Higher regression risk on a working SW. |

## Read for the decision
- **Only P1 (WS-10) is forward-risk** (no MusicXML this weekend). **The two camp-relevant gaps are WS-12 + WS-13** (text sets, offline). WS-29 is mitigated; WS-30 is a by-design edge.
- Doctrine ("fix what actually breaks against the three real sets") points at **WS-12 + WS-13**.
- The close-scope `checkpoint:decision` (Plan 01 Task 2) chooses how far past that to go.
