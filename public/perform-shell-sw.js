// Perform-shell service worker (re-introduced 2026-05-28 for F-C12-R2-009).
//
// Purpose: cache the /perform/* page shell + its Next.js static chunks so
// an offline page-reload mid-service recovers the document. Chart bytes are
// cached separately in the crc-offline IndexedDB store (existing plumbing);
// this SW only handles the HTML + JS/CSS/font bundle layer.
//
// Structurally distinct from the killed serwist SW (2026-05-17,
// f8d7d06a1a) — different filename (/perform-shell-sw.js vs /sw.js),
// different cache namespace (perform-shell-v* vs serwist-*), different
// registration site (src/components/performance/perform-shell-sw-register.ts
// fired only on /perform/* visits). The /sw.js tombstone is preserved
// untouched for legacy-browser cleanup.
//
// Hard constraints (enforced by code shape, not comments):
//   1. No `controllerchange` handler that auto-reloads. Updates apply on
//      next natural navigation. (cycle-9 controllerchange-reload was a
//      load-bearing site of the recovery loop.)
//   2. No setTimeout-reload anywhere. (cycle-9 setTimeout(reload, 1500)
//      was the inner loop step.)
//   3. No Firestore IDB access — only Cache API. (cycle-9 IDB clear from
//      the SW kicked off the Firestore-shutdown cascade.)
//   4. Pass-through (no event.respondWith) for any URL outside the
//      whitelist below — never intercepts /api/*, Firestore endpoints,
//      Google auth, FCM, or any third-party origin.
//
// Cache version comes from the SW's own URL `?v=<sha>` query param,
// injected by the registration helper at register time. Different
// version = different cache name + different SW identity (browser treats
// distinct URLs as distinct SWs), so a deploy invalidates both the SW
// install and the cache.

const SW_URL = new URL(self.location.href)
const SW_VERSION = SW_URL.searchParams.get('v') || 'unversioned'
const CACHE_NAME = `perform-shell-v${SW_VERSION}`
const CACHE_PREFIX = 'perform-shell-v'

self.addEventListener('install', (event) => {
    // Skip waiting so a new SW activates on the next page load instead of
    // sitting in `waiting` until every controlled tab closes. This is safe
    // here because the SW is scope-limited to /perform/ and uses
    // NetworkFirst for HTML (so any stale-vs-fresh divergence resolves on
    // first online navigation).
    event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // Drop every prior perform-shell-v* cache. The current build's
            // cache (CACHE_NAME) is freshly created — anything else is
            // from a prior deploy and must go.
            try {
                const names = await caches.keys()
                await Promise.all(
                    names
                        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                        .map((name) => caches.delete(name)),
                )
            } catch {
                // Cache API can throw in restricted-storage contexts. Failing
                // to purge old caches is non-fatal; the next deploy will try
                // again. Do not auto-reload, do not surface to user.
            }
            // Take control of any /perform/* clients already open so they
            // start using this SW immediately (otherwise they'd need a
            // navigation to bind). Safe here because we don't have any
            // controllerchange handler that would auto-reload in response.
            try {
                await self.clients.claim()
            } catch {
                // Same defensive shrug — claim() failures are non-fatal.
            }
        })(),
    )
})

self.addEventListener('fetch', (event) => {
    const request = event.request

    // Only handle GET. POST/PUT/DELETE etc. always go to the network —
    // caching mutations would be dangerous.
    if (request.method !== 'GET') return

    // Same-origin only. Third-party requests (Google auth, fonts.gstatic,
    // analytics, etc.) always pass through to the network.
    const url = new URL(request.url)
    if (url.origin !== self.location.origin) return

    // Strategy routing:
    //   - /perform[/...] HTML navigations → NetworkFirst (with cache fallback)
    //   - /_next/static/** chunks/CSS/fonts → CacheFirst (hash-named immutable)
    //   - Anything else → pass through, no SW interception
    if (isPerformNavigation(url, request)) {
        event.respondWith(networkFirst(request))
        return
    }
    if (isNextStatic(url)) {
        event.respondWith(cacheFirst(request))
        return
    }
    // Pass-through: do NOT call event.respondWith(). The browser handles
    // the request as if this SW weren't installed. Load-bearing for
    // /api/*, Firestore endpoints, FCM, Google auth.
})

function isPerformNavigation(url, request) {
    if (!url.pathname.startsWith('/perform')) return false
    // Navigation requests have `mode: 'navigate'` OR an `Accept: text/html`
    // header. Cover both — some sub-resource requests for /perform/* URLs
    // (rare, but theoretically a fetch() call) should pass through.
    if (request.mode === 'navigate') return true
    const accept = request.headers.get('accept') || ''
    if (accept.includes('text/html')) return true
    return false
}

function isNextStatic(url) {
    return url.pathname.startsWith('/_next/static/')
}

async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request)
        // Only cache 2xx — never cache 4xx/5xx error pages (cache
        // poisoning by 404 was a foot-gun in the serwist setup).
        if (networkResponse && networkResponse.ok) {
            try {
                const cache = await caches.open(CACHE_NAME)
                await cache.put(request, networkResponse.clone())
            } catch {
                // Cache write failure is non-fatal — return the network
                // response regardless.
            }
        }
        return networkResponse
    } catch {
        // Network failed (offline, abort, DNS, etc.). Try the cache.
        const cached = await caches.match(request)
        if (cached) return cached
        // No cache fallback — propagate a real network-error response
        // shape. The browser will paint its own error page; no in-app
        // fallback shell. This is intentional — the cycle-9 fix said
        // "nothing reloads without user input", same ethos: nothing
        // synthesizes a recovery shell, either.
        return Response.error()
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request)
    if (cached) return cached
    try {
        const networkResponse = await fetch(request)
        if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
            try {
                const cache = await caches.open(CACHE_NAME)
                await cache.put(request, networkResponse.clone())
            } catch {
                // Same shrug — return network response even if cache
                // write fails.
            }
        }
        return networkResponse
    } catch {
        // Offline + no cache entry for this chunk. Propagate the error.
        return Response.error()
    }
}
