# Hypotheses — `ipad-stuck-spinner-characterization` (F-2 from `ipad-webkit-prod-sweep`)

**Lane:** `ipad-stuck-spinner-characterization` (Tier-0 research, NO code fix).
**Source of bug:** `ipad-webkit-prod-sweep/FINDINGS.md` §F-2 — Shavuot Yizkor 5/23 `perform-ipad-real-setlists.spec.ts` walks 13 bonded charts on iPad WebKit portrait (820×1180); rows 1–12 RENDER; row 13 FAILS with `no render signature, audio-bond, or error within 25s (stuck spinner?)`. Failure repeats on retry with a DIFFERENT fileId (`6ca6e82c-…` vs `12JfLCHy…`) → **position-bound, not chart-bound.**

**What the spec does not tell us:** which subsystem times out. The 25s timeout in `classifyCurrent()` is a binary signal (saw a render signature, or not); there's no instrumentation of PDF.js worker count, IDB queue depth, memory usage, or PDFDocumentProxy retention at the failure boundary. This file enumerates the three mechanisms in the dispatch + one additional from the surface map (PDFOverlay's idle prefetcher) and proposes a discrimination plan for each.

---

## Surface map — what happens on a single `next` click

PDFOverlay's per-chart change (`SectionErrorBoundary key={track.fileId}`) UNMOUNTS the prior viewer and MOUNTS a new one. The overlay itself stays mounted. For each chart:

1. **PDFOverlay** runs three useEffects on `track.fileId` change:
   - **L218–239 `fileUrl` resolver**: `getFile(fileId)` from offline-idb → either `URL.createObjectURL(blob)` (cached) or the network URL string (miss). Cleanup `URL.revokeObjectURL` is called.
   - **L243–290 prefetcher**: ~1s after queueIndex changes, fetches the NEXT TWO PDFs (if not already in IDB) and writes them to IDB via `putFile`. Each prefetch keeps `prefetchedRef` (a per-overlay Set) growing.
   - **Implicit unmount of prior chart viewer** via the `key` prop.

2. **PDFViewer** (the most common path) on mount:
   - re-asserts `pdfjs.GlobalWorkerOptions.workerSrc` (string, not a Worker instance).
   - `fetchPdf` useEffect: IDB-first via `getFile(fileId)` → if hit, set `source` to a `Uint8Array`; if miss, `fetch(networkUrl)` → arrayBuffer → set source.
   - `<Document file={source}>` from react-pdf spawns a **new PDFDocumentProxy** + (typically) a **dedicated `pdf.worker.mjs` Web Worker** behind the scenes, which parses the bytes and emits page metadata.
   - Each visible page becomes a `<canvas>` rendered by `PDFPageWrapper`.
   - On unmount: useEffect cleanup aborts the in-flight fetch, but there is **NO explicit `pdfDocument.destroy()` call** in PDFViewer — react-pdf v10 is supposed to clean up internally when `<Document>` unmounts, but this is implicit, not guaranteed cross-engine.

3. **Heavy state lifecycle per chart change:**
   - One IDB transaction (PDFOverlay `getFile`).
   - One-or-two IDB transactions (PDFViewer `getFile` + potentially `putFile` from prefetch).
   - Up to two outbound fetches for `/api/drive/file/<next-1>` + `/api/drive/file/<next-2>` (cache miss).
   - One `URL.createObjectURL` + one revoke (PDFOverlay).
   - One new PDFDocumentProxy + worker (PDFViewer).
   - N new `<canvas>` elements via react-pdf.

The bug surfaces after **12 such cycles** complete on the same overlay mount. Position 13 doesn't get a render signature within 25 s. **One or more of those per-chart resources is leaking, queueing, or contending.**

---

## H1 — PDF.js worker starvation / leak

**Mechanism:**
react-pdf v10 spawns one `pdf.worker.mjs` Web Worker per `PDFDocumentProxy` (in single-worker mode; or shares a pool — implementation detail of pdf.js, varies by version). iOS WebKit's per-page Web Worker cap is documented at ~16-20 historically (and as low as 8 in some iPad memory-pressure states). On every chart change, PDFViewer unmounts and react-pdf is supposed to terminate the worker — but in practice (a) the unmount cleanup runs async, (b) `pdfDocument.destroy()` is not called explicitly in PDFViewer, and (c) under heavy churn (12 rapid mounts), some workers may not have torn down by the time the 13th mount requests its own. The 13th `<Document>` then waits indefinitely for a worker slot — no error fires because react-pdf's worker code doesn't time out; the user-visible spinner stays put.

