# Phase 19: Native Transposition for MusicXML and Structured Score Files - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add real note/chord/key-signature transposition for MusicXML files rendered via OSMD, replacing the chord-overlay-only approach used for PDFs. The TransposerMenu UI should feel identical for musicians regardless of file type — the difference is entirely under the hood.

</domain>

<decisions>
## Implementation Decisions

### Chord symbol handling
- OSMD's `Sheet.Transpose` already handles note transposition and key signature changes natively
- Chord symbols in MusicXML (`<harmony>` elements) should also transpose — verify if OSMD handles this natively; if not, pre-process the MusicXML XML before loading into OSMD
- For MusicXML files, bypass the SmartTransposer chord overlay entirely — chords are part of the score data, not AI-detected overlays

### UX parity with PDF mode
- TransposerMenu should look and behave identically for MusicXML files — same semitone +/-, key picker, capo calculator
- No extra UI chrome for "MusicXML mode" — musicians shouldn't need to know the file format
- The existing `transposition` value in `useMusicStore` already drives both PDF overlay and OSMD; keep this unified
- SmartTransposer overlay should not render when viewing MusicXML files (no AI chord detection needed — chords are in the score)

### Per-musician transposition
- Already handled — `useMusicianTransposition` hook sets the `transposition` value in the store based on instrument profile
- OSMD reads `transposition` from the store and applies it via `Sheet.Transpose`
- No additional work needed here; the existing auto-transposition pipeline works for both file types

### Print/export with transposition
- When printing a transposed MusicXML score, the print output should reflect the transposed notation (not the original key with chord overlays)
- This is a natural benefit of native transposition — the OSMD render is already transposed, so printing/exporting the rendered SVG captures the correct state

### Claude's Discretion
- Whether OSMD handles `<harmony>` chord symbol transposition natively or if we need XML pre-processing
- Implementation approach for disabling SmartTransposer on MusicXML files (detect file type in PDFOverlay/performance page)
- Any edge cases around enharmonic spelling (e.g., Gb vs F#) — follow OSMD's defaults

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SmartScoreViewer` (src/components/music/SmartScoreViewer.tsx): Already uses `Sheet.Transpose = transposition` — this is the core integration point
- `TransposerMenu` (src/components/music/TransposerMenu.tsx): Unified transpose UI with semitone +/-, key picker, capo — works for both file types
- `useMusicStore` (src/lib/store.ts): `transposition` state drives both OSMD and PDF chord overlays
- `useMusicianTransposition` (src/hooks/use-musician-transposition.ts): Auto-transpose by instrument profile — already feeds into store
- `music-math.ts` (src/lib/music-math.ts): `transposeChord()`, `estimateKey()`, `keyUsesFlats()` — chord math utilities

### Established Patterns
- `transposition` is a semitone offset (integer) stored in zustand, consumed by both PDF overlay and OSMD
- File type detection: `queue-utils.ts` checks `.musicxml`, `.xml`, `.mxl` extensions and `db-` prefix to determine `FileType`
- SmartTransposer renders chord overlays on PDF pages; SmartScoreViewer renders MusicXML via OSMD — these are separate render paths

### Integration Points
- `SmartScoreViewer.tsx:105` — `Sheet.Transpose = transposition` is where OSMD applies the transposition
- `PDFOverlay.tsx` / `PDFPageWrapper.tsx` — where SmartTransposer chord overlays are conditionally rendered (need to suppress for MusicXML)
- `perform/[fileId]/page.tsx` — performance page that selects between PDF and MusicXML rendering

</code_context>

<specifics>
## Specific Ideas

- User explicitly stated: "Ideally the UI/UX would feel the same for folks" — transpose controls should be identical regardless of file type
- User wants transposition to affect "the musical scores as well as the chords, rather than OSC" — native transposition is the goal, not overlay hacks
- The key insight: for MusicXML, transposition is better because it changes the actual notation, not just chord labels

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-native-transposition-for-musicxml-and-structured-score-files*
*Context gathered: 2026-03-18*
