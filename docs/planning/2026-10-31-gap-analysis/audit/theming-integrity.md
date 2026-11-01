# Audit: Theming and Implementation Integrity

Date: 2026-10-31. Auditor: read-only, impeccable `audit` playbook, dimensions 3 and 5 only.
Code: `wt-refresh-r4`, branch `refresh/consistency` at `1f7c28fe` (after the consistency sweep, 128 files changed since `72e59584`).
Contract: `docs/design/WEB-REFRESH-BRIEF.md`, `docs/design/DESIGN.md`, `docs/design/design.json`.
Out of scope: the chart viewers in `src/components/music` and the PDF/OSMD canvas. Test files are not counted.

## Scores

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 3 | Theming | **2 / 4** | The token system is complete and both tenants re-skin through it, but 459 raw Tailwind palette classes remain in 77 files. Several of them break light mode on in-scope surfaces: the setlist row delete item, the Add Songs selection and the matrix view. |
| 5 | Implementation Integrity | **3 / 4** | The detector is clean once false positives are removed (6 hits, all false). The shell, page head, list and section bands form one product-specific system. The drift sits in secondary dialogs, a second menu primitive, dead dashboard components and the retired-palette OG image, favicon and manifest. |

## Implementation Integrity Verdict: PASS (conditional)

The refreshed surfaces state one coherent, product-specific system, not a generic SaaS kit:
- **Tokens:** `globals.css` defines the blend-E palette on `:root` (book-cloth `--shell`, `--rule` hairline, the four `--section-*` hues each with its own ink, `--warning-line`, `--caution`). It redefines them under `.dark` and re-skins Brothers Lazaroff through `[data-org="brotherslazaroff"]` and `.dark[data-org=…]`, as DESIGN.md §"Do use the shared tokens" requires.
- **Layout primitives:** `src/components/layout/Page.tsx` holds the shared primitives (`PageContainer`, `PageHeader`, `LIST_GROUP_CLASS`, `CARD_CLASS`, `GROUP_HEADING_CLASS`). The PageHeader title matches the brief (1.6rem, 800 weight).
- **Section bands:** section hues come from one module, `src/components/setlist/grid/section-bands.ts`.
- **Detector:** after verification, no detector findings remain (see the table below).
- **Glass:** the only remaining `glass-card` uses are the two exceptions documented in `globals.css:394-396` (the chart toolbar and the BL login).

**Why conditional:** the refresh stops at the edge of the main path. The modals (Add Songs, Upload, Scraper, Importer), the setlist-editor context menu, the matrix view and the Perform setlist drawer still carry the retired dark-indigo look, with hard-coded zinc, blue and black colours. Three of these are real light-mode legibility failures (P1 below). The build is not a FAIL because these are bounded, nameable files rather than systemic drift on the refreshed views.

### Detector run (`impeccable detect --json src/app src/components`, 6 hits, exit 2)

| Hit | Location | Verdict |
|---|---|---|
| bounce-easing `animate-bounce` | `src/app/globals.css:621` | **False positive.** It is inside the `prefers-reduced-motion` block and sets `animation: none` on `.animate-bounce`. It is a kill switch, not a use. |
| broken-image `<img>` | `src/app/login/page.tsx:132` | **False positive.** The match is inside a JSX comment ("was a raw <img> pointing at public/logo.jpg"). The rendered element is `next/image` `<Image>` with `src={logoUrl}`, guarded by `logoUrl ? … : <OrgLogo/>`. |
| broken-image `<img onerror>` | `src/components/music/__tests__/text-score-viewer.test.tsx:69` | **False positive.** It is a test fixture (and out of scope). |
| broken-image `<img>` ×3 | `src/components/nav/__tests__/org-logo.test.tsx:6,19,28` | **False positive.** These are test assertions on OrgLogo. |

## Theming: what was checked

**Hard-coded colours (non-test, excluding `components/music`):**
- **Tailwind palette classes:** 459 in 77 files. Top: `ui/context-menu.tsx` 26, `dashboard/HeroCard.tsx` 25, `scheduling/ScheduleCard.tsx` 20, `layout/GlobalAlertBanner.tsx` 18, `setlist/importer/ImporterModal.tsx` 16, `performance/SetlistDrawer.tsx` 16, `monitor/VerticalFaderStrip.tsx` 15, `monitor/FaderStrip.tsx` 15, `manage/library-review/LibraryReviewClient.tsx` 15, `setlist/modals/AddSongsModal.tsx` 14, `library/ScraperModal.tsx` 14, `library/UploadDialog.tsx` 13, `schedule/page.tsx` 13, `scheduling/RabbiBanner.tsx` 12, `nav/DesktopHeader.tsx` 11.
  - About 40 of these are dead code (HeroCard, CommandRow, WhatsChangedBanner, UpcomingTimeline, RabbiBanner; see P2-5).
  - About 90 are in monitor or scheduling, which are outside the brief's scope list.
  - `bg-white/10` and `border-white/25` on the shell in `DesktopHeader.tsx` and `MobileHeader.tsx` are acceptable: they are translucent overlays on `--shell` and re-skin correctly under BL teal.
