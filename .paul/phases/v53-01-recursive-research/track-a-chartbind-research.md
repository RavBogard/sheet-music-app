# ChartBind Picker Research: Diagnosis Report

**Target:** Sheet-music-app v53-01, Track A  
**Topic:** ChartBind picker UI breakage — "search doesn't work" on iPad/desktop  
**Mode:** Broad diagnostic research  
**Date:** 2026-05-02

---

## Hypothesis Testing Results

### H1: cmdk value format confuses fuzzy matcher [CONFIRMED]

**Evidence:**
- ChartBindPopover.tsx:123 uses `value={${song.title} ${song.id}}`
- AddRowPlaceholder.tsx:138 uses identical pattern
- DropdownCell.tsx:257 uses same pattern

The space + UUID suffix creates semantic noise for cmdk's fuzzy matcher. When typing "amazing grace", the matcher scores against the full "Amazing Grace 123e45f6" string, not just the title.

**Severity: MEDIUM-HIGH** — explains poor fuzzy ranking for some searches.

---

### H2: useLiveQuery runs empty at first render [CONFIRMED - PARTIAL]

**Evidence:**
- ChartBindPopover.tsx:63-67: default is empty array []
- Dexie hydration completes asynchronously
- User sees "No matches" briefly while loading

**Severity: MEDIUM** — cosmetic but contributes to perceived breakage.

---

### H3: TouchOrPopover suppressAutoFocus contract [RULED OUT]

**Evidence from v52-02-01-SUMMARY.md:**
```
suppressAutoFocus default=false (Radix platform default)
DropdownCell discrete-mode wires suppressAutoFocus={true}
ChartBind is searchable (has CommandInput) → should NOT suppress auto-focus
```

**Verdict:** ChartBindPopover.tsx:85-99 correctly omits suppressAutoFocus prop, inheriting the v52-02 default (false). iPad keyboard SHOULD pop on open. If it doesn't, bug is in Radix layer or iOS Safari edge case, NOT TouchOrPopover.

---

### H4: Library size + alphabetical sort creates friction [CONFIRMED - SYSTEMIC]

**Evidence:**
- ChartBindPopover.tsx:69-72 sorts ALL songs alphabetically every render
- No "Recent" section (missing at application level)
- Simple toArray() query with no indexes

For a 200-song library, user must type full title to avoid scrolling 50+ matches. No recents shortcut.

**Severity: HIGH** — explains "search doesn't work" = "searching is tedious, I have to type the whole name every time"

---

### H5: Sticky-memory v50-04 auto-bind [ANSWERED]

**Evidence from defaults.ts:36-51:**
```typescript
seedTrackFromSong() extracts key, lead, bpm ONLY — NO chartId
```

**Verdict:** By design. Chart binding is NOT part of sticky-memory (chart is track-specific, not song-level default). If Rabbi Daniel wants auto-bind-on-chart-history, that's a NEW feature requiring schema change.

---

## ChartBind Sub-mode Disambiguation Tests for iPad

Run these on real iPad to isolate which sub-mode is broken:

**Test (a): Picker Opens?**  
Tap ChartCell → Popover visible + SearchInput visible? **Expected: YES**

**Test (b): Keyboard Pops & Input Focuses?**  
Popover open → Input has focus ring + iPad keyboard auto-appears? **Expected: YES**

**Test (c): Typing Produces Results?**  
Type 3-4 chars of known title → Results filter + matching songs appear? **Expected: YES**

**Test (d): Tapping a Result Binds?**  
Tap filtered song → Popover closes + ChartCell filled + track updated? **Expected: YES**

**Test (e): Re-bind Switches Charts?**  
Same track, tap ChartCell again → Type different song → Tap → Chart updates? **Expected: YES**

---

## Two Fix Paths

### Smallest-Fix Path: Value Format Only [~10 LOC]

**Changes:**
- ChartBindPopover.tsx:123: `value={song.title}` (remove id suffix)
- Optional: AddRowPlaceholder.tsx:138 (same 1-line fix)
- Optional: DropdownCell.tsx:257 (systemic fix across all pickers)

**Pros:** Immediate cmdk scoring improvement, minimal risk  
**Cons:** Doesn't fix H2 (empty window), doesn't fix H4 (library friction)

---

### Systemic-Fix Path: Recents + Value + Sticky [~80-120 LOC]

**Changes:**
1. ChartBindPopover.tsx (~40 LOC) — add "Recent" section above Library
2. AddRowPlaceholder.tsx (~20 LOC) — mirror changes
3. defaults.ts (~20 LOC) — optional: extend SongDefaults to track chartId history
4. SetlistGrid.tsx (~10-15 LOC) — propagate chart binding to sticky memory
5. schema.ts — optional: add index on songs for faster filtering

**Pros:** Comprehensive fix (H1 + H2 + H4), leverages existing v50-04 patterns  
**Cons:** Larger scope, edge cases around chart history

---

## Files Requiring Changes

**Smallest path:**
- src/components/setlist/grid/ChartBindPopover.tsx (line 123)
- src/components/setlist/grid/AddRowPlaceholder.tsx (line 138, optional)
- src/components/setlist/grid/cells/DropdownCell.tsx (line 257, optional)

**Systemic path:**
- src/components/setlist/grid/ChartBindPopover.tsx (~40 LOC)
- src/components/setlist/grid/AddRowPlaceholder.tsx (~20 LOC)
- src/lib/songs/defaults.ts (~20 LOC)
- src/lib/local/types.ts (+2-3 LOC SongDefaults)
- src/components/setlist/grid/SetlistGrid.tsx (~10-15 LOC)

---

## Summary Table

| Finding | Status | Severity | Action |
|---------|--------|----------|--------|
| **H1: cmdk value format** | CONFIRMED | MEDIUM-HIGH | Fix in either path |
| **H2: Empty hydration window** | CONFIRMED | MEDIUM | Cosmetic; recents masks it |
| **H3: TouchOrPopover contract** | RULED OUT | — | No fix needed; correct by design |
| **H4: Library friction (no recents)** | CONFIRMED | HIGH | Systemic path required if "typing tedious" |
| **H5: Sticky-memory chart bind** | ANSWERED | — | By design; NEW feature if desired |

---

**Next Steps for Planner:**

1. Route to Rabbi Daniel: Run 5-test sub-mode sequence on real iPad.
2. If (a) or (b) fails: Separate focus/wiring bug; open new research.
3. If (c) or (d) fails: cmdk value format (H1) or handler break; smallest fix applies.
4. If only (c) shows slow results: H4 is the pain; prioritize systemic fix.
5. Chart history auto-bind: Frame as NEW feature if requested; ~40 LOC estimate.

---

**Sources:**
- ChartBindPopover.tsx (lines 1-152)
- AddRowPlaceholder.tsx (lines 1-181)
- TouchOrPopover.tsx (lines 1-95)
- DropdownCell.tsx (lines 1-302)
- SetlistGrid.tsx (lines 1064-1083, 399-414)
- schema.ts (lines 1-62)
- defaults.ts (lines 1-142)
- v52-02-01-SUMMARY.md (suppressAutoFocus contract)
- v51-01-01-SUMMARY.md (TouchOrPopover baseline)
