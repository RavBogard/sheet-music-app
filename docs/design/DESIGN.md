---
name: CentralReform.live
description: The band's setlists and charts on every iPad, set like the siddur the service follows.
colors:
  ink: "#18202E"
  ground: "#F6F7FB"
  paper: "#FFFFFF"
  primary: "#2563EB"
  book-cloth: "#23356B"
  book-cloth-muted: "#C9D2EA"
  section-green: "#1F7A6E"
  section-oxblood: "#8E2E3B"
  section-ochre: "#C58B1A"
  section-blue: "#23356B"
  section-green-ink: "#1F7A6E"
  section-oxblood-ink: "#8E2E3B"
  section-ochre-ink: "#8F6210"
  section-blue-ink: "#23356B"
  page-call: "#23356B"
  tag-ground: "#EEF1F7"
  tag-ink: "#2B3445"
  quiet-ink: "#556072"
  wash: "#EAF0FE"
  hairline: "#E3E6EE"
  field-stroke: "#D5DAE5"
  warning-line: "#8E2E3B"
  caution: "#8A5A00"
  destructive: "#B4232F"
  success: "#1F7A4D"
  night-ground: "#0F1420"
  night-paper: "#161C2A"
  night-ink: "#E8ECF4"
  night-quiet-ink: "#9AA5B8"
  night-shell: "#141B30"
  night-hairline: "#232C3E"
  night-brand: "#7AA2FF"
  night-warning-line: "#E07A86"
  night-caution: "#E2B04A"
  night-section-green-ink: "#5CC0B0"
  night-section-oxblood-ink: "#EC8F9B"
  night-section-ochre-ink: "#E2B04A"
  night-section-blue-ink: "#9DB3F0"
  night-page-call: "#9DB3F0"
  bl-ground: "oklch(0.16 0.028 198)"
  bl-shell: "oklch(0.22 0.04 200)"
  bl-shell-active: "oklch(0.85 0.10 205)"
  bl-brand: "oklch(0.72 0.115 210)"
  bl-primary: "oklch(0.97 0.012 200)"
  bl-hairline: "oklch(0.30 0.03 200)"
  bl-section-slate: "oklch(0.42 0.03 255)"
  bl-section-slate-ink: "oklch(0.80 0.03 255)"
  bl-page-call: "oklch(0.80 0.10 208)"
typography:
  headline:
    fontFamily: "Assistant, sans-serif"
    fontSize: "1rem"
    fontWeight: 800
    lineHeight: 1.25
  page-call:
    fontFamily: "Assistant, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  title:
    fontFamily: "Assistant, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.375
  list-title:
    fontFamily: "Assistant, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 700
    lineHeight: 1.375
  tab:
    fontFamily: "Assistant, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "Assistant, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  section-label:
    fontFamily: "Assistant, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 800
    letterSpacing: "0.1em"
  label:
    fontFamily: "Assistant, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  row-x: "16px"
  row-y: "8px"
  section-top: "10px"
  section-gap: "8px"
  touch: "44px"
  top-bar: "56px"
  tab-bar: "64px"
components:
  top-bar:
    backgroundColor: "{colors.book-cloth}"
    textColor: "{colors.paper}"
    height: "{spacing.top-bar}"
  top-bar-tab:
    textColor: "{colors.book-cloth-muted}"
    typography: "{typography.tab}"
    height: "{spacing.touch}"
  top-bar-tab-active:
    textColor: "{colors.paper}"
  bottom-tab-bar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.quiet-ink}"
    height: "{spacing.tab-bar}"
  bottom-tab-bar-active:
    textColor: "{colors.primary}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "{spacing.touch}"
  section-label-green:
    textColor: "{colors.section-green-ink}"
    typography: "{typography.section-label}"
    padding: "10px 16px 4px"
  section-label-oxblood:
    textColor: "{colors.section-oxblood-ink}"
    typography: "{typography.section-label}"
    padding: "10px 16px 4px"
  section-label-ochre:
    textColor: "{colors.section-ochre-ink}"
    typography: "{typography.section-label}"
    padding: "10px 16px 4px"
  section-label-blue:
    textColor: "{colors.section-blue-ink}"
    typography: "{typography.section-label}"
    padding: "10px 16px 4px"
  song-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "8px 16px"
    height: "{spacing.touch}"
  song-row-current:
    backgroundColor: "{colors.wash}"
  key-tag:
    textColor: "{colors.ink}"
    rounded: "3px"
    padding: "0 5px"
    height: "16px"
  page-call:
    textColor: "{colors.page-call}"
    typography: "{typography.page-call}"
    width: "56px"
  setlist-list-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.list-title}"
    padding: "4px 16px"
    height: "{spacing.touch}"
  list-group:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "{spacing.touch}"