- **Hex literals:** 41 in 12 files. Legitimate:
  - `opengraph-image.tsx`, `icon.tsx` and `apple-icon.tsx` render rasters and cannot read CSS variables (but see P2-4 on which palette they use).
  - The Google "G" glyph in `LoginClient.tsx`.
  - The QR code (`QRSignIn.tsx:217`, black on white for scanning).
  - `print-document.ts` (paper).
  - `layout.tsx:146-147` theme-color (see P2-3).
  - `SongChartsLibrary.tsx:505` is a comment ("#100"), not a colour.
- **`rgb(` literals:** mostly the DESIGN.md shadow vocabulary written inline as `rgb(24_32_46/…)`, 9 times (see P3-1).

**Dark mode completeness (`globals.css`):**
- Every colour token on `:root` is redefined under `.dark` except `--chart-1..5` and `--sidebar-ring`.
- No component uses `chart-*` or `sidebar-ring` (grep: 0 hits), so there is no visible defect, but the token set is incomplete. If charts are ever used, `--chart-5` (#23356B) on the dark ground (#0F1420) would be near-invisible.
- The dark values follow DESIGN.md (night-blue ground, section hues a step deeper, brand lifted to #7AA2FF).

**BL overrides:**
- **Correctly overridden:** ground, shell, shell-active, rule, brand, primary, the full sidebar set, and Zilla Slab on h1–h3.
- **Not overridden:** `--section-*`, `--destructive`, `--success`, `--warning-line` and `--caution`, so BL inherits CRC's `.dark` values (see P2-2).

**Theme switch:**
- No `getComputedStyle` or `getPropertyValue` calls.
- The only inline colour styles are in the OG image.
- No component branches on `resolvedTheme` to pick a colour; the one `theme ===` check is the Settings radio state.
- Nothing is computed once and then left stale. Clean.

## Findings

### P1: Major (light-mode legibility, fix before band onboarding)

**[P1-1] Delete item in the setlist row menu is pale red on white**
- **Location:** `src/components/setlist/grid/SetlistGrid.tsx:712`. `text-red-300 focus:text-red-200 focus:bg-red-500/15` sits on the `ContextMenuContent`, which is `bg-white` in light mode (`ui/context-menu.tsx:50`).
- **Impact:** about 2:1 contrast on the most destructive action in the setlist editor (WCAG 1.4.3 fails). These are dark-theme values that were never translated.
- **Recommendation:** use `text-destructive focus:bg-destructive/10`, which matches `dropdown-menu.tsx`'s `data-[variant=destructive]`.
- **Suggested command:** `/impeccable colorize`.

**[P1-2] Add Songs selected row puts dark ink on the blue fill**
- **Location:** `src/components/setlist/modals/AddSongsModal.tsx:205`. The selected state is `bg-blue-600 text-foreground`.
- **Impact:** in light mode `--foreground` is #18202E on #2563EB, about 3:1, so the selected song's name is hard to read (1.4.3). Lines 168 and 210 also hard-code `bg-blue-600`, `border-blue-500` and `bg-blue-500/10 text-blue-500` instead of `primary`/`brand`. Under BL these show CRC blue, where BL's primary is the pale teal action (DESIGN.md: "Don't let a CRC color … into the Brothers Lazaroff theme").
- **Recommendation:** `bg-primary text-primary-foreground` for the selected state and `bg-brand/10 text-brand` for the tint.
- **Suggested command:** `/impeccable colorize`.

**[P1-3] Setlists matrix view is built for a black ground**
- **Location:** `src/components/setlist/SetlistMatrixView.tsx:77,91,95,100,132`. The view uses `bg-black/20`, `bg-black/80 backdrop-blur-md` (sticky header), and `bg-black/60 … group-hover:bg-black` (sticky row label, whose text inherits `--foreground`). It is reachable from the Setlists toolbar's Matrix toggle (`SetlistToolbar.tsx:77`).
- **Impact:** in light mode the sticky slot labels are dark ink on a 60% black cell, and on hover the cell turns solid black with dark ink, so the labels become unreadable. The grey wash on the table also contradicts the white surfaces in the brief.
- **Recommendation:** use `bg-card` for the sticky cells (opaque, no blur), `bg-background` or `bg-card` for the wells, and `hover:bg-accent`.
- **Suggested command:** `/impeccable colorize`, then `/impeccable polish`.

### P2: Minor (drift, wrong tenant colours, retired look)

**[P2-1] The Perform setlist drawer still uses the retired blue scheme**
- **Location:** `src/components/performance/SetlistDrawer.tsx:67,76,86-116,314-349`. It has 16 palette classes: `bg-blue-600 text-white` for the current row, `text-blue-100`, `text-blue-300` on hover, `bg-blue-500/10 text-blue-400` icon wells, and `text-blue-400` labels on `bg-blue-500/10`.
- **Impact:** in light mode `text-blue-400` and `text-blue-300` sit below 3:1 on white or muted (1.4.3 for the 349 label, 1.4.11 for the icons). Under BL the current row is CRC blue. This drawer is on the Perform path the brief puts in scope (the drawer, not the chart).
- **Recommendation:** current row `bg-primary text-primary-foreground`, tints `bg-brand/10 text-brand`, labels `text-muted-foreground`.
- **Suggested command:** `/impeccable colorize`.

**[P2-2] BL inherits CRC section hues and the CRC browser theme-colour**
- **Location:**
  - `globals.css`: `.dark[data-org="brotherslazaroff"]` defines no `--section-*`, so `--section-blue` resolves to `#2B4080`, CRC's book-cloth step.
  - `src/app/layout.tsx:144-148`: the static `viewport.themeColor` is `#23356B` / `#141B30` for every tenant, while `site.webmanifest` correctly uses BL's `#04201f`.
- **Impact:** on BL, browser and iOS chrome show book-cloth blue above a teal shell, and the fourth section band is CRC blue on a teal ground. DESIGN.md says the section hues are shared, but it also says "Don't let a CRC color … into the Brothers Lazaroff theme". These two rules conflict for section-blue.
- **Recommendation:**
  - Make `viewport` a `generateViewport()` that reads the org (as `generateMetadata` already does).
  - Decide whether BL gets a teal or slate fourth hue.
  - Record the decision in DESIGN.md.
- **Suggested command:** `/impeccable colorize` (the section-blue choice is a wording or product call for Daniel only if it lacks precedent).

**[P2-3] Light-mode dialogs contain hard-coded dark slabs**
- **Location:**
  - `src/components/library/UploadDialog.tsx:248`: the selected-file tile is `bg-zinc-900 border-zinc-800`, with `text-zinc-300/400/500` around it.
  - `src/components/library/ScraperModal.tsx:281-325`: assistant bubbles are `bg-zinc-800/80 text-zinc-100`.
  - `src/components/setlist/importer/ImporterModal.tsx:536`: `bg-zinc-800 text-zinc-300` chips, plus `text-blue-500`, `text-emerald-500` and `text-red-500` status text.
  - `LibraryReviewClient.tsx`: `text-rose-*` and `text-emerald-*`, 15 in all.
- **Impact:** black blocks inside white dialogs. They stay legible but contradict "clean white surfaces". Status colours bypass `--success`, `--destructive` and `--caution`, so they do not deepen in dark mode or change for BL.
- **Recommendation:** `bg-muted text-foreground` for the tile and bubbles; status through `text-success`, `text-destructive` and `text-caution`.
- **Suggested command:** `/impeccable colorize`.

**[P2-4] Favicon, Apple icon, OG image and manifest still carry the retired indigo/violet palette**
- **Location:**
  - `src/app/icon.tsx:20-78`, `src/app/apple-icon.tsx`: the "luminous rings" mandala, with gradients from `#0e0d18` to `#1a1830` and an orb from `#a855f7` to `#7c3aed`.
  - `src/app/opengraph-image.tsx:58-215`: the same violet gradient world.
  - `src/app/site.webmanifest/route.ts:22-23`: `background_color: "#0e0d18"`.
  - `src/lib/org/branding.ts:67`: CRC `themeColor: "#0e0d18"`.
  - `src/components/platform/NewTenantForm.tsx:26`: the default `#4f46e5`.
- **Impact:** every shared link, home-screen icon and PWA splash presents the pre-refresh glow-and-gradient look that DESIGN.md §"Don't" retires. The iPad home-screen splash (`background_color`) flashes near-black indigo before the light app paints.
- **Recommendation:** regenerate on book-cloth (#23356B) and white with the section hues as flat bands, set the manifest `background_color` to `#F6F7FB`, set the CRC `themeColor` to `#23356B`, and use a neutral new-tenant default.
- **Suggested command:** `/impeccable colorize`, then `/impeccable polish`.

**[P2-5] Dead dashboard and scheduling components keep the retired look in the tree**
- **Location:**
  - `src/components/dashboard/index.ts` still exports `HeroCard` (25 palette classes, `bg-gradient`, `backdrop-blur`), `CommandRow`, `UpcomingTimeline`, `WhatsChangedBanner`, `TaskCards` and `PrepRecommendations`. Their only consumer is a commented-out import at `src/app/(main)/DashboardClient.tsx:29`.
  - `src/components/scheduling/RabbiBanner.tsx` has no importers.
- **Impact:** about 40 of the 459 palette hits, plus gradients and glow. They are a trap for the next builder, who will copy them as precedent. They also inflate the drift count.
- **Recommendation:** delete them, or move them to `archive/` under rule 14.
- **Suggested command:** `/impeccable distill`.

**[P2-6] Two menu primitives with different styling**
- **Location:** `src/components/ui/context-menu.tsx` is a stock shadcn copy: `bg-white`, `border-zinc-200`, `text-zinc-950` and `focus:bg-zinc-100`, with `dark:` patches, 26 palette classes. `src/components/ui/dropdown-menu.tsx` is tokenized (`bg-popover`, `focus:bg-accent`, a destructive variant).
- **Impact:** the setlist row's right-click menu and its "⋯" dropdown look different, and only one of them follows `--popover` and the BL teal. The context menu has no destructive variant, which is why P1-1 hand-rolled red-300.
- **Recommendation:** restyle context-menu with dropdown-menu's token classes and a `variant="destructive"`.
- **Suggested command:** `/impeccable polish`.

**[P2-7] GlobalAlertBanner uses raw blue, yellow and red**
- **Location:** `src/components/layout/GlobalAlertBanner.tsx:17-19`. It is mounted on every page via `AppNavigation`.
- **Impact:** the info, warning and error banners use `text-yellow-600`, which is about 3:1 on its own `bg-yellow-500/10` (fails 1.4.3), and `text-blue-600` instead of brand. The warning tone should be `--caution`, which the system defines for exactly this case.
- **Recommendation:** info `text-brand`/`bg-brand/10`; warning `text-caution`/`bg-caution/10`; error `text-destructive`/`bg-destructive/10`.
- **Suggested command:** `/impeccable colorize`.

**[P2-8] PageHeader not adopted on two Manage sub-pages**
- **Location:** `src/app/(main)/manage/library-review/LibraryReviewClient.tsx` and `src/app/(main)/manage/templates/page.tsx` render their own `<h1>`. Manage is in the brief's scope.
  - `perform/setlist/[id]/SetlistPerformClient.tsx:394` copies the PageHeader classes by hand. This is acceptable but duplicated.
  - Legal, changelog and QR pages are outside the brief.
- **Impact:** the head row's scale and actions placement differ between Manage pages.
- **Recommendation:** use `PageHeader`.
- **Suggested command:** `/impeccable layout`.

### P3: Polish

**[P3-1] Shadow vocabulary is not tokenized**
- **Location:** `rgb(24_32_46/0.06|0.10|0.12|0.18)` is written out 9 times (`NextServiceCard.tsx:87`, `login/page.tsx:149,153,164`, `MobileRowCard.tsx:325,544`, `SetlistGrid.tsx:596`). The 0.12 and 0.18 values are not in DESIGN.md's vocabulary.
- **Recommendation:** add `--shadow-float`, `--shadow-panel` and `--shadow-rest` (dark-aware) as `@theme` shadows.
- **Suggested command:** `/impeccable polish`.

**[P3-2] Blur on refreshed bars**
- **Location:** `SetlistGridTopBar.tsx:48` (`bg-background/85 backdrop-blur-md`), `SongChartsLibrary.tsx:743`, `SelectionActionBar.tsx:33`, `MobileMenuDrawer.tsx:107` (`backdrop-blur-xl`), and `ui/dialog.tsx` and `ui/sheet.tsx` overlays.
- **Impact:** DESIGN.md says "Don't use glass … on refreshed surfaces". These are subtle frosted bars rather than glass cards, but they are not in the system, and blur is costly on the 11" iPads.
- **Recommendation:** use opaque `bg-background` or `bg-card` with the hairline.
- **Suggested command:** `/impeccable quieter`.

**[P3-3] AddBar type icons are pastel**
- **Location:** `src/components/setlist/grid/AddBar.tsx:66,71`: `text-blue-300` for prayer and `text-emerald-300` for transition, on a light bar.
- **Impact:** non-text contrast of about 1.8:1 (1.4.11).
- **Recommendation:** use `text-brand` and `text-section-green`.
- **Suggested command:** `/impeccable colorize`.

**[P3-4] Incomplete dark token set**
- **Location:** `--chart-1..5` and `--sidebar-ring` have no `.dark` values (`globals.css` `.dark` block).
- **Impact:** none today, because both tokens have no consumers.
- **Recommendation:** add dark values or delete the tokens.
- **Suggested command:** `/impeccable polish`.

**[P3-5] BL card and popover are translucent glass leftovers**
- **Location:** `.dark[data-org="brotherslazaroff"]`: `--card` is `/0.5`, `--popover` is `/0.80`, `--muted` is `/0.5`, and `--sidebar` is `/0.85`. These alpha values date from the glass era.
- **Impact:** with blur gone from refreshed surfaces, a 50%-alpha card shows content beneath sticky or floating elements. The BL login (`login/page.tsx:39-77`) keeps the glow blobs and `glass-card`. This is a documented exception, but login is in the brief's scope.
- **Recommendation:** make BL card and popover opaque, and confirm with Daniel whether the BL login keeps its photo-and-glass hero.
- **Suggested command:** `/impeccable quieter`.

**[P3-6] Stale comments**
- **Location:** `login/page.tsx:13` still describes "ambient glow … glass-card" for the CRC SSR path. The `globals.css` BL header comment says "Navy hue ~252/255" while the values are teal ~198-210.
- **Impact:** these mislead the next reader.
- **Suggested command:** `/impeccable document`.

## Patterns

- **The refresh is complete on the main views but not in dialogs.** In the shell, PageHeader, lists, section bands and login, colours come from tokens. Every modal and drawer reached from those views (Add Songs, Upload, Scraper, Importer, the Perform setlist drawer, the matrix view, the context menu) still has the dark-era classes.
- **The P1s come from dark-only values.** Classes such as `-300` and `-400` text, `bg-black/x` and `zinc-800` were chosen when the app was dark-only and were never rechecked for light-first.
- **The BL re-skin fails exactly where a component bypasses tokens.** Every hard-coded `bg-blue-600` shows CRC blue on BL.

## Positive findings

- **The token architecture is right.** One `@theme inline` map carries semantic names (shell, rule, section hues with paired foregrounds, warning-line, caution), and the contrast notes in the comments are verified (muted at 5.6:1, caution at 5.9:1).
- **BL re-skins the shell and primary purely through variables.** `DesktopHeader` and `MobileHeader` need no tenant branches.
- **No colour is computed once and then left stale on theme change.** The forced-dark BL path (`forcedTheme`) is clean.
- **There is one place each** for page width, page head, list group and card class, and one module for section-band assignment.
- **`prefers-reduced-motion` is handled deliberately.** This is the detector's lone motion hit.

## Recommended actions

1. **[P1] `/impeccable colorize`:** SetlistGrid delete item, the AddSongsModal selection, and the SetlistMatrixView sticky cells.
2. **[P2] `/impeccable polish`:** retokenize `ui/context-menu.tsx` to match `dropdown-menu.tsx` and add a destructive variant.
3. **[P2] `/impeccable colorize`:**
   - SetlistDrawer, GlobalAlertBanner, Upload, Scraper and Importer dialogs, LibraryReview status colours.
   - The BL theme-color via `generateViewport`, and the BL fourth section hue.
4. **[P2] `/impeccable colorize`:** regenerate the favicon, Apple icon and OG image, and fix the manifest `background_color` and CRC `themeColor`.
5. **[P2] `/impeccable distill`:** delete or archive the dead `components/dashboard/*` and `RabbiBanner`.
6. **[P2] `/impeccable layout`:** PageHeader on Manage → Library review and Templates.
7. **[P3] `/impeccable quieter`:** remove blur from the refreshed bars, and make BL card and popover opaque.
8. **[P3] `/impeccable polish`:** shadow tokens, the dark chart and sidebar-ring tokens, and stale comments. Run it last.
