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
  bl-ground: "oklch(0.16 0.028 198)"
  bl-shell: "oklch(0.22 0.04 200)"
  bl-shell-active: "oklch(0.85 0.10 205)"
  bl-brand: "oklch(0.72 0.115 210)"
  bl-primary: "oklch(0.97 0.012 200)"
  bl-hairline: "oklch(0.30 0.03 200)"
typography:
  headline:
    fontFamily: "Assistant, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  page-call:
    fontFamily: "Assistant, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\" 1, \"lnum\" 1"
  title:
    fontFamily: "Assistant, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.375
  list-title:
    fontFamily: "Assistant, sans-serif"
    fontSize: "17px"
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
  running-head:
    fontFamily: "Assistant, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 800
    letterSpacing: "0.08em"
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
  row-y: "14px"
  band-y: "10px"
  band-gap: "16px"
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
    padding: "0 20px"
    height: "{spacing.touch}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "{spacing.touch}"
  section-band-green:
    backgroundColor: "{colors.section-green}"
    textColor: "{colors.paper}"
    typography: "{typography.running-head}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  section-band-oxblood:
    backgroundColor: "{colors.section-oxblood}"
    textColor: "{colors.paper}"
    typography: "{typography.running-head}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  section-band-ochre:
    backgroundColor: "{colors.section-ochre}"
    textColor: "{colors.ink}"
    typography: "{typography.running-head}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  section-band-blue:
    backgroundColor: "{colors.section-blue}"
    textColor: "{colors.paper}"
    typography: "{typography.running-head}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  song-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "14px 16px"
  song-row-current:
    backgroundColor: "{colors.wash}"
  key-tag:
    backgroundColor: "{colors.tag-ground}"
    textColor: "{colors.tag-ink}"
    rounded: "{rounded.md}"
    height: "32px"
    width: "44px"
  page-call:
    textColor: "{colors.ink}"
    typography: "{typography.page-call}"
    width: "64px"
  setlist-list-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.list-title}"
    padding: "12px 16px"
    height: "72px"
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

**Creative North Star: "The Siddur Section Rails"**

The service reads like the book it follows. A setlist is set as a printed order: each section opens on a full-hue band carrying its running head and its page range, and every row carries its page call in large tabular numerals at the margin. Above it sits a slim book-cloth top bar with the tabs; below it, clean white paper on a cool ground, a 1px hairline grid, and one blue action. Freshness and readiness are always stated in a status line under the title.

Density is the product rule: text-first rows, no cover art, no card per row. Hierarchy comes from scale contrast, not decoration: the title and the page calls are large and heavy, the metadata is small and quiet. The world is light-first for bright rooms and desks; dark is a considered night-blue, not black, with the section hues a step deeper so the bands do not glare on a dim stage.

Brothers Lazaroff runs the same world under its own cloth: forced dark, a deep teal ground and a deep teal top bar, a teal brand accent, a pale primary action, and Zilla Slab on its headings. The section bands, hairline grid, page calls and type ramp are shared. The chart viewer inside Perform is outside this system.

**Key Characteristics:**
- A book-cloth top bar (56px) with tabs at desktop; a white bottom tab bar (64px) below 1024px.
- Section header rows as full-hue bands: uppercase tracked running head left, "pp. N–M" right.
- Page calls right-aligned in a fixed column, 800 weight, tabular numerals.
- White rows on a 1px hairline, never a card per row, never zebra.
- One blue primary action per view.
- Assistant everywhere, Latin and Hebrew.

## Colors

A cool white-and-ink page, one action blue, and four bookbinding hues reserved for section bands.

### Primary
- **Action Blue** (`primary`): the one primary button on a view (Perform, Edit, sign in), links, focus rings, the active bottom-tab mark, the caret and text selection (22% mix). In dark it stays the button fill; links and rings lift to **Night Brand Blue** (`night-brand`) to keep 4.5:1 on the ground.

### Secondary
- **Book-Cloth Blue** (`book-cloth`): the top bar on every route, and the browser theme color. Tabs at rest use **Book-Cloth Muted** (`book-cloth-muted`); the active tab is white with a 3px rule on the bar's bottom edge. Dark uses **Night Shell** (`night-shell`).