---

# Design System: CentralReform.live

## Overview

**Creative North Star: "The Siddur Section Rails", quiet (Option B, 2026-11-01)**

The service reads like the book it follows, and nothing gets between the reader and the order. Each section opens on a thin coloured underline carrying a small uppercase label and its page range; every row carries its page call at the margin in bold book-blue at row size. Above it sits a slim book-cloth top bar with the tabs; below it, clean white paper on a cool ground, a 1px hairline grid, and one blue action. Every head is a title plus ONE meta line that states freshness and readiness.

Density is the product rule. Daniel retired blend E on 2026-11-01 ("B. Everywhere. That's the look"): its full-colour section bands, huge page numbers and tall header and status blocks were too bloated and slowed getting to the info. Rows now run about 36–40px drawn and keep 44px hit areas through padding or the `touch-hit` utility. Hierarchy comes from weight and a little colour, not scale. The world is light-first for bright rooms and desks; dark is a considered night-blue, not black, with the section inks lifted so the small labels stay legible.

Brothers Lazaroff runs the same density under its own cloth: forced dark, a deep teal ground and top bar, a teal brand accent (also its page-call ink), a pale primary action, Zilla Slab on its headings, and a slate fourth section ink. The section labels, hairline grid and type ramp are shared. The chart viewer inside Perform is outside this system.

**Key Characteristics:**
- A book-cloth top bar (56px) with tabs at desktop; a white bottom tab bar (64px) below 1024px.
- Section labels as a thin 2px coloured underline: small uppercase label in the hue ink left, muted "pp. N–M" (and set totals) right. No filled bands.
- Page calls right-aligned in a fixed column at row size, 700 weight, book-blue, tabular numerals.
- Dense white rows on a 1px hairline (about 38px drawn, 44px hit), never a card per row, never zebra.
- Every head is a title (1rem/800) plus ONE meta line. The gig line, the parasha and the Beit Mitzvah card are each one small line.
- One blue primary action per view, drawn small (32px) in a head row with a 44px hit area.
- Assistant everywhere, Latin and Hebrew.

## Colors

A cool white-and-ink page, one action blue, a book-blue for page calls, and four bookbinding inks reserved for section labels.

### Primary
- **Action Blue** (`primary`): the one primary button on a view (Perform, Edit, sign in), links, focus rings, the active bottom-tab mark, the caret and text selection (22% mix). In dark it stays the button fill; links and rings lift to **Night Brand Blue** (`night-brand`) to keep 4.5:1 on the ground.

### Secondary
- **Book-Cloth Blue** (`book-cloth`): the top bar on every route, and the browser theme color. Tabs at rest use **Book-Cloth Muted** (`book-cloth-muted`); the active tab is white with a 3px rule on the bar's bottom edge. Dark uses **Night Shell** (`night-shell`).

- **Page-Call Book-Blue** (`page-call`): every printed page number at a row's end, bold at row size. Dark lifts it to `#9DB3F0`; Brothers Lazaroff uses its own teal (`oklch(0.80 0.10 208)`).

### Tertiary
- **Section inks** (`section-green-ink`, `section-oxblood-ink`, `section-ochre-ink`, `section-blue-ink`): the label text and its 2px underline. Each keeps 4.5:1 on white and on the ground; ochre is darkened to `#8F6210` for that. A known section name keeps its hue every week (Kabbalat and closing are green, Torah is oxblood, Shacharit and morning blessings ochre, Maariv blue, "Set N" cycles); any other header takes the next hue in green, oxblood, ochre, blue order. Dark lifts each (`#5CC0B0`, `#EC8F9B`, `#E2B04A`, `#9DB3F0`). Brothers Lazaroff shares green, oxblood and ochre at the dark step but takes a **Slate** ink (`oklch(0.80 0.03 255)`) for the fourth, so no book-cloth blue reaches its teal theme (theming audit P2-2).
- The full-strength fills (`section-green`, `section-oxblood`, `section-ochre`, `section-blue`) no longer draw sections. They remain only for the offline pill and the notification badge.

