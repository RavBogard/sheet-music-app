# Phase v53-03 — Polymorphic Add menu (port AddBar.tsx from commit d8c0442)

**Status:** 🚧 Discuss complete; ready for /paul:plan
**Created:** 2026-05-02 via /paul:discuss-phase
**Milestone:** v5.3 — Editor UX Repair (3 of 4 phases done; v53-02 ✅ same day; v53-04 likely collapses)
**Blocking gate:** `/ui-ux-pro-max` BLOCKING at PLAN/APPLY entry per SPECIAL-FLOWS.md (UI-touching phase)
**Standing precedent:** Daniel-loop UAT discipline + Harness Fidelity Gate (binding from v5.3) — see PROJECT.md §Constraints

---

## Goals (from discussion)

### Goal 1 — Polymorphic Add menu replaces single-purpose AddRowPlaceholder
**Decision: Option B (split-button) — old-editor literal port, NOT Option A (grouped CommandList).**

Track C ranked Option A strongest for cheapness, but Daniel selected B because the AddBar muscle memory + colored type tiles are the discoverability cue Track B explicitly flagged as "MUCH better" in his words. The cheaper Option A would have shipped a CommandGroup-segmented picker; Option B literally ports the d8c0442 AddBar shape into the current cmdk + Radix Popover substrate.

**Shape:**
- **Primary "+ Song" indigo CTA** — one tap opens a cmdk picker that mirrors v53-02's ChartBindPopover exactly: Recent CommandGroup above Library CommandGroup + Custom CommandGroup (free-text "Create new track called …" sentinel preserved). One mental model with v53-02; reuses the same fixed cmdk substrate (value-format `${title}` only; recent[0].performedAt sort).
- **Chevron popover with 5 type tiles** (48×48px, 2-column grid) for all non-Song TrackTypes:
  - Section Header (Heading icon, muted)
  - Reading (BookOpen icon, **amber**)
  - Prayer (Heart or BookOpen icon, **blue**)
  - Transition (ArrowLeftRight icon, **emerald**)
  - Stage Note (StickyNote icon, muted)

### Goal 2 — Icon colors ported from old AddBar
**Decision: bring back amber=Reading / blue=Prayer / emerald=Transition (+ indigo=Song / muted=Header/Note).**

Track B specifically called out the colored icon vocabulary as "the discoverability cue Daniel misses" since v50-02 amputation. Unified neutral palette would have preserved v51-02's restrained dark-first OKLCH indigo aesthetic but deleted the very signal that made the old AddBar memorable. Daniel's phrasing ("MUCH better") + the explicit research finding made the choice clear.

**Implementation surface:** colored Tailwind tokens on each tile's icon (e.g., `text-amber-300`, `text-blue-300`, `text-emerald-300`, `text-indigo-300`, `text-muted-foreground`). Match v51-02 dark-first contrast levels (≥4.5:1 against bg-card). NO new Tailwind theme entries — reuse stock palette tokens.

### Goal 3 — Plan shape: single vertical-slice plan
**Decision: single plan v53-03-01 covering BOTH primary CTA + chevron popover + tile palette + tests.**

v51/v52/v53-02 vertical-slice precedent — cohesive single commit. No A/B-test-by-shipping; if the chevron palette misses the muscle-memory mark, v53-03-02 follow-up plan handles per v51-04 UAT-failure rule.

### Goal 4 — Free-text path consolidated under primary "+ Song" picker
**Decision: option (a) — Library + Recent + Custom free-text inside the primary picker (same v53-02 substrate), NOT a 6th tile.**

Reuses v53-02's three-CommandGroup pattern verbatim (Recent / Library / Custom). Free-text remains accessible without adding a 6th tile that would dilute the chevron's "5 non-song types" semantic. Custom CommandGroup retains the `__create__${filter}` sentinel for create-new-track (existing AddRowPlaceholder behavior preserved). One mental model across ChartBind + Add picker.

---

## Approach (from discussion + project conventions)

### Component shape
Replace `AddRowPlaceholder.tsx` (~181 LOC) with:
- New `AddBar.tsx` — shell component holding primary CTA + chevron Popover trigger. Renders inside the existing AddRowPlaceholder grid-slot (no SetlistGrid layout disruption).
- Primary CTA opens v53-02-substrate-style cmdk picker (Recent / Library / Custom) — extract this picker from AddRowPlaceholder OR reuse a shared sub-component (PLAN decides; default = inline new component since AddRowPlaceholder is being replaced wholesale).
- Chevron Popover content = `TypeTileGrid` with 5 tiles, 48×48 each, 2-column grid, ≥8px gap (touch-spacing rule), distinctive icon colors per Goal 2.
- Each tile onClick → `applyEdit({ op: 'set', collection: 'tracks', doc: { id, setlistId, type, order, ... } })` with appropriate defaults (e.g., empty title for Header/Reading/Prayer/Transition/Note; user fills inline after row appears).

