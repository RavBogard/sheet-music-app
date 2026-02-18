# The Living Score — v3

*Integrates chord detection, AI validation, user corrections, AND key management into one coherent system.*

---

## Part 1: Usability Analysis

### The Transposition=0 Blind Spot

Line 227 of SmartTransposer.tsx: `if (!isChanged) return null`

When transposition is 0, zero chord overlays render. The assumption is "the PDF is correct." But when AI corrects "A" to "Am", or adds a missed chord, there's no way to show it. And t=0 is the most common state — most musicians play in the original key. The self-healing system would be invisible to most people most of the time.

**Fix**: Replace "show overlays when transposing" with "show overlays when the PDF text is wrong." At t=0, corrected/added chords still render because the PDF is still wrong. At t≠0, everything renders transposed as before.

### The Key Problem (New)

Currently, `SetlistTrack.key` is a text label that doesn't drive anything. `SetlistTrack.transposition` is raw semitones set manually. This creates three problems:

1. **No native key concept.** The system can detect "this chart is in Em" from chords, but doesn't store or use that knowledge. Every setlist track starts blank.

2. **Transposition is opaque.** Setting "+3" requires mental math: "Em +3 = ...Gm?" The leader has to think in semitones instead of keys.

3. **No shared baseline.** When the leader says "we're doing Oseh Shalom in Am," each musician has to independently figure out their transposition. There's no way to say "the setlist key is Am" and have everyone's view adjust accordingly.

### How Transposition Actually Flows Today

```
SetlistTrack.transposition (raw semitones, set by leader)
  → QueueItem.transposition (copied directly)
    → store.transposition (set when navigating songs)
      → SmartTransposer reads store, applies to detected chords
        → Musician profile may override with saved preference
```

`SetlistTrack.key` is displayed in the UI but has zero connection to the transposition pipeline. It's decorative.

### The Desired Flow (from interview)

```
Library song: nativeKey = "Dm" (auto-detected from chords)
                ↓
Setlist track: setlistKey = "Am" (leader's choice; default = nativeKey)
                ↓
              semitones = Am - Dm = +7 (CALCULATED, not manual)
                ↓
Performance:  store.transposition = +7 (everyone sees Am)
                ↓
Musician:     guitar profile says "capo 2, play as Gm shapes"
              → personal transposition = +7 - 2 = +5
              → chords shown as Gm-relative (derived from Am setlist key)
```

The key insight: **transposition semitones should be DERIVED from keys, not manually set.** The leader thinks in keys ("Am"), the system calculates semitones, and each musician's instrument profile layers on top.

---

## Part 2: The Three-Layer Chord Architecture

### Layer 1: Instant Scan (0ms)

Text-layer extraction, improved with more aggressive merge heuristics for the "dropped minor" case. Gives you 80% of chords instantly.

### Layer 2: Self-Healing AI Validation (1-3 seconds)

After text-layer results are shown, a full-page image goes to Gemini:

> "I detected these chords at these positions: [list]. Confirm, correct, or add any I missed."

Corrections animate in — wrong chords morph, missing chords fade in. One cheap API call per page (~$0.002), cached permanently.

This replaces the fragile strip-based raster pipeline entirely. `line-scanner.ts` gets deleted.

### Layer 3: Teachable User Corrections (on tap)

When Fix mode is active (not during live performance), the musician can:
- **Tap a wrong chord** → popover with AI + theory suggestions → one tap to fix
- **Tap empty space** → AI examines that region → chord materializes

User corrections are stored with `source: 'user'` and survive all cache invalidations.

### Enhanced Chord Record

```typescript
interface ChordRecord {
  text: string            // Resolved winner (userText > aiText > originalText)
  originalText: string    // What text-layer scan found
  aiText?: string         // What AI validation said
  userText?: string       // What human set (SACRED)
  x: number              // Position (percentage, 0-100)
  y: number
  w?: number
  h?: number
  pxHeight?: number
  source: 'textLayer' | 'ai' | 'user'
}
```

### Rendering at Transposition=0

```typescript
// Old: if (!isChanged) return null
// New:
const needsOverlay = isChanged || chord.text !== chord.originalText
if (!needsOverlay) return null
```

---

## Part 3: The Key Management System

### Data Model Changes

