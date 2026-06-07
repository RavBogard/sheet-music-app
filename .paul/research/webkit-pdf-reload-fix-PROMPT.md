# Lane: webkit-pdf-reload-fix (coder-5) — kill the transient "Failed to load PDF" on first tap

**Tier 2** (Perform robustness, launch-relevant, ships to prod). Root-cause + fix. **Launch-day deploy — keep it tight.**

## The bug (R1 Finding B, observed live on iPad WebKit vs prod)

In Perform on iPad WebKit, a chart intermittently shows **"Failed to load PDF"** on first tap and **self-heals on retry/re-tap**. Critically, R1 observed **NO `/api/drive/file` network request** at failure → it is NOT a network/fetch miss; it's failing on the **precached blob path** (a race), not the server fetch. See R1's `.paul/research/ipad-launch-R1-STRATEGY.md` + the R1 SHIP-NOTICE for the repro.

## Where to look (verified @ origin/master)
- `src/components/performance/PDFOverlay.tsx:184` — `objectUrl = URL.createObjectURL(blob)` (the precache/offline blob → object-URL handed to the viewer).
- `src/components/music/PDFViewer.tsx` — the loader + retry/exhausted UI (the "Failed to load PDF" surface at :310).
- The precache feeders: `src/components/performance/SaveOfflineButton.tsx` (idle auto-precache → `prefetchSetlistPDFs`) + `src/app/perform/layout.tsx:72` (F1 offline-precache overlay warm).
- ⚠️ react-pdf worker gotcha — the workerSrc override must be UNCONDITIONAL ([[feedback_react_pdf_worker]]); confirm the worker is ready before the first document load (a worker-not-ready race is a prime suspect on a cold first paint).

## Likely root-cause classes to confirm (pick by evidence, don't guess)
- **Object-URL lifecycle race:** the blob `createObjectURL` is revoked / not yet assigned when PDFViewer mounts → first load fails, second tap (URL now stable) succeeds.
- **Worker timing:** the pdf.js worker isn't initialized on the very first cold load on WebKit → the document `getDocument` rejects → "Failed to load PDF"; warm on retry.
- **Effect ordering / stale dep:** the viewer starts loading before the precache blob resolves; an await/ordering or missing-dep issue.

## Fix + gates
- Root-cause the actual race (instrument if needed), then fix so the **first tap loads reliably** on iPad WebKit — no user re-tap. Keep the existing retry/exhausted affordance as a backstop (don't remove it). Don't change the network fallback path or the offline-cache contract.
- Tests covering the race (e.g. viewer mounts before/after blob ready; worker-not-ready → loads once ready, no error surfaced on the happy path). `next build` exit 0 · check:types · eslint clean.
- Verify on iPad WebKit via R1's `e2e/perform-ipad-real-setlists.spec.ts` (the transient was visible there with `--retries`); the fix target is green WITHOUT relying on retries for the first load.
- Cut a FRESH worktree off origin/master; claim `PDFOverlay.tsx` + `PDFViewer.tsx` (+ any precache file you touch). SHIP-NOTICE → inbox/auditor.md (Tier 2) with the deployed-verify note (first-tap load on iPad webkit, no re-tap).

## Definition of done
Root cause identified + fixed; tests green; build/types/eslint clean; FF-pushed; master-tip + agents.md updated; SHIP-NOTICE to auditor. Sign `from coder-5`.
