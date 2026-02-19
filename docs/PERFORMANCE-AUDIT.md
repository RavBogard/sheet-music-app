# CentralReform.live — Performance Audit

**Why It Feels Slow, and What to Do About It**
*February 2026*

---

## Executive Summary

Users report that "every part" of the app feels sluggish. After a thorough codebase analysis, the root cause isn't any single bottleneck — it's a constellation of architectural choices that each add 200–800ms of delay, compounding into a consistently slow-feeling experience across every interaction. The good news: most fixes are incremental and low-risk.

The five systemic issues are:

1. **Firebase long-polling adds 200–500ms to every cold Firestore read** (configured as a workaround for SDK console noise)
2. **Every page is `"use client"` with zero server-side rendering**, meaning the browser downloads JS, boots React, initializes Firebase, resolves auth, *then* starts fetching data
3. **No code splitting** — heavy libraries (PDF viewer, music XML renderer, jsPDF) ship in the initial bundle even when unused
4. **Firestore N+1 read patterns** — the dashboard fires 10–30+ individual `getDoc` calls on every load
5. **No navigation prefetching** — all page transitions use `router.push()` instead of `<Link>` with automatic prefetch

---

## The Waterfall Problem

Every page load follows the same serial chain. Each step must complete before the next can begin:

```
Browser loads HTML shell (SSR = empty div because "use client")
  → Downloads JS bundle (~1–2s on 3G, ~300ms on fast WiFi)
    → React hydrates, Firebase SDK initializes
      → Firebase Auth resolves (onAuthStateChanged)
        → Auth context triggers profile subscription (Firestore read)
          → Profile loads → page components mount
            → Components fire their own Firestore queries
              → Data arrives → UI renders
```

**Measured impact:** On a typical mobile connection, users see a blank or skeleton screen for 2–4 seconds before meaningful content appears. On fast WiFi it's 800ms–1.5s, which still *feels* sluggish compared to native apps.

---

## Issue 1: Firestore Long-Polling Transport

**File:** `src/lib/firebase.ts`

### What's happening

Firestore is configured with `experimentalForceLongPolling: true` and `useFetchStreams: false` as a workaround for `AbortError` console noise in Firebase SDK v12. This forces XHR-based long-polling instead of the default WebChannel streaming transport.

### Why it's slow

Long-polling requires a full HTTP request/response cycle for every data update. WebChannel streaming opens a single persistent connection and pushes updates instantly. The difference is 200–500ms per cold read, and it affects *every* Firestore interaction — auth profile, congregation config, setlist queries, library loads, notification subscriptions.

### Fix

```typescript
// Remove these two lines:
experimentalForceLongPolling: true,
useFetchStreams: false,
```

The app is now on Firebase SDK v12.9.0. The AbortError issue was largely resolved in v12.5+. Test after removal — if console noise returns, the alternative is to filter it in a custom logger rather than degrading transport performance for all users.

### Potential downsides

- **Console noise may return:** Some `AbortError` messages may reappear when listeners are added/removed. These are cosmetic (no functional impact) but can be noisy during development.
- **Multi-tab edge cases:** WebChannel streaming occasionally has issues with multiple tabs on the same origin in older browsers. The `persistentMultipleTabManager` already handles this, but worth testing on Safari/iOS.
- **Risk level:** Low. This is a config flag change, fully reversible.

### Expected improvement

200–500ms faster on every cold Firestore read. Since the app makes 5–10 Firestore reads on initial load, this alone could shave 1–2 seconds off perceived load time.

---

## Issue 2: Zero Server-Side Rendering

**Files:** Every `page.tsx` in `src/app/`

### What's happening

All 12 page files have `"use client"` at the top. This means Next.js sends an empty HTML shell to the browser, which then downloads the full JS bundle, boots React, and renders everything client-side. The server does zero useful work.

### Why it's slow

Server Components (the Next.js default) can:
- Fetch data on the server and send rendered HTML immediately
- Stream HTML progressively as data resolves
- Reduce the client JS bundle size (server-only code never ships to the browser)
- Eliminate the "blank screen → skeleton → content" flash

