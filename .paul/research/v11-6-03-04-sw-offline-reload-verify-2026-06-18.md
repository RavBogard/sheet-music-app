# v11.6-03-04 — Perform SW offline-reload verification (WS-30)

**Date:** 2026-06-18 · **Plan:** v11.6-03-04 Task 1 (verify-first; NO prod code) · **Method:** code-trace of `public/perform-shell-sw.js` against deployed master + Phase-01 live-sweep offline cells.

## The SW (recap)
- **`/perform` navigations → `networkFirst`** (122-147): online, `fetch` → `cache.put(request, resp.clone())` for 2xx, return network; offline, `caches.match(request)` → return cached or `Response.error()` (no synthesized shell — cycle-9 ethos).
- **`/_next/static/**` → `cacheFirst`** (150-169): cached on first fetch, immutable hash-named.
- **Pass-through** for everything else (no `event.respondWith`): `/api/*`, Firestore, FCM, Google auth, and any request that is NOT a `/perform` navigation.
- `isPerformNavigation` (107-116): true only when `pathname.startsWith('/perform')` AND (`request.mode === 'navigate'` OR `Accept` includes `text/html`).

## What a FULL RELOAD (F5) of an already-visited `/perform/setlist/<id>` recovers offline

| Resource on reload | Request shape | SW path | Cached during the online visit? | Offline reload result |
|--------------------|---------------|---------|----------------------------------|------------------------|
| The HTML document | `mode: navigate`, `Accept: text/html` | `networkFirst` | **Yes** — the same document request was `cache.put`-cached on the online navigation (same URL incl. query = same cache key) | **Recovers from cache** |
| `/_next/static/**` chunks + CSS + fonts | sub-resource GET | `cacheFirst` | **Yes** for every chunk the page actually fetched online (a reload of the same page needs the same chunks) | **Recovers from cache** |
| Inlined RSC (App Router) | served inside the HTML doc on a hard render | (rides the HTML doc) | n/a — part of the cached document | **Recovers** |

⇒ **A full offline reload of a `/perform` setlist URL the band already opened online RECOVERS today.** The HTML was cached by `networkFirst` and its chunks by `cacheFirst` on the online visit; a same-URL reload re-requests the same keys and hits cache. This matches the Phase-01 live sweep: *"Offline open-chart + offline next-chart nav — live-confirmed working (PDF Song 12→13, text Song 5→6); Saved-offline indicator renders"* (`v11-6-01-stress-triage-REPORT-2026-06-17.md`).

## The genuine residual (what does NOT recover offline)
1. **Soft client-side navigation to a NOT-yet-visited setlist while offline.** A `<Link>` click fetches the RSC payload (`?_rsc=…`, `Accept: text/x-component`, NOT `mode:navigate` / not `text/html`) → `isPerformNavigation` is **false** → pass-through → no cache → fails offline. This is *navigate-to-unvisited-set*, **not a reload**, and it is distinct from open-set next/prev nav (which Phase-01 confirmed works offline via the playback queue + IDB chart bytes).
2. **A chunk required on reload that was never fetched during the online session** — only possible if reload pulls a code-split chunk the original render didn't (rare for the same page; effectively a non-issue for same-URL reload).

WS-30 as filed (OFF-4, `perform-shell-sw.js:122-147`) — *"offline full-reload depends on the SW having cached that track URL during the online session"* — is **accurate but narrow**: the dependency is satisfied for any URL the band actually visited online (which is the whole point of opening the set before going off-site). The uncovered case is soft-nav to an unvisited set offline.

## Verdict
**Full offline RELOAD of a visited `/perform` URL is reliable today.** The residual is the *soft-navigation-to-an-unvisited-setlist-while-offline* edge — uncommon mid-service (the band opens its set before leaving wifi; the "Saved N/N" gate from WS-13 confirms charts are cached), and **open-set reading + next/prev nav already work offline** (Phase-01). The SW is load-bearing with a cycle-9 recovery-loop history (no auto-reload / no synthesized shell / no SW-side IDB). Hardening the residual means caching RSC responses or precaching a shell (hash-named chunks → needs a manifest the SW doesn't carry), touching the load-bearing fetch handler for an uncommon action.

⇒ **Recommendation: ACCEPT the edge and document it** (Decision A). No SW production change.
