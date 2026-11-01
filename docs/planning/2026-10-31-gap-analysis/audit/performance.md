# Audit — Dimension 2: Performance

- **Date:** 2026-10-31
- **Code:** `wt-refresh-r4` @ `1f7c28fe` (branch `refresh/consistency`). Local `.next` build at 19:23, about 11 minutes older than HEAD, close enough for bundle shape.
- **Live:** production `www.centralreform.live` (deployment `dpl_5uXQt3x3zccdx28MkdPhKX8vXEu6`). Chrome DevTools MCP performance trace on a cold load (cache bypassed), emulating a mobile device (412x915 at DPR 2.625, touch), Slow 4G and 4x CPU throttling.
- **Method notes:**
  - The MCP `lighthouse_audit` tool **excludes the performance category**, so LCP, CLS and the insights come from `performance_start_trace`, which uses the same Lighthouse/CrUX insight engine.
  - TBT is approximate: the sum of (long task − 50 ms) after FCP, read from buffered `longtask` entries.
  - There is no CrUX field data for either page.
  - Chromium emulation is not the iPad's WebKit. Throttled 4x CPU is pessimistic against an 11" iPad (M-class or A-class chips), so read the TBT figures as relative.

## Score: **2 / 4 (Partial)**

**Why the score is 2:**
- There is real, deliberate optimisation work:
  - OSMD, react-pdf and pdfjs are dynamic and idle-deferred.
  - Sentry is dynamic.
  - next/font is self-hosted, and the tenant fonts use `preload:false`.
  - `/login` has bundle-size and import-graph regression tests.
  - The perform list is SSR'd, so its LCP is text.
  - There is no `will-change` anywhere, and no layout thrash on hot paths.
  - CLS is near zero.
- But there are clear gaps:
  - **A 587 KB, 1000×1000 JPEG is painted as a 26 px logo on every Perform and app page.**
  - The pdf worker (295 KB) downloads twice on Perform entry.
  - The Perform page burns about 1.5 s of main thread (at 4x) after FCP: hydration plus the eager evaluation of the 1.2 MB OSMD chunk.
  - The `/login` LCP image loses its high fetch priority under Next 16.
  - The editor grid re-renders every row on each focus move.

None of these is catastrophic for 30-row setlists, so the score is not 1. Too many easy wins remain on the band's hot path for a 3.

## Live measurements (production, mobile, Slow 4G, 4x CPU)

| Page | LCP | LCP element | CLS | TBT (approx.) | JS (decoded) |
|---|---|---|---|---|---|
| `/login` | **3.19 s** | logo `<img>` (next/image webp 256w) | 0.00 | ~317 ms (tasks 301/101/65 ms) | 1.36 MB (446 KB transfer) |
| `/perform/setlist/fff7942d…` | **1.83 s** | track title text (SSR) | **0.07** | **~1.5 s** (tasks 425, 487, 228, 224, 162 ms…) | **4.33 MB** (served from `perform-shell-sw.js` cache) |

**`/login` LCP breakdown:**
- TTFB: 52 ms
- Load delay: 591 ms
- Load duration: 2,101 ms
- Render delay: 447 ms

The LCP image was requested at **Priority: Low**, and the `fetchpriority=high` check FAILED. The `/_next/image` response carries `cache-control: public, max-age=0, must-revalidate`.

**`/perform` LCP breakdown:**
- TTFB: 622 ms. DocumentLatency flagged "server responded slowly", with an estimated saving of 521 ms. The navigation was served through the perform shell service worker.
- Render delay: 1,211 ms

**Top opportunities from the trace insights:**
1. **ImageDelivery (perform):** `/logo.jpg` at 1000×1000, 587 KB, displayed at 26×26. Estimated waste: **587 kB**.
2. **DocumentLatency (perform):** TTFB of 622 ms; the estimated FCP/LCP saving is 521 ms.
3. **LCPDiscovery (login):** the LCP image has no `fetchpriority=high`.
4. **CLSCulprits (perform):** a 0.07 shift at about 2.5 s. The list rows (`flex-1 overflow-y-auto`, `.border-b border-rule` rows) are pushed down by content inserted above them after hydration.
5. **LegacyJavaScript:** 36–38 kB of unneeded polyfills/transforms on both pages.
6. **ForcedReflow (login):** 98 ms, unattributed.
7. **RenderBlocking:** one 196 KB (decoded; 29 KB br) global stylesheet. It took 1.8 s on Slow 4G in contention.

**Resources pulled on Perform entry (decoded bytes):**
- OSMD/VexFlow chunk: 1.21 MB
- pdfjs: 396 KB
- Sentry: 378 KB
- Firestore: 236 KB
- react-dom: 200 KB
- `pdf.worker.min.5.4.296.mjs`: **twice** (`script` and `fetch`, 295 KB transfer each)
- 6 chart files precached from `/api/drive/file/*`. This is intended: it is the offline arming.