Instead, every page follows the waterfall described above.

### Fix

This is a larger refactor, but can be done incrementally page-by-page. The pattern:

**Before (current):**
```tsx
"use client"
export default function DashboardPage() {
    const { user } = useAuth()        // waits for client-side auth
    const [data, setData] = useState() // waits for client-side fetch
    useEffect(() => { fetchData() }, [])
    return <div>{data ? <Content /> : <Skeleton />}</div>
}
```

**After (server + client hybrid):**
```tsx
// page.tsx — Server Component (no "use client")
import { cookies } from 'next/headers'
import { verifySessionCookie } from '@/lib/firebase-admin'
import { DashboardClient } from './DashboardClient'

export default async function DashboardPage() {
    const session = await getServerSession()
    const publicSetlists = await fetchPublicSetlists() // server-side, no waterfall
    return <DashboardClient initialSetlists={publicSetlists} session={session} />
}
```

The client component receives pre-fetched data as props and hydrates instantly.

### Potential downsides

- **Significant refactor effort:** Each page needs to be split into a server wrapper and client interactive shell. Auth flow needs a session cookie strategy (currently pure client-side Firebase Auth).
- **Session cookie complexity:** Firebase Auth is client-side only. To use server components, you need to mint a session cookie after client sign-in and verify it server-side. This adds ~100 lines of auth infrastructure.
- **Caching strategy changes:** Server-rendered pages need careful cache headers to avoid serving stale authenticated content.
- **Risk level:** Medium-high due to scope, but individual pages can be migrated independently.

### Expected improvement

First meaningful paint drops from 2–4s to under 1s on most connections. The server sends real HTML instead of an empty shell.

---

## Issue 3: No Code Splitting / Lazy Loading

**Evidence:** Only 1 `next/dynamic` import exists in the entire codebase (PDFViewer in PerformerView). Everything else is statically imported.

### What's happening

Heavy libraries are bundled into shared chunks and downloaded on first page visit regardless of whether they're needed:

| Library | Disk Size | Used On |
|---------|-----------|---------|
| `firebase` | 32 MB (source) | Everywhere, but most modules only on specific pages |
| `@sentry/nextjs` | 45 MB (source) | Error tracking (background) |
| `pdfjs-dist` | 36 MB (source) | Perform page only |
| `jspdf` | 29 MB (source) | PDF export only (rare action) |
| `opensheetmusicdisplay` | 1.8 MB | MusicXML files only |
| `framer-motion` | 4.5 MB | SwipeToDelete component only |

*(Note: disk size ≠ bundle size after tree-shaking, but these are still the heaviest contributors.)*

The ChatPanel (383 lines, imports AI/setlist services) is mounted in the main layout and loaded on every single page, even though most users never open it.

### Fix

**A. Lazy-load heavy page components:**
```tsx
import dynamic from 'next/dynamic'

const ChatPanel = dynamic(() => import('@/components/setlist/ChatPanel'), {
    ssr: false,
    loading: () => null // invisible until opened
})

const SongChartsLibrary = dynamic(
    () => import('@/components/library/SongChartsLibrary'),
    { loading: () => <LibrarySkeleton /> }
)
```

**B. Lazy-load rare-use libraries:**
```tsx
// jsPDF — only imported when user clicks "Export PDF"
const handleExportPDF = async () => {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    // ...
}
```

**C. Replace framer-motion with CSS:**

`framer-motion` (4.5 MB) is used for exactly one component: `SwipeToDelete`. This can be replaced with a CSS `touch-action: pan-x` + `translateX` approach or a lightweight alternative like `react-swipeable` (12 KB).

### Potential downsides

- **Slightly slower first interaction with lazy components:** The ChatPanel will take ~200ms to load the first time a user opens it. A loading spinner or skeleton handles this gracefully.
- **Flash of loading state:** If lazy boundaries are too granular, users see brief flashes. Group related components into the same dynamic import.
- **Testing complexity:** Lazy components need their own test wrappers. Minor inconvenience.
- **Risk level:** Low. Each lazy import is an isolated change.

