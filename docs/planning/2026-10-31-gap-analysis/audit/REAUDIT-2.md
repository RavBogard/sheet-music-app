# Product re-audit 2: 2026-11-01 (after option B, PR #56)

**Scope:** production `https://www.centralreform.live` while it still served option B (master `848c9554`, which contains #56 `ce4038a8`). Every file:line below is cited against `ce4038a8`. The lead is reverting B (#57), so this file is the **redo checklist for B**.

**Method:**
- **Playbook:** the impeccable `audit`, with the same 5 dimensions and scoring as `REAUDIT.md`. The lead asked for the weight to sit on **visual quality**, so the findings are ranked by how ugly or broken they look to a musician, not by WCAG severity. Compliance findings are tagged separately.
- **Live walk:** Playwright (Chromium) with a temporary `band_leader` account (`test-reaudit-band_leader-10d8ac79`). It was **revoked at the end**: the cascade removed 1 token and reported 0 setlists, tracks or other data.
- **Sweep:** 10 routes (`/`, `/setlists`, the editor, `/perform`, a Perform setlist, `/library`, `/manage`, `/manage/templates`, `/settings`, `/monitor`) at 390 and 820, in light and dark (40 loads). Each load ran axe-core 4.10.2, a count of targets under 44 px, overflow at 100% and 200% text, and a heading outline. Also `/login` signed out, a 1440 spot check of `/setlists`, the chart viewer (modal, PageDown and Escape), and an idle check of Perform (IndexedDB opens and long tasks).
- **Mock comparison:** `docs/design/setlist-mock-B.html`, rendered at 820 beside the shipped Perform setlist.
- **Detector:** `impeccable detect --json src/app src/components`.
- **Not changed:** nothing was saved, reordered, uploaded or deleted. The setlist used was `77d140d9…` (Shir Shabbat, Nov 6).
- **Screenshots:** `docs/planning/2026-10-31-gap-analysis/audit/shots-2/` (00–12). `02`, `03` and `04` are annotated.

## Audit Health Score

| # | Dimension | Before (REAUDIT) | Now | Key finding |
|---|---|---|---|---|
| 1 | Accessibility | 3 | **3** (=) | axe is clean on 9 of 10 routes in both schemes. `/manage/templates` "Custom" badge is 4.18:1 and has a heading skip. The editor's recordings buttons are 36 px at 820 |
| 2 | Performance | 2 | **3** (+1) | The Perform render loop is **fixed**: 0 IndexedDB opens in 5 s idle and 0 ms of long tasks in 3 s (before, about 320 opens a second) |
| 3 | Responsive | 3 | **2** (−1) | At 390, Manage cuts names to 3 letters. Editor titles wrap beside an empty page column. Perform's header is about 200 px tall. At 200% text, `/manage/templates` overflows by 296 px and `/` by 65 px (it was 28) |
| 4 | Theming | 3 | **3** (=) | Raw palette is still 18 classes in 6 files (the accepted shell overlays). Dark mode is coherent. Ochre notes are loud in dark |
| 5 | Implementation Integrity | 3 | **1** (−2) | **The Assistant face never renders: the whole app is in the OS system font.** B's character didn't carry through. Each screen uses a different page-call, row-action and card-title treatment, and Templates and Settings are still on the old look |
| | **Total** | **14/20** | **12/20** | **Acceptable: significant work needed (Integrity, then Responsive)** |

## Does the build match mock B?

**Only partly. The section label is the one piece that carried over; the rest diverged structurally.** See `shots-2/03-mock-vs-perform-setlist.png`.

| Mock B | Shipped |
|---|---|
| Assistant typeface | The system UI font (Segoe UI on Windows, SF on iPad). Assistant is downloaded but never applied (finding V1) |
| Header: title plus **one** meta line, Perform on the right | Perform: title, then 2–3 wrapped meta lines (counts, "7/7 charts on this iPad", book, parasha), then a separate 5-button toolbar row (Screen on, Saved, Reorder, Print, Edit). About 110 px at 820 and 200 px at 390 |
| A muted row number on every row | No numbers in Perform. The editor has them |
| Keys in a fixed column; page numbers as bare bold book-blue numerals in a fixed right column | Key tags float, because the page cell and the Swap gutter exist only on some rows (V2). Pages read "p. 8" in Perform but "p." 11 px muted plus a bold numeral in the editor |
| One continuous card. Sections are a 2 px coloured rule with a small uppercase label and a muted "pp. N–M" | **Matches** (`section-bands.ts`, `LiturgyRunDivider.tsx`). But each section is its own card with about 30 px of ground between them, so the list reads as fragments |
| Regular-weight titles; notes as a small muted oxblood second line | Titles are `font-semibold text-base` (16 px/600). Notes are bold ochre (`text-caution`), loud in dark mode |

The other screens took only B's header size (16 px/800) and quiet group labels. None of them took its row grammar.

## Implementation Integrity verdict
**Fail (systemic drift).**

1. **The type system isn't applied anywhere.** `layout.tsx:206` puts the next/font *variable* class on `<body>`, so `--font-sans` resolves to `"Assistant","Assistant Fallback"` on body. But no element uses it:
   - `globals.css:21` is a self-reference (`--font-sans: var(--font-sans)`) inside `@theme inline`, so Tailwind's preflight `--default-font-family` is never emitted;
   - no element carries `font-sans`.

   Live: `document.fonts` lists Assistant as `unloaded`, and `body`, `h1` and `/login` compute to `ui-sans-serif, system-ui…`. This was not introduced by #56. It undercuts every typographic decision in DESIGN.md and the mock, and it is the main reason the type "feels cheap".
2. **The same idea is drawn several ways from screen to screen.** Page calls, row actions, status indicators and card-title sizes each have 2–4 renderings (details below).
3. **Two screens are untouched old look:** `/manage/templates` and most of `/settings`.

**Detector:** 46 findings.
- 5 warnings, all false positives as before: `animate-bounce` and 4 `<img>` warnings in avatar fallbacks.
- 41 advisories: arbitrary font sizes (`10px` ×15, `13px` ×13, `11px` ×3, `0.8rem` ×2, `2rem` ×1), 6 undocumented colours and 1 radius.
- In source there are still 63 arbitrary `text-[…]` sizes, including `0.92rem` ×5 and `15px` ×9 sitting beside `0.95rem` ×7. These are near-duplicates of one step.

## Findings, ranked by how they look to a musician

### V1 [P1] The whole app renders in the system font, not Assistant
- **Where:** `src/app/layout.tsx:206` (the body className) and `src/app/globals.css:21`.
- **Look:** generic Segoe UI / SF. The 800-weight headlines look heavy and cramped, the weights don't match the mock, and Windows and iPad differ.
- **Fix:**
  - Add `font-sans` to the body className in `bodyFontClassName()` (`layout.tsx:92-102`).
  - Or add `@layer base { body { font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif } }`.
  - Remove the self-referential `--font-sans` line from `@theme inline`.
  - Verify that `document.fonts.check('16px Assistant')` is true on `/setlists` and `/login`.
- **Command:** `/impeccable typeset`.

### V2 [P1] Perform setlist: the key and page columns are ragged
- **Where:** `src/components/performance/SetlistRow.tsx:139-147`, where `folioBadge` is `null` when a row has no folio. Also `:451-463`, where the Swap gutter (`w-14 border-s`) wraps only rows with `onSwapTap`.
- **Look:** key tags sit at 4 different x positions in one section (C at 755, D at 697, Dm at 628). A grey vertical rule appears and disappears down the list (`shots-2/03`).
- **Fix:**
  - Always render the `w-14` page cell; leave it empty when there is no folio.
  - When any row on the setlist can swap, render the gutter on every song row (empty when that row can't), or move Swap into the row's long-press or context menu.
  - Put the key in its own fixed `w-10` cell, not inline after the title.
- **Command:** `/impeccable layout`.

### V3 [P1] Perform setlist header is the old tall header, not B's one line
- **Where:** `src/app/perform/setlist/[id]/SetlistPerformClient.tsx:660-740`: the meta paragraph wraps (`flex-wrap`, `:660`), then `<SetlistFamilyHead>` (`:724`, with the parasha line from `SetlistFamilyHead.tsx:57`), then a second toolbar row (`:727`).
- **Look:** at 390 the title wraps to 2 lines and the meta to 3, and the toolbar is a separate row of icons with an unexplained blue dot on the lock (`shots-2/11`). That spends about 25% of the phone screen before the first song.
- **Fix:**
  - Use the mock's grammar: title, then one meta line ("Fri Nov 6 · 7/7 saved"), then Edit or Perform on the right.
  - Move Reorder, Print and Screen-on into one "⋯" menu or a compact icon cluster on the title row.
  - Drop "12 songs · 16 items · Updated…" to the editor.
  - Fold the parasha into the meta line.
- **Command:** `/impeccable distill`.

### V4 [P1] /setlists: four row treatments in one list (Daniel's "worst page")
`shots-2/02-setlists-annotated.png`, `05` (390), `06` (1440), `07` (dark).

1. **Row actions differ by row type and width.**
   - **Upcoming row:** an outlined "Edit" button, a download icon and a kebab, but only at ≥1024 (`SetlistCards.tsx:183`, `:198`, both `hidden lg:flex`). At 820 it shows a kebab only.
   - **Past rows:** a bare pencil and a kebab at every width (`SetlistCards.tsx:341-362`).
   - **Family-group heads:** no actions at all (`VariantGroupList.tsx:46-53`).
   - So at 820 the next service, the row a leader most wants to edit, is the only one without a pencil.
   - **Fix:** one `RowActions` component: a ghost pencil and a kebab on every row at every width, with download in the kebab.
2. **Family-group head is a different component** (`VariantGroupList.tsx:46-61`).
   - **Layout:** `pt-3 pb-1` and a `text-base` (16 px) title, against 0.95 rem rows, so the title is indented 4 px and the row is about 100 px tall.
   - **Toggle:** "Show 4 other versions" sits on its own line, indented with `ps-[4.75rem]` (`:55`), so it doesn't line up with the titles at 89 px.
   - **Fix:** render the head with the same `ROW_CLASS` and `<h3>` as `SetlistCards.tsx:49/336`. Put "＋4 versions" as a small chip in the meta line (or a chevron at the right) that expands inline.
3. **The date is shown three times per row:** the date block ("OCT 31"), the title ("… — Oct 31", set by the author) and the meta line ("Oct 31, 2026", `SetlistCards.tsx:99`).
   - **Fix:** drop the date from the meta line (`SetlistCards.tsx:99-110`). It is already in the block. The title is author data, so leave it.
4. **Title weights are mixed:** upcoming 700 (`SetlistCards.tsx:165`), past 600 (`:336`), and "Plan Service" 600 muted with a dashed box in place of the date block (`:440-443`). The ghost row looks disabled.
   - **Fix:** one weight (600). Give Plan Service the normal date block (muted "SAT 7") and a brand-coloured "＋ Plan service" title.
5. **Copy:** "1 upcoming setlists scheduled." (`src/i18n/en/setlist.json:37`; `_one` is plural). The greeting is home-page copy reused as the page subtitle.
   - **Fix:** `_one` → "{count} upcoming setlist". Consider dropping the greeting here.
6. **Header stack:** three uppercase labels ("All setlists", "Upcoming services", "Library & past events") sit within about 80 px. "All setlists" labels a filter row and a search icon (`SetlistToolbar.tsx:35`), not a group. At 390 the 4 filter chips wrap to 2 lines.
   - **Fix:** drop the "All setlists" label, put search and chips on one row, and let the chips scroll horizontally on a phone.
7. **The 390 meta line wraps to 3 lines** ("Oct 31, 2026 · 15 songs · / 15/15 charts · / Updated Sat 9:17am"). Removing the date (item 3) and "Updated…" below `sm` keeps it to one line.
8. **"7/12 charts" in bold ochre** (`SetlistCards.tsx:77`) is the only colour in the list besides links. With 7 of 19 rows flagged it reads as a page of warnings. Use `text-caution` without `font-semibold`, or a small dot.
- **Command:** `/impeccable layout`, then `/impeccable clarify`.

### V5 [P1] Manage at 390: names truncated to 3 letters
- **Where:** `src/components/admin/UserRow.tsx:395-401` (`min-w-0 flex-1 truncate`) against the fixed `w-[7.5rem]` select (`:451`, `:455`), plus the kebab and checkbox.
- **Look:** "Mei…", "Dre…", "rabbi…" (`shots-2/04`). The People list is unusable on a phone.
- **Fix:** below `sm`, stack the role select under the name (or show the role as a tappable badge that opens the select) and give the name the full width.
- **Command:** `/impeccable adapt`.

### V6 [P2] Editor at 390: titles wrap beside empty columns; the status dot is orphaned
- **Where:**
  - `src/components/setlist/grid/MobileRowCard.tsx:596-611` reserves `min-w-12` for the page call on every non-band row, even with no folio.
  - `SyncIndicator.tsx:208` and `:223` hide the "Saved" label below `sm` (`sr-only sm:not-sr-only`), which leaves a green dot and a check floating beside Perform.
  - The parasha sits on its own loose line (`SetlistFamilyHead.tsx:57`).
- **Look:** "Ashir Oz (Zach / Fredman)" wraps while about 60 px to its right is blank (`shots-2/04`).
- **Fix:**
  - Render the page cell only when the setlist has any folio, and collapse it below `sm` when the row has none.
  - Keep one status glyph (the check) and drop the dot.
  - Fold the parasha into the header meta line.
- **Command:** `/impeccable adapt`.

### V7 [P2] Three page-call treatments and misaligned section page ranges
- **Where:** editor `MobileRowCard.tsx:606-607` ("p." 11 px muted plus a 0.85 rem bold numeral); Perform `SetlistRow.tsx:143` ("p. 8", all bold page-call); mock: a bare numeral. The editor section range carries `pb-1` (`MobileRowCard.tsx:592`), so "pp. 10–16" sits about 6 px below its label (`shots-2/04`, third panel). In Perform they align.
- **Fix:** one `PageCall` component used by both. Keep "p." for meaning, but at the same size and colour as the numeral (or use `aria-label="page 8"` and drop it visually, as the mock does). Remove `pb-1` and align the label row with `items-baseline`.
- **Command:** `/impeccable polish`.

### V8 [P2] Card titles larger than page titles; mixed card anatomy in Settings
- **Where:**
  - `/monitor`: the page h1 "Monitor" is 16 px, and the card h2 "No wedge mixer access yet" is 17 px (`monitor/page.tsx:47`).
  - Home: the "You're approved!" card has the same inversion (`OnboardingCard.tsx:152`).
  - Settings uses four anatomies in one column:
    - Account: a 16/800 name (`settings/page.tsx:164`).
    - Appearance and Live Gig Mode: 14/700 with no icon (`:181`, `:214`).
    - Push Notifications: an ochre icon tile and a 16/600 title (`PushNotificationSettings.tsx:96`).
    - Musician Profile: a blue icon tile and an 18/600 title (`MusicianProfileSettings.tsx:102`).
    - A tan callout and grey filled instrument tiles.
- **Fix:**
  - Card titles at most the B headline (1 rem/800 page, 0.875 rem/700 card).
  - One settings-row anatomy: title, description, control. Icon tiles everywhere or nowhere.
  - The instrument grid as outlined chips like the Appearance segmented control.
- **Command:** `/impeccable layout`.

### V9 [P2] `/manage/templates` is entirely the old look
- **Where:** `src/app/(main)/manage/templates/page.tsx:36` (its own `p-6 pb-24` container, not `PageContainer`). "Template Editor" with a round ghost back button. A disabled "Import from Setlist" floats alone. An unboxed two-pane list, cramped at 820. A "Custom" badge `bg-caution/20 text-caution` (`src/components/admin/TemplatesSection.tsx:238`, and `TemplateEditor.tsx:166`) at **4.18:1** (axe, light). An h1→h3 skip. **296 px overflow at 200% text** at 390.
- **Fix:**
  - Use `PageContainer` and `PageHeader` like Manage, with a list card using `ROW_CLASS` rows.
  - Make the badge `bg-caution/10 text-caution` or an outlined tag in ink.
  - Make the group labels `h2`.
  - Stack the panes below `md`.
- **Command:** `/impeccable layout`.

### V10 [P2] Editor icon column: rows of faded ghost icons; 36 px targets
- **Where:** `MobileRowCard.tsx:549-556` (the "no chart" FileText at `text-muted-foreground/40`) and `:581` (the disabled `RecordingCell` `h-9 w-9` with no `touch-hit`).
- **Look:** half the rows show two pale icons that read as broken controls (`shots-2/08`). At 820 the sweep counts 9 buttons at 36×36 (axe passes, but they are under 44).
- **Fix:**
  - Render nothing when there is no chart. The red "No chart" second line already says it.
  - Show the recordings control only for bound songs, or give the disabled one `touch-hit`.
- **Command:** `/impeccable distill`.

### V11 [P2] Perform notes are bold ochre at full width
- **Where:** `SetlistRow.tsx:308` (`text-xs font-medium text-caution line-clamp-2`).
- **Look:** long author notes become 2 lines of orange in dark mode and dominate the list (`shots-2/03`). The mock uses a small muted oxblood line.
- **Fix:** `text-muted-foreground`, or the section's ink at 0.75 rem, and clamp to 1 line on Perform with tap to expand.
- **Command:** `/impeccable quieter`.

### V12 [P3] Library rows are not dense, and the virtualizer estimate is wrong
- **Where:** `src/components/library/row-metrics.ts:26` (`ROW_ESTIMATE_PX = 45`) against measured rows of **61 px** (`LibraryFileRow.tsx:162` plus the icon and two lines).
- **Look:** 14 rows per iPad screen against about 22 in the mock's density. The leading file icon repeats on every row.
- **Fix:** drop the leading icon (the type already shows in "PDF · CRC"), use one meta line, aim for about 44 px, and set the estimate to the measured height. A wrong estimate also makes the scroll thumb jump.
- **Command:** `/impeccable distill`.

### V13 [P3] Shell inconsistencies
- **Footer:** on short pages (`/`, `/monitor`) the footer is a white band floating mid-screen above the tab bar.
- **Bottom tab bar:** no active tab on `/` and `/perform`, and the tab labels shift 7 px between pages that have the footer and pages that don't.
- **`/perform`:** lists the next service twice (the hero, then the first row of "Upcoming"; `PublicSetlistListing.tsx:225`), and its subtitle reads "Public setlists".
- **Fix:** pin the footer to the content end, not the viewport. Map `/` and `/perform` to the Setlist tab. Skip `upcoming[0]` in the list when the hero shows it.
- **Command:** `/impeccable polish`.

### V14 [P3] Copy defects
- "1 pending requests": `src/i18n/en/admin-people.json:61` has no `_one`.
- "Get notified when setlists are **published** or updated": `src/i18n/en/settings.json:67`. Publish is retired.
- The chart viewer footer reads "Next: Mizmor l_David D**.pdf** · E", and the dialog is named "Shiru L_Adonai Shir Shabbat.pdf chart". The file extension leaks into the UI. Strip it.
- **Command:** `/impeccable clarify`.

## Compliance status (non-visual)
| Item | Status |
|---|---|
| Perform render loop (REAUDIT P1-1) | **Fixed**: 0 IDB opens in 5 s idle and 0 ms of long tasks in 3 s, on `77d140d9` |
| Chart viewer (must stay bulletproof) | **No regression.** `role=dialog aria-modal=true`, 6 `[inert]` siblings. PageDown works, and Escape closes it and returns focus to the row (`shots-2/12`) |
| Matrix view (REAUDIT P1-2) | Removed in #54, so no longer applicable |
| axe | 0 violations on `/`, `/setlists`, the editor, `/perform`, the Perform setlist, `/library`, `/manage`, `/settings`, `/monitor` and `/login`, light and dark, 390 and 820. Only `/manage/templates` fails (V9) |
| Targets under 44 px | The footer "Rabbi Daniel Bogard" link is 127×19 and Privacy/Terms are 31–37 wide, on every page with the footer. The editor's recordings buttons are 36×36 at 820 (V10) |
| 200% text at 390 | Editor **0** (was 137; fixed). `/setlists` 0, `/library` 0. `/settings` 44 (was 52). `/` **65** (was 28, regressed: the `shrink-0` action group at `NextServiceCard.tsx:98`). `/manage/templates` **296** (V9) |
| Console | Only the Vercel toolbar CSP frame block (`vercel.live`), which is noise. No hydration error this pass |
| Raw palette | 18 in 6 files, unchanged (the accepted shell overlays) |

**Counts:** P0 0 · P1 5 (V1–V5) · P2 6 (V6–V11) · P3 3 (V12–V14) · plus 2 compliance P3s (the footer link targets and the `/` 200% regression).

## Redo checklist for B, in order
1. **[P1] `/impeccable typeset`:** apply Assistant (V1) before judging anything else; it changes every screenshot.
2. **[P1] One shared row grammar** (`/impeccable layout`):
   - a `PageCall` component;
   - fixed key, page and action cells that always render;
   - one `RowActions` component;
   - one list-row class for setlist, family-head, library and template rows.
   - This covers V2, V4.1–4.4, V7, V9 and V12.
3. **[P1] Headers to the mock's one-liner** (`/impeccable distill`): the Perform header (V3), the editor parasha line and status dot (V6), and the `/setlists` stack (V4.6).
4. **[P1] Phone pass** (`/impeccable adapt`): the Manage rows (V5), editor columns (V6), `/setlists` meta wrapping and chip scrolling (V4.6–4.7), and the templates panes (V9).
5. **[P2] Settings, Monitor and Home card anatomy (V8)**, and quieter Perform notes and chart counts (V11, V4.8).
6. **[P3] Copy and shell** (V13, V14), plus the `NextServiceCard` 200% fix.
7. **Then `/impeccable polish`**, and re-run this audit. Compare against `shots-2/00-mock-B-820.png` at 820 and 390, in both schemes.
