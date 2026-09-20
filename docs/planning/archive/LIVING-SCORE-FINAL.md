# The Living Score

---

## What's Wrong Today

**Three bugs, one root cause.** The text-layer scanner splits "Am" into "A" + "m" and fails to rejoin them. It misses chords entirely when PDF spans don't align with its pixel-distance thresholds. And once a bad scan is cached, it stays wrong forever.

**The t=0 blind spot.** When transposition is 0 (the most common state), zero chord overlays render. Line 227: `if (!isChanged) return null`. Even if we fix detection, corrections can't appear for most musicians most of the time.

**Key is decorative.** `SetlistTrack.key` is a text label with zero connection to transposition. There's no native key concept. Setting keys requires thinking in semitones. Each musician independently figures out their shift.

---

## Design Principles

1. **Calculations, not mental math.** Musicians think in key names. The system thinks in semitones. Don't make the musician translate.
2. **Every automatic action has a graceful failure.** Gemini down → text-layer results stand. Auto-detection wrong → one tap to fix. Nothing blocks rendering.
3. **Simplest data model that works.** No fields that need to stay in sync. No resolution priority chains. If two fields can be one, use one.
4. **Explicit modes for editing.** Don't guess intent from gestures. Viewing is the default. Editing is an intentional, clearly entered state.

---

## Part 1: Self-Healing Chords

### The Chord Record

```typescript
interface ChordRecord {
  text: string          // The current best chord text
  originalText: string  // What the PDF text layer actually says (for t=0 overlay logic)
  x: number             // Percentage (0-100)
  y: number
  w?: number
  h?: number
  pxHeight?: number
  source: 'textLayer' | 'ai' | 'user'
}
```

Three fields that matter: `text` (what to display/transpose), `originalText` (what the PDF says — needed to know when t=0 overlay is necessary), `source` (who set `text` — needed so user corrections survive cache invalidation).

When AI corrects a chord, it updates `text` and sets `source: 'ai'`. When a user corrects it, same thing with `source: 'user'`. The current `text` is always the answer. No resolution chain.

### The Cache Record

```typescript
interface PageChordData {
  chords: ChordRecord[]
  scannedAt: string
  scanMethod: 'textLayer' | 'textLayer+ai' | 'ai'
  aiValidated: boolean
  cacheVersion: number
}
```

`aiValidated` prevents re-calling Gemini on every open. On cache version bump: chords with `source: 'user'` are preserved and re-applied by position; everything else is re-scanned.

### The AI Validation Pass

After the text-layer scan shows results:

1. Render the page canvas to JPEG at 1200px width, quality 0.7 (~80KB)
2. Send ONE image to Gemini with our first-draft results as context:

```
This is a lead sheet page. I detected these chords:
- "A" at x≈12%, y≈15%
- "C" at x≈35%, y≈15%
[...]

Return the COMPLETE list of chord symbols on this page with positions.
Include chords I may have missed. Correct any I got wrong.
Return JSON: [{ "text": "Am", "x": 12, "y": 15 }, ...]
```

Asking for the complete list (not corrections/diffs) is simpler for the model. We do the diffing in code where we can be precise.

3. Merge when response arrives:
   - For each AI chord, find the nearest text-layer chord by position (~5% tolerance)
   - Match found, same text → no change (confirmed)
   - Match found, different text → update `text`, set `source: 'ai'` (correction)
   - No match → add as new chord with `source: 'ai'` (addition)
   - Text-layer chords with no AI match → keep (AI may have missed one too)

4. Save with `aiValidated: true`

**Cost**: ~$0.002 per page. Full CRC library (~200 charts, ~400 pages): ~$0.80 one-time.

**Failure mode**: If Gemini is down or returns garbage, text-layer results stand unchanged. `aiValidated` stays `false`. Next open retries. Nothing breaks.

**Rate limiting**: Max 2 concurrent AI validation calls. Rest queue.

### The t=0 Fix

```typescript
// Before:
if (!isChanged) return null

// After:
if (!isChanged && chord.text === chord.originalText) return null
```

At t=0: correct chords → no overlay (PDF is right). Corrected/added chords → purple overlay (PDF is wrong or has nothing there). At t≠0: all chords get transposed overlays as before.

### Delete the Strip Pipeline

`line-scanner.ts` (170 lines) and the strip-based Gemini calls are replaced entirely by the full-page AI validation. One call per page instead of N. Simpler, cheaper, more reliable.

---

## Part 2: Key Management

### Native Key

Stored on the library song, not the setlist:

```
library_index/{fileId}: {
  ...existing fields,
  nativeKey?: string             // "Em", "Dm"
  nativeKeySource?: 'auto' | 'manual'
}
```

**Auto-detection**: After AI-validated chords are available, `estimateKey()` runs on the final chord list. Writes to library if no `nativeKey` exists or source is `'auto'`. Manual overrides (`'manual'`) are never auto-overwritten.

**Important**: `estimateKey()` runs AFTER AI validation. The "dropped minor" bug (Am→A) directly corrupts key estimation. Fix the chords first, then estimate the key.

### Setlist Key