**Why this fits the failure shape:**
- Position-bound (workers accumulate with mount count). ✅
- "No error within 25 s" (worker requests don't time out — they queue). ✅
- Different fileId across attempts (the worker pool is fileId-agnostic). ✅

**Discrimination evidence to collect:**
- Count `/pdf.worker.mjs` script-load requests over the walk. A new worker per Document → request count climbs monotonically. A reused pool → flat after first.
- Count `<canvas>` elements at each step. If they accumulate (rather than dropping back to the per-chart-page count after unmount), it confirms render output isn't being torn down on chart change either.
- Compare step-12 vs step-13 elapsed time between `next` click and first canvas paint. H1 predicts step-13 stays >25s with NO paint, while step-12 paint completes normally.

**Distinguishing from H2/H3/H4:**
H1 is the only hypothesis where the bug is **synchronous to the worker subsystem** — it should still reproduce even with prefetch disabled (rules out H4), even with abundant IDB quota (rules out H2), and even on a freshly-killed tab with no memory pressure (a partial rule-out for H3, since worker pool may be per-context-not-per-memory).

---

## H2 — IDB queue backpressure / large-blob contention

**Mechanism:**
PDFOverlay's prefetcher writes next-2 PDFs into Dexie IDB via `putFile` per chart change. Over 12 charts that's up to 24 outstanding `putFile` operations (minus dedup via `prefetchedRef`). PDFViewer's chart-load reads from the same IDB store via `getFile`. iOS WebKit IDB throughput on blob writes is documented as bottlenecked by an internal serialization queue; concurrent reads-during-write can block. If a `putFile` for a 5-MB PDF is mid-flight when the user advances to position 13, that 13th chart's `getFile` may block on the in-flight `putFile`. PDFViewer's `fetchPdf` awaits `getFile` before falling back to network — and there's no explicit timeout on the IDB read itself (the 60s fetch timeout wraps the fetch, not the IDB-await).

**Why this fits the failure shape:**
- Position-bound (more prior chart changes → more pending IDB writes). ✅
- "No error within 25 s" (IDB await silently hangs; no timeout on the IDB read). ✅
- Different fileId across attempts (the IDB queue is per-store, not per-key). ✅
- Self-heals on reload (queue clears). ✅ — matches "retry attempt" with same shape (different fileId, same failure mode).

**Discrimination evidence to collect:**
- `navigator.storage.estimate()` at each step — quota usage trajectory.
- Count `prefetchedRef` size over time (probe-visible via DOM mutation? Or via instrumented counter).
- Latency between mount and IDB-resolve (instrument `getFile` start vs finish — if the probe can stub it).
- If we toggle off the prefetcher (e.g. by setting an env flag OR walking faster than the 1s prefetch delay so it always aborts), does position 13 still fail? If position 13 now renders, H2 confirmed.

**Distinguishing from H1/H3/H4:**
H2 should be aggravated by larger PDFs (more bytes per IDB transaction). If we collect per-chart size and the failure correlates with cumulative bytes prefetched rather than chart count, H2 is the cause.

---

## H3 — WebKit memory pressure / canvas + PDFDocumentProxy retention

**Mechanism:**
Each rendered PDF holds a `PDFDocumentProxy` (parsed PDF tree, font caches), one `<canvas>` per page (HTMLCanvasElement backing-store ≈ width × height × 4 bytes — for an iPad 820×1180 page that's ~3.9 MB), and the original `Uint8Array` of bytes (~0.5–5 MB). React unmounts the React tree on chart change, but the underlying canvas backing stores and pdf.js parse caches may not be GC'd immediately (V8/JSC GC is asynchronous; pdf.js `cleanup()` only runs if called explicitly). After 12 charts × ~10 MB each = ~120 MB. iOS WebKit per-tab memory limits hover around 200–400 MB before the WKWebView gets killed (or before WebKit starts silently aborting new Document creation as a soft-OOM defense). The 13th chart's `<Document>` mount may be the one that trips the threshold, and the failure mode is silent — WebKit just doesn't run the worker / doesn't parse the bytes, with no error event surfaced.

**Why this fits the failure shape:**
- Position-bound (memory accumulates with chart count). ✅
- "No error within 25 s" (silent soft-OOM is documented WebKit behavior — kills the worker without raising). ✅
- Different fileId across attempts (memory is fileId-agnostic). ✅
- Retry-after-reload would help (fresh tab = fresh memory budget) — matches a Daniel-observed mitigation if seen.

**Discrimination evidence to collect:**
- `<canvas>` count over the walk. If H3, count climbs (uncleaned). If clean unmount, count drops back to per-chart steady-state after each navigation.
- `performance.memory` if available (Chrome-only — unlikely to be exposed on WebKit; worth trying).
- `performance.measureUserAgentSpecificMemory()` if available (requires cross-origin isolation; likely not in prod).
- Heuristic: count `document.querySelectorAll('canvas').length` per step. **If H3, this is the highest-signal lightweight probe.**
- Cumulative `URL.createObjectURL` calls without matching revokes (the offline-idb path) — also accumulates ImageBitmap / Blob references.

**Distinguishing from H1/H2/H4:**
H3 should improve if we force `pdfDocument.destroy()` + `canvas.width = 0; canvas.height = 0` on unmount. If we can verify in Phase 4 that adding explicit cleanup eliminates the failure, H3 confirmed. Conversely, H1/H2/H4 wouldn't be helped by canvas cleanup.

---

## H4 — PDFOverlay prefetch idle-queue saturation (additional candidate, not in dispatch)

**Mechanism:**
PDFOverlay's prefetcher (L243–290) schedules a `requestIdleCallback` 1 s after every `queueIndex` change. Each callback fetches up to 2 PDFs and writes them to IDB. iOS WebKit's idle-callback scheduler de-prioritizes pending callbacks under main-thread pressure; after 12 chart navigations, multiple idle-callbacks may still be pending, holding fetch streams + IDB writes in-flight. Position 13's chart load competes with all of these for the same connection pool (iOS WebKit caps ~6 concurrent connections to one host) and the same IDB write queue. This is essentially a sub-mechanism of H2 with a specific cause.

**Why this fits the failure shape:**
Same shape predictions as H2 — position-bound, silent hang, cross-fileId.

**Discrimination evidence to collect:**
- Network panel: count in-flight `/api/drive/file/<id>` requests at step 13. H4 predicts queued/blocked requests > 0.
- Probe with `R1_RUN` walking at maximum speed (no `waitForTimeout` between charts). If the prefetcher aborts faster, position 13 may not fail. Conversely walking SLOWLY (let prefetch settle each time) should also help.
- Look at `prefetchedRef.current.size` — should plateau at ~14 after 12 chart changes (each charts schedules 2 prefetches, dedup may collapse them).

**Distinguishing from H1/H2/H3:**
H4 is the only hypothesis where **disabling the prefetcher** (via an env flag, or by walking past the 1s prefetch delay before it can fire its first fetch) would eliminate the failure. The probe spec can attempt this by walking at <1s per chart and observing whether position 13 still hangs.

---

## Probe plan summary

The probe spec at `e2e/ipad-stuck-spinner-probe.spec.ts` will collect, at each step `[1..13]`:

| Signal | H1 prediction | H2 prediction | H3 prediction | H4 prediction |
|---|---|---|---|---|
| `document.querySelectorAll('canvas').length` | climbs (worker holds canvas) | flat | **climbs (load-bearing)** | flat |
| `/pdf.worker.mjs` request count | **climbs (load-bearing)** | first-only | first-only | first-only |
| `navigator.storage.estimate().usage` | flat | **climbs (load-bearing)** | flat | climbs |
| In-flight `/api/drive/file/*` fetch count at advance | flat | queued | flat | **queued (load-bearing)** |
| Time-to-first-render per step | flat 1–3 s | flat 1–3 s, spikes at 13 | flat 1–3 s, spikes at 13 | flat 1–3 s, spikes at 13 |
| Step 12 vs 13 `canvas` delta | low | low | **high (no GC fired)** | low |

The discrimination matrix in FINDINGS.md will resolve each hypothesis against the actual data with `SUPPORT / REFUTE / INCONCLUSIVE`.

**Reproduction target:** Shavuot Yizkor 5/23 (`UnjLqKTtS4lNKQfMY6hB`, 13 bonded charts) — known repro from F-2; reproducing position-13 hang is sufficient. Walking deeper (15+) is not strictly required by the failure characterization, but if a deeper prod setlist is available via R1_SETLISTS override, the probe will accept it.

**Bearer note:** Probe needs no MCP_BEARER for setlist mount (the route is public-by-design per F-2's spec), but the probe spec MAY accept `CRL_MCP_TOKEN` as an env arg for future audio-bond / private-setlist axes — same shape as the parent sweep used.

---

## Out-of-scope reminder

Per dispatch:
- ⛔ NO fix code.
- ⛔ NO changes to existing Playwright specs or `playwright.config.ts`.
- ⛔ NO `src/` changes EXCEPT optional flag-gated debug counter.
- ⛔ NO SmartTransposer / use-smart-transposer.
- ⛔ NO bridge / monitor / firestore.rules / vercel.json changes.
- ⛔ NO Firestore mutations / Storage operations.

If Phase 3 evidence forces ambiguity, Phase 4 FINDINGS.md MAY propose a follow-on Tier-0 lane with the flag-gated debug counter rather than ship one without evidence justification.