### Neutral
- **Ink** (`ink`): all primary text, page calls at full strength even on muted rows.
- **Ground** (`ground`): the app background behind lists.
- **Paper** (`paper`): rows, list groups, popovers, the bottom tab bar, the footer.
- **Quiet Ink** (`quiet-ink`): metadata, the status line, the chart chip, row numbers (5.6:1 on ground).
- **Tag Ground / Tag Ink** (`tag-ground`, `tag-ink`): secondary fills. The key tag is now outlined (Field Stroke, 3px radius) in Ink, with no fill.
- **Wash** (`wash`): hover on rows and menu items, and the current-position row in Perform.
- **Hairline** (`hairline`): the 1px row rule, list-group borders and dividers. **Field Stroke** (`field-stroke`) outlines inputs.
- **Warning Line** (`warning-line`): oxblood warning text on a chip ("not saved offline", "no chart", "differs from last").
- **Caution** (`caution`): amber readiness shortfalls in the status line ("22/24 charts ready").
- **Destructive** and **Success**: delete actions and the offline-ready state.

### Named Rules
**The One Blue Rule.** One filled primary button per view, in Action Blue. Every other action is outline, ghost or an icon button.

**The Section Ink Rule.** The four section inks draw section labels and their underline and nothing else that carries meaning. A hue is a section's identity; reusing it for status or decoration breaks the reading.

**The Stated Warning Rule.** A warning is a line of words in Warning Line or Caution, never a hue on its own and never a badge.

## Typography

**Body Font:** Assistant (variable 200–800, Latin and Hebrew subsets), with sans-serif fallback.
**Label/Mono Font:** Geist Mono only where code-like values appear; not part of the refreshed surfaces.
**Brothers Lazaroff headings:** Zilla Slab on h1–h3, from the tenant layer.

**Character:** a humanist sans that holds Hebrew in the same voice, run in a wide weight range so the scale contrast does the work a display face would otherwise do.

### Hierarchy
- **Headline** (800, 1rem): every page and setlist title in the head row, two lines at most, with ONE meta line under it.
- **Page Call** (700, 0.85rem, line-height 1, tabular, book-blue): the printed page at the row's end, in a 48–56px column; "p." prefix (11px Quiet Ink in the editor).
- **Title** (600, 1rem in Perform; 0.92rem in the editor and Library): a song row title. Non-song rows are 500, or Quiet Ink when passive.
- **List Title** (700, 0.95rem): a setlist name in the setlists and Perform lists.
- **Tab** (600, 15px): top-bar tabs. Bottom-tab labels are 12px, 600 at rest and 700 active.
- **Meta** (500, 12px, tabular): the one meta line, row metadata, notes, the chart chip, the gig line, the parasha and Beit Mitzvah lines, and set totals.
- **Section Label** (800, 12px, uppercase, 0.1em, in the hue ink): over its 2px underline; the page range beside it is 700, 12px, 0.02em in Quiet Ink.
- **Group heading** (700, 12px, uppercase, 0.08em, Quiet Ink): "Upcoming", "Past events", "Account"; the only heading of its group.

### Named Rules
**The Tabular Rule.** Every number that can sit in a column (page calls, counts, dates, keys, BPM) uses tabular lining numerals (`tnum`).

**The Quiet Hierarchy Rule.** Hierarchy is weight (800 titles, 700 page calls, 500 metadata) and a small step in size (1rem against 0.75rem), never large numerals or tall heads. No second display face for CRC.

## Layout

A single column of lists under a fixed top bar, no permanent sidebar. At 1024px and up the top bar holds brand, tabs (Setlists, Library, Manage, Monitor where shown), search and the user menu. Below 1024px the top bar keeps the brand and a white bottom tab bar (64px plus the safe area, `--tabbar-h`) carries the tabs; fixed bottom surfaces sit above it.

Each page opens with a compact head row: the title and ONE meta line on the left (status, book, date and readiness share it, dot-separated), the blue action on the right. Band tenants add the gig line, and CRC services the parasha and Beit Mitzvah lines, each a single small truncated line. Then the rows. Rows run 16px horizontal and 8px vertical, about 36–40px drawn; list rows (setlists, Perform index, Library, People) are a name over one meta line at a 44px minimum. A section label sits 8px above the rows it heads (none above the first). The editor row is a grid of drag handle, number (24px), title with its chip, key tag, the chart and recording buttons, then the page call; at 821px and wider the chip sits inline after the title, below that it wraps under it.

**The One Meta Line Rule.** A head is a title and ONE meta line under it, with the primary action on the right. Nothing gets its own tall block.

Every interactive target takes at least 44px of taps. Density comes from drawing controls and rows smaller (32–36px) and giving them the `touch-hit` utility's invisible 44px hit area, or 44px through padding, never from shrinking the hit area.

## Elevation & Depth