### Substrate reuse
- TouchOrPopover (v51-01 substrate) for both the primary picker AND the chevron popover.
- cmdk Command + CommandGroup + CommandItem — same as v53-02.
- TYPE_OPTIONS from TypeCell.tsx (existing icon vocabulary: Music/BookOpen/Heart/ArrowRight/Heading/StickyNote) — reuse where icons match. Some types may need icon refinement (Track B spec said BookOpen for both Reading + Prayer; could differentiate Prayer with Heart icon to avoid icon collision — PLAN decides).

### Long-press disambiguation (Track C HIGH-risk item)
v50-05-04 implemented 500ms long-press on coarse pointer to open row ContextMenu via synthetic contextmenu MouseEvent dispatch. The new AddBar's chevron sits below the grid (in AddRowPlaceholder's slot), NOT inside any row — so long-press on the chevron should not trigger row ContextMenu. PLAN-time verification needed: (a) chevron + primary CTA both have explicit `onContextMenu={(e) => e.preventDefault()}` to neutralize accidental long-press; (b) tile clicks are immediate (no long-press semantic); (c) no row-side overlap with tile grid positioning.

### Single write path preserved
Per v5h-01 anti-pattern audit (rules-audit + dual-write incidents): all add-row paths route through `applyEdit('set', 'tracks', { ... })`. NO direct Dexie writes; NO embedded-array side effects. Each tile click + cmdk picker confirmation + free-text Custom create all funnel through the same single applyEdit call site.

### NO Dexie schema bump; NO new collections; NO Firestore rules changes
TrackType union (`'song' | 'header' | 'reading' | 'prayer' | 'transition' | 'note'`) already supports all 6 types. Firestore rules at `firestore.rules` already cover `tracks/{id}` writes since v5h-01-02. No schema/rules work needed.

### Boundaries / patterns to avoid
- **DO NOT touch sync engine (`src/lib/sync/`), Dexie schema (`src/lib/local/schema.ts`), Firestore rules.** Pure UI surface change.
- **DO NOT touch v51-01 picker substrate (TouchOrPopover, DropdownCell, KeyCell, TextCell).** Locked.
- **DO NOT touch v51-02 SetlistGrid tier classes.** Add affordance lives outside the row tier-class scope.
- **DO NOT touch v51-04 terminology.** "Vocal Lead" surfaces preserved.
- **DO NOT touch v50-04 sticky-memory contract (`src/lib/songs/defaults.ts`).** Recent + library priming + propagation paths all locked. Recent section in primary picker reads existing `songs.recent[0].performedAt`.
- **DO NOT touch v53-02 ChartBindPopover.** That's the chart-binding picker; v53-03 is the add-track picker. Same substrate, different consumer.
- **DO NOT introduce new dropdown primitives.** TouchOrPopover + cmdk + Radix Popover only.
- **DO NOT add chart-verification peek.** Dropped from v5.3 scope earlier today.
- **DO NOT touch admin panels.** Out of scope per project memory.
- **DO NOT bump Dexie schema.** Recent ranking derives from existing v50-04 fields.
- **DO NOT add a Recent section to the chevron type-tile popover.** 5 types are stable + small; recency adds no value at that scale. Recent stays in the primary CTA picker for songs only.

### Harness Fidelity Gate — does it trigger?

**No.** v53-03 surface is `src/components/setlist/grid/AddRowPlaceholder.tsx` (or its replacement) — NOT in the gate's protected list. The protected list per PROJECT.md §Harness Fidelity Gate: sync engine (`src/lib/sync/`), Dexie schema/writes (`src/lib/local/schema.ts`, `src/lib/local/write.ts`), snapshot-listener (`src/lib/sync/snapshot-listener.ts`), lazy-hydration (`src/components/setlist/grid/SetlistGridHydrator.tsx`), perf-view rendering (`src/hooks/use-setlist-performance.ts`), editor cell-commit (`src/components/setlist/grid/cells/`), or Firestore rules (`firestore.rules`).

AddRowPlaceholder is at `src/components/setlist/grid/AddRowPlaceholder.tsx` — NOT inside `cells/`. The Add path enqueues outbox via applyEdit, but applyEdit itself is unchanged. v53-03 plan does NOT need a waiver; counter stays at 1 of 3.

**Plan note:** if v53-03's PLAN-time tech read uncovers an unexpected need to touch one of the gate's protected files (e.g., a new applyEdit signature for batch tile-add), trigger the gate's binding semantics + waiver clause then. Otherwise, no waiver needed.

### Tablet-first verification
Every Goal 1 + Goal 2 deliverable verified on real iPad in addition to desktop. Daniel-loop UAT discipline applies; UAT failures route to v53-03-02 follow-up plan in same phase per v51-04 rule. Long-press conflict (Track C HIGH-risk item) is the highest UAT priority — explicit verification step in HUMAN-VERIFY.

---

## Open questions (deferred to /paul:plan or /ui-ux-pro-max)

