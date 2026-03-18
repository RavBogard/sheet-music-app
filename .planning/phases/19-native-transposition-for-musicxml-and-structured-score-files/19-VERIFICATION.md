---
phase: 19-native-transposition-for-musicxml-and-structured-score-files
verified: 2026-03-18T18:00:30Z
status: human_needed
score: 7/7 must-haves verified
human_verification:
  - test: "Open a setlist containing a MusicXML file (db- prefixed fileId or .musicxml extension) in the performance view"
    expected: "Score renders via OSMD as sheet music notation (not a PDF image)"
    why_human: "OSMD rendering fidelity cannot be verified programmatically — requires visual confirmation that notation appears correctly"
  - test: "With a MusicXML song open, use TransposerMenu +/- buttons to transpose by +2 semitones"
    expected: "Notes, key signature, AND chord symbols all shift correctly in the rendered score"
    why_human: "Native OSMD transposition accuracy (notes + chords + key signatures all shifting) is a visual/musical correctness check"
  - test: "Verify no duplicate chord overlays appear on a transposed MusicXML score"
    expected: "SmartTransposer AI chord overlay is absent — only OSMD-native chord symbols visible"
    why_human: "Overlay suppression depends on SmartTransposer never mounting, which can only be confirmed visually in the live app"
  - test: "Navigate to a PDF song in the same setlist after viewing MusicXML"
    expected: "PDF renders normally with SmartTransposer chord overlay, and TransposerMenu looks identical to the MusicXML view"
    why_human: "UX parity between file types requires side-by-side comparison that automated tests mock away"
  - test: "(Optional) Print the transposed MusicXML score"
    expected: "Printed output shows the transposed notation, not the original pitch"
    why_human: "Print output correctness depends on browser print rendering, which cannot be verified in jsdom"
---

# Phase 19: Native Transposition for MusicXML and Structured Score Files — Verification Report

**Phase Goal:** Enable real note/chord/key-signature transposition for MusicXML files rendered via OSMD, replacing the chord-overlay-only approach used for PDFs. Fix TransposeCalculator initialization, wire file-type branching into the performance view, and suppress the SmartTransposer overlay for MusicXML files. TransposerMenu UI should feel identical regardless of file type.
**Verified:** 2026-03-18T18:00:30Z
**Status:** human_needed — all automated checks pass; visual/musical verification required
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SmartScoreViewer initializes TransposeCalculator so Sheet.Transpose actually works | VERIFIED | `osmdRef.current.TransposeCalculator = new TransposeCalculator()` at line 63 of SmartScoreViewer.tsx; test confirms TC set before load() and transposition triggers updateGraphic+render |
| 2 | PDFOverlay queue items have correct file type (musicxml for db-/.musicxml/.xml/.mxl, pdf for everything else) | VERIFIED | `toQueueItem()` from queue-utils called at line 76 of PDFOverlay.tsx; toQueueItem correctly branches on fileId patterns; 5 tests confirm all extensions |
| 3 | SmartScoreViewer re-renders with transposed notes/chords/key when transposition value changes | VERIFIED | useEffect at lines 102-117 sets Sheet.Transpose and calls updateGraphic+render on each transposition/zoom change; test "sets Sheet.Transpose and calls updateGraphic+render" passes |
| 4 | MusicXML files render via SmartScoreViewer in the performance view | VERIFIED | PDFOverlay conditionally renders SmartScoreViewer when isMusicXml=true (lines 188-189); 2 tests confirm SmartScoreViewer present and PDFViewer absent for musicxml queue items |
| 5 | PDF files still render via PDFViewer (no regression) | VERIFIED | PDFViewer rendered in else-branch (line 191); existing test "renders PDFViewer with correct URL" passes; 2 tests confirm PDFViewer present and SmartScoreViewer absent for pdf queue items |
| 6 | SmartTransposer chord overlay does NOT render for MusicXML files | VERIFIED | SmartTransposer lives inside PDFPageWrapper which is only mounted via PDFViewer — automatically suppressed when SmartScoreViewer is rendered instead; architectural isolation confirmed in code |
| 7 | TransposerMenu looks identical regardless of file type | VERIFIED (automated) | PerformanceToolbar (containing TransposerMenu) is always rendered below the viewer section, unconditionally; no branching in toolbar code; visual parity requires human check |

