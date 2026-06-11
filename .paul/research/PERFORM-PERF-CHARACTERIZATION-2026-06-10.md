# /perform Performance Characterization — BUG-2 (v11.3-04-01 VERIFY-FIRST)

**Date:** 2026-06-10 · **Plan:** v11.3-04-01 (research/measurement) · **Oracle:** `docs/ACCESS-POLICY.md` v0.3
**Method:** (1) field-RUM slice probe `scripts/v11-3-04-webvitals-slice.mjs` over `webVitalsObservations` (sinceDays=7, n=1068); (2) synthetic Playwright capture against **PROD** at the band's **820×1180 iPad WebKit** viewport (cold + warm), PerformanceObserver buffered LCP + layout-shift + navigation timing + DOM structural probe.

> **Headline reversal (VERIFY-FIRST did its job):** the suspected cause — *chart-image reflow* — is **REFUTED**. The chart viewer (`/perform/setlist/[id]`) is healthy (CLS 0.010). The regression lives entirely on the **`/perform` listing page**, and its CLS is caused by the **QR sign-in card growing after first paint** and pushing the Upcoming/Past-services lists down. The LCP/FCP/TTFB regression is **cold-load + force-dynamic SSR latency**, not render.

---

## § 1 — Field decomposition (real-user RUM, n=1068, 7d)

**Per-surface p75** (CWV "good": LCP≤2500 · FCP≤1800 · CLS≤0.1 · TTFB≤800):

| surface | LCP | FCP | CLS | TTFB | n(LCP/CLS) | verdict |
|---|---|---|---|---|---|---|
| **`/perform`** (listing) | **2600** | **3551** | **0.200** | **1633** | 61/54 | ⛔ the regression — all four poor |
| `/perform/setlist/[id]` (viewer) | 1368 | 852 | **0.010** | 658 | 24/26 | ✅ healthy — refutes chart-reflow |
| `/setlists` (comparator) | 1112 | 672 | 0.020 | 37 | 44/39 | ✅ healthy |

**`/perform` by navigationType × deviceType** (the dominant cell named):

| cell | LCP | FCP | CLS | TTFB | n(LCP/CLS) |
|---|---|---|---|---|---|
| **cold(navigate) · desktop** ← dominant | 3012 | 3656 | 0.100 | **1633** | **44/41** |
| cold(navigate) · mobile | 4092 | 4468 | 0.360 | 2330 | 6/6 |
| warm(reload/bf) · mobile | 1424 | 1424 | 0.510 | 970 | 6/6 |
| warm(reload/bf) · desktop | 1020 | 1020 | 0.060 | 447 | 1/1 |
| tablet (iPad) — any | 346–799 | — | — | — | 2/cell |

**Findings:**
- **Cold-dominated.** Cold `navigate` TTFB **1633ms** vs warm **447ms**; cold LCP 3012 vs warm 1020. The poor p75 is the cold first-load path. TTFB is the lead domino — it pushes FCP/LCP late.
- **Listing, not viewer.** `/perform/setlist/[id]` (the chart viewer) is CLS 0.010 / LCP 1368 — fine. The headline belongs to the `/perform` **listing**. **Chart-image-reflow hypothesis refuted for the headline.**
- **CLS** p75 0.200 = 0.100 cold-desktop pulled up by 0.36–0.51 mobile cells (narrower viewport amplifies the same reflow).
- **iPad underrepresented** (n≈2/cell — band not onboarded yet). Field data is mostly Daniel's desktop + some mobile → **synthetic iPad capture is load-bearing here, not confirmatory.**
- **Secondary (low-traffic, NOT the headline):** individual `…/track/<uuid>` pages and `/setlists/[id]` show CLS 0.4–0.61 on tiny samples — *that* is real chart-render reflow, but out of the BUG-2 listing scope. Logged for v11.3-05/backlog, not fixed here.

---

## § 2 — Synthetic attribution (820×1180 iPad WebKit, PROD)

| metric | cold load | warm reload |
|---|---|---|
| TTFB | 214 ms | 28 ms |
| FCP | 1232 ms | 428 ms |
| LCP | 1232 ms | 428 ms |
| **CLS** | **0.1869** | **0.1869** (identical) |

- **LCP element:** `h3.font-semibold.text-base.truncate` — the **first service card's title text** ("Shabbat Morning — Parashat Beha'alotcha"). Fonts already `loaded` at measure; LCP == FCP (single text paint). LCP is *not* the problem — it rides on TTFB/FCP timing.
- **CLS source (decisive):** one 0.1869 layout-shift at ~497–1553ms whose `sources[]` are the two **`section.flex.flex-col.gap-3`** blocks — **"Upcoming"** (@640×286) and **"Past services"** (@640×196). Both shift down *together*.
- **DOM structural probe** — the container `div.flex.flex-col.gap-4` orders its children:
  1. `div.flex.items-center.gap-3` header row (@640×48)
  2. **`section.bg-card.rounded-2xl.p-5` "Scan with your phone to sign in"** — the **QR sign-in card, @640×380** ← grows after first paint
  3. `section…gap-3` **Upcoming** (gets pushed down)
  4. `section…gap-3` **Past services** (gets pushed down)
  - → The QR card sits *above* both lists; its late client-side QR render expands the card, shifting everything below. `imgsNoDims: []` (no raw `<img>` missing dimensions — it's the card/QR slot's own height delta).
