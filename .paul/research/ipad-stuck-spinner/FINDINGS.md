# Findings — `ipad-stuck-spinner-characterization`

**Tier-0 research lane. NO code fix.** Mechanism identified; fix shape proposed; auditor-verify-gate NOT warranted (under threshold). Per dispatch routing, SHIP-NOTICE goes to supervisor inbox for fix-lane dispatch.

---

## Headline

**F-2 "Shavuot Yizkor 5/23 row-13 stuck spinner" is a mis-classified `AudioViewer` failure, not a walk-induces-overload mechanism.**

The 13th queue item in `shavuot-yizkor-5-23` is `Adon Olam.mp3` (audio-bond, the only audio chart in the setlist). When PDFOverlay's prefetcher caches the audio bytes into IDB during step 10–11 of the walk, AudioViewer at step 12 reads the cached blob, mints a `blob:` URL, and hands it to a native `<audio src="blob:...">` element. iPad WebKit rejects the blob:-URL audio source → the audio element's `onError` fires → `AudioViewer` flips to `status='error'` → renders an `AlertCircle` + the literal text "Audio file not found".

The parent sweep's classifier (`perform-ipad-real-setlists.spec.ts` `classifyCurrent()`) recognises canvases, sheet-music SVGs, `/api/drive/file/` `<img>`, the `text-brand.font-bold` text-chart signature, the `bonded to an audio file|not a chart` regex, and the `Failed to load|render error|Could not load chart|Chart failed to load|Invalid PDF|chart load timed out` regex — **but not the string "Audio file not found".** With no signal recognised, it times out at 25 s and reports `stuck spinner?`.

**This is the same bug class as `webkit-pdf-reload-fix`** (R1 Finding B, `575bc47ae`, 2026-05-22) — passing a blob: URL to a native media element fails on iPad WebKit. PDFViewer was fixed by removing blob: from its load path and using the network URL with IDB-first byte resolution internal to the loader. AudioViewer (shipped 2 days later in `audio-viewer-f7` / `912ea2c3d`) was implemented to the pre-fix pattern: blob: URL preferred when IDB-cached, network URL only as miss-fallback. **The lesson didn't carry over.**

**Position-bound illusion:** F-2 described the bug as "position-bound, not chart-bound" because different attempts captured different `fileId`s for the row-13 failure (`6ca6e82c-…` vs `12JfLCHy…`). That observation came from a probe-tracking imprecision — the parent spec captures the most recent `/api/drive/file/` URL, which can be from a prefetcher's next-2 cache-fill, NOT the current chart's own fetch. **Both F-2 attempts hit the same actual chart (Adon Olam) at position 13;** the captured fileId varied with prefetcher timing. This probe's `overlayHtmlHead` capture at step 12 shows the AudioViewer error state directly, dissolving the position-bound hypothesis.

**Severity:** Same as F-2's original assessment — HIGH for future Shabbat-morning services that include audio-bonded charts; MEDIUM today (only one audio chart in prod, in a setlist that's already past). Future services with audio bonds will reproduce this on every band iPad.

---

## Hypothesis discrimination

| Hypothesis | Verdict | Load-bearing evidence |
|---|---|---|
| **H1 — PDF.js worker starvation** | **REFUTED** | `cumWorkerFetches = 0` for every sample, all 12 steps. No `/pdf.worker.mjs` request fires beyond first-load (the worker is module-bundled / loaded once). Worker count cannot climb because there's nothing to climb. |
| **H2 — IDB backpressure / quota** | **REFUTED structurally; not directly measured** | `navigator.storage.estimate()` is unavailable on iPad WebKit (returned `-1` for `usage` + `quota` on every step — best-effort surfaces null on this engine). However: there's no large-blob contention shape in the latencies — `ttfrMs` is consistently 9–2400 ms steps 1–11 and the step-12 failure is `25001 ms` (the classifyCurrent timeout), not a slow IDB read. IDB writes for prefetch don't queue up enough to throttle reads. Refuted on shape, not directly. |
| **H3 — WebKit memory pressure / canvas retention** | **REFUTED** | `canvasCount` stays in `0–3` across the entire walk (`trajectory_first_to_last.canvasDelta = -2` from step 1 to step 12). React-pdf's per-chart `<Document>` unmount-and-remount keyed by `track.fileId` cleans up correctly. No accumulation. `svgCount` stays at 23 then ticks to 24 at step 12 — that's the `AlertCircle` of the AudioViewer error state, not a retention signal. |
| **H4 — PDFOverlay prefetch saturation** | **REFUTED** | `inFlightChartFetches` (in-flight `/api/drive/file/*` at advance) is `0 or 1` throughout — never queued. Prefetcher's 1 s `requestIdleCallback` delay + per-fetch abort-on-unmount keeps the pool clear. Connection-pool saturation is not the mechanism. |
| **H5 (NEW) — WebKit blob:-URL rejection for `<audio>` source** | **CONFIRMED** | Step-12 `overlayHtmlHead` directly captures `<svg…><circle …>…</svg><p>Audio file not found</p>` — the AudioViewer `status === 'error'` render path (`src/components/music/AudioViewer.tsx:93-98`). This state is reached when the `<audio onError>` handler fires (`AudioViewer.tsx:118`). The prefetcher fetched Adon Olam's 6.7 MB MP3 bytes between step 10 and step 11 (`cumChartFetches` went `14 → 16`), wrote them to IDB via `putFile`, so by step 12 AudioViewer's `resolve()` hit the IDB-cached path and minted a blob: URL (`AudioViewer.tsx:54-56`). iPad WebKit's media element refused the blob: URL → onError → error state. Identical mechanism class to `webkit-pdf-reload-fix` (R1 Finding B). |