### Tertiary
- **Section Green** (`section-green`), **Section Oxblood** (`section-oxblood`), **Section Ochre** (`section-ochre`), **Section Blue** (`section-blue`): the band hues. White ink on green, oxblood and blue; ink on ochre. A known section name keeps its hue every week (Kabbalat and closing are green, Torah is oxblood, Shacharit and morning blessings ochre, Maariv blue, "Set N" cycles); any other header takes the next hue in green, oxblood, ochre, blue order. Dark deepens each by a step (`#1A6A60`, `#7E2834`, `#B57F17`, `#2B4080`).

### Neutral
- **Ink** (`ink`): all primary text, page calls at full strength even on muted rows.
- **Ground** (`ground`): the app background behind lists.
- **Paper** (`paper`): rows, list groups, popovers, the bottom tab bar, the footer.
- **Quiet Ink** (`quiet-ink`): metadata, the status line, the chart chip, row numbers (5.6:1 on ground).
- **Tag Ground / Tag Ink** (`tag-ground`, `tag-ink`): the key tag and secondary fills.
- **Wash** (`wash`): hover on rows and menu items, and the current-position row in Perform.
- **Hairline** (`hairline`): the 1px row rule, list-group borders and dividers. **Field Stroke** (`field-stroke`) outlines inputs.
- **Warning Line** (`warning-line`): oxblood warning text on a chip ("not saved offline", "no chart", "differs from last").
- **Caution** (`caution`): amber readiness shortfalls in the status line ("22/24 charts ready").
- **Destructive** and **Success**: delete actions and the offline-ready state.

### Named Rules
**The One Blue Rule.** One filled primary button per view, in Action Blue. Every other action is outline, ghost or an icon button.

**The Bands Only Rule.** The four section hues fill section bands and nothing else that carries meaning. A hue is a section's identity; reusing it for status or decoration breaks the reading.

**The Stated Warning Rule.** A warning is a line of words in Warning Line or Caution, never a hue on its own and never a badge.

## Typography

**Body Font:** Assistant (variable 200–800, Latin and Hebrew subsets), with sans-serif fallback.
**Label/Mono Font:** Geist Mono only where code-like values appear; not part of the refreshed surfaces.
**Brothers Lazaroff headings:** Zilla Slab on h1–h3, from the tenant layer.

**Character:** a humanist sans that holds Hebrew in the same voice, run in a wide weight range so the scale contrast does the work a display face would otherwise do.

### Hierarchy
- **Headline** (800, 1.6rem; 1.35rem below 640px; -0.015em): the setlist title in the head row, two lines at most, with the status line under it.
- **Page Call** (800, 1.5rem in the editor, 1.35rem in Perform, line-height 1, tabular): the printed page at the row's end, 64–80px column, with a small 11px "p." prefix in the editor.
- **Title** (700, 1.2rem, leading-snug): a song row title in Perform. Editor rows use the same weight at a smaller size.
- **List Title** (700, 17px): a setlist name in the setlists list.
- **Tab** (600, 15px): top-bar tabs. Bottom-tab labels are 12px, 600 at rest and 700 active.
- **Body** (500, 14px): the status line, row metadata, dates and counts, all tabular.
- **Running Head** (800, 14px in Perform, 13px in the editor, uppercase, 0.08em): the section band title; the page range beside it is 700, 0.04em.
- **Label** (500, 12px): the chart chip ("setting · format · Vocal Lead"). List-group headings ("Upcoming", "Past events", "Account") are 12px, 700, uppercase, 0.08em in Quiet Ink, and they are the only heading of their group.

### Named Rules
**The Tabular Rule.** Every number that can sit in a column (page calls, counts, dates, keys, BPM) uses tabular lining numerals (`tnum`).

**The Scale Contrast Rule.** Hierarchy is weight 800 against 500 and 1.5rem against 0.75rem. No second display face for CRC, no color-coded headings.

## Layout

A single column of lists under a fixed top bar, no permanent sidebar. At 1024px and up the top bar holds brand, tabs (Setlists, Library, Manage, Monitor where shown), search and the user menu. Below 1024px the top bar keeps the brand and a white bottom tab bar (64px plus the safe area, `--tabbar-h`) carries the tabs; fixed bottom surfaces sit above it.

Each list page opens with a head row: title and status line on the left, the blue action on the right. Then the rows. Rows run 16px horizontal and 14px vertical in Perform (12px in the setlists list, min 72px tall). A section band sits 16px above the rows it heads (none above the first). The editor row is a grid of number (24px), title with its chip, key tag, then the page call; at 821px and wider the chip sits inline after the title, below that it wraps under it.