**Library level** — `library_index/{fileId}`:
```typescript
{
  // ...existing fields (name, mimeType, etc.)
  nativeKey?: string        // Auto-detected from chords, e.g. "Em"
  nativeKeySource?: 'auto' | 'manual'  // How it was set
  nativeKeyDetectedAt?: string          // When auto-detection ran
}
```

**Setlist track** — `SetlistTrack`:
```typescript
interface SetlistTrack {
  // ...existing fields
  key?: string              // REPURPOSED: becomes the setlist key (was decorative)
  nativeKey?: string        // Snapshot of the library's native key at setlist creation time
  transposition?: number    // DERIVED: semitones from nativeKey to key
  // Remove nothing — backward compatible
}
```

**Backward compatibility**: Existing tracks with raw `transposition` but no `key` continue to work. The semitone value is used directly. New tracks get `key` set via the key picker, and `transposition` is calculated automatically.

### How Native Key Gets Set

**Auto-detection flow** (happens naturally as part of chord scanning):

```
1. Chart is opened → chord scan runs (Layer 1 + Layer 2)
2. estimateKey() runs on all detected chords → "Em"
3. If library_index/{fileId} has no nativeKey:
     → Write nativeKey: "Em", nativeKeySource: "auto"
4. If it already has one:
     → Don't overwrite (human may have corrected it)
```

**Manual override**: In the library view or the setlist editor, a small key indicator next to the song title is tappable. Opens the KeyPicker. Sets `nativeKeySource: 'manual'`.

**Where it's stored**: On the `library_index` document, NOT the setlist track. The native key is a property of the SONG, not the setlist. Setlist tracks get a snapshot (`nativeKey` field) so they work offline and don't break if the library value changes later.

### How Setlist Key Gets Set

**In the setlist editor** (TrackSheet), the current KeyPicker changes meaning:

**Before**: "What key is this song in?" (decorative label)
**After**: "What key should we play this in?" (drives transposition)

The UI shows:

```
┌──────────────────────────────────┐
│  Oseh Shalom                     │
│                                  │
│  Native Key:  Dm  (auto) ✏️      │
│  Play In:     [Am ▾]  ← KeyPicker│
│               (+7 semitones)     │
│                                  │
│  ── or fine-tune ──              │
│  [−] +7 [+]  ← semitone stepper │
│                                  │
│  Lead: Daniel    BPM: 120        │
└──────────────────────────────────┘
```

- **Native Key** is read from the library (auto-detected or manually set). Shown as a label with a small edit icon. Tapping opens KeyPicker to override.
- **Play In** is the setlist key. Defaults to native key. KeyPicker grid as primary selector.
- **Semitone stepper** shown below as a fine-tuning fallback.
- When the user picks a key from the grid, the semitone stepper updates automatically.
- When the user adjusts semitones, the "Play In" key updates automatically.
- The two controls are bidirectionally linked.

### How It Flows to Performance

When entering perform mode, the queue is built:

```typescript
// Current (raw semitones):
const queue: QueueItem[] = tracks.map(t => ({
    transposition: t.transposition,
    ...
}))

// New (calculated from keys):
const queue: QueueItem[] = tracks.map(t => ({
    transposition: t.key && t.nativeKey
        ? calculateSemitones(t.nativeKey, t.key)
        : t.transposition || 0,   // fallback for legacy tracks
    setlistKey: t.key,             // NEW: pass through for display
    nativeKey: t.nativeKey,        // NEW: pass through for display
    ...
}))
```

The `calculateSemitones` function is a simple addition to `music-math.ts`:

```typescript
export function calculateSemitones(fromKey: string, toKey: string): number {
    const fromRoot = extractRoot(fromKey)  // "Dm" → "D"
    const toRoot = extractRoot(toKey)      // "Am" → "A"
    const fromIndex = findNoteIndex(fromRoot)
    const toIndex = findNoteIndex(toRoot)
    if (fromIndex === -1 || toIndex === -1) return 0
    let diff = toIndex - fromIndex
    // Normalize to -6..+5 range (shortest path)
    if (diff > 6) diff -= 12
    if (diff < -6) diff += 12
    return diff
}
```

### How Musician Profiles Layer On Top

The existing priority chain in `use-musician-transposition.ts` barely changes:

```
Priority (highest wins):
  1. Per-track setlist key → calculated semitones (leader's choice)
  2. User's saved song preference (personal override)
  3. Musician profile instrument default (Bb trumpet = -2)
  4. Zero (original key)
```

The only difference: step 1 now derives from keys instead of raw semitones. The rest is identical.

**The capo UI in TransposerMenu also changes baseline**: Currently, capo shapes are calculated from the detected key. Now they calculate from the SETLIST key:

```
Before: "Song is in Em. Play as D shapes → capo 2"
After:  "Setlist says Am. Play as G shapes → capo 2"
```

This is what Daniel described: "I should be able to set it to play with Em chords and a capo, but it should calculate based on Am."

### How Print Packets Work

The print pipeline already reads `track.transposition` and applies it. With key management:

1. Print reads `track.key` (setlist key) and `track.nativeKey`
2. Calculates semitones: `Am - Dm = +7`
3. Applies transposition to the PDF chords (existing `transposePdf` function)
4. **Per-musician packets**: if the musician has an instrument profile, their additional shift is layered:
   - Bb trumpet viewing "Am" setlist → sees "Bm" (Am + 2 semitones for Bb instrument)
   - Guitar with capo 2 → sees "Gm shapes" with "Capo 2" annotation
5. Cover page shows: "Native: Dm → Playing in: Am" for each track

---

## Part 4: Edge Cases & Safeguards

### Auto-Detection Accuracy
- `estimateKey()` is already pretty good (weighted scoring: first chord, last chord, frequency)
- AI validation (Layer 2) improves chord accuracy, which improves key estimation
- The `nativeKeySource: 'auto'` flag tells the system it can be refined later
- Manual override (`nativeKeySource: 'manual'`) is always respected

### Native Key Conflicts
- The native key lives on the library item, shared across all setlists
- If Daniel changes a song's native key, it doesn't retroactively change existing setlists — those tracks have a `nativeKey` snapshot
- New setlist tracks get the current library value

### Legacy Data Migration
- Existing tracks with `transposition: 3` but no `key` → continue working (raw semitones used directly)
- Existing tracks with `key: "Em"` (decorative) → becomes the setlist key automatically
- No migration needed — the system is backward compatible with graceful fallback

### The "Same Key" Case
- Most songs are played in their native key
- `setlistKey === nativeKey` → `transposition = 0` → no overlays needed (unless AI corrected something)
- This is the common path and it's fast: no calculation, no transposition rendering

### Offline
- Text-layer scan works offline
- Native key snapshot is on the setlist track (no library fetch needed)
- Transposition is calculated client-side
- AI validation deferred to next online session

### Cost Control
- AI validation: once per page per cache version (~$0.002/page)
- Native key auto-detection: free (runs on already-detected chords, no API call)
- User corrections: ~$0.001 per tap (region crop to Gemini)
- Full CRC library (~200 charts): ~$0.80 one-time for AI validation

### Coordinate System Fix (Print)
- Client stores positions as percentages (0-100) with `coordSystem: 'percentage'`
- Server stores as PDF points with `coordSystem: 'pdfPoints'`
- Print pipeline checks flag and converts accordingly
- Fixes the latent print-position bug

### Cache Resilience
- `source: 'user'` overrides survive cache invalidation
- `aiValidated: true` prevents redundant API calls
- `CACHE_VERSION` bump only invalidates auto-scanned data

---

## Part 5: Implementation Phases

### Phase A: Self-Healing Score (the foundation)

**A1. Enhanced chord records with source tracking**
- Add `source`, `aiText`, `userText` to ChordRecord
- Update cache schema with `aiValidated`, `coordSystem`
- Backward-compatible with existing caches

**A2. AI Validation Pass**
- After text-layer scan: send full-page image to Gemini
- Merge corrections into chord array
- Cache with `aiValidated: true`
- Skip if already validated at current version

**A3. Fix t=0 rendering**
- `if (!isChanged && chord.text === chord.originalText) return null`
- Corrected/added chords render at t=0

**A4. Delete strip pipeline**
- Remove `line-scanner.ts`
- Full-page AI validation replaces it

### Phase B: Key Management