Flat by default. Depth is the hairline and the ground-to-paper step, not shadow. Rows and list groups carry no shadow. Shadow appears only on surfaces that float above the page.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 24px rgb(24 32 46 / 0.14)`): search results and popovers under the top bar.
- **Panel** (`box-shadow: 0 8px 24px rgb(24 32 46 / 0.10)`): the expanded row editor panel.
- The dashboard's next-service card is now flat: one compact row (title, meta line, Perform) in a Paper block with a hairline border.

### Named Rules
**The Hairline Rule.** Rows are separated by a 1px Hairline and nothing else: no zebra, no gap, no per-row border box.

## Shapes

Gently rounded and small. The base radius is 10px: list groups use it, buttons and inputs 8px, focus rings 6px, the outlined key tag 3px. Section labels are square (an underline, not a box). Tabs mark the active state with a 3px bar rounded only on the edge away from the bar. Avatars and the offline pill are fully round. Nothing else is pill-shaped.

## Components

### Buttons
Plain and direct.
- **Shape:** 8px radius. 44px tall in forms and dialogs; in a head row or list row drawn at 32px (`size="sm"`) with a 44px `touch-hit` area.
- **Primary:** Action Blue fill, white 700 text (13px in a head row, 15px in forms), 12–20px side padding. Hover drops to 90%.
- **Outline:** Paper fill, 1px border, ink text, Wash on hover; used for Edit in the setlists list and secondary actions on login.
- **Icon:** 44px square, Quiet Ink glyph, Wash on hover.
- **Brothers Lazaroff:** the primary fill is the pale `bl-primary` with the teal ground as ink.

### Section Label (signature)
A thin 2px underline in the section ink, padded 10px above and 4px below, 16px sides. The label (12px, 800, uppercase, 0.1em) in the ink on the left; the page range ("pp. 12–19", or "p. 12" for one page) and, for band tenants, the set total ("38:20 · target 45:00") on the right as small muted tabular text, with an overrun written in Caution. It is always a heading. In Perform a leader's label is a button inside the heading with a 44px hit area. The hue comes from the section-name map, then header order. The filled band of blend E is retired.

### Song Row and Page Call
Dense white rows on the hairline: about 38px drawn, 8px vertical padding, 44px minimum on interactive rows. A muted number (12px), the title, a small outlined key tag (tabular, 12px, 700, 1px Field Stroke, 3px radius, no fill), BPM in Quiet Ink, then the page call last on the line in bold book-blue at row size. Notes, the chart chip and warnings are a small second line (12px); a warning is a Warning Line sentence. The current position in Perform is a Wash row with a 2px inset ring in the brand color. Editor rows draw their drag handle, chart and recording buttons at 32–36px with `touch-hit`.

### Lists and List Groups
The setlists list, the Perform index and the dashboard group rows in a Paper block with a 1px Hairline border, 10px radius and hairline dividers, under an uppercase group heading. Each row (44px minimum): a small month-over-day date column at row scale, the name (List Title), then one tabular metadata line with dot separators, and readiness in Caution when charts are missing.

### Inputs / Fields
Paper fill, 1px Field Stroke, 8px radius, 44px tall (48px for library search at 17px). Focus shifts the border to the ring color. In the top bar the search field is translucent white on the cloth and turns to Paper on focus.

### Navigation
- **Top bar:** Book-Cloth Blue, 56px, brand wordmark at 800 with -0.01em, tabs in Book-Cloth Muted, active tab white with a 3px white bottom rule. Focus outlines are white.
- **Bottom tab bar:** Paper with a Hairline top rule, 24px glyphs, active tab in the brand color with a 40px by 3px top mark. Hidden while the keyboard is open.
- **Brothers Lazaroff:** the bar is `bl-shell` teal and the active tab `bl-shell-active`.

## Do's and Don'ts

### Do:
- **Do** open every view with the title, ONE meta line that states freshness and readiness, and the one blue action.
- **Do** head each section with a thin coloured underline carrying its label and page range.
- **Do** put the page call last on the row in a fixed column, bold, in book-blue at row size.
- **Do** keep rows dense (about 36–40px drawn) and every target at 44px through padding or `touch-hit`.
- **Do** use `tnum` on every number in a column.
- **Do** use the shared tokens (`--shell`, `--rule`, `--brand`, `--primary`, `--section-*-ink`, `--page-call`) so Brothers Lazaroff re-skins without component edits.

### Don't:
- **Don't** fill a section with its hue, or set page numbers in large numerals; both were retired on 2026-11-01.
- **Don't** stack a status line, a book line and a card under a title; fold them into the one meta line.
- **Don't** put a card or a shadow on each row, and don't zebra-stripe; the hairline is the grid.
- **Don't** use a section ink for anything but a section label.
- **Don't** put a second filled primary button on a view.
- **Don't** carry a warning by color alone; write it.
- **Don't** use glass, glow, gradients or noise on refreshed surfaces.
- **Don't** let a CRC color, name or wordmark into the Brothers Lazaroff theme.