## Bundle shape (local build, measured with `src/test-utils/per-route-bundle-size.ts`)

| Route | First-load JS raw | gzip (approx.) |
|---|---|---|
| `/login` | 947 KB | ~283 KB |
| `/(main)` dashboard | 1,606 KB | ~450 KB |
| `/(main)/setlists/[id]` (editor) | **1,742 KB** | **~537 KB** (31 chunks; page chunk alone 140 KB) |
| `/perform/setlist/[id]` | the helper reports 722 KB (root files only) | the helper's page-graph extraction appears to miss this route's split chunks (page chunk resolves to 0 KB); the live number above is authoritative |

**Chunk identification:**

| Chunk | Contents | How it loads |
|---|---|---|
| `ec187f67` | 1.2 MB OSMD + VexFlow | dynamic |
| `e092fe44` | 396 KB pdfjs | dynamic |
| `5590` | 392 KB Sentry | dynamic |
| `ac68ffbc` | 236 KB Firestore | |
| `2472` | 129 KB zod + firebase | on `/login` |
| `3905` | cmdk + radix | |
| `336` | Dexie | |

---

## Findings

### P1 — Major

**P1-1. A 587 KB full-resolution logo is painted at 26–32 px on every Perform and app page**
- **Location:**
  - `src/components/nav/OrgLogo.tsx:49` (raw `<img src={logoUrl}>`)
  - rendered by `src/components/nav/MobileHeader.tsx:65` and `DesktopHeader.tsx:143`
  - reached from `src/app/perform/PerformClientLayout.tsx:205`, `src/app/perform/setlist/layout.tsx:31` and the `(main)` layout
  - asset: `public/logo.jpg` (587,084 B, 1000×1000)
- **Impact:**
  - On shul WiFi, every band iPad's first Perform load spends about 0.6 MB, the single largest non-JS resource on the page, competing with the chart precache that arms offline mode.
  - It also decodes a 1000² bitmap for a 26 px circle.
  - The DevTools ImageDelivery insight estimates the waste at 587 kB.
  - `/login` already fixed this ("audit item (i)", `login/page.tsx:131`), but the header path never got the fix.
- **Recommendation:**
  - Render it through `next/image` with `width/height={32}` and `sizes="32px"`, or ship a pre-sized 64/96 px WebP/AVIF (`public/logo-64.webp`), with explicit `width`/`height` attributes.
  - Keep the broslaz monogram branch as it is.
  - Consider statically importing the asset so it gets a hashed, immutable URL (see P2-4).
- **Suggested command:** `/impeccable optimize`

**P1-2. Perform entry runs about 1.5 s of long tasks after FCP (4x CPU), partly from eagerly evaluating the OSMD and pdfjs chunks**
- **Location:** `src/app/perform/PerformClientLayout.tsx:45-99`
  - `startPreload()` runs `import()` for PDFOverlay, PDFViewer, TextScoreViewer, **SmartScoreViewer (OSMD 1.2 MB)** and ImageScoreViewer.
  - It runs on `requestIdleCallback`, or on `setTimeout(2000)` on iOS Safari, which has no rIC.
- **Impact:**
  - `import()` both downloads **and evaluates** each module. The 425 ms task at about 1.1 s is hydration. The 487 ms and 228 ms tasks at about 4.4–5.0 s line up with the warm-up.
  - On iPad Safari the `setTimeout(2000)` fallback fires regardless of idleness. A musician scrolling or tapping the list in seconds 2–5 can hit a frozen main thread (INP).
  - The intent, warming code for offline, is correct, but evaluation isn't needed to cache the bytes.
- **Recommendation:**
  - Warm the bytes without evaluating them: inject `<link rel="modulepreload">` / `prefetch` for the viewer chunk URLs, or let the perform shell service worker precache those chunk URLs. Webpack chunk URLs are discoverable from the build manifest at build time.
  - Alternatively, chain the imports so each yields between them (`await import(a); await yieldToMain(); …`).
  - Warm OSMD only if the setlist actually contains a MusicXML chart.
  - Re-measure INP during the warm window on a real iPad.
- **Suggested command:** `/impeccable optimize`

### P2 — Minor

**P2-1. The pdf.js worker (295 KB) downloads twice on Perform entry**
- **Location:** `src/app/perform/PerformClientLayout.tsx:66-75`
  - `<link rel="modulepreload" crossOrigin="anonymous">` plus `fetch(href, {cache:"force-cache"})`
  - plus `primeOfflineWorker()` (`src/lib/pdf-worker-offline.ts`)
