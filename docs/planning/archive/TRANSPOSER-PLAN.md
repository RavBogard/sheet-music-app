# Transposer Deep Dive & Improvement Plan

## What's Happening in Your Screenshots

### Blue circles (wrong chord — dropped "m"):
- **Yedid Nefesh**: "Am" rendered as "A"
- **Lecha Dodi**: "Am" rendered as "A"

**Root cause**: The PDF text layer splits "Am" into two separate spans: `"A"` and `"m"`. The merge algorithm (text-scanner.ts, ~250 lines of heuristic gap/Y-tolerance logic) fails to rejoin them — likely because the "m" is rendered in a different font size or baseline offset that exceeds the merge threshold.

### Red circles (chord completely missed):
- **Yedid Nefesh**: "Dm" at top, plus entire "Gm Dm Bb C" cluster at bottom
- **Lecha Dodi**: "F" near the top

**Root cause**: These spans either (a) aren't in the PDF text layer at all, (b) are present but merged with adjacent non-chord text, or (c) are filtered out by the sanity checks (width > 15% of page, excluded words, etc.).

---

## The Architectural Problem

The current pipeline has a **fatal design flaw**:

```
Text layer scan → found ANY chords? 
  YES → use those results, cache them, done ✅
  NO  → fall back to Gemini AI vision 🤖
```

This means: **if the text scanner finds 8 out of 12 chords, those 8 are treated as the complete truth.** The 4 missed chords are gone forever (and cached as "not there").

The text scanner is ~250 lines of fragile heuristic merge logic with 5 passes:
1. Sort spans by Y/X
2. Forward merge adjacent single chars
3. Forward absorb from chord roots (A-G)
4. Reverse merge orphaned fragments
5. Regex filter

Each pass has pixel-distance thresholds that were tuned to *some* PDFs but not all. Every music notation program (Sibelius, Finale, MuseScore, Dorico, handwritten) renders text layers differently.

### Other issues:
- **No color awareness**: Your chords are rendered in **purple**. The scanner ignores color entirely — a massive unused signal.
- **Caching locks in errors**: Once a bad scan is cached, it stays wrong until you manually clear the chord cache from the admin panel.
- **Server-side extractor is a separate copy**: `pdf-chord-extractor.ts` (used for print) has its OWN merge logic, different thresholds. Chords that display correctly may print wrong, or vice versa.

---

## The Plan

### Phase 1: Color-Aware Text Extraction (high impact, 1-2 days)

**The insight**: Your lead sheets render chords in a **distinct color** (purple/violet, roughly `rgb(100-150, 30-80, 180-230)`). Lyrics are black. Staff lines are black. This is the single strongest signal available and we're completely ignoring it.

**Approach**:
1. Before running text-layer merge heuristics, check each span's `computedStyle.color`
2. Classify spans as "chord-colored" vs "non-chord-colored"
3. Only attempt chord extraction on chord-colored spans
4. This eliminates the entire class of "lyric text mistaken for chord" errors AND makes merging trivial (all purple spans near each other on the same Y-line = one chord)

**Why this works**: It sidesteps the entire fragile merge pipeline. Instead of "is this text a chord?", the question becomes "is this text purple?" — which has a binary, unambiguous answer.

**Fallback**: If no colored text is found (monochrome PDF), fall through to current logic.

### Phase 2: AI Validation Pass (high impact, 1 day)

**The insight**: Instead of "text layer OR AI", use "text layer THEN AI verification".

**Approach**:
1. Run text-layer scan as today (with Phase 1 color improvements)
2. Render the page to a low-res canvas (~800px wide)
3. Send the image to Gemini with context: *"I detected these chords at these positions: [list]. Are there any chords I missed? Are any of my detections wrong?"*
4. Gemini returns corrections and additions
5. Merge the validated results

**Why this works**: 
- Gemini is excellent at reading music chord symbols from images
- Providing our "first draft" as context makes Gemini's job easier and cheaper
- We only need the corrections, not full extraction
- Cost: ~$0.001 per page (one cheap image call)

**Bonus**: This also catches the "dropped minor" case — Gemini would say "position X should be Am, not A"

### Phase 3: Full-Page Vision Extraction (medium impact, 0.5 day)

**Replace the image-strip pipeline entirely.**

Current raster fallback:
1. Scan canvas for horizontal "ink density" strips
2. Crop each strip as a separate image
3. Send N images to Gemini with per-strip instructions
4. Map results back by strip Y position

Problems: strip boundaries are heuristic, chord symbols that span strip boundaries get missed, N separate images = higher cost.

**New approach**:
1. Send ONE full-page image to Gemini
2. Ask: "Identify every chord symbol on this lead sheet page. Return the chord text and its position as X%, Y% of the page dimensions."
3. Done.

This is simpler, cheaper (1 call vs N), and more reliable because Gemini sees the full context (staff lines, lyrics, chord positions relative to each other).

### Phase 4: Confidence Scoring & Smart Cache Invalidation (medium impact, 1 day)

**Problem**: cached bad results stay bad forever.

**Approach**:
1. Each cached chord gets a `confidence` score (text-layer-only = 0.7, color-confirmed = 0.9, AI-validated = 0.95)
2. Cache entries below a threshold are automatically re-scanned on next view
3. When the scanner algorithm version changes (CACHE_VERSION bump), low-confidence entries are invalidated first
4. Add a per-page "re-scan" button in the UI (tap a chord overlay → "This looks wrong" → re-scan that page)

### Phase 5: Unify Server & Client Extractors (cleanup, 0.5 day)

**Problem**: `text-scanner.ts` (client, browser) and `pdf-chord-extractor.ts` (server, Node) have **different merge logic and thresholds**. A chord that displays correctly may print wrong.

**Approach**:
1. Extract shared merge logic into `chord-merge.ts`
2. Both client and server import from same module
3. Single set of thresholds to tune

---

## Priority Recommendation

| Phase | Impact | Effort | Do When |
|-------|--------|--------|---------|
| **1: Color-aware extraction** | 🔴 High | 1-2 days | **Now** — fixes both screenshots immediately |
| **2: AI validation pass** | 🔴 High | 1 day | **Now** — catches everything Phase 1 misses |
| 3: Full-page vision | 🟡 Medium | 0.5 day | Next sprint — replaces fragile strip pipeline |
| 4: Confidence + cache | 🟡 Medium | 1 day | Next sprint — prevents bad results from persisting |
| 5: Unify extractors | 🟢 Low | 0.5 day | Whenever — code health |

Phases 1+2 together would fix virtually every case in your screenshots and handle future PDFs from different notation software. The color detection handles your standard CRC lead sheets; the AI validation catches anything color misses (monochrome PDFs, unusual formatting).

---

## Quick Win Available Right Now

Before any of the above, there's a one-line fix that would help the "dropped m" case specifically:

In `text-scanner.ts`, the merge algorithm's `isQuality` regex requires the **entire span** to be a quality marker. But "m" as a standalone span sometimes gets classified differently. We could add "m" to the chord-root forward-absorb logic with a more generous gap tolerance. However, this is a band-aid — Phase 1 (color) would eliminate the need for this entirely.