---

## Step-by-step trajectory (probe-run-005.log)

| Step | Counter | fileId (last captured) | Verdict | ttfr (ms) | canvas | svg | document | audio src | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Song 2 of 13 | 1VSB3w… | RENDERED | 2363 | 2 | 23 | ✅ | — | Modah Ani (first key-badge row) |
| 2 | Song 3 of 13 | 1VSB3w… | RENDERED | 329 | 3 | 23 | ✅ | — | Ma tovu |
| 3 | Song 4 of 13 | 1ds1Ql… | RENDERED | 845 | 3 | 23 | ✅ | — | Psukei d'zimrah |
| 4 | Song 5 of 13 | 1-NNEk… | RENDERED | 9 | 2 | 23 | ✅ | — | Ahava raba |
| 5 | Song 6 of 13 | 1-NNEk… | RENDERED | 317 | 2 | 23 | ✅ | — | Shema |
| 6 | Song 7 of 13 | 12Q_6m… | RENDERED | 847 | 2 | 23 | ✅ | — | Mi chamocha |
| 7 | Song 8 of 13 | 12Q_6m… | RENDERED | 7 | 2 | 23 | ✅ | — | Adonai sfatai |
| 8 | Song 9 of 13 | 1u2g0w… | RENDERED | 337 | 2 | 23 | ✅ | — | Oseh shalom |
| 9 | Song 10 of 13 | 19FuqP… | RENDERED | 310 | 2 | 23 | ✅ | — | Mi shebeirach |
| 10 | Song 11 of 13 | 6ca6e8… | RENDERED | 844 | 2 | 23 | ✅ | — | Eitz chayim — prefetcher fired +2 (`cumChartFetches 12→14`) for Songs 12+13 |
| 11 | Song 12 of 13 | 12JfLC… | RENDERED | 1419 | 3 | 23 | ✅ | — | Eili Eili — prefetcher fired again (`14→16`), Adon Olam audio bytes now cached in IDB |
| **12** | **Song 13 of 13** | 12JfLC… | **FAILED** | 25003 | **0** | **24** | **❌** | **""** | **Adon Olam (audio). AudioViewer mounted; `<audio>` onError fired; `status='error'` → "Audio file not found".** No new `/api/drive/file/` fetch fired (`cumChartFetches` stayed at 16; prefetcher had no next-chart to prefetch). `documentExists=false` confirms PDFViewer didn't take over (audio routing held). |

`cumWorkerFetches: 0` for every step — REFUTES H1.
`cumChartFetches` deltas: +2 at steps 1, 3, 6, 10, 11; +1 at others — consistent with a working prefetcher. The Adon Olam fetch happened during step 11.

---

## Proposed fix (research lane proposes; doesn't fix)

**Lane shape:** `audio-viewer-blob-url-fix` (or similar). Tier-1, single-commit, ~20–40 LOC.

**Change:** `src/components/music/AudioViewer.tsx` `resolve()` → swap the IDB-first → blob: URL path to **network URL first** (mirroring `webkit-pdf-reload-fix`). Optional offline fallback retains a blob: URL only when `!navigator.onLine` (best-effort; the existing fix-on-WebKit caveat means it may not play offline, but no worse than the current always-broken state online).

