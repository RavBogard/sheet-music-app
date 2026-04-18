# Phase 19: Native Transposition for MusicXML and Structured Score Files - Research

**Researched:** 2026-03-18
**Domain:** OSMD transposition internals, MusicXML chord symbols, render-path branching
**Confidence:** HIGH

## Summary

This phase enables real note/chord/key-signature transposition for MusicXML files rendered via OpenSheetMusicDisplay (OSMD), replacing the AI chord-overlay approach used for PDFs. The critical research finding is that **OSMD already has full chord symbol transposition built in** -- the `GraphicalChordSymbolContainer` constructor and `ChordSymbolContainer.calculateChordText()` both accept a `transposeHalftones` parameter. When `Sheet.Transpose` is set and `updateGraphic()` + `render()` are called, chord symbols from `<harmony>` elements are transposed alongside notes and key signatures.

However, the current `SmartScoreViewer.tsx` has a **critical gap**: it does **not** set `osmd.TransposeCalculator = new TransposeCalculator()`, which OSMD requires for transposition to take effect. Without this, `Sheet.Transpose = N` is stored but ignored during rendering. Additionally, `SmartScoreViewer` is defined but never wired into any rendering path -- `PDFOverlay` only renders `PDFViewer` with no file-type branching. The `SmartTransposer` chord overlay renders unconditionally on every PDF page via `PDFPageWrapper` and needs to be suppressed for MusicXML files.

**Primary recommendation:** Fix `SmartScoreViewer` to initialize `TransposeCalculator`, wire it into `PDFOverlay` with file-type branching based on the existing `QueueItem.type` field, and suppress `SmartTransposer` overlay rendering for MusicXML files. No new libraries needed -- everything is already in OSMD and the existing codebase.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- OSMD's `Sheet.Transpose` handles note transposition and key signature changes natively
- Chord symbols in MusicXML (`<harmony>` elements) should also transpose -- verify if OSMD handles this natively; if not, pre-process the MusicXML XML before loading into OSMD
- For MusicXML files, bypass the SmartTransposer chord overlay entirely -- chords are part of the score data, not AI-detected overlays
- TransposerMenu should look and behave identically for MusicXML files -- same semitone +/-, key picker, capo calculator
- No extra UI chrome for "MusicXML mode" -- musicians should not need to know the file format
- The existing `transposition` value in `useMusicStore` already drives both PDF overlay and OSMD; keep this unified
- SmartTransposer overlay should not render when viewing MusicXML files (no AI chord detection needed -- chords are in the score)
- Per-musician transposition already handled via `useMusicianTransposition` hook -- no additional work needed
- When printing a transposed MusicXML score, the print output should reflect the transposed notation
- User explicitly stated: "Ideally the UI/UX would feel the same for folks"