**B1. Native key on library songs**
- Add `nativeKey`, `nativeKeySource` to library_index documents
- After chord scan + AI validation, run `estimateKey()` → write to library if not set
- Expose in library UI as a tappable label with edit icon

**B2. Setlist key picker**
- Repurpose `SetlistTrack.key` as the setlist key (drives transposition)
- Add `nativeKey` snapshot field to SetlistTrack
- TrackSheet UI: show native key (read-only) + "Play In" KeyPicker + semitone stepper
- Bidirectional: picking a key updates semitones, adjusting semitones updates the key
- Add `calculateSemitones()` to music-math.ts

**B3. Queue integration**
- Queue builder derives transposition from `key` and `nativeKey`
- Pass `setlistKey` and `nativeKey` through QueueItem for display
- TransposerMenu shows "Native: Dm → Playing: Am" when setlist key differs
- Capo calculations base on setlist key, not detected key

**B4. Print integration**
- Print pipeline reads setlist key + native key
- Calculates semitones for transposition
- Per-musician instrument shift applied on top
- Cover page shows native → setlist key mapping

### Phase C: Tap to Fix

**C1. Fix Chords mode toggle**
- `isFixingChords` in music store
- Toggle in TransposerMenu / PerformanceToolbar
- Auto-disabled during live mode

**C2. Tap existing chord → correction popover**
- `pointer-events: auto` when Fix mode is on
- Popover with AI + music-theory suggestions
- Undo option for user-corrected chords

**C3. Tap empty space → add chord**
- Region crop → Gemini → place chord
- Pulse animation feedback

### Phase D: Polish

**D1. Text-layer merge improvements** (reduces AI workload)
**D2. Coordinate system fix for print pipeline**
**D3. Correction toast + discovery UI**
**D4. Offline chord cache (IndexedDB)**

---

## Part 6: What the Musician Experiences

### Building a setlist (Tuesday afternoon)

Daniel adds "Oseh Shalom" to Friday's setlist. The system shows:

```
Oseh Shalom
  Key: Dm (auto-detected ✓)
```

He taps the key area. A picker opens showing "Dm" as the native key and a "Play In" grid. He taps "Am." The display updates:

```
Oseh Shalom
  Native: Dm  →  Play in: Am (+7)
```

Done. Everyone who opens this setlist will see Oseh Shalom transposed to Am.

### At rehearsal (Thursday evening)

The guitarist opens the setlist on her phone. She sees Oseh Shalom in Am (the setlist key). Her musician profile says "Guitar, prefer capo shapes." The TransposerMenu shows:

```
Setlist Key: Am
Play As: G shapes → Capo 2
```

She taps "G shapes." Her chords show as G, C, D — with "Capo 2" noted. Everyone else still sees Am, C, Dm.

Daniel notices a missed chord in the bridge. He taps the empty spot. A "Gm" appears one second later. It's saved for everyone.

### Friday night service (live mode)

Live mode is active. All chord overlays are non-interactive (pointer-events: none). Daniel plays through the setlist. Every chart shows the correct key. The guitarist sees her capo shapes. The corrections from Thursday are baked in.

### Printing packets (Friday afternoon)

Daniel prints band packets. The system generates:
- Daniel's packet: all songs in setlist keys (Am for Oseh Shalom)
- Guitarist's packet: all songs in her capo/shape preferences (G shapes, capo 2)
- Trumpeter's packet: all songs shifted +2 for Bb instrument (Bm for Oseh Shalom)

Each cover page shows: "Oseh Shalom — Native: Dm, Playing: Am" with per-musician transposition noted.

---

## Success Criteria

### After Phase A (self-healing):
1. Yedid Nefesh at t=0 → all chords correct, including "Am" not "A"
2. Lecha Dodi at t=0 → "F" present, "Am" correct
3. Any chart opened twice → instant from cache, no AI call
4. Print matches screen

### After Phase B (key management):
5. Auto-detected key shown for every chart with scanned chords
6. Setting setlist key to "Am" → song transposes to Am for everyone
7. Capo shapes calculate from setlist key, not native key
8. Print packets use setlist key as baseline, with per-musician shifts

### After Phase C (tap to fix):
9. Tap wrong chord → correct suggestion appears first
10. Tap empty space → chord materializes within 2 seconds
11. Corrections persist and benefit all users