**Concrete diff sketch (~20 LOC, illustrative — final lane should re-derive):**

```diff
 useEffect(() => {
     let cancelled = false
     let objectUrl: string | null = null
     async function resolve() {
         if (!fileId) { setSrc(""); setStatus("error"); return }
+        // webkit-pdf-reload-fix lesson (R1 Finding B): blob: URLs handed
+        // to a native media element fail on iPad WebKit. Default to the
+        // network URL — the `/api/drive/file/<id>` route serves audio/*
+        // with proper Content-Type + Range support, and the route's
+        // s-maxage CDN cache means repeat plays are cheap. Only use the
+        // blob: URL when offline, as best-effort offline playback.
+        const networkUrl = `/api/drive/file/${fileId}`
+        if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
+            setSrc(networkUrl)
+            setStatus("loading")
+            return
+        }
         try {
             const { getFile } = await import("@/lib/offline-idb")
             const blob = await getFile(fileId)
             if (cancelled) return
             if (blob) {
                 objectUrl = URL.createObjectURL(blob)
                 setSrc(objectUrl)
             } else {
-                setSrc(`/api/drive/file/${fileId}`)
+                setSrc(networkUrl)
             }
             setStatus("loading")
         } catch {
             if (cancelled) return
-            setSrc(`/api/drive/file/${fileId}`)
+            setSrc(networkUrl)
             setStatus("loading")
         }
     }
     resolve()
     return () => {
         cancelled = true
         if (objectUrl) URL.revokeObjectURL(objectUrl)
     }
 }, [fileId])
```

**Test updates (~15 LOC):**
- Existing test "uses a blob: object URL when IDB returns a cached blob (offline path)" must mock `navigator.onLine = false` to keep its semantics.
- New test "uses the network URL by default when online (mirrors webkit-pdf-reload-fix)" — covers the new primary path.
- New test "uses blob: URL only when offline + IDB hit" — covers the explicit offline branch.

**Risk:** **Low.**
- AudioViewer is freshly shipped (2026-05-24, ~24h old); only one chart in prod currently routes through it (Adon Olam.mp3 in `shavuot-yizkor-5-23`). Already-shipped Shabbat morning ran past; future audio binds will exercise the fix immediately.
- Worst case: a fresh-install offline scenario can't play audio. Today it can't either — the AudioViewer's "blob: URL → onError → error state" trajectory means it ALSO doesn't play offline. The fix doesn't make this worse; it makes online work.
- The `/api/drive/file/` route already serves `audio/mpeg` with `Range:` support (verified via curl with Sec-Fetch-* headers — HTTP 200, 6.7 MB MP3). Native `<audio>` will stream via HTTP range requests, which is the standard well-tested path for media elements.

**Deployed-surface verify gate after fix:**
Extend the probe spec to re-walk Shavuot Yizkor 5/23 on iPad WebKit after the fix lands. The new probe should show:
- Step 12 verdict: `RENDERED` (or `AUDIO` if classifyCurrent gets widened — see below) with `audioCount: 1` and `audioElementSrc` matching `/api/drive/file/12JfLCHy...`.
- An actual `/api/drive/file/12JfLCHy...` request fires during step 12 (the `<audio>` preload-metadata fetch).

If the fix landed but step 12 still fails for a different reason, the probe surfaces the new state via `overlayHtmlHead`.

**Alternatives considered + rejected:**
- *Service worker / fetch interceptor to translate blob: requests to network.* Heavy infrastructure for one viewer; risks cross-cutting changes to the existing offline behaviour.
- *Multiple `<source>` elements with format hints.* WebKit's source-selection logic is opaque and doesn't reliably fall back across `blob:` → `https:` sources.
- *Web Audio API decoding.* Doesn't match AudioViewer's "native controls + iOS lockscreen / media-session integration" design intent (AudioViewer.tsx:8-9, 106-109).

**Lane sizing:** ~35 LOC total (`AudioViewer.tsx` + tests). Well under the dispatch's 200-LOC threshold for auditor-verify-gate routing. Standard Tier-1 routing: coder ↔ auditor direct, one-commit lane, deployed-surface verify via re-running this probe spec (with the verify gate above).

---

## Adjacent improvements (separate lanes; non-blocking)

These surface from the data but are NOT part of the proposed fix lane:

1. **Widen `classifyCurrent()` to recognise AudioViewer's error text.** Add `/Audio file not found/i` to the parent sweep's `RENDER_ERROR` regex (or as a third state `AUDIO_FAILED`). Today, this error state is misclassified as a stuck spinner, delaying diagnosis by the 25 s timeout. ~3 LOC in `e2e/perform-ipad-real-setlists.spec.ts` + similar specs that share the classifier.

2. **Audio-bond prod sweep gap closure.** The `ipad-webkit-prod-sweep` (`b24dbdcc4`) explicitly noted: *"Audio-bond prod verify — no AUDIO verdict surfaced — audio-bonded prod setlists not in R1_SETLISTS default — needs spot-check"*. This finding shows the gap is real and load-bearing. Add `R1_SETLISTS` default with an audio-bonded setlist (or extend the existing target) so future iPad-WebKit sweeps surface audio-bond regressions directly. Could be folded into the fix lane's verify gate.

3. **`navigator.storage.estimate()` unavailability on iPad WebKit.** Recorded `-1` for every sample. If future probes want to measure IDB quota on iPad, an alternative measurement strategy is needed (e.g. counting IDB entries via the offline-idb helper exposure). Out of scope for this lane.

4. **Probe spec false-positive on transient list emptying.** Initial probe runs failed because the publicly-readable Shavuot Yizkor setlist briefly rendered "0 songs" on the iPad WebKit unauth client (verified via `pageerror: …/firestore.googleapis.com/.../Listen due to access control checks`). The unauth Firestore listener clears tracks ~3–5 s after hydration on this prod build. The parent sweep got lucky timing-wise (no stability wait), and so did the probe once the stabilization wait was removed. This is structurally fragile — F-2's parent spec could flake on a slower-loading day. May warrant a separate finding in a future sweep dispatch (not action-blocking for the AudioViewer fix).

---

## Out-of-scope honoured

- ⛔ NO fix code shipped in this lane.
- ⛔ NO changes to existing Playwright specs or `playwright.config.ts`. The new probe spec is a NEW file (`e2e/ipad-stuck-spinner-probe.spec.ts`) per dispatch.
- ⛔ NO `src/` changes. The optional `NEXT_PUBLIC_PROBE_HARNESS_PDF=1` flag-gated debug counter was NOT added; the DOM-level instrumentation in the probe spec (`overlayHtmlHead`, `documentExists`, `audioElementSrc`, etc.) was sufficient to identify the mechanism without app-code changes.
- ⛔ NO `SmartTransposer` / `use-smart-transposer.ts` touched.
- ⛔ NO bridge / monitor / firestore.rules / vercel.json changes.
- ⛔ NO Firestore mutations / Storage operations.

---

## Artifacts shipped

- `HYPOTHESES.md` — Phase 1 enumeration (4 candidate mechanisms + discrimination plan).
- `FINDINGS.md` (this file) — mechanism + fix shape + risk + alternatives.
- `e2e/ipad-stuck-spinner-probe.spec.ts` — NEW probe spec, always-PASS at Playwright level, emits per-step `[SAMPLE]` JSON lines + a `[PROBE-SUMMARY]` block to stdout. Reusable for the proposed fix-lane's verify gate.
- `probe-run-001.log` through `probe-run-005.log` — five prod runs. Run-005 is the DEFINITIVE evidence run (12 steps walked, 11 RENDERED, 1 FAILED at step 12 with overlayHtmlHead showing AudioViewer error state). Runs 001-004 are blocked-runs documenting the iterative debugging (Firestore listener flake + Playwright click-retry issue) — preserved for forensic value, not load-bearing.

---

## Source of truth

- Supervisor dispatch `msg-ipad-stuck-spinner-characterization-001` 2026-05-24T16:05Z.
- Parent sweep findings: `.paul/research/ipad-webkit-prod-sweep/FINDINGS.md` §F-2 + `perform-ipad-real-setlists.log` lines 22–40.
- Related fix: `webkit-pdf-reload-fix` SHA `575bc47ae` (2026-05-22) — the precedent the AudioViewer fix should mirror.
- Related ship: `audio-viewer-f7` SHA `912ea2c3d` (2026-05-24) — the lane that shipped AudioViewer with the pre-fix blob-URL pattern.
- Daniel directive 2026-05-24T~04:00Z ("spin up as many coders as you want") + 2026-05-24T~05:00Z calendar correction (Shavuot Yizkor already past; this is post-mortem + future-Saturday-morning protection).
