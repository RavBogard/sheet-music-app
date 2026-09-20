# The Living Score — v2

## Usability Analysis: What Actually Happens Today

### The Transposition=0 Blind Spot (Critical Gap)

This is the biggest problem I missed in v1. Here's line 227 of SmartTransposer.tsx:

```tsx
if (!isChanged) return null
```

**When transposition is 0, zero chord overlays render.** None. The assumption is "at t=0, the PDF is correct." But that's only true if detection was perfect — which it demonstrably isn't.

This breaks *everything*:
- AI corrections would be invisible — the PDF still says "A" even though AI said "Am"
- Missing chords can't be shown — there's no overlay for chords that were never in the text layer
- The user can't tap to fix anything — there are no tap targets
- The "self-healing" animation never plays — there's nothing to animate

**And transposition=0 is the most common state.** Most musicians at CRC play in the original key. The transposer is used by the minority (guitar with capo, Bb instruments). So the current system is blind precisely when most people are looking at it.

### Use Case Walk-Through

Let me trace every real scenario:

**Use Case 1: Daniel opens Yedid Nefesh to rehearse, original key**
- Transposition = 0
- Text layer finds 10 of 14 chords, gets 2 wrong (Am→A)
- AI validation runs, finds the corrections
- **Current behavior**: Daniel sees... nothing. No overlays. Wrong chords in the PDF stay wrong. Missing chords stay missing. He has no idea the system even tried.
- **Needed behavior**: The 2 wrong chords get corrected overlays. The 2 missing chords get added overlays. Daniel sees 4 purple corrections appear; everything else stays as the PDF printed it.

**Use Case 2: Karen transposes Lecha Dodi up 2 for her voice**
- Transposition = +2
- Text layer finds 18 of 20 chords, gets 1 wrong (Am→A)
- AI validation runs, finds corrections
- **Current behavior**: 17 correct chords display transposed. The 1 wrong one shows "B" instead of "Bm" (transposed from "A" not "Am"). The 2 missing chords have no overlay at all — their original text bleeds through, wrong key.
- **Needed behavior**: All 20 chords display correctly transposed. The wrong one becomes "Bm" after AI correction. The missing ones appear at the right positions.

**Use Case 3: Guitarist uses capo 3, "play as G shapes" in key of Bb**
- Same as Use Case 2 but with different transposition. Same problems, same solutions.

**Use Case 4: Daniel prints a packet for the band**
- Print pipeline reads from Firestore chordData cache
- The cache was populated by the *client-side* text scanner, which stores coordinates as percentages (0-100)
- The print renderer expects PDF points (72pt/inch)
- **Latent bug**: Chord at x=50%, y=20% gets rendered at PDF point (50, 20) — bottom-left corner of the page, completely wrong position
- **This bug is masked** when the server-side extractor populates the cache (it uses correct PDF points), but if a client scan writes first, the print is broken
- **Needed**: Consistent coordinate system, or explicit flag so the renderer can convert

**Use Case 5: A new chart is added to the library**
- First person to open it triggers the full pipeline
- Scanned, AI-validated, cached
- Every subsequent person benefits from the cache
- If the first person also makes corrections, everyone gets those too
- **Good**: Cache is per-file (shared), not per-user
- **Bad**: No concept of which parts came from text layer vs. AI vs. human

**Use Case 6: Daniel fixes a chord, then the cache gets invalidated**
- CACHE_VERSION bumps from 5 to 6 (we improve the scanner)
- All cached data is discarded and re-scanned
- **Daniel's manual correction is lost.** It was stored as just another chord in the array, indistinguishable from auto-scanned ones.
- **Needed**: User overrides stored separately, survive cache invalidation

