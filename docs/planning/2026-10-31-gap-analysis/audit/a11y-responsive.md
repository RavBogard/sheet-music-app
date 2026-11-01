# Audit: Accessibility and Responsive Design (refresh/consistency)

**Date:** 2026-10-31
**Scope:** impeccable `audit.md`, dimensions 1 (Accessibility) and 4 (Responsive Design) only.
**Code:** `wt-refresh-r4`, branch `refresh/consistency` (HEAD `1f7c28fe`).
**Live:** preview `sheet-music-4glt0gtl4-ravbogards-projects.vercel.app`, signed in as a temporary band_leader (`test-gap-band_leader-b9adeeb6`, revoked at the end; the revoke removed the auth user and 1 MCP token).
**Engine:** Playwright MCP, Chromium. Viewports 390x844, 820x1180 (the iPad target) and 1440x900. Light and dark color schemes. axe-core 4.10.2 was injected from cdnjs (WCAG 2.0/2.1 A+AA, plus best-practice in light mode).

## Scores

| # | Dimension | Score | Justification |
|---|-----------|-------|---------------|
| 1 | Accessibility | **2 / 4** | axe is clean on 5 of 10 routes, skip link, landmarks, reduced motion and Perform-row keyboard support are solid. But the chart viewer is not a modal, editor rows can't be opened from the keyboard, the Settings toggles have no names, and contrast fails in a few places. The app claims WCAG 2.1 AA and doesn't fully meet it yet. |
| 4 | Responsive | **3 / 4** | No horizontal overflow at any viewport at 100%. Editor drag, chart edge taps and page pan all work under synthesized touch. The gaps: about a dozen controls under 44px (Settings, Library, the chart toolbar) and reflow failures at 200% text on phone width. |

## Method and evidence

- **Per route and viewport:** visible interactive elements with a box under 44px, `scrollWidth - clientWidth`, then the same check after `document.documentElement.style.fontSize = '200%'`, landmarks, headings and unnamed buttons.
- **axe:** run at 820 in dark (the browser default) and again in light on all 9 signed-in routes, on the chart viewer at 390 and 820, and on `/login` (signed out, fresh context) at all three widths.
- **Keyboard:** Tab walks through the Perform setlist (22 stops), the chart viewer and the editor (30 stops). Also tried: Enter/Space on an editor row, the dnd-kit keyboard drag (Space, ArrowDown, Escape to cancel; nothing saved) and Escape on the chart viewer.
- **Touch** (synthesized with CDP `Input.dispatchTouchEvent` plus `Emulation.setTouchEmulationEnabled`, Chromium):
  - Editor: drag handle hold of 350ms, then drag. Released at the start point so no reorder was saved. Then a `touchCancel` mid-drag, and a pan on the row body.
  - Chart viewer: tap at the right edge, left edge and center, then a vertical pan.
- **Reduced motion:** `emulateMedia({reducedMotion:'reduce'})`, then a count of running animations on `/`, `/setlists` and the Perform setlist.
- **Section bands:** contrast measured in both schemes.
- **Not tested:**
  - Physical iPad or WebKit, and VoiceOver output (not run).
  - `/monitor` fader drag. The test account has no wedge mixer access, and I chose not to make a sound-engineer account that could move real wedge levels. Fader findings below come from reading the code.
  - Pinch-zoom on the chart.

**Count of controls under 44px per route** (raw automated count at 820, then the count after removing false positives: the 1px skip link, the inline footer credit link, and the Manage checkboxes, which sit inside 44px labels at `UserRow.tsx:380`):

| Route | Raw | Real |
|---|---|---|
| `/` | 4 | 0 |
| `/setlists` | 4 | 0 |
| `/setlists/[id]` (editor) | 5 | 1 (the "Add another type" chevron, 41x44) |
| `/perform` | 2 | 1 (header avatar, 36x36) |
| `/perform/setlist/[id]` | 1 | 0 |
| Chart viewer | 1 at 820, 2 at 390 | the same 1–2 ("Setlist" drawer 40x40; mobile Exit 42x48) |
| `/library` | 6 | 2 (Upload and Add Song buttons, 32px tall) |
| `/manage` | 37 | 0 (32 of them are the label-wrapped checkboxes) |
| `/settings` | 23 | about 18 (switches 36x20 and 44x24, instrument chips 42px tall, inputs 36–40px, buttons 32px) |
| `/monitor` (no-access state) | 4 | 0 |
| `/login` (signed out) | 6 | 5 footer links, 16px tall |

The numbers are the same at 390 and 1440, plus the 40px top-bar search field at 1440.