```typescript
interface SetlistTrack {
  // ...existing fields
  key?: string              // The setlist key — what everyone plays in
  transposition?: number    // Semitones: PRE-CALCULATED from native key to setlist key
}
```

**Pre-calculated at edit time.** When the leader picks "Am" and the native key is "Dm", the system stores `key: "Am"` AND `transposition: 7`. The track is self-contained — no library lookups at performance time.

**Backward compatibility**: Existing tracks with raw `transposition` but no `key` → work as today. Existing tracks with `key: "Em"` (decorative) and no transposition → key displays, transposition stays 0. No migration.

### Editor UI

In TrackSheet:

```
┌──────────────────────────────────┐
│  Oseh Shalom                     │
│                                  │
│  Chart Key:  Dm  (auto ✓) ✏️     │
│  Play In:    [Am ▾]              │
│              [−] +7 [+]         │
│                                  │
│  Lead: Daniel    BPM: 120        │
└──────────────────────────────────┘
```

- **Chart Key**: from library. Tap ✏️ → KeyPicker → writes to library as `'manual'`
- **Play In**: KeyPicker grid. Defaults to chart key. Picking a key calculates semitones and saves both `key` and `transposition`
- **Stepper**: adjusts semitones ±1. Updates the "Play In" display via `transposeChord(nativeKey, semitones)`

No bidirectional binding. Picker writes key→semitones. Stepper writes semitones→display. One-directional each.

### Performance Flow

Queue building is unchanged:

```typescript
const queue: QueueItem[] = tracks.map(t => ({
    ...existing,
    transposition: t.transposition || 0,  // Already pre-calculated
}))
```

TransposerMenu shows "Playing in Am (chart: Dm)" when setlist key differs. Capo grid calculates from the setlist key.

---

## Part 3: Edit Mode & Verification

### Why a Mode

On a phone screen with densely packed chords above lyrics above staff lines, accidental taps during normal scrolling and playing would be constant and disruptive. Editing chords is a deliberate "I'm reviewing this chart" activity — not something you do while sight-reading. An explicit mode makes intent clear and prevents accidents.

### Entering Edit Mode

Inside the TransposerMenu popover:

```
┌─ TransposerMenu ─────────────────┐
│                                   │
│  Detected Key:  Em                │
│  [−]  +7  [+]  semitones         │
│  Play As: [G] [C] [D] [A] ...    │
│                                   │
│  14 chords detected               │
│  ┌─────────────────────────────┐  │
│  │  ✏️  Edit Chords            │  │
│  └─────────────────────────────┘  │
│                                   │
└───────────────────────────────────┘
```

Tap "Edit Chords" →
1. Popover closes
2. Edit mode activates (`isEditingChords: true` in store)
3. Floating bar appears at bottom of screen:

```
┌────────────────────────────────────────┐
│  ✏️ Editing Chords    [✓ Verify & Done]│
└────────────────────────────────────────┘
```

### While in Edit Mode

**Visual**: Every detected chord gets a subtle dotted violet border. Makes all chord positions visible — including at t=0 where there'd normally be no overlay. You can see what the system found and what it missed.

**Tap a chord** → popover with suggestions:

```
┌─────────────────────────┐
│  Am   A7   Am7   Amaj7  │
│  ───────────────────     │
│  ✏️ Type     ↩ Undo     │
└─────────────────────────┘
```

Suggestions from music-theory context (key + surrounding chords) and common corrections. No AI call — instant. Tap a suggestion → saves immediately as `source: 'user'`.

**Long-press empty space** (~500ms) → pulsing circle → region cropped → Gemini: "What chord is here?" → chord appears in ~1-2 seconds, saved as `source: 'user'`. If nothing found, circle shakes and fades.

**Scrolling** works normally. Only deliberate taps on chord targets and long-press on empty space trigger actions.

### Verify & Done

Tapping "✓ Verify & Done":

1. Writes `chordsVerified: true`, `chordsVerifiedBy: userName` to `library_index/{fileId}`
2. Exits edit mode (floating bar and dotted borders disappear)
3. Individual corrections were already saved on each tap — this is a stamp of approval

Verification is song-level (all pages). Shows in TransposerMenu:

```
14 chords · ✓ Verified by Daniel
```

Band members see this and know the chords are human-reviewed.

**On cache invalidation** (version bump): `chordsVerified` resets to false — the new scan needs re-review. But user corrections (`source: 'user'`) survive and are re-applied automatically. The verified stamp is cleared because the overall chord set changed.

### When Edit is Unavailable

- **Live mode active**: "Edit Chords" button hidden. Zero accident risk during service.
- **No chords detected**: Button disabled with "Scanning..."
- **Transposer off**: TransposerMenu not open, edit not reachable.

---

## Part 4: What's Not in This Plan

- **No animations.** Corrections appear when ready. Polish later.
- **No offline chord cache.** Text-layer works offline. AI and cached results need network.
- **No ML from corrections.** Scanner stays rule-based. AI + user overrides handle the rest.
- **No real-time correction collaboration.** Last-write-wins.
- **No new print features.** Existing musician profile + transposition handles per-musician shifts.

---