- **Impact:**
  - The live trace shows `pdf.worker.min.5.4.296.mjs` twice, as `script` and as `fetch`, with **294,675 B transferred each**.
  - The modulepreload uses CORS mode and the `fetch` uses a different request mode and credentials, so they don't share the cache entry.
  - The result is about 0.3 MB of wasted shul-WiFi bandwidth per cold entry, on the same critical window as the chart precache.
- **Recommendation:**
  - Pick one path. Fetch once (as `primeOfflineWorker` does for IndexedDB) and derive everything from that response, or drop the "belt-and-suspenders" `fetch`.
  - If the modulepreload stays, make the `fetch` use `mode:"cors", credentials:"same-origin"` so the two match.
- **Suggested command:** `/impeccable optimize`

**P2-2. The `/login` LCP image is not high-priority under Next 16**
- **Location:** `src/app/login/page.tsx:141-149` (`<Image … priority>`)
- **Impact:**
  - In Next 16.2.6, `priority` is an alias of `preload` (`get-img-props.js:584`) and **no longer sets `fetchPriority="high"`**.
  - The trace shows the LCP request at **Priority: Low**, with a load duration of 2.1 s, making a 3.19 s LCP on mobile Slow 4G.
- **Recommendation:**
  - Replace `priority` with `preload` and add `fetchPriority="high"`.
  - Serve a correctly sized image: the drawn box is 96 CSS px, but `w=256` is requested. That is fine for DPR 2.6, but AVIF would roughly halve it.
- **Suggested command:** `/impeccable optimize`

**P2-3. Layout shift of 0.07 on the Perform list after hydration**
- **Location:** `src/app/perform/setlist/[id]/SetlistPerformClient.tsx`. The shifted nodes are the list container `flex-1 overflow-y-auto w-full` and the track rows.
- **Impact:**
  - At about 2.5 s, rows jump down by a few px. Candidates are content that mounts client-side above the list: the offline indicator, the SaveOffline or KeepAwake controls, or the "updated when" line.
  - A musician aiming a tap at a song can hit the wrong row. The score is under the 0.1 threshold but sits on the core tap target.
- **Recommendation:**
  - Identify the inserted node with a `layout-shift` attribution trace.
  - Reserve its height in the SSR markup with a fixed-height slot or `min-h`, or render it as an overlay.
- **Suggested command:** `/impeccable harden`

**P2-4. Perform document TTFB of 622 ms and an uncached image optimizer**
- **Location:** the dynamic SSR of `src/app/perform/setlist/[id]/page.tsx` (`fetchInitialFrame`), and the `next.config.ts` `images` block.
- **Impact:**
  - DocumentLatency flags an estimated 521 ms of FCP/LCP saving.
  - Separately, `/_next/image?url=/logo.jpg` and `/logo.jpg` respond with `cache-control: public, max-age=0, must-revalidate`, so every visit revalidates the logo.
- **Recommendation:**
  - Consider short-lived caching of the public setlist frame: a `revalidate` window or `unstable_cache` keyed by setlist and its `updatedAt`.
  - Add `images.minimumCacheTTL` and long `Cache-Control` headers for `/logo*.{jpg,webp}`, or use a hashed static import.
- **Suggested command:** `/impeccable optimize`

**P2-5. The editor grid re-renders every row on every focus move or keystroke**
- **Location:**
  - `src/components/setlist/grid/SetlistGrid.tsx:465` (`SortableRow`, not memoized)
  - `:1372-1406` (`meta` useMemo)
  - `src/hooks/use-grid-keyboard.ts:61-65` (`isCellFocused` is recreated whenever `focusedCell` changes)
- **Impact:**
  - Each arrow-key or cell focus creates a new `meta` object, and every row and cell (about 30 rows × about 10 cells, plus dnd-kit sortable hooks) re-renders.
  - This is fine on desktop but can be felt as input lag on the iPad editor. The page is also the heaviest route, at 1.74 MB raw / about 537 KB gzip first-load JS.
- **Recommendation:**
  - Pass `focusedCell` as primitives, or read it from a ref or context selector, so `meta` is stable.
  - Wrap `SortableRow` in `React.memo`, comparing the row and its focused/selected flags.
  - Virtualization is **not** needed at setlist sizes (about 30 rows).
- **Suggested command:** `/impeccable optimize`

**P2-6. Sentry loads its whole SDK namespace on every page**
- **Location:** `sentry.client.config.ts` (`import("@sentry/nextjs")`)
- **Impact:**
  - The comment says "~40KB", but the chunk is **378–392 KB decoded** and is fetched on `/login` and `/perform`.
  - It is async, so it doesn't block LCP. It still costs bandwidth and parse time during the Perform warm-up window.
  - `replaysOnErrorSampleRate` is set without a replay integration, which is dead config.