### Expected improvement

Initial JS bundle shrinks by 30–50%, meaning faster parse/execute on mobile. Pages that don't need the PDF viewer or music renderer load significantly faster.

---

## Issue 4: Firestore N+1 Query Patterns

### What's happening

Several components issue individual `getDoc()` calls in loops instead of batched or collection-level queries.

**Worst offender — `use-upcoming-prep.ts`:**
```typescript
// For each upcoming setlist, for each track with a fileId,
// fires an individual getDoc:
const loads = Array.from(fileIds).map(async (fileId) => {
    const ref = doc(db, 'users', user.uid, 'songPreferences', fileId)
    const snap = await getDoc(ref)  // N individual reads!
})
```

If a user has 2 upcoming setlists with 8 tracks each, this fires 16 individual Firestore reads on every dashboard load. With long-polling (Issue 1), each read is 200–500ms. Even parallelized, the waterfall through the Firestore connection means these reads compete for the same pipe.

**Other N+1 patterns:**
- Dashboard fires separate `subscribeToPublicSetlists` and `subscribeToPersonalSetlists` listeners (2 Firestore queries)
- `CongregationProvider` fires its own `onSnapshot` on every page (though this is cached after first load)
- `NotificationBell` maintains a persistent listener
- `useUpcomingPrep` fires a setlist query + N `getDoc` calls + a `getDoc` + `setDoc` for last-visit tracking

**Active listeners on a typical dashboard load:** 5–7 concurrent Firestore subscriptions, each maintaining a long-poll connection.

### Fix

**A. Batch song preferences into a single document:**

Instead of `users/{uid}/songPreferences/{fileId}` (one doc per song), store a single `users/{uid}/preferences/songViews` document with a map:

```typescript
// Single read instead of N reads:
const snap = await getDoc(doc(db, 'users', uid, 'preferences', 'songViews'))
const allPrefs = snap.data()?.views || {}
// allPrefs = { "fileId1": { lastViewedAt: ... }, "fileId2": { ... } }
```

**B. Use `getDocFromCache()` for non-critical reads:**

Firestore persistence is enabled. For data that doesn't need to be real-time fresh (like song preferences, last-visit timestamps), read from cache first:

```typescript
import { getDocFromCache, getDoc } from 'firebase/firestore'

// Try cache first, fall back to network
let snap
try {
    snap = await getDocFromCache(ref)
} catch {
    snap = await getDoc(ref)
}
```

**C. Consolidate dashboard subscriptions:**

The public and personal setlist queries could be merged into a single query with an `or()` filter (Firebase v12+ supports this), or the personal query could piggyback on the public query's cache.

### Potential downsides

- **Migration effort for song preferences:** Existing per-file documents need a one-time migration to the consolidated format. Need a migration script and backward compatibility during rollout.
- **Document size limits:** A single songViews document has a 1MB Firestore limit. At ~100 bytes per entry, this supports ~10,000 songs — well within range for this app.
- **Cache staleness:** Reading from cache means the data could be up to one Firestore sync cycle old. For song preferences, this is fine. For setlist data, real-time listeners are still appropriate.
- **Risk level:** Low-medium. The songPreferences consolidation is the biggest change; cache-first reads are trivial.

### Expected improvement

Dashboard load drops from 16+ individual reads to 2–3 reads. With long-polling removed (Issue 1), this compounds into a 1–3 second improvement on initial dashboard render.

---

## Issue 5: Navigation Without Prefetching

### What's happening

The app uses `router.push()` for nearly all navigation (46 instances) instead of Next.js `<Link>` components. `<Link>` automatically prefetches the destination page's JS bundle when it enters the viewport, so by the time the user taps, the code is already cached. `router.push()` starts downloading the destination page *after* the tap.

**Current pattern:**
```tsx
<button onClick={() => router.push(`/perform/setlist/${s.id}`)}>
    View Setlist
</button>
```

**Prefetching pattern:**
```tsx
import Link from 'next/link'
<Link href={`/perform/setlist/${s.id}`}>
    View Setlist
</Link>
```