**Score:** 7/7 truths verified (automated portion)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/music/SmartScoreViewer.tsx` | OSMD viewer with TransposeCalculator initialization | VERIFIED | Imports TransposeCalculator from opensheetmusicdisplay; assigns to osmdRef.current after construction; 142 lines, substantive |
| `src/components/music/__tests__/smart-score-viewer.test.tsx` | Unit tests for TransposeCalculator wiring | VERIFIED | 3 tests: TC assigned after init, TC set before load(), transposition triggers updateGraphic+render; all pass |
| `src/components/performance/PDFOverlay.tsx` | File-type branching between SmartScoreViewer and PDFViewer; uses toQueueItem | VERIFIED | 217 lines; imports toQueueItem and SmartScoreViewer; isMusicXml flag and conditional render present |
| `src/components/performance/__tests__/pdf-overlay.test.tsx` | Tests for file-type branching and queue detection | VERIFIED | 12 tests total (3 original + 5 file-type detection + 4 branching); all pass |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `SmartScoreViewer.tsx` | `opensheetmusicdisplay` | `TransposeCalculator` assignment | WIRED | Line 4: import; Line 63: `osmdRef.current.TransposeCalculator = new TransposeCalculator()` |
| `PDFOverlay.tsx` | `src/lib/queue-utils.ts` | `toQueueItem` call | WIRED | Line 9: import; Line 76: called in queue building effect |
| `PDFOverlay.tsx` | `src/components/music/SmartScoreViewer.tsx` | conditional render based on `isMusicXml` | WIRED | Lines 19-22: dynamic import; Line 132: `isMusicXml = currentItem?.type === 'musicxml'`; Lines 188-189: conditional JSX |
| `PDFOverlay.tsx` | `src/lib/store.ts` | reading current queue item type | WIRED | Line 131: `useMusicStore(s => s.playbackQueue[s.queueIndex])`; used at line 132 to set `isMusicXml` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| T19-01 | 19-01 | SmartScoreViewer must initialize OSMD's TransposeCalculator | SATISFIED | Line 63 SmartScoreViewer.tsx; 3 tests pass |
| T19-02 | 19-01 | PDFOverlay must detect MusicXML file types from queue items | SATISFIED | toQueueItem() called at line 76; 5 detection tests pass |
| T19-03 | 19-02 | PDFOverlay must render SmartScoreViewer for MusicXML, PDFViewer for PDF | SATISFIED | Conditional render lines 188-191; 4 branching tests pass |
| T19-04 | 19-02 | SmartTransposer must NOT render for MusicXML files | SATISFIED | Architecturally automatic — SmartTransposer only mounts inside PDFPageWrapper via PDFViewer; confirmed by branching tests |
| T19-05 | 19-01 | Queue items must use toQueueItem() from queue-utils.ts | SATISFIED | Import at line 9; usage at line 76 of PDFOverlay.tsx |
| T19-06 | 19-02 | Transposition must change actual OSMD notation natively | SATISFIED (automated) | Sheet.Transpose set on transposition change (line 106); updateGraphic+render called; visual accuracy needs human check |
| T19-07 | 19-02 | Print output of transposed MusicXML must reflect transposed notation | NEEDS HUMAN | OSMD renders SVG that is printed via browser print — transposition is applied before render so print output should be correct, but this requires visual confirmation in the live app |

All 7 requirement IDs (T19-01 through T19-07) are accounted for across the two plans. No orphaned requirements found in REQUIREMENTS.md for Phase 19.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `SmartScoreViewer.tsx` | 44-49 | Empty useEffect with comment "Wait to init?" — the initialization path is deferred to the loadScore effect instead | Info | No functional impact; initialization happens correctly in the loadScore effect; slightly confusing code structure |

No blockers or warnings found. The empty initialization useEffect (lines 44-49) is a minor code smell but does not affect functionality — the OSMD instance is correctly created and the TransposeCalculator is assigned within the `loadScore` useEffect that runs on `sourceUrl`/`aiXmlContent` changes.

---

### Human Verification Required

#### 1. MusicXML Score Renders via OSMD

**Test:** Open a setlist containing a MusicXML file (db- prefixed fileId or .musicxml extension). Tap the song to enter performance view.
**Expected:** Score renders as sheet music notation (staves, notes, clefs) — not a PDF image.
**Why human:** OSMD rendering fidelity cannot be verified programmatically. The test environment mocks SmartScoreViewer; real DOM rendering requires the live app.

#### 2. Transposition Affects Notation

**Test:** With a MusicXML song open, use TransposerMenu +/- semitone buttons to transpose by +2.
**Expected:** Notes shift up, key signature updates, and chord symbols (if present in score) all shift by 2 semitones.
**Why human:** Musical correctness of OSMD's native transposition (whether all three elements update correctly) requires visual/aural verification.

#### 3. No Duplicate Chord Overlays

**Test:** While viewing a transposed MusicXML score, inspect whether any AI-detected chord overlays appear on top of the score.
**Expected:** No SmartTransposer overlay — only OSMD-native chord symbols are visible.
**Why human:** The suppression is architectural (SmartTransposer never mounts) but visual confirmation that no overlays appear is required to close the requirement.

#### 4. PDF Regression Check and UX Parity

**Test:** Navigate from a MusicXML song to a PDF song in the same setlist. Open TransposerMenu on both.
**Expected:** PDF renders with SmartTransposer chord overlay. TransposerMenu looks and behaves identically for both file types.
**Why human:** UX parity requires comparing both file types in sequence; automated tests mock both viewers, so no real comparison occurs in CI.

#### 5. Print Output (Optional)

**Test:** With a transposed MusicXML score open, use the Print function (via PerformanceToolbar).
**Expected:** Browser print preview shows the transposed notation.
**Why human:** Browser print rendering cannot be verified in jsdom.

---

### Gaps Summary

No gaps found. All automated checks pass:
- TransposeCalculator is initialized before load() and responds to transposition changes
- Queue file-type detection correctly identifies all MusicXML variants
- PDFOverlay branches rendering correctly based on queue item type
- All 6 commits documented in SUMMARYs exist in git history
- All 15 tests pass

The only outstanding items are human verification steps that were already identified in the plan as a blocking checkpoint (Plan 02, Task 2: `checkpoint:human-verify`). The SUMMARY notes these were approved by the user during plan execution. If the human checkpoint approval is accepted as closure, status can be upgraded to `passed`.

---

_Verified: 2026-03-18T18:00:30Z_
_Verifier: Claude (gsd-verifier)_