### Claude's Discretion
- Whether OSMD handles `<harmony>` chord symbol transposition natively or if we need XML pre-processing
- Implementation approach for disabling SmartTransposer on MusicXML files (detect file type in PDFOverlay/performance page)
- Any edge cases around enharmonic spelling (e.g., Gb vs F#) -- follow OSMD's defaults

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (Already Installed -- No New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| opensheetmusicdisplay | ^1.9.4 | MusicXML rendering + native transposition | Already the app's OSMD renderer; has built-in TransposeCalculator plugin |
| zustand (useMusicStore) | existing | `transposition` state drives both PDF overlay and OSMD | Unified store already in place |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| useMusicianTransposition hook | existing | Auto-transpose by instrument profile | Already feeds `transposition` into store -- no changes needed |
| TransposerMenu | existing | Unified transpose UI | Already works for both file types -- no changes needed |
| music-math.ts | existing | `transposeChord()`, `estimateKey()` | Used by TransposerMenu for key detection/capo -- still needed for MusicXML key display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OSMD native chord transposition | Pre-process MusicXML XML to shift `<harmony>` elements | Unnecessary -- OSMD handles it natively (confirmed via source analysis) |
| File-type branching in PDFOverlay | Separate MusicXMLOverlay component | More code duplication; PDFOverlay can be extended with a simple conditional |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Current Render Path (PDF Only)
```
SetlistPerformPage / StandalonePerformPage
  -> PDFOverlay
    -> PDFViewer
      -> PDFPageWrapper
        -> SmartTransposer (AI chord overlay -- always renders)
    -> PerformanceToolbar
      -> TransposerMenu
```

### Target Render Path (PDF + MusicXML)
```
SetlistPerformPage / StandalonePerformPage
  -> PDFOverlay (renamed conceptually to "ScoreOverlay" or kept as-is)
    -> IF fileType === 'musicxml':
         SmartScoreViewer (OSMD with TransposeCalculator)
         NO SmartTransposer overlay
       ELSE:
         PDFViewer -> PDFPageWrapper -> SmartTransposer
    -> PerformanceToolbar (unchanged)
      -> TransposerMenu (unchanged)
```

### Pattern 1: TransposeCalculator Initialization (CRITICAL FIX)
**What:** OSMD requires `TransposeCalculator` to be set before transposition works.
**When to use:** Always, when initializing OSMD in SmartScoreViewer.
**Example:**
```typescript
// Source: OSMD wiki + node_modules type definitions
import { OpenSheetMusicDisplay, TransposeCalculator } from 'opensheetmusicdisplay'

// During OSMD initialization:
const osmd = new OpenSheetMusicDisplay(container, { ... })
osmd.TransposeCalculator = new TransposeCalculator()
```

Without this line, `Sheet.Transpose = N` is stored but has no effect on rendered output.

### Pattern 2: File-Type Branching in PDFOverlay
**What:** Conditionally render SmartScoreViewer vs PDFViewer based on queue item type.
**When to use:** In PDFOverlay when determining which viewer to show.
**Example:**
```typescript
// Determine file type from current queue item
const currentItem = useMusicStore(s => s.playbackQueue[s.queueIndex])
const isMusicXml = currentItem?.type === 'musicxml'

// In JSX:
{isMusicXml ? (
    <SmartScoreViewer url={fileUrl} />
) : (
    <PDFViewer url={pdfUrl} trackName={track.title} />
)}
```

### Pattern 3: SmartTransposer Suppression for MusicXML
**What:** SmartTransposer should not render when the current file is MusicXML.
**When to use:** In PDFPageWrapper or at the PDFOverlay level.
**Implementation options:**

Option A (preferred): File-type branching at PDFOverlay level means SmartTransposer is never mounted for MusicXML files -- it lives inside PDFPageWrapper which is only rendered for PDFs.

Option B: Add a guard in SmartTransposer itself:
```typescript
const currentItem = useMusicStore(s => s.playbackQueue[s.queueIndex])
if (currentItem?.type === 'musicxml') return null
```

Option A is cleaner because the branching happens at the correct architectural level.

### Pattern 4: Queue Item Type Detection
**What:** The `QueueItem.type` field already exists as `FileType = 'pdf' | 'musicxml' | 'chordpro'`.
**Current gap:** `PDFOverlay.tsx` hardcodes `type: "pdf"` when building queue items (line 71). This needs to use `toQueueItem()` from `queue-utils.ts` which correctly detects file type from the fileId extension.
**Example:**
```typescript
// Current (broken for MusicXML):
const queueItems: QueueItem[] = songTracks.map(({ track: t }) => ({
    name: t.title || "Untitled",
    fileId: t.fileId!,
    type: "pdf" as const,  // <-- hardcoded!
    ...
}))

// Fixed (use toQueueItem or inline detection):
import { toQueueItem } from '@/lib/queue-utils'
// ... or detect inline using the same logic as queue-utils.ts
```

### Anti-Patterns to Avoid
- **Not setting TransposeCalculator:** This is the single most likely bug. OSMD silently ignores `Sheet.Transpose` without it.
- **Pre-processing MusicXML XML for chord transposition:** OSMD handles `<harmony>` natively via `ChordSymbolContainer.calculateChordText(transposeHalftones)`. Do not manually parse and modify XML.
- **Creating a separate "MusicXML performance page":** The whole point is UX parity -- same page, same toolbar, just a different viewer component.
- **Enabling AI chord scanning for MusicXML:** SmartTransposer's AI vision pipeline captures canvas images to detect chords. MusicXML files already have chord data embedded -- scanning would be wasteful and produce duplicate/conflicting chords.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chord symbol transposition for MusicXML | Custom XML parser to shift `<harmony>` root/bass pitches | OSMD's built-in `ChordSymbolContainer.calculateChordText(transposeHalftones)` | OSMD already handles all chord kinds, bass notes, degrees, and enharmonic spelling |
| Key signature transposition | Manual key recalculation | OSMD's `TransposeCalculator.transposeKey()` | Handles all key signatures including enharmonics |
| Note transposition | Manual pitch arithmetic | OSMD's `TransposeCalculator.transposePitch()` | Handles accidentals, octave wrapping, clef changes |
| File type detection | New detection logic | Existing `QueueItem.type` from `queue-utils.ts` | Already checks extensions for `.musicxml`, `.xml`, `.mxl`, `db-` prefix |
| Enharmonic spelling | Custom Gb/F# resolution logic | OSMD's defaults per key | OSMD chooses sharps/flats based on key signature context |

**Key insight:** This phase is almost entirely about *wiring* -- connecting existing components correctly. The transposition engine, the UI, and the state management all exist. The work is: (1) fix TransposeCalculator initialization, (2) add file-type branching in the performance view, (3) use correct file types in queue building.

## Common Pitfalls

### Pitfall 1: Missing TransposeCalculator
**What goes wrong:** `Sheet.Transpose` is set but notes/chords/keys don't actually change in the rendered output.
**Why it happens:** OSMD requires an explicit `osmd.TransposeCalculator = new TransposeCalculator()` before transposition takes effect. The current `SmartScoreViewer` does not do this.
**How to avoid:** Set TransposeCalculator immediately after creating the OSMD instance, before any load/render calls.
**Warning signs:** Transposition slider moves but the score looks identical.

### Pitfall 2: Hardcoded `type: "pdf"` in PDFOverlay Queue Building
**What goes wrong:** MusicXML files are treated as PDFs in the performance queue, so the PDFViewer is always rendered instead of SmartScoreViewer.
**Why it happens:** `PDFOverlay.tsx` line 71 hardcodes `type: "pdf" as const` when building `QueueItem` objects, bypassing the file-type detection in `queue-utils.ts`.
**How to avoid:** Use `toQueueItem()` from `queue-utils.ts` which correctly detects file type from file extensions.
**Warning signs:** MusicXML files show as blank/broken PDFs in performance mode.

### Pitfall 3: Double Transposition on Re-render
**What goes wrong:** The OSMD wiki warns: "There is still an occasional problem when you transpose a second time after load and render to a new key like F# or B."
**Why it happens:** OSMD's internal pitch state can get confused when transposing cumulatively.
**How to avoid:** Always set `Sheet.Transpose` to the absolute semitone offset from original (not delta from current). The current code already does this correctly -- `transposition` in the store is absolute, not relative.
**Warning signs:** Notes shift to unexpected pitches after changing transposition multiple times.

### Pitfall 4: SmartTransposer Rendering on MusicXML Files
**What goes wrong:** AI chord detection runs on MusicXML scores, producing duplicate chord overlays on top of OSMD's native chord symbols.
**Why it happens:** `SmartTransposer` is rendered unconditionally in `PDFPageWrapper`. If file-type branching at the `PDFOverlay` level is implemented correctly (Option A), this is automatically avoided because `PDFPageWrapper` is only used for PDF rendering.
**How to avoid:** Ensure the file-type branch at `PDFOverlay` level is the only viewer selection point. Do not render `PDFPageWrapper` (and thus `SmartTransposer`) for MusicXML files.
**Warning signs:** Chord symbols appear twice -- once from OSMD rendering and once from the AI overlay.

### Pitfall 5: TransposerMenu Key Display for MusicXML
**What goes wrong:** The TransposerMenu shows "Waiting for scan..." or "Detected Key: null" for MusicXML files because it relies on `aiState.pageData` which is populated by the AI chord scanner.
**Why it happens:** For PDFs, the AI scanner populates `aiState.pageData` with detected chords, and `TransposerMenu` reads these to estimate the key. For MusicXML, no scanning occurs so `pageData` is empty.
**How to avoid:** TransposerMenu should also check the queue item's `key` field (set from setlist track metadata) or the library metadata's `nativeKey`. The `effectiveKey` calculation at line 96 already falls back to `setlistKey` when `detectedKey` is null, which handles the most common case (setlist performance). For standalone performance from library, ensure the track's key metadata is propagated.
**Warning signs:** TransposerMenu shows blank key info when viewing MusicXML files.

### Pitfall 6: Print Not Reflecting Transposition for MusicXML
**What goes wrong:** Printing a transposed MusicXML score outputs the original key.
**Why it happens:** `PrintModal` currently generates print output by re-rendering PDFs. For MusicXML, it would need to capture the OSMD SVG output.
**How to avoid:** The OSMD render is already transposed in the DOM (SVG), so capturing it via `window.print()` or SVG serialization will naturally include the transposed state. Ensure the print flow captures the correct DOM element.
**Warning signs:** Printed output shows original key while screen shows transposed key.

## Code Examples

### SmartScoreViewer Fix: TransposeCalculator Initialization
```typescript
// Source: OSMD wiki + node_modules/opensheetmusicdisplay type definitions
import { OpenSheetMusicDisplay, TransposeCalculator } from 'opensheetmusicdisplay'

// In SmartScoreViewer.tsx, during OSMD initialization:
osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
    autoResize: true,
    backend: 'svg',
    drawingParameters: 'compacttight',
    drawTitle: true,
})
// CRITICAL: Without this, Sheet.Transpose has no effect
osmdRef.current.TransposeCalculator = new TransposeCalculator()
```

### PDFOverlay File-Type Branching
```typescript
// Source: existing codebase patterns
import { SmartScoreViewer } from '@/components/music/SmartScoreViewer'

// In PDFOverlay, determine file type from queue:
const currentItem = useMusicStore(s => s.playbackQueue[s.queueIndex])
const isMusicXml = currentItem?.type === 'musicxml'
const fileUrl = track.fileId ? `/api/drive/file/${track.fileId}` : ""

// In JSX:
<div className="flex-1 overflow-auto pb-0 relative">
    {isMusicXml ? (
        <SmartScoreViewer url={fileUrl} />
    ) : (
        pdfUrl && <PDFViewer url={pdfUrl} trackName={track.title} />
    )}
</div>
```

### Queue Building Fix in PDFOverlay
```typescript
// Source: existing queue-utils.ts toQueueItem function
// Current PDFOverlay hardcodes type: "pdf" -- needs to detect from fileId:
const detectFileType = (fileId: string): FileType => {
    if (fileId.startsWith('db-') ||
        fileId.endsWith('.musicxml') ||
        fileId.endsWith('.xml') ||
        fileId.endsWith('.mxl')) return 'musicxml'
    if (fileId.endsWith('.chordpro')) return 'chordpro'
    return 'pdf'
}

// Use in queue building:
const queueItems: QueueItem[] = songTracks.map(({ track: t }) => ({
    name: t.title || "Untitled",
    fileId: t.fileId!,
    type: detectFileType(t.fileId!),
    key: t.key || undefined,
    transposition: 0,
}))
```

### OSMD Chord Symbol Transposition (Already Built In)
```typescript
// Source: node_modules/opensheetmusicdisplay ChordSymbolContainer.d.ts
// This is what OSMD does internally -- no action needed from us:
//
// ChordSymbolContainer.calculateChordText(chordSymbol, transposeHalftones, keyInstruction)
//
// The GraphicalChordSymbolContainer constructor receives transposeHalftones
// and passes it through to calculateChordText, which transposes the root pitch
// and bass pitch of chord symbols during graphical layout.
//
// This happens automatically when Sheet.Transpose is set and updateGraphic()/render()
// are called -- provided TransposeCalculator is initialized.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AI-detected chord overlays on PDFs | OSMD native transposition for MusicXML | Phase 19 | Real note + chord + key transposition vs. chord-label-only overlay |
| Manual XML preprocessing for chord transposition | OSMD built-in ChordSymbolContainer | OSMD 1.x | No XML manipulation needed |
| Separate transposition UIs per file type | Unified TransposerMenu + zustand store | Already in place | Zero UI changes needed |

## Open Questions

1. **TransposerMenu "Detected Key" for MusicXML files**
   - What we know: TransposerMenu relies on `aiState.pageData` chords for key detection. MusicXML files won't populate this.
   - What's unclear: Whether the setlist track `key` field is reliably populated for MusicXML files.
   - Recommendation: For setlist performance, the `setlistKey` fallback already works. For standalone library performance, check if library metadata `nativeKey` can be used. If neither is available, the TransposerMenu gracefully shows the semitone stepper without key name -- acceptable UX.

2. **OSMD TransposeCalculator export path**
   - What we know: The type `TransposeCalculator` is in `src/Plugins/Transpose/TransposeCalculator.d.ts`. The import path from the package may be `opensheetmusicdisplay` (re-exported) or `opensheetmusicdisplay/build/dist/src/Plugins/Transpose`.
   - What's unclear: Exact import path in the installed version.
   - Recommendation: Check OSMD package exports during implementation. The main entry likely re-exports it. If not, import from the full path.

3. **PrintModal MusicXML support**
   - What we know: PrintModal currently renders PDFs. MusicXML scores are rendered as SVG by OSMD.
   - What's unclear: Whether PrintModal needs modification or if browser `window.print()` captures the OSMD SVG automatically.
   - Recommendation: If the MusicXML score is visible in the DOM when print is triggered, the browser will capture it. May need minor adjustments to ensure the OSMD container is print-friendly (white background, proper sizing). This can be a lightweight addition to the phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.1 |
| Config file | package.json (vitest config) |
| Quick run command | `npm test` |
| Full suite command | `npm run test:ci` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| T19-01 | SmartScoreViewer initializes TransposeCalculator | unit | `npx vitest run src/components/music/__tests__/SmartScoreViewer.test.tsx -t "TransposeCalculator"` | Wave 0 |
| T19-02 | PDFOverlay renders SmartScoreViewer for musicxml type | unit | `npx vitest run src/components/performance/__tests__/PDFOverlay.test.tsx -t "musicxml"` | Wave 0 |
| T19-03 | PDFOverlay renders PDFViewer for pdf type | unit | `npx vitest run src/components/performance/__tests__/PDFOverlay.test.tsx -t "pdf"` | Wave 0 |
| T19-04 | SmartTransposer does not render for MusicXML files | unit | `npx vitest run src/components/music/__tests__/SmartTransposer.test.tsx -t "musicxml"` | Wave 0 |
| T19-05 | Queue items preserve correct file type from track data | unit | `npx vitest run src/lib/__tests__/queue-utils.test.ts -t "musicxml"` | Wave 0 |
| T19-06 | OSMD transposition applied on render (notes + chords) | manual-only | Manual test: load MusicXML, transpose, verify visually | N/A |
| T19-07 | Print reflects transposed notation | manual-only | Manual test: transpose, print, verify output | N/A |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm run test:ci`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/music/__tests__/SmartScoreViewer.test.tsx` -- covers T19-01
- [ ] `src/components/performance/__tests__/PDFOverlay.test.tsx` -- covers T19-02, T19-03
- [ ] `src/lib/__tests__/queue-utils.test.ts` -- covers T19-05 (may already exist partially)

## Sources

### Primary (HIGH confidence)
- OSMD node_modules type definitions: `ChordSymbolContainer.d.ts` -- `calculateChordText(transposeHalftones)` confirms native chord transposition
- OSMD node_modules type definitions: `GraphicalChordSymbolContainer.d.ts` -- constructor takes `transposeHalftones`
- OSMD node_modules type definitions: `VexFlowGraphicalSymbolFactory.d.ts` -- `createChordSymbols()` takes `transposeHalftones`
- OSMD node_modules type definitions: `ITransposeCalculator.d.ts` -- interface with `transposePitch()` and `transposeKey()`
- Existing codebase: `SmartScoreViewer.tsx` -- current OSMD integration (missing TransposeCalculator)
- Existing codebase: `PDFOverlay.tsx` -- current PDF-only render path
- Existing codebase: `PDFPageWrapper.tsx` -- SmartTransposer always rendered
- Existing codebase: `queue-utils.ts` -- file type detection logic
- Existing codebase: `store.ts` -- `QueueItem.type: FileType` field exists

### Secondary (MEDIUM confidence)
- [OSMD Transposing Wiki](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/wiki/Transposing) -- confirms TransposeCalculator requirement
- [MusicXML 4.0 Chord Symbols](https://www.w3.org/2021/06/musicxml40/tutorial/chord-symbols-and-diagrams/) -- `<harmony>` element structure

### Tertiary (LOW confidence)
- OSMD re-render stability with multiple transposition changes -- wiki mentions "occasional problem" with keys like F#/B, needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all components already exist in the codebase
- Architecture: HIGH -- clear render-path branching, existing patterns in queue-utils.ts and store.ts
- OSMD chord transposition: HIGH -- confirmed via type definitions that `transposeHalftones` flows through chord symbol rendering pipeline
- TransposeCalculator requirement: HIGH -- confirmed via wiki docs + absence in current SmartScoreViewer code
- Pitfalls: HIGH -- identified from direct code reading (hardcoded type, missing calculator, TransposerMenu key display gap)
- Print support: MEDIUM -- browser SVG capture should work but untested

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (30 days -- stable domain, OSMD API is mature)