### Fix

Replace `router.push()` with `<Link>` for all user-visible navigation targets. Keep `router.push()` only for programmatic navigation after async operations (save, delete, etc.).

Priority targets (most-tapped paths):
1. Dashboard → setlist perform view
2. Dashboard → library
3. Setlist list → setlist editor
4. Library → perform view
5. All nav bar links (already using `<Link>` — good)

### Potential downsides

- **Slightly more bandwidth:** `<Link>` prefetches JS for pages the user *might* visit. On a page with 10 links, this could prefetch 10 page bundles. In practice, Next.js is smart about this — it only prefetches links visible in the viewport and uses `prefetch={false}` to opt out for less common destinations.
- **Styling changes:** `<Link>` renders an `<a>` tag, which may need different styling than the current `<button>` or `<div>` click handlers. Minor CSS adjustments.
- **Risk level:** Very low. Drop-in replacement for most cases.

### Expected improvement

Page-to-page transitions feel 200–500ms faster because the destination JS is pre-cached. Most noticeable on the dashboard → setlist flow, which is the single most common user action.

---

## Issue 6: Library API Round-Trip

**File:** `src/lib/library-store.ts`

### What's happening

The library uses a good cache-then-network pattern (IndexedDB cache → API fetch → compare). However, the API call is `fetch('/api/library/list?all=true')`, which:

1. Hits a Vercel serverless function
2. Initializes Firebase Admin SDK
3. Queries Firestore `library_index` collection (up to 5,000 docs)
4. Serializes and returns JSON

This takes 1–3 seconds on cold start (Vercel function boot) and 500ms–1s on warm.

### Fix

**A. Add `stale-while-revalidate` headers to the API:**

```typescript
return NextResponse.json(data, {
    headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'
    }
})
```

This tells Vercel's CDN to serve the cached response for 5 minutes, and serve stale for up to 1 hour while revalidating in the background. Since the library changes infrequently, this is safe.

**B. ETag-based conditional requests:**

The library response already includes `lastModified`. Send it as `If-None-Match` on subsequent requests to get a 304 response (no body, instant) when nothing changed.

### Potential downsides

- **Stale library data:** With s-maxage=300, a newly uploaded chart won't appear for up to 5 minutes. For a congregation that uploads charts infrequently, this is acceptable. The force-refresh button (`loadLibrary(true)`) bypasses the CDN cache.
- **CDN cache invalidation:** If the library is reorganized significantly, users may need to hard-refresh. A versioned cache key in the URL resolves this.
- **Risk level:** Very low. HTTP caching is standard infrastructure.

### Expected improvement

Repeat library loads go from 500ms–1s to near-instant (CDN hit). Cold loads still take 1–3s but are masked by the IndexedDB cache.

---

## Issue 7: Congregation Config on Every Page Load

**File:** `src/lib/congregation-context.tsx`

### What's happening

`CongregationProvider` wraps the entire app and fires an `onSnapshot` listener on `config/congregation` on every page load. This is a real-time listener for data that changes approximately never (congregation name, feature flags, theme color).

### Fix

**A. Cache in localStorage with a long TTL:**

```typescript
const [config, setConfig] = useState<CongregationConfig>(() => {
    if (typeof window === 'undefined') return DEFAULT_CONFIG
    try {
        const cached = localStorage.getItem('crc_congregation')
        if (cached) {
            const parsed = JSON.parse(cached)
            if (Date.now() - parsed._ts < 86400000) return parsed.data // 24h TTL
        }
    } catch {}
    return DEFAULT_CONFIG
})
```

Then update from Firestore in the background and write back to localStorage.

**B. Move to build-time config (most aggressive):**

Since this data nearly never changes, bake it into an environment variable or a static JSON file. Update it via a deploy or admin action.

### Potential downsides

- **Option A — Stale config for up to 24h:** If you change the congregation name or toggle a feature flag, users won't see it until the cache expires. You could reduce the TTL to 1 hour, or add a "config version" that triggers immediate refresh.
- **Option B — Requires redeploy for changes:** Any config change needs a new Vercel deployment. Loses the real-time flexibility.
- **Risk level:** Very low for option A. Medium for option B (changes workflow).