- **CLS is deterministic** (identical cold & warm) → it reproduces every load, independent of network. A pure layout-reservation fix kills it.
- **Synthetic TTFB (214/28ms) ≪ field TTFB (1633ms cold).** My measurement is from a warm edge / fast link; the real-user cold TTFB is edge-cold + the per-request Firestore query. **The TTFB fix must be validated against field RUM (re-run the slice probe post-deploy), not synthetic.**

**Code loci identified:**
- CLS → `src/components/auth/QRSignIn.tsx` (the "Scan with your phone to sign in" card) as placed in `src/components/performance/PublicSetlistListing.tsx`.
- TTFB/FCP/LCP cold → `src/app/perform/page.tsx`: `export const dynamic = "force-dynamic"` (opted out of ISR for per-host `x-org-id` tenant scoping — v11-04-01) + a synchronous per-request `getAllSetlists({ limit: 50, org })` Firestore query blocking SSR. `/setlists` (TTFB ~35ms) is the cached/fast comparator.

---

## § 3 — Ranked fix list → input to Plan v11.3-04-02

Each item: **{metric moved · code locus · approach · regression cite · CRC-byte-identity / do-not-regress risk}**.

### FIX-1 (rank 1 — highest impact, lowest risk): Reserve height for the QR sign-in card → kill the 0.187 CLS
- **Metric:** CLS 0.200 → target ≤ 0.1 (ideally ~0.02 like `/setlists`).
- **Locus:** `src/components/auth/QRSignIn.tsx` + placement in `PublicSetlistListing.tsx`.
- **Approach:** reserve the card's final height before the QR renders — fixed `min-height` (or aspect-ratio box) on the QR image/canvas slot and the card, so the QR loading in does not change layout height. The card already settles at @640×380; reserve that. Pure CSS/markup; deterministic shift means this fully resolves it.
- **Regression cite:** new synthetic CLS probe (reuse this plan's Playwright pattern at 820×1180) asserting `/perform` cumulative layout-shift < 0.1 → cites the **web-vitals `/perform` CLS cell** (0.200 baseline). Optionally an emulator-free jsdom test asserting the reserved-height style is present.
- **Risk:** LOW. CRC byte-identity: QRSignIn is shared — verify the reserved height is visually identical for CRC (no layout change, only earlier reservation). Do-not-regress: none. **Touches UI → /ui-ux-pro-max BLOCKING.**

### FIX-2 (rank 2 — addresses the LCP/FCP/TTFB headline): Cut `/perform` cold SSR latency
- **Metric:** TTFB 1633→ target ≤800 (cold); cascades to LCP 2600→<2500 / FCP 3551→<1800.
- **Locus:** `src/app/perform/page.tsx` (`force-dynamic` + blocking `getAllSetlists`).
- **Approach (Plan 02 to pick one, measure, keep if it moves field TTFB):**
  (a) **per-org cached data layer** — wrap the listing fetch in `unstable_cache`/`"use cache"` keyed by `org` with a short revalidate + tag, so repeat cold hits serve cached rows while staying per-tenant correct (the reason `force-dynamic` exists); or
  (b) **stream the listing** — render the shell immediately and `<Suspense>` the Firestore query so TTFB/FCP aren't blocked on the round-trip.
  Prefer (a) if per-org cache correctness is provable; (b) is the safe fallback (no caching-correctness risk).
- **Regression cite:** re-run `scripts/v11-3-04-webvitals-slice.mjs` post-deploy (field) — `/perform` cold(navigate) TTFB p75 must drop materially vs the 1633ms baseline → cites the **web-vitals `/perform` cold-cell TTFB**. (Synthetic TTFB can't prove this — field only.)
- **Risk:** MEDIUM — **must not reintroduce the v11-04-01 cross-tenant cache bug** (path-keyed ISR served broslaz CRC's setlists). Any cache MUST be keyed by `org`. CRC byte-identity: the rendered listing slice (`selectVisiblePublicSetlists`) and wire payload must stay identical (Cycle-12 F-C12-001 — no extra rows leaked). **Touches the data/render path → /ui-ux-pro-max + careful planning.**

### Plan-02 scope handoff
> **v11.3-04-02 = the `/perform` listing perf fix.** Land FIX-1 (QR-card height reservation → CLS) and FIX-2 (cold-SSR latency → TTFB/LCP/FCP) on the `/perform` listing only. FIX-1 is the clean win (deterministic, low-risk); FIX-2 is the architecturally-sensitive one (org-keyed cache or streaming — must preserve v11-04-01 per-tenant correctness + Cycle-12 wire-payload identity). Both gated by **/ui-ux-pro-max (BLOCKING)** and CRC byte-identity. Each fix carries the regression cite above. Quality floor: tsc + tests + `SKIP_ENV_VALIDATION=1 npx next build` before deployable.
>
> **OUT OF SCOPE (do not pull in):** the chart-viewer/track-page CLS 0.4–0.61 (low-traffic, separate cause — backlog/v11.3-05 consideration); the QR card's `/api/auth/qr` 429 self-heal (**that is F-6, v11.3-05** — FIX-1 only reserves layout, does not touch the rate-limit/endpoint); D8 publish/notify (v11.4); anon recordings (D2 veto cell).

---

## Reusable assets
- `scripts/v11-3-04-webvitals-slice.mjs` — field-RUM slicer by surface × navigationType × deviceType (read-only; firebase-CLI ADC). **Re-run post-FIX-2 deploy to verify field TTFB drop** (the FIX-2 regression cite).
- Playwright iPad-viewport (820×1180) CLS/LCP capture recipe (this doc § 2) — basis for the FIX-1 synthetic CLS regression probe.
