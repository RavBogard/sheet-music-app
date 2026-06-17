# v11.6-01 — Stress Sweep & Triage Report

**Date:** 2026-06-17 · **Phase:** v11.6-01 (DISCOVERY) · **Milestone:** v11.6 Airtight (Weekend Stress & Usability)
**Method:** live Playwright sweep on PROD (`https://www.centralreform.live`, real 11" iPad-WebKit 820×1180 portrait + 1180×820 landscape) + 5-surface read-only multi-agent code audit.
**Triage bar:** usability-AND-access (a real reading/usability defect counts even if it doesn't contradict an access cell). `err-public` governs access-shaped findings. Oracle `docs/ACCESS-POLICY.md` v0.4.
**This report drives the v11.6-02/03/04 fix PLANs.** Each finding has a stable `WS-NN` id, severity, fix-phase tag, repro, and 1-line direction. No production code was changed in this phase.

---

## Headline

1. **Offline reading already WORKS** (live-confirmed) — the "venue has wifi / PWA dropped" premise is **stale**. A scoped `/perform` service worker + IndexedDB chart cache were re-introduced 2026-05-28. Live sweep: with a chart open, `openChartVisibleOffline=true` AND offline next-chart nav succeeded on **both** the PDF set (Song 12→13) and the text set (Song 5→6); the **"All charts saved for offline use"** indicator renders live. ⇒ **Phase v11.6-03 is reframed from "re-introduce offline" to "verify + close the 2 narrow gaps"** (WS-10 MusicXML, WS-12 incognito-blank).
2. **WS-01 (P0, suspected):** opening a *bonded non-song row* (prayer/reading with a chart) bounces the musician to song 1 — hits the **Friday Shir Shabbat** set (bonded prayer rows: Shema, Mi Chamocha, Adonai sfatai). Code-confirmed; needs live confirmation.
3. **WS-02 (P1, live-observed + config-confirmed):** the CSP `img-src` blocks Firestore's `cleardot.gif` long-poll beacon → setlist rows can fail to hydrate on iPad Safari on restrictive/camp wifi. Cheap, known-pattern fix.
4. **Text-chart reading (the camp sets' dominant path)** has real legibility/correctness risks in Fit mode (WS-03 font shrink/clip, WS-04 transposed-chord drift).

---

## Findings

### P0 — breaks reading/using the chart in service

| id | finding | source | fix-phase | repro |
|----|---------|--------|-----------|-------|
| **WS-01** | Opening a bonded **non-song** row (type≠'song' with a fileId — prayer/reading) bounces to song 1: `PDFOverlay` queue filter excludes `type!=='song'`, so `queueStart` resolves to -1→0 and the sync effect navigates to song 1. `SetlistRow` deliberately makes such rows openable. **Affects Friday Juneteenth set.** | NAV-2 (code; PDFOverlay.tsx:113-128,148-162) | **02** | Open a prayer/reading row that has a bonded chart (e.g. "Shema (major)" on the Juneteenth set) → tapped chart flashes then jumps to song 1. **NOT yet live-confirmed — confirm in 02.** |

### P1 — significantly degrades reading / likely wrong

| id | finding | source | fix-phase | repro |
|----|---------|--------|-----------|-------|
| **WS-02** | CSP `img-src` (proxy.ts:47) omits `https://www.google.com`; Firestore long-poll WebChannel beacons `cleardot.gif` → blocked → Listen channel errors → **setlist rows fail to hydrate** on WebKit/Safari long-polling networks. | LIVE (console: "Refused to load …cleardot.gif"; non-hydrating rows) + proxy.ts:47 | **02** (quick win) | iPad/WebKit on a long-poll-forcing network: open a setlist, rows never appear (button count stays at the SSR 2). |
| **WS-03** | Text Fit-mode (default at 820px) auto-shrinks font with **no legibility floor** and computes width from text-only lines only (constant 40 for chord-lyric lines) → long chorded lines render sub-11px or **clip with no horizontal scroll** (`overflow-x-hidden`). | TXT-2/3/4 (TextScoreViewer.tsx:255-258,289,314) | **02** | Open a long-line camp text chart (Staff Concert) on 820px → tiny/clipped right edge unreachable. |
| **WS-04** | Transposed chord wider than its lyric slice widens the flex column → chords **drift off their syllables**, compounding across the line (Fit mode). | TXT-1 (TextScoreViewer.tsx:171-176,299-308) | **02** | Text chart, transpose +1 (C→Db) → chords misalign progressively. |
| **WS-05** | PDF **render-stage** stuck-spinner: the 60s timeout guards only the *fetch*; once bytes arrive, a 0-width/clipped container renders `<Page width=0>` with no watchdog and no Retry. | PDF-4 (PDFViewer.tsx:73,237-239) | **02** | Mount/rotate during load on iPad → blank/spinner, no error, no Retry. (Known: e2e/ipad-stuck-spinner-probe.spec.ts.) |
| **WS-06** | `ImageScoreViewer` ignores store `zoom` → toolbar Zoom buttons are **present but inert** on image charts (and overlay may block native pinch). | PDF-6 (ImageScoreViewer.tsx:39-51) | **02** | Open an image chart, tap Zoom-in → % changes, image doesn't scale. *(No image charts in this weekend's 3 sets — lower live-weight.)* |
| **WS-07** | Multi-page PDFs render as one long vertical scroll with **no page indicator / no page nav**; "Next song" advances charts not pages. | PDF-2 (PDFViewer.tsx:375-383) | **02** | Open a 2-page PDF chart on iPad portrait → page 2 hidden below fold, no signal. |
| **WS-08** | Opening a song from the in-chart **Setlist drawer** `router.push('/perform/<fileId>')` → single-chart route with `onNavigate={()=>{}}` → **Next/Prev die**, setlist context lost. | NAV-3 (SetlistDrawer.tsx:402-406) | **02** | In a chart, open drawer, tap another song → lands "Song 1 of 1", chevrons greyed. |
| **WS-09** | Live-director insert/swap/reorder rebuilds the queue keyed on `fileId||title`; a follower's `queueStart` can resolve -1→0 → **follower yanked off their chart** mid-service. | NAV-5 (PDFOverlay.tsx:112-128) | **02** | Follower on song 5; director inserts before song 3 → follower's chart jumps. |
| **WS-10** | `SmartScoreViewer` (MusicXML) still uses `fetch(blob:)` — the exact iPad-WebKit race PDF/Text/Audio were rebuilt to avoid (IDB-first). Offline MusicXML can fail to load. | OFF-1 (SmartScoreViewer.tsx:251-253) | **03** | Cache a MusicXML chart, go offline, open on iPad → intermittent "Failed to fetch score". *(No MusicXML in this weekend's sets — forward-risk.)* |
| **WS-11** | In-app "setlist published" bell notification links to dead route `/setlist/{id}` (push/SMS correctly use `/perform/setlist/{id}`). | PUB-1 (setlist-publish.ts:771; publish/route.ts:159; notify-updated/route.ts:80) | **04** | Publish to a uid; tap the bell notification → 404 / login bounce. |

### P2 — minor / edge

| id | finding | source | fix-phase |
|----|---------|--------|-----------|
| **WS-12** | Offline Firestore `onSnapshot` error can blank the whole open set in incognito/memory-cache mode (error screen has no `tracks.length===0` guard). | OFF-3 (SetlistPerformClient.tsx:190-222) | **03** |
| **WS-13** | Uncached charts unavailable offline; precache is best-effort + silent; no hard "all N saved" pre-departure gate. *(Mitigated: "Saved" indicator seen live.)* | OFF-2 (use-perform-entry-precache.ts:61; prefetch.ts:78-89) | **03** |
| **WS-14** | Landscape fit-to-width scales portrait PDFs up → overflow below fold; no fit-page mode. | PDF-3 (PDFViewer.tsx:276,379) | **02** |
| **WS-15** | Image-chart load error has no Retry / no re-fetch (PDF has both). | PDF-7 (ImageScoreViewer.tsx:33-37) | **02** |
| **WS-16** | PDF manual-retry budget (3) doesn't reset on rotate/re-entry → terminal dead-end on the affected chart. | PDF-8 (PDFViewer.tsx:256-265) | **02** |
| **WS-17** | "Current position" highlight + leader set-position are dead code (`currentTrackIndex=-1`, no-op) yet still wired → no "you are here" in the list. | NAV-4 (use-setlist-performance.ts:180,226) | **02** |
| **WS-18** | Zoom-% readout is `hidden md:…` → on iPad shows a bare `/`; player can't tell current zoom level. | NAV-6 (PerformanceToolbar.tsx:181-183) | **02** |
| **WS-19** | Chord regex (case-insensitive, ≥75% tokens) misclassifies short header/lyric lines (e.g. "A E") as chord lines → mis-stacked layout. | TXT-5 (TextScoreViewer.tsx:121-135) | **02** |
| **WS-20** | Text control bar buttons ~32px (<44px iOS floor) + fixed bar can overlap last lines on iPad. | TXT-10 (TextScoreViewer.tsx:263-280) | **02** |
| **WS-21** | QR device-approval hard-requires a `role` *claim*; a claim-lagged but approved musician gets 403 with no in-flow remedy. | PUB-2 (auth/qr/route.ts:179-186) | **04** |
| **WS-22** | **Transpose control unreachable in sweep** — trigger present (`<button>`) but click timed out (6s) on iPad-WebKit for both PDF (expected) and the **text** set (should transpose). Possibly toolbar-overflow/obscured on narrow width. **Inconclusive — verify in 02.** | LIVE (sweep `transpose` cell) | **02** |

### P3 — cosmetic / low / forward-risk

| id | finding | source | fix-phase |
|----|---------|--------|-----------|
| **WS-23** | Text `preferFlats` hard-wired `undefined` → enharmonic spelling can fight a flat-key chart after transpose. | TXT-7 (TextScoreViewer.tsx:139) | 02 |
| **WS-24** | Whitespace-only line between chord rows dropped → section gaps collapse. | TXT-6 (TextScoreViewer.tsx:174-176) | 02 |
| **WS-25** | Slash-chord bass spelled with the root's flat/sharp choice, not its own. | TXT-9 (music-math.ts:117-135) | 02 |
| **WS-26** | "Fit chart to width" actually does `setZoom(1)` (reset-to-100%); correct today only via the width==container invariant. | PDF-1 (PerformanceToolbar.tsx:174) | 02 |
| **WS-27** | No explicit DPR guard on `<Page>` (likely sharp via library default; verify on device). | PDF-5 (PDFPageWrapper.tsx:20-28) | 02 (verify-on-device) |
| **WS-28** | `SwipeOverlay` advertises "swipe to change songs" but there is **no swipe handler** and the component is **unmounted** (nav is chevron-only). Decide: implement swipe or delete the stale promise. | NAV-1 (SwipeOverlay.tsx:39-40) | 02 |
| **WS-29** | Audio charts effectively online-only (iPad WebKit rejects `<audio src=blob:>`). *(No audio rows this weekend.)* | OFF-5 (AudioViewer.tsx:64-93) | 03 |
| **WS-30** | Offline full-reload depends on the SW having cached *that* track URL during the online session (2s window). | OFF-4 (perform-shell-sw.js:122-147) | 03 |
| **WS-31** | QR session-registration race: phone scanning before the iPad's background POST lands sees "expired". | PUB-3 (QRSignIn.tsx:60-87; qr/[code]/page.tsx:37-47) | 04 |

---

## Confirmed-GOOD (no fix — verified, do not re-investigate)

- **Offline open-chart + offline next-chart nav** — live-confirmed working (PDF Song 12→13, text Song 5→6); "Saved offline" indicator renders. PDF path is IDB-first/offline-correct. (Phase 03 = close WS-10/WS-12 only.)
- **Publish recipient model** — real publish refuses `recipients_required`; org-walled; test-uid gates keep fan-out off real humans (PUB agent). Anon access to a published `/perform/setlist/[id]` works (err-public).
- **Transpose pitch math** — `transposeChord` correct per `music-math.test.ts` (only spelling/alignment nits: WS-04/19/23/25).
- **Nav core** — next/prev bounds, header-row exclusion, prefetch abort-guarding, reload place-keeping for song rows: correct (the bug is non-song rows, WS-01).
- **All 3 weekend sets are chart-healthy** (`verify_setlist_charts`: 0 missing/0 unreachable; unbonded rows are intentional section/header rows). None published yet.

---

## Coverage (what was run / what was NOT — no silent caps)

**Sweep cells run** (`e2e/v11-6-perform-stress.spec.ts`, prod, both orientations): load+hydrate · enumerate-rows · open-chart · transpose · zoom-fit · next/prev nav · **wifi-drop**. Artifacts: per-cell `observations.json` + screenshots (01-listing … 05-offline) under `test-results/`.
- **Fully characterized (landscape):** Juneteenth (PDF) + Havdalah (text) — open/nav/zoom/offline all PASS; transpose click timed out (WS-22).
- **Portrait runs (Havdalah/Staff) did NOT hydrate** (button count stayed 2) — root cause = WS-02 (CSP/Firestore long-poll in headless WebKit). This is a *finding*, not a harness defect; headless WebKit + Firestore streaming is also lower-fidelity than a real iPad.

**Code audit:** all 5 surfaces covered (text-render, PDF/image+zoom, perform-nav, offline, publish/deliver) with file:line citations.

**NOT run / deferred to real-device UAT (→ `.paul/UAT-PENDING.md`):**
- Real 11" iPad Safari (not headless WebKit) — confirm WS-02 hydration on real device + actual camp-wifi; confirm WS-01 by opening a bonded prayer row; confirm WS-22 transpose reachability; confirm WS-03 legibility at music-stand distance.
- **Image-chart cells** (WS-06/15) — none of the 3 weekend sets contain image charts.
- **MusicXML** (WS-10) — none in the 3 sets (forward-risk only).
- **Audio offline** (WS-29) — no audio rows in the 3 sets.
- Live publish/notify SEND (WS-11/21/31) — STOP-gate; verify via dryRun/preview in phase 04, real send is human-gated.

---

## Phase routing summary

- **v11.6-02 (Perform reading airtight):** WS-01(P0), WS-03, WS-04, WS-05, WS-06, WS-07, WS-08, WS-09 (P1); WS-14..20, WS-22 (P2); WS-23..28 (P3). **WS-02 (CSP) is a one-line quick win — pull in early.**
- **v11.6-03 (Off-site resilience):** reframed to VERIFY (offline works) + close WS-10(P1), WS-12, WS-13(P2), WS-29, WS-30(P3). The `checkpoint:decision` shrinks to "how far to close the residual gaps" (no full re-introduction needed).
- **v11.6-04 (Authoring + publish round-trip):** WS-11(P1), WS-21(P2), WS-31(P3) + finalize/verify the 3 sets (already chart-healthy); live send STOP-gated.