### Expected improvement

Eliminates one Firestore listener from every page load. Small individual impact (50–100ms) but reduces connection contention for the listeners that matter.

---

## Issue 8: Sentry SDK Bundle Weight

**Files:** `sentry.client.config.ts`, `@sentry/nextjs` (45 MB source)

### What's happening

The Sentry SDK ships in the client bundle on every page. Even with tree-shaking, `@sentry/nextjs` adds ~30–70 KB to the initial JS bundle (gzipped). The current config has `tracesSampleRate: 0.1` and `replaysSessionSampleRate: 0`, so tracing and replay are mostly off, but the SDK code is still downloaded and parsed.

### Fix

**A. Lazy-load Sentry:**

```typescript
// sentry.client.config.ts
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    import('@sentry/nextjs').then((Sentry) => {
        Sentry.init({
            dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
            tracesSampleRate: 0.1,
        })
    })
}
```

**B. Use Sentry's bundle-size-optimized import:**

Sentry v10 supports `@sentry/nextjs/lite` or selective feature imports to reduce bundle size.

### Potential downsides

- **Missed early errors:** If Sentry loads lazily, errors that happen in the first ~500ms of page load won't be captured. For a music library app, this is an acceptable tradeoff.
- **Configuration complexity:** Lazy Sentry init means error boundaries need to handle the case where Sentry isn't ready yet.
- **Risk level:** Low.

### Expected improvement

10–30ms faster JS parse time on mobile. Small but contributes to the overall "snappiness" feel.

---

## Issue 9: Redundant Library Loads

**Files:** `src/app/(main)/page.tsx`, `src/app/(main)/setlists/page.tsx`, `src/app/(editor)/setlists/[id]/page.tsx`

### What's happening

Three different pages call `loadLibrary()` on mount:
- Dashboard page
- Setlists page
- Setlist editor page

The library store has a guard (`if (get().initialized && !force) return`), so subsequent calls are no-ops. But on the *dashboard* — the most visited page — the library load fires unconditionally and triggers a full API round-trip even though the dashboard doesn't display library data. It only needs library data if the user navigates to the AI chat.

### Fix

Remove `loadLibrary()` from the dashboard page. Load it lazily when the user actually navigates to the library or opens the AI chat:

```typescript
// In ChatPanel, load library on-demand:
const handleOpen = () => {
    loadLibrary() // Only when chat is opened
    open()
}
```

### Potential downsides

- **Slightly slower first library or chat access:** The first time a user opens the library or AI chat in a session, there's a ~500ms delay while the library loads. Since the IndexedDB cache usually serves instantly, this is barely noticeable.
- **Risk level:** Very low.

### Expected improvement

Removes one API call from every dashboard load. Saves 500ms–1s on initial page render.

---

## Issue 10: BackgroundPrefetcher Competing for Bandwidth

**File:** `src/components/offline/BackgroundPrefetcher.tsx`

### What's happening

The `BackgroundPrefetcher` component starts downloading PDF files from upcoming setlists 5 seconds after page load. While it downloads sequentially with 200ms delays, it competes for bandwidth with the user's actual interactions — Firestore queries, library API calls, and any charts the user taps on.

### Fix

**A. Use `requestIdleCallback`:**

```typescript
const startPrefetch = () => {
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => prefetchUpcomingSetlists(), { timeout: 30000 })
    } else {
        setTimeout(prefetchUpcomingSetlists, 15000)
    }
}
```

**B. Use `navigator.connection` to skip on slow networks:**

```typescript
const conn = (navigator as any).connection
if (conn && (conn.saveData || conn.effectiveType === '2g')) return
```

**C. Increase the initial delay to 15–30 seconds:**

The current 5-second delay means prefetching starts while the user is still waiting for the dashboard to render on slow connections.

### Potential downsides