## Part 5: Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gemini returns bad chords | Low | Medium | Text-layer stands. User fixes in edit mode. |
| Auto-detected key wrong | Medium | Low | Tap ✏️ to override. `'manual'` prevents re-overwrite. |
| AI validation slow (>5s) | Low | Low | Text-layer shows instantly. AI arrives when ready. |
| Gemini API down | Low | Low | `aiValidated: false`. Next open retries. |
| Two users fix same chord | Very low | None | Last write wins. Same result next time. |
| API flood from fast scrolling | Medium | Low | Max 2 concurrent calls, rest queued. |
| estimateKey wrong | Medium | Medium | AI fixes chords first. Manual override available. |

### What's honestly fragile

1. **AI merge logic** — position-matching at ~5% tolerance. Closely-spaced chords could mismatch. User corrections handle remaining issues.
2. **estimateKey() for minor keys** — only checks first chord for minor quality. Major IV as first chord → wrong guess. Manual override available.
3. **Stepper display for unusual transpositions** — `transposeChord("Dm", +6)` enharmonic ambiguity. Existing logic picks conventional spellings but edge cases exist.

---

## Part 6: Implementation Phases

### Phase A: Self-Healing Chords

**A1. Chord record with `source` field**
- Add `source` to ChordRecord and cache schema
- Add `aiValidated` to cache schema
- Backward-compatible defaults

**A2. AI validation pass**
- New endpoint `/api/ai/chord-validate`
- Full-page image + existing chords → complete chord list
- Merge logic, cache with `aiValidated: true`
- Max 2 concurrent calls

**A3. Fix t=0 rendering**
- One condition change in SmartTransposer

**A4. Native key auto-detection**
- `estimateKey()` on AI-validated chords → write to library
- Piggybacked on chord-cache save

**A5. Delete strip pipeline**
- Remove `line-scanner.ts` and strip code from SmartTransposer

### Phase B: Key Management

**B1. `calculateSemitones()` in music-math.ts**

**B2. TrackSheet UI** — Chart Key + Play In + stepper

**B3. TransposerMenu** — "Playing in Am (chart: Dm)", capo from setlist key

**B4. Fetch native key** — load from library when TrackSheet opens

### Phase C: Edit Mode & Verification

**C1. Edit mode infrastructure**
- `isEditingChords` in store
- "Edit Chords" button in TransposerMenu
- Floating bottom bar with "✓ Verify & Done"
- Auto-disabled during live mode

**C2. Tap to correct**
- Dotted borders on chords in edit mode
- Tap → popover with suggestions
- Save as `source: 'user'`

**C3. Long-press to add**
- 500ms hold → pulsing circle → region crop → Gemini → place chord

**C4. Verification**
- `chordsVerified` + `chordsVerifiedBy` on library document
- Badge in TransposerMenu
- Resets on cache invalidation

**C5. Override persistence**
- `source: 'user'` chords extracted before re-scan, re-applied after

### Phase D: Hardening

**D1. Text-layer merge improvements** — aggressive quality-suffix absorption
**D2. estimateKey improvements** — last chord weighting, minor-dominant patterns

---

## What the Musician Experiences

### Building the setlist

Daniel adds Oseh Shalom. System shows "Chart Key: Dm (auto ✓)". He taps "Play In", picks Am. Stepper shows +7. Everyone sees Am.

### At rehearsal

Guitarist opens the setlist. Oseh Shalom in Am. She opens TransposerMenu, taps "G shapes." Her chords: G, C, D with "Capo 2." Everyone else sees Am.

Daniel opens TransposerMenu, taps "Edit Chords." Popover closes. Floating bar appears: "✏️ Editing Chords · [✓ Verify & Done]". Every chord shows a dotted violet border.

He sees "A" that should be "Am." Taps it. Popover: Am | A7 | Am7 | Amaj7. Taps Am. Updated.

Spots a gap where "Gm" should be. Long-presses. Pulsing circle, one second, "Gm" appears.

Scrolls through both pages. Looks right. Taps "✓ Verify & Done." Bar disappears. TransposerMenu now shows: "14 chords · ✓ Verified by Daniel."

### Service

Live mode. Overlays non-interactive. Charts correct. Corrections baked in.

### A new chart

Chords appear instantly from text-layer. Two seconds later, "A" quietly becomes "Am." Auto-detected key appears in TransposerMenu. No action required.

---

## Success Criteria

**Phase A:**
1. Yedid Nefesh at t=0 → "Am" correct (not "A")
2. Missing chords appear after ~2s AI validation
3. Second open → instant from cache, zero AI calls
4. Gemini down → text-layer shown, no error

**Phase B:**
5. Every scanned chart shows auto-detected key
6. "Play In: Am" on Dm chart → everyone sees Am
7. Capo calculates from setlist key (Am), not native (Dm)
8. Legacy setlists → unchanged

**Phase C:**
9. Edit mode → dotted borders on all chord positions
10. Tap wrong chord → first suggestion is correct
11. Long-press empty spot → chord in ~2 seconds
12. "Verify & Done" → badge visible to all band members
13. Corrections persist, benefit everyone
14. Live mode → edit unavailable
