# Product re-audit: 2026-10-31 (after PRs #46–#49)

**Scope:** production `https://www.centralreform.live` (deployment `dpl_3NqY53CYmLjPcXmJ7bcPQUuKvZzy`, master `e988e237`),
checked against the baseline in `AUDIT.md`, `a11y-responsive.md`, `performance.md` and `theming-integrity.md`.
The playbook is the impeccable `audit.md`, with the same 5 dimensions scored the same way. The chart rendering itself is still out of scope.

**Method:**
- **Live:** Playwright (Chromium) with a temporary `band_leader` test account (`test-gap-band_leader-68d4076f`). The account was **revoked at the end**; the cascade reported 0 setlists, tracks or other data created.
- **Sweep:** 9 routes × 390/820/1440 × light/dark (54 loads). Each load ran axe-core 4.10.2, a count of targets under 44 px (counting `touch-hit` pseudo hit areas), overflow at 100% and 200% text, and a heading outline.
- **Chart viewer:** a keyboard walk (focus trap, Tab cycle, PageDown/PageUp, Escape and focus return) and synthesized CDP touch (right, left and centre edge taps, then a vertical pan). axe ran at 390 and 820 in both schemes, plus the nested Setlist drawer.
- **Editor:** Enter/Space on a row, then a dnd-kit keyboard drag (Space, ArrowDown, Escape to cancel). The order was verified unchanged afterwards. Also the right-click context menu.
- **Perform timing:** a fresh context, 4× CPU, Slow-4G-like network (150 ms, 1.6 Mbps), with the Performance API (longtask, LCP, CLS) and CDP CPU profiles, plus `/login` LCP and fetch priority.
- **Detector:** `impeccable detect --json src/app src/components` on `e988e237`.
- **Not changed:** no saves, no reorders and no fader moves.
- **Evidence:** screenshots and the sweep script are in `C:\Users\dsbog\centralreform.live\.playwright-mcp\reaudit-*`.

## Audit Health Score

| # | Dimension | Baseline | Now | Key finding |
|---|---|---|---|---|
| 1 | Accessibility | 2 | **3** (+1) | All 4 a11y P1s are fixed (the modal chart viewer with trap and return, keyboard editor rows, named switches). One contrast failure remains in the editor (3.99:1 on 11 nodes) |
| 2 | Performance | 2 | **2** (=) | The logo, the worker, Sentry, login LCP and CLS are all fixed. **New P1:** the Perform setlist page runs a render loop with no end, about 320 IndexedDB opens per second and 55–80% of a core while idle |
| 3 | Responsive | 3 | **3** (=) | Shared targets are now 44 px. Section-only editor rows are 30 px tall on touch, and the editor still overflows by 137 px at 200% text on a phone |
| 4 | Theming | 2 | **3** (+1) | Raw palette classes fell from 459 in 77 files to 18 in 6 (the shell overlays, which are acceptable). Left: one light-mode legibility miss (Add Song empty state, 2.15:1) and the manifest `theme_color` |
| 5 | Implementation Integrity | 3 | **3** (=) | The overlay layer, icons and OG card now speak the system, and the dead components are gone. Left: drift from the DESIGN.md type ramp (118 detector advisories) and a broken Matrix view |
| | **Total** | **12/20** | **14/20** | **Good: address the weak dimension (Performance)** |

Performance would be 3 (giving 15/20) once the render loop is fixed. Every item the baseline named under Performance is closed.

## Implementation Integrity verdict
**Pass (the conditional is lifted for the overlay layer).**
- The context menu, Add Songs, Upload, Scraper, Importer, the Matrix cells, the Perform drawer and GlobalAlertBanner all run on tokens.
- The favicon, Apple icon and OG card are redrawn on book-cloth with flat section bands. The live `/icon` and OG card were verified.
- `viewport` is now `generateViewport()`, giving a per-tenant theme colour.
- `components/dashboard/*` (HeroCard and others) and `RabbiBanner` are deleted.
- Both Manage sub-pages use `PageHeader`.