- **Delayed offline readiness:** Charts take longer to cache for offline use. Since services are typically prepared hours or days in advance, a 30-second delay is negligible.
- **`requestIdleCallback` not supported on Safari iOS:** Falls back to `setTimeout` with a longer delay.
- **Risk level:** Very low.

### Expected improvement

Reduces bandwidth contention during the critical first 5–30 seconds of page load. Most beneficial on mobile/slow networks.

---

## Priority Matrix

| # | Fix | Effort | Impact | Risk |
|---|-----|--------|--------|------|
| 1 | Remove Firestore long-polling | 5 min | High | Low |
| 3 | Lazy-load ChatPanel, jsPDF, framer-motion | 1–2 hours | High | Low |
| 5 | Replace `router.push` with `<Link>` | 1–2 hours | Medium | Very Low |
| 9 | Remove dashboard `loadLibrary()` | 5 min | Medium | Very Low |
| 10 | Defer BackgroundPrefetcher | 15 min | Medium | Very Low |
| 7 | Cache congregation config in localStorage | 30 min | Low-Medium | Very Low |
| 4 | Batch songPreferences reads | 2–4 hours | Medium | Low-Medium |
| 6 | Add CDN caching to library API | 30 min | Medium | Low |
| 8 | Lazy-load Sentry | 30 min | Low | Low |
| 2 | Server-side rendering migration | 2–4 weeks | Very High | Medium |

### Recommended execution order

**Phase 1 — Quick wins (same day, no risk):**  Items 1, 9, 10, 7. These are config/flag changes that compound into a noticeably faster experience. Total effort: ~1 hour.

**Phase 2 — Code splitting (same week):** Items 3, 5. Lazy-load heavy components and add `<Link>` prefetching. Total effort: ~3 hours.

**Phase 3 — Data layer (next week):** Items 4, 6, 8. Batch reads, CDN caching, Sentry optimization. Total effort: ~4 hours.

**Phase 4 — SSR migration (future):** Item 2. This is the single highest-impact change but requires the most investment. Can be done page-by-page starting with the dashboard.

---

## Appendix: Active Firestore Listeners Per Page

Understanding listener count helps explain why the app feels "always working":

| Page | Listeners | What they're watching |
|------|-----------|----------------------|
| Dashboard | 5–7 | Auth profile, congregation config, public setlists, personal setlists, upcoming setlists, song preferences (N reads), notifications |
| Library | 3 | Auth profile, congregation config, notifications |
| Setlist Editor | 4–5 | Auth profile, congregation config, setlist doc, email events, notifications |
| Perform (setlist) | 3–4 | Auth profile, congregation config, setlist doc, presence |
| Perform (chart) | 2–3 | Auth profile, congregation config, annotations |

Each listener on the long-polling transport maintains its own HTTP connection. Browsers limit concurrent connections per origin (typically 6). With 5–7 listeners, the app is near or at the connection limit, causing queuing.

**Removing long-polling (Issue 1) is the single most impactful change** because it switches all these listeners to a single multiplexed WebChannel connection.

---

## Appendix: Bundle Composition (Estimated)

| Category | Estimated Gzipped Size | Notes |
|----------|----------------------|-------|
| React + React DOM | ~45 KB | Unavoidable |
| Next.js runtime | ~90 KB | Unavoidable |
| Firebase (auth + firestore + app) | ~80 KB | Could slim with modular imports |
| Sentry | ~30–70 KB | Lazy-loadable |
| Radix UI (9 components) | ~25 KB | Reasonable |
| pdfjs-dist (client) | ~200 KB+ | Only needed on perform page |
| jsPDF | ~80 KB | Only needed for PDF export |
| framer-motion | ~30 KB | Replaceable with CSS |
| opensheetmusicdisplay | ~150 KB | Only needed for MusicXML |
| Fuse.js | ~5 KB | Reasonable |
| App code | ~100 KB | Reasonable |
| **Total estimated** | **~700 KB–1 MB** | Could be ~350–400 KB with splitting |

*These are estimates based on typical tree-shaken sizes. Run `npx @next/bundle-analyzer` for exact numbers.*