- **Recommendation:**
  - Import the slim browser client (`@sentry/browser` core with only `browserTracingIntegration`), or defer `init` to `requestIdleCallback` after load.
  - Correct the comment.
  - Add the chunk to the bundle-size guard.
- **Suggested command:** `/impeccable optimize`

### P3 — Polish

**P3-1. `/login` uses two large `blur-3xl` decorative blobs**
- **Location:** `src/app/login/page.tsx:42-43`
- **Impact:** two 55–60% viewport circles with a 64 px blur filter. The cost is a one-time paint, since they are static, but heavier on low-end GPUs. The ForcedReflow insight showed 98 ms unattributed on login.
- **Recommendation:** replace them with a pre-rendered radial-gradient background, which needs no filter.
- **Suggested command:** `/impeccable quieter`

**P3-2. `backdrop-blur` on Perform overlays**
- **Location:**
  - `src/components/performance/KeepAwakeBanner.tsx:114,156`
  - `TempoFlash.tsx:86`
  - `SetlistDrawer.tsx`
  - `SmartScoreViewer.tsx` toolbar
  - the `glass-card`/`material-thin` utilities (`globals.css:399-440`)
- **Impact:** these are bounded and small-area, which is acceptable. But backdrop-filter over a live OSMD SVG or PDF canvas forces re-compositing of the blurred region on every scroll frame in WebKit.
- **Recommendation:** on chart-overlay surfaces, prefer an opaque `bg-background/95` and drop the blur.
- **Suggested command:** `/impeccable quieter`

**P3-3. Legacy JS and polyfills (36–38 kB)**
- **Location:** the build target or browserslist.
- **Recommendation:** set a modern `browserslist` (Safari ≥ 16, the iPad fleet) so SWC stops transpiling Baseline features.
- **Suggested command:** `/impeccable optimize`

**P3-4. Font preloads include the Hebrew subset on English pages**
- **Location:** `src/app/layout.tsx:26-29` (Assistant `subsets:["latin","hebrew"]`, preloaded).
- **Impact:** four woff2 files (64 KB) are preloaded on `/login`, including about 22 KB of Hebrew glyphs that an English UI doesn't draw on first paint. The strategy is otherwise good: next/font is self-hosted with swap, and tenant faces use `preload:false`.
- **Recommendation:** preload `latin` only. The Hebrew subset still loads on demand through `unicode-range`.
- **Suggested command:** `/impeccable typeset`

**P3-5. zod is co-bundled into the `/login` graph**
- **Location:** chunk `2472` (129 KB raw), which contains about 470 zod references alongside firebase auth.
- **Recommendation:** trace the client importer of `zod` (`lib/org/config-schema.ts` and `src/env.mjs` are the candidates) and keep the schemas server-only, or import types only.
- **Suggested command:** `/impeccable optimize`

**P3-6. The per-route bundle helper doesn't resolve the `/perform/setlist/[id]` page graph**
- **Location:** `src/test-utils/per-route-bundle-size.ts`
- **Impact:** the page chunk resolves to 0 KB. There is no Perform bundle budget at all, although Perform is the most important route.
- **Recommendation:**
  - Fix the extraction for this route.
  - Add a `perform-bundle-size.test.ts` budget mirroring the login one, including a dynamic-chunk ceiling for OSMD and pdfjs.
- **Suggested command:** `/impeccable harden`

## Checked and clean

- **`will-change`:** zero uses.
- **Layout thrash:** layout reads in hot paths (`use-edge-tap-zones.ts`, the SmartScoreViewer scroll-parent probe) are single reads inside event handlers, not read/write loops.
- **Dynamic imports:** OSMD and pdfjs are correctly dynamic (`PDFOverlay.tsx:24-50`, `PerformClientLayout.tsx:52`), with `ssr:false` where needed, and `PDFOverlay`/`PrintModal` are dynamic in `SetlistPerformClient.tsx`.
- **Server/client split:** the Perform page is a server `page.tsx` that SSRs the initial frame into a client island, so its LCP is text at 1.8 s on Slow 4G with 4x CPU.
- **Lists:** Perform has 304 DOM elements and 29 rows. Virtualization is unnecessary. `SongChartsLibrary` and `SetlistDrawer` already virtualize.
- **Images:** chart images are drawn in the viewer at the chart's own size, which is intended. `ChartThumb` thumbnails are tiny, generated `blob:` URLs, so lazy-loading isn't material.
- **Existing perf guards:** `login-bundle-size.test.ts` (580 KB root budget), `login-full-payload-size.test.ts` and `login-import-graph-regression.test.ts` are good. Extend the same pattern to Perform (P3-6).

## Not verified

- Real iPad WebKit timings, since Chromium emulation was used.
- INP during the warm-up window. This needs an interaction trace on a device.
- Authenticated `/setlists/[id]` live metrics, because the page needs auth. It was assessed from code and the bundle only.
