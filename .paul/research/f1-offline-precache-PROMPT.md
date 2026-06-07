# Lane: f1-offline-precache (coder-6) — Tier 1 (iPad-perform hot path)

## Context
F1 — the **biggest live-service risk** from your own
`.paul/research/product-gap-features-FINDINGS.md`. If shul WiFi drops mid-service
the band loses their charts.

Verified at origin/master (`5dd02b555`):
- `prefetchSetlistPDFs` is DEFINED at `src/lib/prefetch.ts:50` and has **ZERO
  callers** in `src/**` (grep confirms only the definition). Nothing precaches on
  Perform entry.
- Service worker is tombstoned (intentional — do NOT reintroduce a SW; use the
  Cache Storage API / existing client cache directly).
- Perform path is the RSC-converted `src/app/perform/setlist/[id]/page.tsx` +
  `SetlistPerformClient.tsx`; `src/app/perform/layout.tsx` already idle-defers the
  PDF worker via `requestIdleCallback` — mirror that pattern.

## Scope — EDIT
1. **Wire `prefetchSetlistPDFs` on Perform entry** — when a band member opens
   `/perform/setlist/[id]`, kick an **idle-time** precache (`requestIdleCallback`,
   after first paint, non-blocking) of all bonded chart PDFs for that setlist.
2. **"Save offline" CTA** — explicit control in the Perform toolbar to force-cache
   the whole setlist with progress + done state, so a member can pre-arm before a
   service even if idle precache hasn't finished. Use **`/ui-ux-pro-max`** per
   [[feedback_ui_ux_skill]].
3. **Verify the offline read path** — confirm what `prefetchSetlistPDFs` caches
   into, that it survives WiFi loss, and that `PDFOverlay` reads from that cache
   when offline. Fix the read side if it doesn't.

## Acceptance
- Opening a setlist in Perform triggers idle precache of all bonded PDFs (network
  panel shows PDF fetches after paint, or a test asserts the call fires with the
  setlist's fileIds).
- "Save offline" CTA force-caches with progress/done.
- **Offline repro (REQUIRED):** load setlist online → go offline (DevTools) →
  charts still render from cache. Run on the **ipad-webkit Playwright project**
  (820×1180 — the band hardware). Paste before/after in SHIP-NOTICE `## Repros`.
- No regression to RSC SSR seeding / CLS=0 / Logic-Pro density.

## Hard rules
No cover art ([[feedback_no_cover_art]]); "Vocal Lead" terminology; setlist
public-by-design; react-pdf `workerSrc` override stays UNCONDITIONAL
([[feedback_react_pdf_worker]]); **do NOT reintroduce a service worker**;
`bridge/**`, `errors.ts` read-only. Fully disjoint frontend (`perform/**`,
`prefetch.ts`) — no shared-file contention with the infra lanes.

## Tier 1 (high-stakes iPad hot path)
Tests + build + the deployed ipad-webkit offline repro.