**Horizontal overflow at 100%:** 0px on every route at every viewport.

**Overflow at 200% text, 390 wide:**

| Route | Overflow |
|---|---|
| `/library` | 174px |
| Editor | 153px |
| `/settings` | 61px |
| `/setlists` | 51px |
| `/` | 28px |
| Perform, chart viewer, `/manage`, `/monitor`, `/login` | 0 |

At 820 and 1440, nothing overflowed at 200%.

## Findings

### P1: The chart viewer is not a modal. Focus and the screen reader stay on the hidden setlist behind it
- **Location:** `src/components/performance/PDFOverlay.tsx:487` (`<div className="fixed inset-0 z-50 bg-background ...">`). Route: `/perform/setlist/[id]/track/[trackId]`.
- **Evidence:**
  - After opening a chart, focus stays on the setlist row underneath.
  - The next 12 Tab stops were all setlist rows and Swap buttons covered by the overlay. `elementFromPoint` showed each one obscured.
  - There is no `role="dialog"` or `aria-modal`, and the background is neither `inert` nor `aria-hidden`.
  - Escape does close the viewer, which is good.
- **Impact:** A keyboard or switch user tabs "blind" through about 60 invisible controls before reaching the chart toolbar. VoiceOver reads the setlist, not the chart. Hardware-keyboard users on the iPad hit the same thing.
- **WCAG:** 2.4.3 Focus Order (A), 2.4.11 Focus Not Obscured (AA, 2.2), 1.3.1 Info and Relationships (A).
- **Recommendation:**
  - Give the overlay `role="dialog" aria-modal="true" aria-label={songTitle}`.
  - Set `inert` on the app shell while it is open.
  - Move focus to the overlay, or the first toolbar control, on open, and back to the opening row on close.
- **Command:** `/impeccable harden`

### P1: Editor rows can't be opened from the keyboard and have no role
- **Location:** `src/components/setlist/grid/MobileRowCard.tsx:298-317`. The `<div tabIndex={0} onClick={handleCardClick} aria-label="… Tap to edit.">` has no `role` and no `onKeyDown`. Route: `/setlists/[id]`.
- **Evidence:** I focused the "Achat Sha'alti" row and pressed Enter, then Space. Nothing opened. The DOM didn't change and focus stayed on the div.
- **Impact:** The edit fields (title, key, Vocal Lead, notes, bind chart, delete) can't be reached without a pointer. Screen readers announce a focusable generic div, and `aria-label` on a generic element is unreliable. The "Tap to edit" wording is also wrong for keyboard and VoiceOver users.
- **WCAG:** 2.1.1 Keyboard (A), 4.1.2 Name, Role, Value (A).
- **Recommendation:**
  - Add `role="button"` and an Enter/Space `onKeyDown` that calls the same handler. `SetlistRow.tsx:382` in Perform already does this correctly; copy that pattern.
  - Consider `aria-expanded` for the inline editor.
  - Reword to "Edit {title}".
- **Command:** `/impeccable harden`

### P1: Settings toggles have no accessible name, and three are not switches
- **Location:**
  - `src/components/settings/MusicianProfileSettings.tsx:187, 232, 293`: plain `<button>` styled as a toggle, with no name, no `role="switch"` and no `aria-checked`. The nearby `<label>` is not associated with it.
  - `src/app/(main)/settings/page.tsx:216` (Live Gig Mode) and `src/components/settings/PushNotificationSettings.tsx:104`: Radix `<Switch>` with no `aria-label` or `id`/`htmlFor` link.
- **Evidence:** axe `button-name` (critical) on 5 nodes at every viewport.
- **Impact:** A screen reader says "button" or "switch, off" with no subject. The three custom toggles don't even announce their state. They are also 44x24 and 36x20 (see the touch finding below).
- **WCAG:** 4.1.2 (A), 1.3.1 (A).
- **Recommendation:** Swap the custom buttons for the shared `Switch`, and give each one `id` plus `<Label htmlFor>` or `aria-labelledby` pointing at the visible label.
- **Command:** `/impeccable harden`

### P1: Settings, Library and the chart toolbar have touch targets under 44px (the PRODUCT.md and DESIGN.md rule)
- **Location:**
  - `/settings`: the shadcn `Switch` (`components/ui/switch.tsx`, h-5 w-9), the custom toggles (`MusicianProfileSettings.tsx`, `w-11 h-6`), instrument chips (42px tall), the phone input (40px), the token input (36px), and the "Generate Calendar URL" and "Generate" buttons (`size="sm"`, 32px).
  - `/library`: Upload at `components/library/UploadDialog.tsx:197` and Add Song at `components/library/ScraperModal.tsx:224`, both `size="sm"`, 32px tall.
  - Chart viewer: the Setlist drawer trigger at `components/performance/SetlistDrawer.tsx:303` (`h-10 w-10` below `lg`, so 40x40 on the 820 iPad).
  - `/perform` head: the avatar link, 36x36.
  - Editor: the add-bar chevron, 41x44.
  - `/login`: the footer links, 16px tall.