Every interactive target is at least 44px. Density comes from tight vertical rhythm and small metadata, never from shrinking targets.

## Elevation & Depth

Flat by default. Depth is the hairline and the ground-to-paper step, not shadow. Rows and list groups carry no shadow. Shadow appears only on surfaces that float above the page.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 24px rgb(24 32 46 / 0.14)`): search results and popovers under the top bar.
- **Panel** (`box-shadow: 0 8px 24px rgb(24 32 46 / 0.10)`): the expanded row editor panel.
- **Rest card** (`box-shadow: 0 2px 12px rgb(24 32 46 / 0.06)`): the dashboard's next-service card, the one card on the home view.

### Named Rules
**The Hairline Rule.** Rows are separated by a 1px Hairline and nothing else: no zebra, no gap, no per-row border box.

## Shapes

Gently rounded and small. The base radius is 10px: list groups use it, buttons, inputs and key tags 8px, section bands and focus rings 6px. Tabs mark the active state with a 3px bar rounded only on the edge away from the bar. Avatars and the offline pill are fully round. Nothing else is pill-shaped.

## Components

### Buttons
Plain and direct.
- **Shape:** 8px radius, 44px tall.
- **Primary:** Action Blue fill, white 700 text at 15px, 16–20px side padding. Hover drops to 90%.
- **Outline:** Paper fill, 1px border, ink text, Wash on hover; used for Edit in the setlists list and secondary actions on login.
- **Icon:** 44px square, Quiet Ink glyph, Wash on hover.
- **Brothers Lazaroff:** the primary fill is the pale `bl-primary` with the teal ground as ink.

### Section Band (signature)
A full-hue bar, 6px radius, 10px by 16px, at least 44px tall. Running head left, page range ("pp. 12–19", or "p. 12" for one page) right in tabular numerals. In Perform a leader's band is a button; for others it is a label. The hue comes from the section-name map, then header order.

### Song Row and Page Call
White on the hairline. Number, title, a key tag (tabular, 700, Tag Ground with a 1px border, 32px tall in Perform and 28px in the editor), BPM in Quiet Ink, then the page call last on the line at full ink. The chip under the title is quiet; a warning under it is a Warning Line sentence. The current position in Perform is a Wash row with a 2px inset ring in the brand color.

### Lists and List Groups
The setlists list and the dashboard group rows in a Paper block with a 1px Hairline border, 10px radius and hairline dividers, under an uppercase group heading. Each row: name (List Title), then a tabular metadata line with dot separators, and readiness in Caution when charts are missing.

### Inputs / Fields
Paper fill, 1px Field Stroke, 8px radius, 44px tall (48px for library search at 17px). Focus shifts the border to the ring color. In the top bar the search field is translucent white on the cloth and turns to Paper on focus.

### Navigation
- **Top bar:** Book-Cloth Blue, 56px, brand wordmark at 800 with -0.01em, tabs in Book-Cloth Muted, active tab white with a 3px white bottom rule. Focus outlines are white.
- **Bottom tab bar:** Paper with a Hairline top rule, 24px glyphs, active tab in the brand color with a 40px by 3px top mark. Hidden while the keyboard is open.
- **Brothers Lazaroff:** the bar is `bl-shell` teal and the active tab `bl-shell-active`.

## Do's and Don'ts

### Do:
- **Do** open every setlist view with the title, a status line that states freshness and readiness, and the one blue action.
- **Do** head each section with a full-hue band carrying its running head and page range.
- **Do** put the page call last on the row in a fixed column at 800 weight and full ink.
- **Do** use `tnum` on every number in a column.
- **Do** keep every target at 44px or more.
- **Do** use the shared tokens (`--shell`, `--rule`, `--brand`, `--primary`) so Brothers Lazaroff re-skins without component edits.

### Don't:
- **Don't** put a card or a shadow on each row, and don't zebra-stripe; the hairline is the grid.
- **Don't** use a section hue for anything but a section band.
- **Don't** put a second filled primary button on a view.
- **Don't** carry a warning by color alone; write it.
- **Don't** use glass, glow, gradients or noise on refreshed surfaces.
- **Don't** let a CRC color, name or wordmark into the Brothers Lazaroff theme.