| # | Question | Resolves at | Owner |
|---|----------|-------------|-------|
| Q1 | Mobile path: sticky-bottom on coarse pointer (matching old AddBar)? hide when keyboard open? Or unified split-button on both surfaces with same positioning? | PLAN | /ui-ux-pro-max + Daniel preference |
| Q2 | Long-press conflict: explicit `onContextMenu preventDefault` on chevron + primary CTA? Or trust positioning (AddBar lives outside row scope)? | PLAN | tech read of v50-05-04 ContextMenu trigger |
| Q3 | Chevron popover side: open above (toward grid) vs below (toward viewport edge)? Anchored vs auto-flip? | /ui-ux-pro-max | UI surface assessment |
| Q4 | Tile size: 48×48 (Track C spec) vs 56×56 (old AddBar spec on coarse pointer)? | PLAN | /ui-ux-pro-max touch-target rules |
| Q5 | Default focus on chevron-open: first tile vs no focus on touch (matches v51-01 suppressAutoFocus pattern)? | PLAN | v51-01 contract carryover |
| Q6 | Icon refinement: BookOpen for both Reading + Prayer per Track B, OR differentiate Prayer with Heart icon to avoid collision? | PLAN | Daniel preference |
| Q7 | Keyboard shortcut for primary picker: "+" key? Or no shortcut (Cmd+K already in use)? | PLAN | check existing keyboard map; default = no new shortcut |
| Q8 | Type tile labels: icon-only vs icon+text? icon-only saves space; icon+text aids first-use discoverability | /ui-ux-pro-max | accessibility (aria-label fallback regardless) |
| Q9 | Tile click immediate or with subtle confirm? Old AddBar was immediate; modern UX often confirms. Default: immediate (matches v53-02 sticky-right pattern of one-tap-to-act on primary affordance) | PLAN | match v53-02 immediate-action pattern |

---

## Cross-references (research artifacts to consume at PLAN time)

- `.paul/phases/v53-01-recursive-research/track-b-old-editor-archaeology.md` — Pattern 1 (lines 20-37): full AddBar.tsx shape including 6 tiles (Song/Header/Reading/Prayer/Transition/StageNote), icon colors (amber/blue/emerald), divider, sticky-bottom mobile, hidden when keyboard open
- `.paul/phases/v53-01-recursive-research/track-c-polymorphic-add-and-chart-peek.md` — Polymorphic Add 3 options (Option B at rank 2, lines 33-40); chart-peek 3 options (DROPPED per Daniel)
- `.paul/phases/v53-01-recursive-research/RESEARCH-SYNTHESIS.md` — full confidence matrix
- `.paul/phases/v53-02-chart-binding-and-verification/v53-02-01-PLAN.md` — substrate template for cmdk picker (Recent + Library + Custom three-CommandGroup pattern)
- `.paul/phases/v53-02-chart-binding-and-verification/v53-02-01-SUMMARY.md` — patterns established + boundaries that v53-03 inherits
- `src/components/setlist/grid/AddRowPlaceholder.tsx` (current — to be replaced)
- `src/components/setlist/grid/cells/TypeCell.tsx` (TYPE_OPTIONS icon vocabulary to reuse)
- `src/types/models.ts` (TrackType union — 6 values)
- `src/lib/local/write.ts` (applyEdit — single write path; unchanged)
- `src/components/setlist/grid/cells/TouchOrPopover.tsx` (v51-01 substrate; both pickers use it)
- Old AddBar.tsx in git history at commit `d8c0442` — `git show d8c0442:src/components/setlist/AddBar.tsx` (or wherever it lived in v50-02 amputation)
- `src/components/setlist/grid/SetlistGrid.tsx` (line ~1444, ~1481 — current AddRowPlaceholder integration site for the "Add row" placeholder)

---

## Plan-shape estimate

- **Single plan v53-03-01** covering Option B split-button (primary "+ Song" CTA + cmdk picker reusing v53-02 substrate) + chevron popover with 5 colored type tiles + AddRowPlaceholder replacement + tests.
- **LOC estimate:** ~150-220 source + ~80-120 tests (~3-5 source files modified + ~1-2 created + ~2-3 test files modified or created).
- **Type:** execute · autonomous=false (one HUMAN-VERIFY at end for Daniel-loop iPad UAT — long-press disambiguation is the highest-priority verification target).
- **Wave:** 1 (no dependencies; parallel-eligible if any other Wave 1 plan opens, but realistically v53-03 is the next-and-last v5.3 plan barring v53-04 collapse confirmation).
- **Skills required at APPLY:** /ui-ux-pro-max (BLOCKING per SPECIAL-FLOWS.md).
- **Boundary-locked:** sync engine / Dexie schema / Firestore rules / v51-01 picker substrate / v51-02 tier classes / v51-04 terminology / v50-04 sticky-memory / v53-02 ChartBindPopover / admin panels / mobile parallel render path (unchanged).
- **Harness Fidelity Gate:** NOT triggered (AddRowPlaceholder is outside protected list); counter stays at 1 of 3.
- **Daniel-loop UAT:** AC at end; failures route to v53-03-02 follow-up plan in same phase per v51-04 rule.
- **Decision checkpoints in plan:** likely zero or one (chevron-popover-side choice could be /ui-ux-pro-max-driven during APPLY rather than a checkpoint:decision; default lean = no checkpoint, autonomous through to HUMAN-VERIFY).

---

*Discussion complete. Next: `/paul:plan v53-03` to create v53-03-01-PLAN.md from this context.*