**Detector:** 5 hits, all the same false positives as the baseline: the reduced-motion kill switch at `globals.css:665`, a JSX comment at `login/page.tsx:132`, and 3 test files. It also found 125 new *advisory* findings now that it reads DESIGN.md:
- 118 font sizes off the type ramp (`10px` ×81, `11px` ×18, `1.35rem` ×6, `9px` ×5).
- 6 colours outside DESIGN.md: the BL login hero oklch values at `globals.css:677-681`, and `SmartTransposer.tsx:158-160` violet (`#6d28d9`), which is in the music viewer.
- 1 radius.

These are drift, not defects.

## Status of the baseline P1s and P2s

### Accessibility and responsive (`a11y-responsive.md`)
| Baseline item | Status | Evidence (production) |
|---|---|---|
| P1 Chart viewer not a modal | **Fixed** | `role=dialog aria-modal=true aria-label="<song> chart"`. 6 `[inert]` siblings. Focus lands on the chart region on open. Tab cycles only inside the dialog (40 presses, 0 stops outside). Escape closes it and returns focus to the opening row. The nested Setlist drawer traps too, and Escape closes only the drawer, with focus back on "Setlist" |
| P1 Editor rows not keyboard-operable | **Fixed** | `div role=button tabindex=0 aria-expanded aria-label="Edit <title>"`. Enter opens (`aria-expanded=true`) and Space toggles. *Escape does not close the inline editor* (new P3) |
| P1 Settings toggles unnamed or not switches | **Fixed** | 0 axe `button-name` on `/settings` in any of the 6 viewport/scheme runs. Shared `Switch` with `htmlFor` / `aria-labelledby` |
| P1 Sub-44 px targets | **Mostly fixed** | `Button sm` and `icon-sm` have a `touch-hit` 44 px hit area. Library Upload and Add Song are 32 px drawn plus the hit area. Setlist drawer 44×44. Perform avatar and `/login` footer are no longer flagged. Left: mobile Exit is 42×48, the Settings name button is 235×26, the desktop search field is 40 px, and the editor section-only rows are 30 px tall (new P2) |
| P2 Contrast: editor chip and "Screen on" | **Partly fixed** | Keep-awake: 0 contrast violations in the chart viewer or Perform, light or dark. Editor: **still 3.99:1 (#77808e on #fff), 11 nodes**. The baseline put this on the chart chip, but the real node is the italic section-only title `text-sm italic text-muted-foreground/80` at `MobileRowCard.tsx:397`. The `/80` alpha is the cause |
| P2 Manage avatars without `alt` | **Fixed** | 0 axe `image-alt` on `/manage` |
| P2 Mobile Exit unnamed | **Fixed** | `aria-label="Exit"` at 390. 0 `button-name` |
| P2 Reorder announcements read UUIDs | **Fixed** | Live region: "Nigun 2 (DG Mando) moved to position 5 of 35." and "Reorder cancelled. Nigun 2 (DG Mando) is back at position 4 of 35." Order verified unchanged |
| P2 Chart not keyboard or pedal scrollable | **Fixed (axe residue)** | The region `aria-label="Chart pages. Arrow keys, Page Up, Page Down and Space scroll."` is focusable. PageDown scrolled 0→157 (the end), and PageUp returned to 0. axe still reports `scrollable-region-focusable` on 1 inner scroller (`.dark:bg-zinc-900`) at every width (P3) |
| P2 Heading levels | **Fixed** | `/setlists` outline is 1-2-2-3-3-2-3… with no skips. Editor bands are `role=heading aria-level=2`. Perform is 1-2-2-2-2-2. 0 `heading-order` |
| P2 Phone 200% reflow | **Partly fixed** | Overflow at 390 / 200%: `/library` 174→**0**, `/setlists` 51→**0**, editor 153→**137** (the page-call column `min-w-14` scales with rem, `MobileRowCard.tsx:528`), `/settings` 61→52, `/` 28→28 (Edit setlist / Set Up Instrument buttons) |
| P2 Weak Perform row focus | **Fixed** | `focus-visible:outline-3 outline-ring -outline-offset-3` (3 px solid) |
| P3 Fader / mute 32 px | Not re-tested (no mixer access) | `icon-sm` now has `touch-hit`, so the mute button gets a 44 px hit area by inheritance (code read) |
| P3 Reduced motion kills spinners | **Still open** | `globals.css:662-665` still sets `.animate-spin { animation:none }` |

### Performance (`performance.md`)
| Baseline item | Status | Evidence |
|---|---|---|
| P1-1 587 KB logo at 26–32 px | **Fixed** | The header requests `/logo-64.avif`, **1.8 KB**, cache-control `max-age=604800` |
| P1-2 Warm-up evaluates OSMD/pdf.js (≈1.5 s long tasks) | **Fixed as specified, but long tasks remain** | The warm-up is now fetch-only (10–14 chunk `fetch`es and no big script evaluation). Long tasks after FCP at 4× are still **1.5–2.3 s** (523–576, 356–414 and 385–443 ms around hydration, then 170–200 ms at about 9 s and one 713–888 ms task at 10–14 s). Profiling shows these are driven by the render loop below, not the warm-up |
| P2-1 pdf worker downloaded twice | **Fixed** | One request (`fetch`, 295 KB) per cold entry |
| P2-2 `/login` LCP image low priority | **Fixed** | `fetchpriority=high`, CDP initial priority **High**. LCP 3.19 s→**2.26 s** (mobile, 4×, Slow-4G-like) |
| P2-3 Perform CLS 0.07 | **Fixed** | CLS **0.001 / 0.017** over 2 cold loads |
| P2-4 Perform TTFB 622 ms; uncached image optimizer | **TTFB fixed; cache partly** | TTFB 199–271 ms (curl and Performance API). `/logo-64.avif` is cached for 7 days, but `/logo.jpg` and `/_next/image?url=/logo.jpg` (the login LCP) still send `max-age=0, must-revalidate` even though `minimumCacheTTL: 86400` is set |
| P2-5 Editor grid re-renders every row | **Still open** | `SortableRow` is not wrapped in `memo` (`SetlistGrid.tsx`). Not in the scope of #48 |
| P2-6 Sentry full namespace | **Fixed** | `@sentry/browser` trimmed client (`src/lib/sentry-browser.ts`, `sentry-lazy.ts`). No script over 65 KB transferred on `/login` |

### Theming and integrity (`theming-integrity.md`)
| Baseline item | Status | Evidence |
|---|---|---|
| P1-1 Context-menu Delete pale red | **Fixed** | Delete row is `rgb(180,35,47)` on `#fff` (about 6.5:1), and the menu is `bg-popover` |
| P1-2 Add Songs selection dark-on-blue | **Fixed** | `bg-primary text-primary-foreground` and `bg-brand/10 text-brand` (`AddSongsModal.tsx:168,205,210`) |
| P1-3 Matrix built for black | **Fixed in code; view unusable** | Sticky cells are `bg-card` with `hover:bg-accent`. But on production the view shows "Failed to load matrix data": `GET /api/setlists/matrix` returns **401** because `SetlistMatrixView.tsx:52` uses a bare `fetch` with no auth. This predates #46 (new P1, integrity) |
| P2-1 Perform drawer retired blue | **Fixed** | The current row is `primary`, and 0 axe violations in light or dark (screenshot `reaudit-drawer-light.png`) |
| P2-2 BL theme-colour and section-blue | **Fixed (code)** | `generateViewport()`, and BL dark `--section-blue: oklch(0.42 0.03 255)`. Not verified live, because there is no BL account |
| P2-3 Dark slabs in light dialogs | **Mostly fixed** | Upload has 0 axe violations. Add Song (Scraper) empty state "Ask me to find a specific song…" is **2.15:1** (`ScraperModal.tsx:276`, new P2) |
| P2-4 Favicon / Apple / OG / manifest | **Mostly fixed** | `/icon` and the OG card are redrawn (screenshots `reaudit-icon.png`, `reaudit-og.png`), and the manifest `background_color` is `#F6F7FB`. **Still `theme_color: "#0e0d18"`** in the live manifest: `site.webmanifest/route.ts:26` takes `b.themeColor` from the stored org config before the code default `#23356B` (P3, a data fix) |
| P2-5 Dead dashboard components | **Fixed** | `HeroCard`, `RabbiBanner` and the others are deleted |
| P2-6 Two menu primitives | **Fixed** | `context-menu.tsx` is tokenized (`bg-popover`), with a destructive variant |
| P2-7 GlobalAlertBanner raw colours | **Fixed** | `brand`, `caution` and `destructive` tokens |
| P2-8 PageHeader on Manage sub-pages | **Fixed** | Both use `PageHeader` |

**Raw palette classes** (non-test, excluding `components/music`): **18 in 6 files**, down from 459 in 77. The top files are `DesktopHeader` (9) and `MobileHeader` (4), which are the accepted `white/x` overlays on `--shell`.

## Regressions from #46–#49
- **None confirmed.** Every baseline fix verified above holds in both schemes and at all three widths, and edge-tap page turns still work under synthesized touch: right edge forward, left edge back, centre does nothing, and a vertical pan scrolls.
- **Close calls:**
  - #48's "hold the per-row lines until the first pass settles" (`SetlistPerformClient.tsx`) does not cause the render loop below (that dates from #36/#38/#39). It also does not mask it.
  - The `invisible` reserve span in the status line is `aria-hidden`, which is correct.

## New findings

### P1
1. **The Perform setlist page never stops rendering (battery and CPU drain on the band iPads).**
   - **Evidence:** idle, chart closed or open, at 10 s and still at 30 s after load:
     - 55–80% of a core is busy unthrottled: 1.1–1.6 s of CPU per 2 s, and 2.3 s per 3 s with a chart open.
     - There are **about 320 `indexedDB.open` calls and 320 transactions per second**, with zero DOM mutations and zero network requests.
     - The hot frames are React render, lucide `createElement`, cva, date formatting and IDB `open`/`transaction`.
     - It happens on both setlists tested and signed in or out. `/perform`, `/setlists` and `/login` idle at about 0 ms.
   - **Cause (code):**
     - `SetlistPerformClient.tsx:301-305` builds `songFileIds` as a new array on every render and passes it to `<SaveOfflineButton fileIds>` (`:490`).
     - In `SaveOfflineButton.tsx:64-127`, `cacheable` is `useMemo([fileIds])`. Its identity changes, so `recount` changes, and the effect at `:136` re-runs `recount()`.
     - `recount` calls `listFileIds()`, which opens IDB again through `withStore` (`offline-idb.ts:52`). It then calls `setSavedIds(new Set)` and `setFailures(new Map)`.
     - The `onReadyChange` effect then sets new objects in the parent, so the parent re-renders and the cycle repeats.
   - **Impact:**
     - An iPad on a music stand burns battery and heats through the whole service.
     - The constant render traffic produces the long tasks still seen after load (up to 888 ms at 4×), which compete with page turns.
   - **Fix:**
     - `useMemo` `songFileIds` on the joined id string, or key `cacheable` on `sig`.
     - Only set state when the count or set content changes.
     - Reuse one open IDB connection.
     - Add a test that counts renders or IDB opens over an idle second.
   - **Command:** `/impeccable optimize`.
2. **The Setlists "Matrix" view is broken on production.** `SetlistMatrixView.tsx:52` calls `fetch('/api/setlists/matrix?type=…')` with no bearer, and `createApiHandler` requires auth, so it returns 401 and shows "Failed to load matrix data". The toggle sits on the main Setlists toolbar. The fix is to use the app's authenticated fetch helper, or hide the toggle. **Command:** `/impeccable harden`.

### P2
3. **Editor section-only title contrast is 3.99:1** (`MobileRowCard.tsx:397`, `text-muted-foreground/80`), on 11 nodes in light at every width. Drop the `/80`. **Command:** `/impeccable colorize`.
4. **Add Song (Scraper) empty-state text is 2.15:1 in light** (`ScraperModal.tsx:276`). Use `text-muted-foreground` with no reduced opacity. **Command:** `/impeccable colorize`.
5. **Editor section-only rows are 30 px tall on touch** (390 and 820). They are `role=button` "Edit INTRO" and similar, so they are tap targets under the 44 px rule (16–18 per setlist). Give the row `min-h-11` on coarse pointers. **Command:** `/impeccable adapt`.
6. **The editor still overflows by 137 px at 200% text on a phone.** The page-call column is `min-w-14 sm:min-w-16` with `whitespace-nowrap` at 1.5rem numerals (`MobileRowCard.tsx:528`). Let it wrap under the title below `sm`, or size it with `ch` and drop `nowrap`. **Command:** `/impeccable adapt`.

### P3
7. Escape does not close an expanded inline editor row: `aria-expanded` stays `true`, and only Space or Enter toggles it.
8. axe `scrollable-region-focusable` on the inner chart scroller (`.dark:bg-zinc-900`), even though keys work through the labelled outer region. It needs `tabindex=-1`/`0` or role tuning on the inner node.
9. The Settings display-name button is 26 px tall and wraps an `<h3>` (a heading inside a button). The mobile Exit button is 42 px wide.
10. The live manifest `theme_color` is still `#0e0d18`, from the stored CRC org config. It is a data update, not code.
11. `/logo.jpg` and `/_next/image?url=/logo.jpg` (the `/login` LCP) send `max-age=0, must-revalidate`.
12. Unauthenticated, non-crawler requests to `/icon`, `/apple-icon` and `/opengraph-image` get a 307 to `/login` (they are inside the proxy matcher). Signed-out browsers fall back to `favicon.ico`. This was there before the PRs.
13. A React hydration error #418 (text mismatch) is logged on `/setlists`. It is likely the time-of-day greeting.
14. Type-ramp drift: 118 detector advisories, mostly 10 and 11 px micro-labels. Either add a documented micro step to DESIGN.md or fold them into `text-xs`.
15. Carried over: the reduced-motion spinner freeze, and P2-5 (editor rows not memoized).

**Counts:** P0 0 · P1 2 · P2 4 · P3 9. The baseline had 9 P1, about 20 P2 and about 15 P3.

## Recommended next actions
1. **[P1] `/impeccable optimize`:** fix the Perform render loop. Make `songFileIds` and `cacheable` stable, set state only on change, and keep one IDB connection. Add a regression test for idle renders and IDB opens. Then re-measure long tasks after FCP; the target is under 500 ms total at 4×.
2. **[P1] `/impeccable harden`:** make the Matrix view fetch with auth, or remove the toggle.
3. **[P2] `/impeccable colorize` + `adapt` (one small PR):**
   - the `/80` on the editor section title;
   - the Scraper empty-state contrast;
   - `min-h-11` on section-only editor rows;
   - the page-call column reflow at 200%;
   - Escape to close the inline row.
4. **[P3] data and config:** set the CRC org `themeColor` to `#23356B`, and give `/logo.jpg` and the image optimizer long cache headers.
5. **[P3] `/impeccable typeset`:** decide on the micro type step (10/11 px) in DESIGN.md and sweep the 118 advisories.
6. **Re-verify on a real iPad (WebKit)**, plus a Brothers Lazaroff account for the tenant colours, which this pass couldn't cover.
