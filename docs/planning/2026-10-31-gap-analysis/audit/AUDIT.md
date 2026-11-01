# Product audit: 2026-11-01

**Scope:** the whole web app as of branch `refresh/consistency` (#45). The chart rendering itself
is out of scope.

**Method:** three read-only passes, plus the impeccable detector. Detail is in this folder:
- `a11y-responsive.md`: live in Chromium at 390, 820 and 1440 px, using axe, a keyboard walk,
  200% text and synthesized touch.
- `performance.md`: code review plus Chromium mobile traces (Slow 4G, 4× CPU) against production.
- `theming-integrity.md`: a token, dark-mode and drift review, plus the detector.

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | The chart viewer isn't a modal (focus stays on the hidden setlist), editor rows can't be opened from the keyboard, and the Settings toggles have no names |
| 2 | Performance | 2 | A 587 KB logo is shown at 30 px on every page; Perform has about 1.5 s of long tasks from warming up the chart renderers |
| 3 | Responsive | 3 | No overflow at 100% and touch gestures work, but there are many sub-44 px controls (Settings, Library, the chart toolbar) and the phone breaks at 200% text |
| 4 | Theming | 2 | 459 raw palette classes across 77 files; dialogs and menus are still in the old dark-only colours |
| 5 | Implementation Integrity | 3 | A conditional pass: the main views are coherent, but the dialog layer and the retired assets (favicon, OG image) still carry the old look |
| | **Total** | **12/20** | **Acceptable: significant work needed** |

## Implementation Integrity verdict
**Conditional pass.**
- **Coherent:** the main views share one system and it is product-specific (siddur section bands,
  page calls, the tokens, and the shared header, chips and rows).
- **Detector:** all 6 hits are false positives (the reduced-motion override, a JSX comment, and
  test files).
- **The redesign stops at the overlay layer:**
  - `ui/context-menu.tsx` is a stock shadcn copy with hard-coded greys.
  - The Upload, Scraper, Importer and Add Songs dialogs use the old zinc and blue colours.
  - The favicon, Apple icon, OG image and manifest still use the retired indigo/violet look.
  - Dead dashboard components (HeroCard and five others) still ship gradients and blur.

## Counts
- **P0:** 0.
- **P1:** 9.
- **P2:** about 20.
- **P3:** about 15.

## Top issues (all P1)
1. **The chart viewer is not a modal.** `PDFOverlay.tsx:487` has no dialog role or focus trap,
   so Tab walks the hidden setlist (a11y).
2. **Light-mode legibility in the overlay layer** (theming):
   - The editor's context-menu Delete is `text-red-300` on white, about 2:1 (`SetlistGrid.tsx:712`).
   - The Add Songs selection is about 3:1 (`AddSongsModal.tsx:205`).
   - The Matrix view's sticky cells use black backgrounds with dark text (`SetlistMatrixView.tsx:100,132`).
3. **The Perform warm-up freezes the screen** (perf). `PerformClientLayout.tsx` downloads and
   evaluates OSMD (about 1.2 MB) plus pdf.js on a fixed 2 s timer in iPad Safari, giving about
   1.5 s of long tasks just when a musician taps. The pdf worker (295 KB) also downloads twice.
4. **A 587 KB `logo.jpg` is shown at 26–32 px everywhere** (`OrgLogo.tsx`, a plain `<img>`), and
   the `/login` logo loads at low priority (LCP 3.2 s) (perf).
5. **Keyboard and naming gaps** (a11y):
   - Editor rows are a focusable div with no role and no Enter/Space (`MobileRowCard.tsx:298`).
   - Five Settings toggles have no name, and three of them don't announce on/off.
6. **Sub-44 px targets** (responsive): the shared small button sizes and the switch fall under
   44 px, giving about 18 on Settings plus Upload/Add Song and the chart drawer button.

## Systemic patterns
- **The overlay layer (dialogs, menus, sheets) was never refreshed.** Most of the hard-coded colour
  and the light-mode legibility bugs live there.
- **Shared primitives are below the floor.** The small button sizes and the switch are under
  44 px, so every screen inherits the problem.
- **Assets and metadata were outside the refresh**: the logo weight, the favicon and OG image, and
  the theme-colour.

## What works
- Section bands, page calls and the tokens are coherent. The ochre band passes contrast (dark ink,
  above 5:1).
- No horizontal overflow at 100%. Reduced motion is honoured. Drag-reorder and edge taps work
  under touch, and cancelled gestures leave nothing stuck.
- The chart renderers are lazy-loaded, fonts are handled well, and CLS is near 0 on `/login`.
- Dark-mode values exist for every token in use.

## Recommended actions (in order)
1. **[P1] `/impeccable harden`:**
   - Make the chart viewer a modal (dialog role, focus trap, return focus).
   - Make editor rows buttons with keyboard support.
   - Name the Settings toggles and use real switches.
   - Name the mobile Exit button.
   - Read song titles in the reorder announcements.
2. **[P1] `/impeccable colorize` (token sweep of the overlay layer):**
   - Rebuild `ui/context-menu.tsx` on tokens.
   - Move the Add Songs, Upload, Scraper and Importer dialogs and the Matrix cells to tokens.
   - Give Brothers Lazaroff its own primary instead of `bg-blue-600`.
3. **[P1] `/impeccable optimize`:**
   - Resize the logo (about 64 px, AVIF/WebP, through `next/image`).
   - Make the warm-up idle-only and fetch-only (no evaluate) after first interaction, cancelled
     while a chart opens.
   - Download the pdf worker once.
   - Fix `fetchpriority` on the login logo.
   - Trim Sentry from first load.
4. **[P1/P2] `/impeccable adapt`:**
   - Bring the shared small button sizes and the switch up to 44 px hit areas.
   - Reflow at 200% text on phones.
   - Add keyboard and pedal scrolling in the chart viewer (Daniel deferred pedal keys, but
     keyboard access is an a11y need).
5. **[P2] `/impeccable typeset`:** fix the heading hierarchy (make the section bands headings,
   with no skipped levels) and the contrast of the chip and "Screen on" text.
6. **[P2] `/impeccable distill`:**
   - Delete the dead dashboard components.
   - Replace the favicon, Apple icon, OG image and manifest colours with the new identity.
   - Make the theme-colour per tenant.
7. **`/impeccable polish`:** a final pass across every screen at 390, 820 and 1440, in light and
   dark.
