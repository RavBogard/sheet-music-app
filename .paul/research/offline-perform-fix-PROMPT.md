# Lane: offline-perform-fix (coder-5) — make a NOT-yet-opened chart render offline

**Tier 2** (Perform offline resilience, ships to prod). **★ LAUNCH-DAY, before tonight's service.** You just shipped the webkit first-tap fix on these exact files — warm context. Build on master (your webkit fix `575bc47ae` is already in).

## The gap (coder-3 exec finding, reproduced on the REAL Shavuot-Yizkor setlist, no auth)
After "Save offline" completes (bytes ARE in IDB; header reads "OFFLINE — 13/13 CHARTS READY"), the offline safety net protects ONLY the chart already open at drop-time. **TWO failure modes for a chart NOT already open when wifi drops:**
1. **Cold open offline** → `"Failed to load PDF — Setting up fake worker failed: Importing a module script failed"`. The pdf.js **worker module is fetched over the (dead) network at render time.**
2. **Next-nav offline** (worker already warm from an earlier online open) → stuck on **"Rendering…" forever**, no canvas — the chart bytes aren't resolved from cache on offline navigation.

What WORKS offline (proven): byte precache 13/13, overlay mounts, TEXT charts render, and a chart already open at drop keeps rendering. So: **bytes are cached, but the CODE (pdf.js worker + lazy viewer chunk) and the on-nav byte-resolve path are not.**

## Where (verified @ origin/master)
- **Worker is a STATIC same-origin asset:** `src/app/perform/layout.tsx:47-55` sets `pdfjs.GlobalWorkerOptions.workerSrc = /pdf.worker.min.${pdfjs.version}.mjs` (+ `PDFViewer.tsx:37,74-80` defense-in-depth). The file is copied to /public by `scripts/copy-pdf-worker.js` at build. **Offline it 404s** because nothing precaches `/pdf.worker.min.<v>.mjs` (nor the lazy react-pdf JS chunk). ⇒ [[feedback_react_pdf_worker]]: workerSrc must resolve to a PRECACHED asset, not a runtime network import.
- **Byte cache:** `src/lib/offline-idb.ts` (`getFile`/`hasFile`/`putFile`) + `src/hooks/use-offline.ts`; precache via `SaveOfflineButton.tsx` / `perform/layout.tsx`. Mode-2 suggests the render/nav path doesn't read bytes from offline-idb when offline (or the viewer chunk isn't loaded).
- **coder-3's decisive evidence (reuse, don't re-derive):** `e2e/r1-offline-decisive.spec.ts` + `test-results/r1-offline-decisive-*/error-context.md` + `r1-run-logs/sec3-offline-authed-isolated.log` — in worktree `sheet-music-app-r1-run` (coder-3's; read it, don't disturb it). This spec is your acceptance test.

## Fix (both modes)
1. **Precache the pdf.js worker asset + the lazy react-pdf viewer chunk** as part of the offline save (so a cold offline open resolves the worker from cache, not the network). A service-worker/Cache-API precache of `/pdf.worker.min.<v>.mjs` (+ the dynamic viewer chunk) on Perform entry / Save-offline is the likely shape. (Confirm whether a service worker exists; if the offline model is IDB-only with no SW, you may need to add a minimal SW or cache the worker bytes in IDB and feed react-pdf a blob: workerSrc.)
2. **Offline byte-resolve on nav:** ensure PDFOverlay/PDFViewer resolves chart bytes from offline-idb when offline (mode-2 "Rendering…" hang) instead of awaiting a dead network fetch.

## ★ Escape hatch (launch-day discipline)
This is more involved than the webkit fix. **If you cannot land a clean, verified fix safely before service, STOP and HEADS-UP supervisor IMMEDIATELY** — we fall back to briefing the band ("keep the current chart open if wifi drops; don't navigate"). Do NOT ship a risky half-fix on launch day. A correct fix for mode-1 (worker precache) alone is still a big win if mode-2 is deeper — ship incrementally + tell me what's covered.

## Gates
coder-3's `r1-offline-decisive.spec.ts` goes GREEN (cold-offline open + offline Next-nav both render) — that's the acceptance proof. Unit tests for the precache/worker-resolve logic. `next build` exit 0 + check:types + eslint. Cut a FRESH worktree off origin/master (`575bc47ae`+); claim the files you touch (PDFOverlay/PDFViewer/perform layout/offline-idb/use-offline/any SW). SHIP-NOTICE → inbox/auditor.md (Tier 2) + HEADS-UP supervisor with the deployed offline-verify. **Ships to prod on push — verify before service.**

## Definition of done
Both offline modes fixed (or mode-1 shipped + mode-2 status reported); coder-3's decisive spec green; build/types/eslint clean; FF-pushed; master-tip + agents.md updated; SHIP-NOTICE to auditor + HEADS-UP supervisor. Sign `from coder-5`.
