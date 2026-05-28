# Perform-shell service worker — design

**Lane:** `c12-fix-perform-shell-cache-sw` (Tier-2 P1)
**Finding:** F-C12-R2-009 — offline page-reload on `/perform/*` returns `net::ERR_FAILED`
**Base:** `af30cd90ff` (origin/master at fire)
**Author:** coder-1, 2026-05-28
**Status:** APPROVED (Daniel via supervisor dispatch + 2 sub-decision Q&A)

## Problem

Cycle-12 run-2 confirmed: chart bytes survive offline in IndexedDB (`crc-offline/files`), but a page-reload while offline returns the browser's generic "no internet" page because no service worker controls the document shell. Cycle-9 (commit `f8d7d06a1a`, 2026-05-17) killed the serwist PWA SW after a recovery-loop incident; the surviving `public/sw.js` is a self-unregistering tombstone with no fetch handler. New browsers register no SW at all unless the user grants notification permission (which only registers `/firebase-messaging-sw.js` for FCM).

## Goal

Re-introduce a narrow service worker that caches the `/perform/*` page shell + its static chunks so an offline page-reload mid-service recovers the document, without re-introducing the cycle-9 recovery loop.

## Non-goals

- Caching `/api/drive/file/[fileId]` chart bytes (already in IndexedDB via `pdf-worker-offline` + `crc-offline/files`).
- Caching admin/library/dashboard surfaces.
- Re-introducing serwist or any PWA build wrapper (`@serwist/next` deps stay installed but inactive).
- Auto-update reload UX (user reloads manually if a stale SW ever blocks).

## Architecture

### New SW: `public/perform-shell-sw.js`

Hand-rolled (no serwist). Lifecycle:

- `install` → `self.skipWaiting()`. No precache step; cache fills lazily on first NetworkFirst/CacheFirst hit.
- `activate` → drop every `perform-shell-v*` cache whose version-suffix ≠ current; `self.clients.claim()`. Old build's cache is purged on every deploy.
- `fetch` → URL filter + strategy router (see below). Anything not in the whitelist returns early WITHOUT `event.respondWith()` so the browser does a normal network fetch with zero SW interference.

**Forbidden:**
- No `controllerchange` handler.
- No `setTimeout(reload, …)`.
- No Firestore IDB access (Cache API only).
- No interaction with `/api/*`, Firestore endpoints, FCM endpoints, Google auth, or any third-party origin.

**Cache version (revised — simpler than original postbuild approach):** The SW reads `?v=<sha>` from its own registration URL at startup and uses that as the cache name suffix. The registration helper appends `?v=${VERSION}` where `VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0,10) ?? 'dev'`. No postbuild file mutation needed — Vercel injects the env var at build time, the helper bakes it into the registration call, and the browser treats different SW URLs as different SWs (so version changes also force re-installation). Cache name pattern: `perform-shell-v${version}`. On `activate`, any cache matching `perform-shell-v*` whose version-suffix ≠ current is deleted.

### Fetch handler URL filter

For clients controlled by this SW (scope `/perform/`), every request the client initiates passes through the fetch handler. The handler routes by URL:

| URL pattern                                     | Strategy        | Notes                                    |
|------------------------------------------------|-----------------|------------------------------------------|
| `/perform`                                     | NetworkFirst    | Landing HTML                             |
| `/perform/setlist/{id}`                        | NetworkFirst    | Setlist HTML                             |
| `/perform/setlist/{id}/track/{trackId}`        | NetworkFirst    | Per-track HTML                           |
| `/perform/{fileId}` (legacy standalone)        | NetworkFirst    |                                          |
| `/_next/static/**` (chunks, CSS, fonts)        | CacheFirst      | Hash-named, immutable per build          |
| Anything else                                  | Pass through    | `return` early, no `event.respondWith()` |

Pass-through means the SW does not call `event.respondWith()`, so the browser handles the request as if no SW were installed for that URL. This is the load-bearing choice that keeps `/api/*`, Firestore endpoints, FCM endpoints, and Google auth completely untouched by the SW.

### Registration: `src/components/performance/perform-shell-sw-register.ts`

Single export `registerPerformShellSW(): void`. Idempotent. Body:

1. Guard: `'serviceWorker' in navigator` — bail otherwise.
2. Guard: `sessionStorage.getItem('perform-shell-sw-registered')` — bail if already fired this tab.
3. Set the sessionStorage flag BEFORE the async work (one-shot, survives reload).
4. `navigator.serviceWorker.register('/perform-shell-sw.js', { scope: '/perform/' })`.
5. On error, `logger.warn` — never throw. Registration failures must not break the page.
6. NO `updatefound` listener, NO `controllerchange` listener, NO reload anywhere.

The sessionStorage one-shot mirrors the pattern from `src/lib/firebase.ts` that fixed the cycle-9 loop: a flag that survives reloads, scoped to the tab, never reset by a `load` event listener.

### Integration: `src/app/perform/layout.tsx`

Existing layout is a client component that mounts `<PdfWorkerPreload />` + `<PerformanceOfflineIndicator />` inside `<main>`. Add one more mounted child:

```tsx
function PerformShellSWBootstrap() {
    useEffect(() => {
        registerPerformShellSW()
    }, [])
    return null
}
```

Inside the existing `<main id="main-content" …>` next to the other islands. Zero changes to the AuthedQueryProvider tree.

### No postbuild script

Replaced by the URL-query-param approach above. `public/perform-shell-sw.js` is a static file with no placeholders; the version flows through the registration URL.

## Tests (TDD-first, per `/superpowers:test-driven-development`)

### POSITIVE: `e2e/perform-offline-reload.spec.ts`

- Online visit to `/perform/setlist/<id>/track/<trackId>` against a real public setlist.
- Wait for SW registration (`navigator.serviceWorker.getRegistration('/perform/')` to be non-null).
- Wait for at least one chart render (chart bytes go to IDB, page bundle goes to cache).
- `goOffline(page)` per `e2e/helpers/gestures.ts:57-72` (route-abort http(s), NOT `context.setOffline(true)` — see existing perform-ipad-offline.spec.ts for the why).
- `page.reload({ waitUntil: 'domcontentloaded' })`.
- Assert page shell HTML renders (`<h1>` setlist heading visible).
- Assert at least one chart byte-signature appears (`canvas, svg, img, audio`).
- `goOnline(page)`.

Runs under `--project=ipad-webkit-landscape` AND `--project=chromium` for engine cross-check.

### NEGATIVE: `e2e/perform-shell-sw-no-recovery-loop.spec.ts`

- Online visit to `/perform/setlist/<id>` with console listener installed BEFORE navigation.
- Wait for SW registration.
- Reload 5 times over ~10 seconds with `page.reload({ waitUntil: 'domcontentloaded' })`.
- Assert no console line matching `/\[FirestoreRecovery\]/`.
- Assert no `DOMContentLoaded` re-fire <2 seconds after the previous DOMContentLoaded (would indicate an auto-reload was triggered between user-driven reloads).
- Assert `navigator.serviceWorker.controller` stays the same SW URL throughout (no flap).

Runs under both projects.

## Out of `serviceWorkers: 'block'` regression

The existing `perform-ipad-pwa-fresh-install.spec.ts` asserts `swRegistrations === 0` under `test.use({ serviceWorkers: 'block' })`. That assertion will hold post-fix because the block prevents the `register` call from succeeding — the new code is opt-in via a fresh-registration call, not a hardcoded inclusion in the page bytes. Verified by reading the cold-boot assertion logic before design.

## Risks + mitigations

1. **Race with `/sw.js` tombstone scope.**
   *Risk:* If a legacy browser still has the serwist SW registered at scope `/`, registering a new SW at scope `/perform/` happens in the same tab.
   *Mitigation:* Service workers are scope-keyed — `/` and `/perform/` are independent. No conflict.
   *Verification:* Manual test in a browser w/ a stubbed legacy SW (devtools "Update on reload" + force-install).

2. **NetworkFirst HTML returning a 5xx that gets cached.**
   *Risk:* If origin returns a 5xx during the online visit, NetworkFirst caches the error.
   *Mitigation:* Only cache responses with `response.ok === true` (2xx). Failed responses pass through to the natural error path.

3. **`CacheFirst` for a chunk URL that 404s on first hit.**
   *Risk:* Cache poisoning by a 404.
   *Mitigation:* Only cache responses with `response.ok && response.status === 200`. Same guard.

4. **Activate-event taking too long during deploy purge.**
   *Risk:* If old caches are huge, `caches.delete()` could stall activate.
   *Mitigation:* Cache is bounded by what NetworkFirst/CacheFirst lazily fills for `/perform/*` only — empirically tens of MB at most. `Promise.all` parallelizes the deletes.

5. **Tests flake on slow CI when waiting for SW registration.**
   *Mitigation:* `waitForRegistration(page, timeout: 10s)` helper added to `e2e/helpers/gestures.ts` IF needed; otherwise direct `await page.waitForFunction()` with explicit timeout.

## Acceptance criteria (mirrors dispatch)

1. ✅ Open `/perform/setlist/<id>/track/<trackId>` online → `goOffline()` → `page.reload()` → page shell renders + chart bytes load from IDB.
2. ✅ Open same route → reload 5× → no recovery loop, no auto-redirect, no console floods.
3. ✅ Tombstone `public/sw.js` unchanged (file diff = 0 lines).
4. ✅ Scope-bounded — `/library`, `/admin`, `/setlists` continue to NetworkFirst-direct without any caching by the new SW. Verified by absence-of-cache-write in NEGATIVE test.
5. ✅ Build manifest contains only perform routes + chunks they reference; no admin/library bloat. Verified by `next build` output inspection (no new precache step).
6. ✅ Standard gates pass: tsc 0 / eslint 0 / vitest 0 fail / next build / Playwright at `ipad-webkit-landscape` + `chromium`.

## Out of scope (queued for follow-ups)

- A standalone "Open offline" PWA install prompt.
- Update notifications when a new SW activates.
- Cache pre-warming for setlists user hasn't visited yet.
- Cleanup of the inactive `@serwist/next` deps (separate package.json hygiene lane).