- **Impact:** Missed taps on an 11" iPad at a music stand. Most of this cluster is in Settings, which musicians use rarely, but the Setlist drawer button is used during Perform.
- **WCAG:** 2.5.8 Target Size Minimum (AA, 2.2) passes for most at 24px+. The `/login` footer links (16px tall, stacked tightly) are borderline. The project's own 44px rule (DESIGN.md "Do keep every target at 44px or more") fails.
- **Recommendation:**
  - Make `size="sm"` 44px tall on touch, or stop using it for primary actions.
  - Wrap switches in a 44px hit area: label row `min-h-11` with the whole row clickable.
  - Set `SetlistDrawer` to `h-11 w-11`.
  - Make the avatar link `size-11`.
  - Add `min-h-11` to the login footer links, as `Footer.tsx:26` already does.
- **Command:** `/impeccable adapt`

### P2: Text contrast fails in the editor chart chip and the Perform "Screen on" label
- **Location:**
  - Editor: `MobileRowCard.tsx:389`, the `chart-chip` (`text-xs text-muted-foreground`). axe measured #77808e on #fff = **3.99:1** on 14 nodes (light). It renders lighter than the `--muted-foreground` token (#556072) because of an inherited opacity or blend, so the token alone is not the cause.
  - Perform and chart toolbar: `components/performance/KeepAwakeToggle.tsx:149-153`, 11px `text-primary` on the brand tint. **4.21:1** in light (#2563eb on #e1e8f9), **3.27:1** in dark (#2563eb on #111c34).
- **Impact:** Small 11–12px metadata is hard to read in a bright sanctuary or a dim stage. The dark-mode failure is the worse of the two.
- **WCAG:** 1.4.3 Contrast Minimum (AA).
- **Recommendation:**
  - Chip: use full `text-muted-foreground` with no alpha.
  - Keep-awake label: use `night-brand` in dark, as DESIGN.md already prescribes for links and rings, and a darker brand ink (or 12px+ semibold) in light.
- **Command:** `/impeccable colorize`

### P2: Manage avatars have no `alt`
- **Location:** `src/components/admin/UserRow.tsx:391` (`<AvatarImage src=…>`). axe `image-alt` (critical) on 32 nodes.
- **Impact:** Screen readers read the image URL, or "image", on every row.
- **WCAG:** 1.1.1 Non-text Content (A).
- **Recommendation:** Use `alt=""`, because the name is already in the row text. Fix `components/ui/avatar.tsx` so `AvatarImage` defaults to `alt=""`, which also covers `DesktopHeader` and `MobileMenuDrawer`.
- **Command:** `/impeccable harden`

### P2: Mobile chart toolbar Exit button has no name below 640px
- **Location:** `src/components/performance/PerformanceToolbar.tsx:457`. The label span is `hidden sm:inline` and there is no `aria-label`. axe `button-name` at 390. The iPad at 820 shows the label, so iPad is fine.
- **WCAG:** 4.1.2 (A).
- **Recommendation:** Add `aria-label={t("perform.toolbar.exit")}`. The 485 variant already has a `title`; give it the same.
- **Command:** `/impeccable harden`

### P2: Reorder announcements read machine IDs
- **Location:** `src/components/setlist/grid/MobileCardList.tsx:149-165`. The dnd-kit announcements pass `String(active.id)` and `String(over.id)`.
- **Evidence:** The live region read "Draggable item 5f28ce24-5bed-… was moved over droppable area ab11a301-…".
- **What works:** The keyboard drag (Space, Arrow, Escape) itself works, and the handle has `aria-roledescription="sortable"` and instructions.
- **Impact:** A screen-reader user reordering a service hears UUIDs, not song titles or positions.
- **WCAG:** 4.1.3 Status Messages (AA), in spirit; 1.3.1.
- **Recommendation:** Map ids to titles with the `tracks` list already in scope: "Picked up Modah Ani, position 3 of 31", "Moved to position 4".
- **Command:** `/impeccable clarify`

### P2: The chart can't be scrolled or turned from a keyboard or pedal
- **Location:**
  - `PDFOverlay.tsx:521`: the chart scroller has no `tabIndex`. axe `scrollable-region-focusable`.
  - There is no ArrowRight, PageDown or Space handler for turning pages anywhere in `src/components/performance/`. The only keydown in `PDFOverlay.tsx:386-396` is Escape.
- **Evidence:** ArrowRight and ArrowLeft with the viewer open changed nothing. Prev/Next *song* buttons are reachable by Tab.
- **Impact:**
  - Keyboard users can't page within a long chart.
  - Bluetooth page-turner pedals, which send arrow or PageDown keys, are the normal hands-free tool for musicians and do nothing.
- **WCAG:** 2.1.1 Keyboard (A), for scrolling the content region.
- **Recommendation:**
  - Make the scroller `tabIndex={0}` with a label.
  - Route ArrowRight/PageDown and ArrowLeft/PageUp (direction-aware via `useReadingDirection`) to the same `planTurn` the edge tap zones use.
- **Command:** `/impeccable harden`

### P2: Headings: levels skip on /setlists, and no section headings in the editor or Perform
- **Location:**
  - `src/components/setlist/SetlistDashboard.tsx:175, 205`: `<h4>` directly after an `<h2>`.
  - `SetlistCards.tsx:165, 336, 440`: `<h5>` for setlist names. axe `heading-order`.
  - In the editor and Perform setlist, the section bands (Beginning, Bar'chu, Amidah …) are divs or buttons, not headings. Each page exposes only the H1.
- **Impact:** VoiceOver rotor users can't jump between service sections in a 30-row setlist.
- **WCAG:** 1.3.1 Info and Relationships (A), 2.4.6 Headings and Labels (AA).
- **Recommendation:**
  - Make the group headings `h3` and the card titles `h4`, or keep the visual style and set the level semantically.
  - Wrap each band's running head in `<h2>` (Perform keeps the band as a button with the heading inside, or uses `role="heading"` on a wrapper).
- **Command:** `/impeccable harden`

### P2: Phone width doesn't reflow at 200% text
- **Location:**
  - Editor at 390: `MobileRowCard.tsx:491`. The page-call column is fixed `w-14 sm:w-16` and `whitespace-nowrap`, which pushes "Open chart in new tab" and the "p. 51" numerals 153px off-screen.
  - `/library`: the header action row (Upload, Add Song, `whitespace-nowrap`) doesn't wrap. 174px overflow.
  - `/settings`: the "Generate Calendar URL" button. 61px.
  - `/setlists`: the row menu buttons. 51px.
  - `/`: the "Set Up Instrument" and "Edit setlist" buttons. 28px.
- **Positives:** The iPad (820) and desktop are clean at 200%, and Perform and the chart viewer reflow at all widths.
- **Impact:** Low-vision phone users with large Dynamic Type lose the chart link and the page numbers in the editor.
- **WCAG:** 1.4.4 Resize Text (AA), 1.4.10 Reflow (AA).
- **Recommendation:**
  - Size the page-call column in `em` or `min-w` instead of a fixed width.
  - Allow `flex-wrap` on header action rows.
  - Let long button labels wrap below `sm`.
- **Command:** `/impeccable adapt`

### P2: Perform rows have a weak focus indicator
- **Location:** `SetlistRow.tsx:373-400`. It relies on the global `* { outline-ring/50 }` (`globals.css:331`), which computes to a 1px `auto` outline at 50% alpha. The editor rows use `focus-visible:ring-2 ring-inset`; Perform rows have nothing explicit.
- **Impact:** At arm's length on an iPad the focused row is hard to find.
- **WCAG:** 2.4.7 Focus Visible (AA) passes. 1.4.11 Non-text Contrast and 2.4.13 (AAA) are marginal.
- **Recommendation:** Add `focus-visible:ring-2 focus-visible:ring-ring ring-inset` to the Perform row and the Swap button, to match the editor.
- **Command:** `/impeccable polish`

### P3: Wedge fader track is 32px wide, and the mute button is 32px (code read only)
- **Location:**
  - `src/components/monitor/VerticalFaderStrip.tsx:187`: track `w-8 h-[200px]`.
  - `VerticalFaderStrip.tsx:326`: mute `size="icon-sm"` = `size-8` (`components/ui/button.tsx:31`).
- **Good:** `touch-none`, `setPointerCapture`, `onPointerCancel` resets the drag, `role="slider"` with value, label and arrow/PageUp/PageDown keys. The gesture code is sound.
- **Not tested live:** No mixer access. A `lostpointercapture` handler would make the cleanup airtight.
- **WCAG:** 2.5.8 passes (24px). The project's 44px rule fails.
- **Recommendation:** Widen the hit area to 44px with padding around the 32px visual track, and make mute `size="icon"`.
- **Command:** `/impeccable adapt`

### P3: Reduced motion freezes loading spinners
- **Location:** `src/app/globals.css:609-623`. `.animate-spin { animation: none !important }`.
- **Good:** Reduced motion is otherwise handled well (live check: zero running animations under `reduce` on `/`, `/setlists` and Perform; `TempoFlash` swaps its beat for a static dot; the keep-awake pulse drops while `aria-pressed` and the text keep the state).
- **Problem:** A frozen spinner reads as a hung app.
- **Recommendation:** Under `reduce`, slow the spinner (for example 1.5s linear) or swap in a static "Loading…" label instead of killing it.
- **Command:** `/impeccable animate`

## Verified non-issues

- **White on ochre `#C58B1A`:** The rendered ochre band uses **ink, not white**: `#18202E` on `#C58B1A` = **5.51:1** (light), and `#12161F` on `#B57F17` = **5.18:1** (dark), in both the editor running head and the Perform page range. That matches DESIGN.md ("ink on ochre"). Green (5.16:1) and oxblood (8.06:1) with white also pass. No white-on-ochre text was found.
- **No horizontal overflow** at 100% text on any route or viewport.

## Patterns and systemic issues

- **Shared primitives under 44px:** `Button size="sm"` (h-8), `icon-sm` (size-8) and the shadcn `Switch` (h-5 w-9) are each under 44px. Every screen that uses them inherits the miss. Fix the primitives, or add a touch-size variant, once.
- **Two row patterns:** A focusable `div` that acts as a button exists twice. Perform's `SetlistRow` got it right (role plus keys); the editor's `MobileRowCard` didn't. One shared "row button" primitive would stop the drift.
- **Overlays outside Radix Dialog:** `PDFOverlay`, and possibly `PrintModal` inside it, skip focus management that the Radix sheets get for free.

## Positive findings

- A skip link is present on every route. One `main`, labelled navs and an H1 on every page.
- axe found **zero** WCAG A/AA violations on `/`, `/perform`, `/library`, `/monitor` and `/login`, in both schemes.
- **Perform setlist:** rows are `role="button"` with Enter and Space. Swap buttons and section bands are named and 44px or more. No overflow at 200% text.
- **Editor drag-reorder** works under synthesized touch. The handle is 44x44 with `touch-action: none`. The 200ms hold doesn't steal page scroll; a row-body pan scrolled the page 941px. `touchCancel` mid-drag leaves no stuck state. The keyboard drag works and Escape cancels.
- **Chart edge tap zones** work under synthesized touch:
  - A right-edge tap scrolled forward (0 to 113px) and a left-edge tap scrolled back.
  - A center tap was a no-op.
  - A vertical pan scrolled without triggering a turn (`pointercancel` honoured).
  - The toggle exposes `aria-pressed`.
- **Reduced motion** is honoured: no running animations under `reduce`, and colour or opacity transitions kept.
- **Manage checkboxes** are 16px visually but sit in 44px labels (`UserRow.tsx:380`), the right pattern.

## Recommended actions

1. **[P1] `/impeccable harden`:**
   - Make PDFOverlay a real modal (role, aria-modal, inert shell, focus in and out).
   - Add keyboard activation and a role to the editor row (`MobileRowCard.tsx:298`).
   - Name and role the Settings toggles.
2. **[P1] `/impeccable adapt`:** Bring `Button sm`, `icon-sm` and `Switch` to 44px touch targets (Settings, Library, Setlist drawer, avatar, login footer).
3. **[P2] `/impeccable colorize`:** Fix the editor chart-chip alpha and the keep-awake 11px label (dark 3.27:1).
4. **[P2] `/impeccable harden`:**
   - Add `alt=""` on avatars and a name on the mobile Exit button.
   - Add keyboard and pedal page turns plus a focusable chart scroller.
   - Fix the heading hierarchy and make section bands headings.
5. **[P2] `/impeccable clarify`:** Use human-readable dnd-kit announcements.
6. **[P2] `/impeccable adapt`:** Reflow at 200% text on phone width (the editor page-call column, the Library header row).
7. **[P2] `/impeccable polish`:** Add a strong focus ring on Perform rows.
8. **[P3] `/impeccable animate`:** A reduced-motion alternative for spinners.
9. **[P3] `/impeccable adapt`:** A 44px hit area for the wedge fader and mute.
10. **`/impeccable polish`:** A final pass.