**Use Case 7: Offline at the synagogue during Friday night service**
- No network for AI validation
- Text-layer scan still works (client-side, no network needed)
- If the chart was previously cached: loads instantly from Firestore (which has offline persistence if configured, but currently it's via API calls, so no)
- **Needed**: Local chord cache fallback (IndexedDB) for offline resilience

**Use Case 8: Daniel taps a wrong chord during rehearsal**
- **Current**: Nothing happens. Chord overlays are `pointer-events-none`, always.
- **Needed**: Interactive overlays when not in live performance mode

---

## Architecture: What Must Change

### 1. Enhanced Chord Record

Every chord should carry its provenance:

```typescript
interface ChordRecord {
  text: string            // Current best text (resolved from priority below)
  originalText: string    // What text-layer scan originally found
  aiText?: string         // What AI validation said (if different from originalText)
  userText?: string       // What user manually set (SACRED — never auto-overwritten)
  x: number               // X position (percentage, 0-100)
  y: number               // Y position (percentage, 0-100)
  w?: number              // Width (percentage)
  h?: number              // Height (percentage)
  pxHeight?: number       // Pixel height for font sizing
  source: 'textLayer' | 'ai' | 'user'
}
```

Resolution priority: `userText > aiText > originalText`

The `text` field always contains the resolved winner. When rendering, we can check: does `text` differ from `originalText`? If yes → this chord needs an overlay even at t=0.

### 2. Enhanced Cache Schema

```typescript
interface PageChordData {
  chords: ChordRecord[]
  scanMethod: 'textLayer' | 'textLayer+ai' | 'ai' | 'manual'
  aiValidated: boolean
  aiValidatedAt?: string
  cacheVersion: number
  scannedAt: string
  // Coordinate system flag for print pipeline compatibility
  coordSystem: 'percentage' | 'pdfPoints'
}
```

Key properties:
- `aiValidated` — prevents re-running AI on every open (cost control)
- `coordSystem` — print pipeline can convert correctly
- Individual chord `source` — user overrides survive cache version bumps

### 3. Rendering Logic at Transposition=0

Replace `if (!isChanged) return null` with:

```typescript
// At t=0: only overlay chords that DIFFER from what the PDF shows
// At t≠0: overlay ALL detected chords with transposed text
const needsOverlay = isChanged || chord.text !== chord.originalText

if (!needsOverlay) return null
```

This single change means:
- Correct chords at t=0: no overlay (PDF is right) ✅
- AI-corrected chords at t=0: overlay with correct text (PDF is wrong) ✅
- AI-added chords at t=0: overlay appears (PDF has nothing there) ✅
- User-overridden chords at t=0: overlay appears ✅
- All chords at t≠0: overlay with transposed text ✅

### 4. The Interaction Model

**Principle: Fix mode follows the AnnotationLayer pattern exactly.**

The codebase already has a proven pattern:
- `isAnnotating` toggle in PerformanceToolbar (pencil icon)
- SVG overlay flips between `pointer-events: none` and `pointer-events: auto`
- Works on touch and mouse

We add an analogous `isFixingChords` state:

```
Toolbar:  [🎵 Transpose ▾]  [✏️ Annotate]  [🔧 Fix Chords]
```

When Fix Chords is active:
1. Every detected chord position gets a subtle colored border (thin violet outline)
2. Positions where text layer found something → solid outline
3. The entire page area becomes tappable for "add missing chord" gestures
4. Chord overlays switch to `pointer-events: auto`

When Fix Chords is inactive (default):
- Everything behaves as today (plus the t=0 correction overlays from §3)
- Performance mode: completely non-interactive

**Automatically disabled during live mode** — the `liveState.enabled` flag already exists.

---

## The Complete Flow

### First Open (no cache)

```
t=0ms     Check Firestore cache → miss
t=10ms    Text-layer scan begins
t=50ms    Text-layer results displayed (Layer 1)
t=100ms   Full-page canvas rendered to JPEG
t=150ms   Gemini API call sent (with text-layer results as context)
t=2000ms  Gemini response arrives
t=2050ms  Corrections animate in:
            - Wrong chords: text morphs (e.g., "A" → "Am")
            - Missing chords: fade in from transparent
t=2100ms  Merged results saved to Firestore cache
            scanMethod: 'textLayer+ai', aiValidated: true
```

### Repeat Open (cached, AI-validated)

```
t=0ms     Check Firestore cache → HIT (aiValidated: true, version OK)
t=50ms    Chords displayed from cache (all corrections included)
          No AI call. No scan. Instant.
```

### Repeat Open After Cache Version Bump

```
t=0ms     Check cache → version mismatch
t=10ms    Load cache anyway, extract user overrides (source: 'user')
t=50ms    Re-scan text layer
t=100ms   Re-run AI validation
t=2000ms  Merge: auto-scanned chords updated, user overrides preserved
t=2100ms  Save updated cache with new version
```

### User Taps Wrong Chord

```
t=0ms     User taps "A" overlay → popover appears below
          Shows: [Am] [A7] [Amaj7] [Am7] [✏️ Type]
          Suggestions from:
            - AI re-examination of that region (background)
            - Music theory (key context: Em → Am is diatonic, A is not)
            - Common corrections database
t=300ms   User taps "Am"
t=350ms   Chord updates instantly
t=400ms   Saved to cache as source: 'user'
          (This chord now survives all future cache invalidations)
```

### User Taps Empty Space (Missing Chord)

```
t=0ms     User taps blank area in Fix mode
t=10ms    Small pulsing circle appears at tap point (feedback)
t=50ms    200×100px region cropped from canvas around tap point
t=100ms   Sent to Gemini: "What chord is at the center of this image?"
t=1500ms  Response: "Gm"
t=1550ms  Chord "Gm" fades in at tap position
          Saved to cache as source: 'user'
```

### User Taps Empty Space — No Chord There

```
t=0ms     User accidentally taps a lyric area
t=50ms    Region sent to Gemini
t=1500ms  Response: no chord found
t=1550ms  Brief shake animation on the pulsing circle → fades out
          No chord added. Clean failure.
```

---

## Edge Cases and Safeguards

### Cost Control
- AI validation runs ONCE per page per cache version, then is cached
- `aiValidated: true` flag prevents re-running on every open
- Estimated cost for full CRC library (~200 charts, ~400 pages): $0.80 one-time
- User corrections via region crop: ~$0.001 each, expected <5 per chart lifetime

### Offline Resilience
- Text-layer scan: always works offline ✅
- AI validation: skipped when offline, flag `aiValidated` stays false
- Next online open: AI validation runs, corrections applied
- Consider: local IndexedDB chord cache mirror for truly offline performance

### Coordinate System Fix (Print Pipeline)
- All client-side scans store coordinates as percentages with `coordSystem: 'percentage'`
- Print pipeline checks `coordSystem` flag:
  - `'percentage'` → converts: `x_points = (x_pct / 100) * pageWidth`
  - `'pdfPoints'` → uses directly (legacy server-extracted data)
- Server-side extraction continues storing PDF points with `coordSystem: 'pdfPoints'`

### Undo for User Corrections
- Each user override is individually revertable
- In Fix mode, tapping a user-corrected chord shows the popover with an "Undo" option that reverts to AI or text-layer value
- Last resort: "Reset All Corrections" in the TransposerMenu clears all `source: 'user'` entries for the current file

### Discovery (How Users Know This Exists)
- When AI validation makes corrections, show a brief toast: "2 chords corrected ✓"
- The toast has a "Review" action that scrolls to the first correction
- In TransposerMenu, show: "14 chords · AI verified ✓" (or "14 chords · 2 corrections")
- If corrections were made, show a subtle badge on the Transpose button

### Band-Wide Benefit
- Cache is per-file (Firestore: `library_index/{fileId}/chordData/`), not per-user
- When Daniel fixes "A" → "Am", everyone sees "Am" next time they open the chart
- If two people make conflicting corrections, last-write-wins (acceptable for small trusted team)
- Future: could add correction attribution if needed

### Multi-Page Charts
- AI validation is per-page (each page = one Gemini call)
- Pages scan in parallel (current behavior, preserved)
- User overrides are per-page (stored in `page_{n}` document)
- Key estimation uses chords from ALL pages (current behavior, preserved)

---

## Implementation Phases (Revised)

### Phase A: The Foundation (must ship together)

**A1. Enhanced chord records with source tracking**
- Add `source`, `aiText`, `userText` fields to ChordRecord
- Update cache schema with `aiValidated`, `coordSystem` flags
- Backward-compatible: existing caches load as `source: 'textLayer'`
- Update `saveChordCache` and `loadChordCache`

**A2. AI Validation Pass**
- After text-layer scan, send full-page image to Gemini
- Prompt: "Here are the chords I found; confirm, correct, or add"
- Merge AI results into chord array with `source: 'ai'`
- Cache with `aiValidated: true`
- Skip if cache already has `aiValidated: true` and version matches

**A3. Fix the t=0 rendering**
- Replace `if (!isChanged) return null`
- New logic: `if (!isChanged && chord.text === chord.originalText) return null`
- Corrected/added chords render at t=0 in purple (covers wrong PDF text)
- Use slightly different styling for "correction overlay" vs "transposition overlay"

**A4. Delete the strip pipeline**
- Remove `line-scanner.ts` (170 lines)
- Remove strip-based Gemini calls from SmartTransposer
- Full-page AI validation replaces it entirely

Phase A is the complete "self-healing score." Once this ships, every chart in the library will get automatic AI verification within seconds of being opened, corrections will persist, and they'll be visible regardless of transposition setting.

### Phase B: Tap to Fix

**B1. Fix Chords mode toggle**
- Add `isFixingChords` to music store
- Add toggle button to TransposerMenu (and/or PerformanceToolbar)
- Auto-disable when live mode is active

**B2. Tap existing chord → correction popover**
- Switch chord overlays to `pointer-events: auto` when Fix mode is on
- On tap: show inline popover with AI + music-theory suggestions
- On select: update chord, save as `source: 'user'`
- On "Undo": revert to AI/text-layer value

**B3. Tap empty space → add chord**
- In Fix mode: entire page is tappable
- Tap feedback (pulse animation)
- Region crop → Gemini → place chord
- Save as `source: 'user'`

### Phase C: Polish and Hardening

**C1. Text-layer merge improvements**
- More aggressive "m" absorption for the dropped-minor case
- Reduces AI's workload (fewer corrections needed)
- Lower latency for first paint

**C2. Coordinate system fix for print**
- Add `coordSystem` flag to cache documents
- Update print pipeline to convert percentages → PDF points
- Fixes the latent print-position bug

**C3. Correction toast + discovery**
- Brief toast when AI makes corrections
- Badge on Transpose button when corrections exist
- Chord count in TransposerMenu shows verification status

**C4. Offline chord cache**
- Mirror Firestore chord data to IndexedDB
- Text-layer scan + local cache = full offline functionality
- AI validation deferred to next online session

---

## What This Doesn't Do (Explicit Scope Limits)

- **No real-time collaboration on corrections.** Last-write-wins is fine for CRC's team size.
- **No ML training from corrections.** User corrections don't retrain the text-layer scanner. The scanner stays rule-based; AI validation and user overrides handle what rules miss.
- **No inline chord editing keyboard.** Users select from suggestions or type in the popover. No inline text field on the PDF.
- **Keyboard shortcuts deferred.** Per the original audit exclusion.

---

## Success Criteria

After Phase A ships:
1. Open Yedid Nefesh at t=0 → all 14 chords visible and correct (including "Am" not "A")
2. Open Lecha Dodi at t=0 → "F" at top is present, "Am" is correct
3. Open Shalom Alechem at t=+2 → all chords transposed correctly, including minors
4. Open any chart a second time → loads instantly from cache, no AI call
5. Print a transposed packet → chords match what's on screen

After Phase B ships:
6. Tap a wrong chord → popover with correct suggestion as first option
7. Tap empty space where chord should be → chord appears within 2 seconds
8. Corrections persist across sessions and benefit all users
