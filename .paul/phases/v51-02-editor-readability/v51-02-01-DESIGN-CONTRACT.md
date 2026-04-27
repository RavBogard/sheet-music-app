# DESIGN-CONTRACT — v51-02-01 Editor Readability + Visual Hierarchy

**Phase:** v51-02 (Editor readability + visual hierarchy, desktop + tablet)
**Plan:** v51-02-01
**Date:** 2026-04-27
**Consulted:** `/ui-ux-pro-max` (skill DB queries: design-system "dashboard data-table dense dark professional editor"; ux "data table density hierarchy"; color "dark mode hierarchy contrast muted text"; shadcn stack "data table responsive layout")

---

## Locked foundations (apply to ALL options)

- **Fonts (UNCHANGED per memory):** Righteous (display only — top bar, eventDate label) / Poppins (everything inside the grid: cells, headers, dropdowns)
- **Palette (UNCHANGED):** existing dark OKLCH indigo Tailwind tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-white/10`, `bg-indigo-500/X`, `text-indigo-300`)
- **Touch targets (UNCHANGED):** every interactive element ≥ 44px on `[@media(pointer:coarse)]` per v50-05-04
- **Mobile parallel render path (UNCHANGED):** `MobileCardList.tsx` / `MobileRowCard.tsx` / `MobileEditSheet.tsx` not touched
- **Picker internals (UNCHANGED per v51-01):** `TouchOrPopover` always-Popover, `KeyCell` Major\|Minor Tabs, `DropdownCell` mode='discrete'\|'searchable'
- **shadcn/ui primitives only:** no new components, no new dependencies
- **Sticky thead offset:** `<thead>` `top-[N]rem` MUST equal top-bar `py-N` final height (lockstep — break it and headers overlap content)
- **Reduced motion:** all transitions ≤ 200ms; gated on `motion-reduce:transition-none` (already applied in TopBar; extend to row hover)

---

## Field-tier definitions (referenced by all options)

The setlist editor has 7 columns. Group them into 4 visual tiers (highest → lowest emphasis):

| Tier | Fields | Job |
|------|--------|-----|
| **T1 (Primary)** | title | The thing the eye must find first when scanning a setlist |
| **T2 (Secondary-Prominent)** | key | Musicians need this at-a-glance during rehearsal/build; key-left from v1.6 P3 stays |
| **T3 (Tertiary)** | leadMusician, type, bpm | Useful but quieter — they tell you who/what but you already know the song |
| **T4 (Quaternary)** | notes, drag handle, chart icon | Chrome + supporting info — present, not loud |

Section-header rows (`type === 'header'`) are a separate visual class entirely — see per-option spec.

---

## Option A — "Tight Compact"

> Maximum density. Desktop fits ~16 rows in 720px viewport (vs ~10 today). Best if Daniel optimizes for "see whole setlist without scrolling".

### 1. Row heights
- **Desktop (≥1024px):** 40px content rows
- **Tablet (768-1023px / `pointer:coarse`):** 44px content rows (exactly the touch-target floor)
- **Header rows:** 36px desktop / 40px tablet (smaller than content rows — they're scaffolding, not interactive content)

### 2. Cell padding
- **Desktop:** `px-2 py-1` (8px horizontal, 4px vertical)
- **Tablet:** `[@media(pointer:coarse)]:py-2` (8px vertical — keeps 44px outer)
- **Drag column:** `px-1` (no horizontal expansion — handle is dense)

### 3. Column widths (TanStack `size` field)
| Column | Width | Notes |
|--------|-------|-------|
| drag | 44px (52px touch) | Touch-target floor |
| type | 96px | Was 120px — narrowed |
| title | flex (auto) | Takes remaining space — primary tier |
| key | 64px | Was 80px — narrowed |
| bpm | 60px | Was 72px — narrowed |
| leadMusician | 140px | Cap to prevent dominating |
| notes | 200px max | Truncate with ellipsis if longer |
| chart | 44px | Touch-target floor |

### 4. Typographic scale (Poppins; sizes refer to Tailwind text-* tokens)
- **T1 title:** `text-sm font-semibold` (14px / 600)
- **T2 key:** `text-sm font-semibold tabular-nums` (14px / 600 — same as title; differentiated by color)
- **T3 lead/type/bpm:** `text-xs font-normal` (12px / 400) — bpm uses `tabular-nums`
- **T4 notes:** `text-xs font-normal` (12px / 400)
- **Header row title:** `text-[10px] font-bold uppercase tracking-[0.12em]` (smallcaps look)
- **Line height:** `leading-tight` (1.25) — matches dense rows; v51-02 verifies WCAG holds

### 5. Color scale (existing tokens)
- **T1 title:** `text-foreground` (full strength)
- **T2 key:** `text-indigo-300` (brand-tinted prominence — stands out from neutral title without weight bump)
- **T3 lead/type/bpm:** `text-muted-foreground` (Tailwind ~oklch 70% L)
- **T4 notes:** `text-muted-foreground/70` (further muted)
- **Header row title:** `text-indigo-200/80` (smallcaps + tinted)
- **Drag handle / chart icon:** `text-muted-foreground/60`

### 6. Section-row treatment (`type === 'header'`)
- **Background:** `bg-indigo-500/[0.06]` (faint tint — distinguishable, not loud)
- **Top border:** `border-t border-indigo-500/20` (separator above header row)
- **Bottom border:** standard `border-b border-white/10` (preserved)
- **Title rendering:** smallcaps as above; type-cell stays editable but dropdown trigger picks up the same muted-indigo treatment
- **Other cells (key, lead, bpm, notes, chart) on header rows:** rendered at T4 muted-foreground/50 — present but recessive (header rows rarely have musical metadata; they're text labels)

### 7. Hover / selected / dragging
- **Hover:** `hover:bg-white/[0.015]` (lower opacity — at 40px density `bg-white/[0.02]` reads as harsh banding)
- **Selected:** `bg-indigo-500/[0.06]` (matches header tint — selection feels of the same family as section grouping)
- **Selected + hover compound:** `bg-indigo-500/[0.08]`
- **Dragging:** existing `shadow-lg ring-2 ring-indigo-400/40` (unchanged — works at any density)

### Tradeoffs
- **Pros:** Maximum scan-throughput. Whole setlist visible at once. Information density matches what Daniel already mentally compresses to.
- **Cons:** Fingertips on iPad have less "miss room" — 44px exact is the floor, not comfort. Some users may find 12px text small for ambient (across-stand) reading.

---

## Option B — "Comfortable Dense" *(recommended primary)*

> Middle ground. Desktop fits ~14 rows in 720px viewport. Optimal balance of density + scannability + touch comfort.

### 1. Row heights
- **Desktop:** 44px content rows
- **Tablet:** 48px content rows (44px floor + 2px breathing room top/bottom)
- **Header rows:** 40px desktop / 44px tablet

### 2. Cell padding
- **Desktop:** `px-2.5 py-1.5` (10px horizontal, 6px vertical)
- **Tablet:** `[@media(pointer:coarse)]:py-2.5` (10px vertical)
- **Drag column:** `px-1`

### 3. Column widths
| Column | Width | Notes |
|--------|-------|-------|
| drag | 44px (52px touch) | Floor preserved |
| type | 104px | Slight narrow from 120px |
| title | flex | Primary tier |
| key | 72px | Slight narrow from 80px (tabs picker fits) |
| bpm | 64px | Narrow from 72px |
| leadMusician | 156px | Cap |
| notes | 220px max | Truncate ellipsis |
| chart | 44px | Floor |

### 4. Typographic scale
- **T1 title:** `text-sm font-semibold` (14px / 600)
- **T2 key:** `text-sm font-medium tabular-nums` (14px / 500 — slightly lighter than title; differentiated by both weight AND color)
- **T3 lead/type/bpm:** `text-[13px] font-normal` (13px / 400)
- **T4 notes:** `text-xs font-normal` (12px / 400)
- **Header row title:** `text-xs font-bold uppercase tracking-[0.1em]` (12px smallcaps — readable from across the stand)
- **Line height:** `leading-snug` (1.375) — comfortable at 44px

### 5. Color scale
- **T1 title:** `text-foreground`
- **T2 key:** `text-indigo-200` (brand-prominent — slightly higher chroma than Option A)
- **T3 lead/type/bpm:** `text-muted-foreground`
- **T4 notes:** `text-muted-foreground/75`
- **Header row title:** `text-indigo-100` (high-contrast smallcaps; ALL CAPS tight tracking carries the eye)
- **Drag handle / chart icon:** `text-muted-foreground/70`

### 6. Section-row treatment
- **Background:** `bg-indigo-500/[0.08]` (more present than Option A — section rows visually frame their groups)
- **Left accent rule:** `border-l-2 border-indigo-400/50` (subtle vertical mark — rivers the eye down through sections)
- **Top border:** `border-t border-indigo-500/25`
- **Bottom border:** `border-b border-white/10` (standard)
- **Cells inside header rows:** title cell uses smallcaps spec above; type cell collapses to a small icon-only badge (still editable via long-press / right-click); other cells stay empty/recessive at `text-muted-foreground/40`

### 7. Hover / selected / dragging
- **Hover:** `hover:bg-white/[0.02]` (existing — works at this density)
- **Selected:** `bg-indigo-500/[0.08]`
- **Selected + hover:** `bg-indigo-500/[0.10]`
- **Dragging:** existing `shadow-lg ring-2 ring-indigo-400/40`

### Tradeoffs
- **Pros:** Density tightens noticeably without feeling cramped. Section rows visibly frame. Tap targets sit comfortably inside 48px on tablet (2px slop). Type stays readable at musician-on-stand distance.
- **Cons:** Slightly more vertical space than Option A — fewer rows visible at once. Compromise position rather than a strong design statement.

---

## Option C — "Hierarchical Spacious"

> Lower density (close to today), but dramatically stronger visual hierarchy + section framing. Best if Daniel values "scan rank" over "rows-per-screen".

### 1. Row heights
- **Desktop:** 44px content rows (same as B)
- **Tablet:** 48px content rows (same as B)
- **Header rows:** 52px desktop / 56px tablet (LARGER than content rows — they're full-height section banners)

### 2. Cell padding
- **Desktop:** `px-3 py-2` (12px horizontal, 8px vertical)
- **Tablet:** `[@media(pointer:coarse)]:py-3` (12px vertical)
- **Drag column:** `px-1.5`

### 3. Column widths
| Column | Width | Notes |
|--------|-------|-------|
| drag | 44px (52px touch) | Floor |
| type | 112px | Modest narrow |
| title | flex | Primary tier — gets significantly more weight via type, not width |
| key | 80px | Unchanged from today |
| bpm | 72px | Unchanged |
| leadMusician | 168px | Roomy |
| notes | 240px max | Truncate ellipsis |
| chart | 44px | Floor |

### 4. Typographic scale (largest tier separation)
- **T1 title:** `text-base font-semibold` (16px / 600 — pop)
- **T2 key:** `text-sm font-semibold tabular-nums` (14px / 600)
- **T3 lead/type/bpm:** `text-[13px] font-normal`
- **T4 notes:** `text-xs font-normal italic` (italic adds quiet de-emphasis)
- **Header row title:** `text-sm font-bold uppercase tracking-[0.14em]` (14px smallcaps banner)
- **Line height:** `leading-snug` (1.375)

### 5. Color scale
- **T1 title:** `text-foreground`
- **T2 key:** `text-indigo-200`
- **T3 lead/type/bpm:** `text-muted-foreground`
- **T4 notes:** `text-muted-foreground/65` (most muted — italic adds further visual quieting)
- **Header row title:** `text-indigo-100`
- **Drag handle / chart icon:** `text-muted-foreground/70`

### 6. Section-row treatment (most dramatic)
- **Background:** `bg-gradient-to-r from-indigo-500/[0.10] via-indigo-500/[0.06] to-transparent` (left-weighted gradient — eye anchored to label)
- **Left accent bar:** `border-l-4 border-indigo-400` (full-saturation 4px bar)
- **Top border:** `border-t-2 border-indigo-500/30` (thicker — section break is unmistakable)
- **Bottom border:** `border-b border-white/10`
- **Cells inside header rows:** title cell renders the smallcaps banner spanning the full row width via `colSpan` (header rows do NOT need other columns — they're labels). Type cell collapses to an inline icon-prefix on the title, switchable via the title cell's edit affordance.

### 7. Hover / selected / dragging
- **Hover:** `hover:bg-white/[0.025]`
- **Selected:** `bg-indigo-500/[0.10]`
- **Selected + hover:** `bg-indigo-500/[0.12]`
- **Dragging:** existing `shadow-lg ring-2 ring-indigo-400/40`

### Tradeoffs
- **Pros:** Strongest hierarchy — title pops, sections feel architectural. Eye scans rank effortlessly. Section banners read as "chapters". Suits iPad ambient reading at 2-3ft distance.
- **Cons:** Density barely tightens vs today (the win is hierarchy + section framing, not raw rows-per-screen). The colSpan'd header rows require reworking the section-row render path (more code than A/B). Header bg gradient is the most departure from current visual language.

---

## Side-by-side comparison

| Dimension | Option A "Tight Compact" | Option B "Comfortable Dense" *(rec)* | Option C "Hierarchical Spacious" |
|-----------|---------------------------|---------------------------------------|------------------------------------|
| Desktop row | 40px | **44px** | 44px |
| Tablet row | 44px | **48px** | 48px |
| Title type | text-sm 600 | **text-sm 600** | text-base 600 |
| Key type | text-sm 600 indigo-300 | **text-sm 500 indigo-200** | text-sm 600 indigo-200 |
| Notes | text-xs 400 muted | **text-xs 400 muted/75** | text-xs 400 italic muted/65 |
| Section bg | indigo-500/[0.06] | **indigo-500/[0.08] + L-2 bar** | indigo gradient + L-4 bar |
| Section row height | 36/40 | **40/44** | 52/56 (banners) |
| Rows in 720px viewport | ~16 | **~14** | ~12 |
| Implementation cost | low | **low** | medium (colSpan rework) |
| Distance readability | weakest | **good** | strongest |

---

## Recommendation

**Option B "Comfortable Dense"** is the recommended primary because:
1. Tightens density meaningfully (~14 rows vs ~10 today) without crossing into cramped
2. Tablet 48px gives 4px tap-target slop above the 44px floor — comfort margin matters for live-service use where Daniel may be wearing a robe with sleeves catching the screen
3. Section rows visibly frame their groups via the L-2 accent bar — solves the "blends together" complaint
4. Implementation cost is the same as Option A (className tweaks); Option C requires rework of the SortableRow render path for `colSpan`-banner header rows
5. Type tier separation via *both* weight (semibold→medium→normal) AND color (foreground→indigo-200→muted) — redundant cues = robust hierarchy across age + lighting conditions

Option A is the pick if Daniel says "fit more rows on screen, I don't mind compact". Option C is the pick if he says "hierarchy matters more than density" or "I want sections to feel like chapters".

**Hybrid candidate:** Option A's row density + Option B's section-row treatment is a coherent combo (tight rows but strong section framing) — call out as `A-density + B-sections` if Daniel mixes.

---

## What this contract enables Task 3 to do without further interpretation

- Every row-level className substitution has an exact source/target (no design judgment needed during APPLY)
- TanStack `size` values are numeric and direct
- Tailwind text/color tokens reference existing OKLCH palette — zero palette changes needed
- Section-row branch: read `row.original.type === 'header'` → apply locked treatment (per-option spec is unambiguous)
- jest-axe contrast assertion: all picked color tokens are existing AA-cleared values (`text-foreground`, `text-muted-foreground`, `text-indigo-200/300/100`); only verify, don't recompute
