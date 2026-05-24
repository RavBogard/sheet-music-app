# MusicXML Phase-2 — DISCUSSION.md (Phase 2 + 3)

**Lane:** `musicxml-phase2-discuss` · **Tier:** 0 (research/discussion; one DISCUSSION.md commit, NO code)
**Author:** coder-3 · **Base SHA:** `54378d7e5`
**Goal:** Ratified BUILD-SPEC for the follow-on lane(s) that will (1) light up Capo + Detected-Key for MusicXML, and (2) polish remaining transpose-jank. Pattern mirrors the `live-director-gesture` flow (DISCUSSION → Daniel annotates inline ## RATIFIED → build dispatch).

> **Audit-of-prior-art callout:** the supervisor's dispatch said "NO capo panel exists; NO detected-key surface beyond existing transposition." That's **half-true.** The capo panel **DOES exist** in `TransposerMenu.tsx` (the "Play As" guitar-shape grid) and `useMusicStore.capoFret` is wired through the toolbar label. The detected-key **DOES exist** for PDF/AI-chord charts via `estimateKey()`. What's missing is **MusicXML-native** key detection — so the panel correctly shows "WAITING FOR SCAN…" for MusicXML even though the key signature is sitting in the file. So this lane is **NOT** "build a capo panel from scratch"; it's "feed the existing capo panel from MusicXML's native key element so it lights up for the third viewer type." That collapses the LOC envelope substantially. **Reflected throughout this DISCUSSION.md.**

---

## 0. TL;DR — proposed build scope

| Subfeature                                  | What ships                                                                                                                                                                  | Honest LOC (likely)            | Tier   | Status                |
|---------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------|--------|-----------------------|
| **Capo for MusicXML**                       | Surface MusicXML's parsed key as the input to the existing `TransposerMenu` "Play As" grid + the toolbar's Detected-Key label. **The capo grid itself is already built.**   | ~80–150 LOC (one viewer + one store slot + two consumer fallbacks) | Tier 1 | Subsumed by Detected-Key build  |
| **Detected-Key for MusicXML**               | `SmartScoreViewer` reads OSMD `Sheet.SourceMusicalKey` post-load → writes a new `musicXmlKey` store slot → `TransposerMenu` + `PerformanceToolbar` fall back to it when `aiState.pageData` is empty. | (covered above)                | Tier 1 | **Primary build item** |
| **Transpose-jank polish**                   | Symptom-priority TBD by Daniel; candidate fixes range from preserve-scroll-position to off-screen render-then-swap. **Open-ended honest LOC range.**                        | 50–300 LOC depending on chosen symptoms                       | Tier 1 | **Symptom-prioritized; smaller follow-up**                  |

**Pattern recommendation:** one Tier-1 lane covering Capo + Detected-Key as a single coherent change (because Capo light-up is a free side-effect of Detected-Key). Transpose-jank is a separate Tier-1 lane that fires after a Daniel-prompt narrows the symptoms.

**Why not three independent parallel lanes:** the touchpoints overlap (TransposerMenu + SmartScoreViewer for both Capo + Detected-Key; the jank lane touches SmartScoreViewer + tests). Parallel would race on `SmartScoreViewer.tsx`. One sequential build with a clean checkpoint mid-way is safer.

---

## 1. Gap map (Phase 2)

For each subfeature: state of the art, what's missing, where it lives, what changes.

### 1.1 Capo panel

**State of the art (already built):**
- `useMusicStore.capoFret: number | null` — store slot, persisted per-iPad. (`src/lib/store.ts:67-68`)
- `setCapoFret(fret)` setter. (`src/lib/store.ts:233`)
- `TransposerMenu.tsx:13-22` — the 8 guitar-friendly shapes (G/C/D/A/E/Am/Em/Dm).
- `TransposerMenu.tsx:103-111` — `calculateCapo(effectiveKey, shape)` for each shape, memoized on `effectiveKey`.
- `TransposerMenu.tsx:247-309` — the rendered "Play As (with capo)" grid: each cell shows shape + computed fret + "same" badge when fret is 0; selecting writes BOTH `transposition` (the negative-semitone delta) and `capoFret`.
- `PerformanceToolbar.tsx:84-92` — the toolbar's transpose-button LABEL shows `Capo {capoFret}` when active.

**What's missing for MusicXML:**
- The grid is **gated on `effectiveKey`** (`TransposerMenu.tsx:248`), which derives from `detectedKey` (`TransposerMenu.tsx:88-91`) which currently only reads `aiState.pageData` chord data. MusicXML never populates `aiState.pageData` → `detectedKey === null` → `effectiveKey === null` → grid hidden, popover shows "WAITING FOR SCAN…".
- Per the 2026-05-20 audit's probe: confirmed at `4f7179add` — the popover for a MusicXML chart shows the scanning label indefinitely. (`musicxml-health-FINDINGS.md` Finding "MED — Capo … unavailable for MusicXML")

**Where the fix lands:**
- `SmartScoreViewer` writes the parsed-out key into a new store slot.
- `TransposerMenu`'s `detectedKey` calc adds a fallback: `aiState.pageData`-derived key (current path) ?? `musicXmlKey` from store.
- `PerformanceToolbar`'s `detectedKey` calc gets the same fallback.

**Effective UX after fix:** open a MusicXML chart in Perform → TransposerMenu shows "Detected Key: D" + the "Play As" grid lights up → pick "G" → store writes `transposition: -5, capoFret: 5` → SmartScoreViewer's existing transpose effect fires → OSMD re-renders at -5 semitones → guitarist sees G shapes on the staff; toolbar label shows "Capo 5". **Zero new UI components.**

### 1.2 Detected-Key from MusicXML

**State of the art:**
- For PDFs: `estimateKey(chords)` in `src/lib/music-math.ts:176-232` — weighted scoring from chord array.
- For MusicXML: the `<key fifths="…">` element is in the file. OSMD parses it (verified — transpose +2 adds 2 sharps to the key signature in the rendered SVG; probed at `4f7179add`).
- OSMD candidate API: `osmd.Sheet.SourceMusicalKey` (a `KeyInstruction` carrying a `Key` enum + `Mode`). **Build-lane confirmation needed** (Q-OSMD-API-1 below) — this is the principal API uncertainty.

**What's missing:**
- The parsed key is never lifted out of OSMD into application state. SmartScoreViewer doesn't read it; nothing downstream knows the chart's key.

**Where the fix lands:**
- Inside SmartScoreViewer's load effect (post-`osmd.load()` + first render), read the parsed key, convert to the canonical string format used elsewhere (e.g. `"D"`, `"Am"`, `"F#"`), call a new `setMusicXmlKey(key)` setter on the store.
- On viewer unmount (or `sourceUrl` change), clear: `setMusicXmlKey(null)`.
- TransposerMenu + PerformanceToolbar: `detectedKey = pdfDetectedKey ?? musicXmlKey` (preserve PDF-source priority so the AI-chord path still works for non-MusicXML files; MusicXML falls into the fallback because PDF detectedKey will be null when the AI-overlay is off).

**Edge case:** mid-piece key changes (a MusicXML with multiple `<key>` signatures across measures). For MVP, **read the FIRST key signature only**; surface a `keyChangesPresent` boolean as a future affordance. Don't try to surface "this song modulates" in v1 — that's a much larger UX question.

### 1.3 Transpose-jank polish

**State of the art (already landed, see SURFACE-MAP §4.1–4.2):**
- 140ms debounce on rapid +/- taps.
- "Rendering Score…" overlay paints synchronously before the heavy render.
- `await sleep(50)` yields before parse + before render so the overlay actually frames.
- `appliedRef` deduplicates redundant re-renders on remount.
- Fit-to-width baseline + clamped manual zoom.

**Honest assessment:** the obvious low-hanging fruit is mostly picked. The ~1–1.6s **synchronous** OSMD `updateGraphic() + render()` is the structural floor and would require off-screen rendering to break further. Daniel should weigh whether further jank work is worth the effort *before* the build lane fires.

**Candidate residual symptoms (Daniel-prompt below):**

| Symptom                                                                                                                                              | Mechanism                                                                                                       | Cost                  | Verifiability                                                                                |
|------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|-----------------------|-----------------------------------------------------------------------------------------------|
| **S1. Scroll-position loss** on transpose (user scrolls down a long score, taps +1, scroll resets)                                                   | OSMD replaces the `<svg>` content; the container's `scrollTop` survives but the visual content jumps.            | LOW — preserve `scrollTop` ref pre-render, restore post.            | iPad WebKit visual probe + a Playwright assertion on container scrollTop pre/post.           |
| **S2. UI freeze during the ~1s render** (toolbar buttons / TransposerMenu inputs are unresponsive while OSMD blocks the main thread)                | Synchronous main-thread render; no `requestIdleCallback` / `requestAnimationFrame` chunking; the `sleep(50)` yield is one-shot. | MED — chunk via `requestIdleCallback` (sketchy on Safari) OR move render to an off-screen container + `requestAnimationFrame`-driven swap. | iPad WebKit input-latency probe; measure ms-from-tap-to-input-acceptance.                    |
| **S3. Cold render still ~2.3s** for moderate scores                                                                                                  | OSMD parse + first render are both unavoidably synchronous; the `compacttight` drawing parameters are already the leanest. | HIGH — likely no further wins without changing renderer (out of scope).                          | Compare deployed cold-render artifacts pre/post.                                              |
| **S4. Stale frame on a SECOND tap immediately after a render completes** (debounce window has expired; second tap fires a full new ~1s render with no batching) | The 140ms debounce only collapses taps WITHIN the same window; once it fires, the next tap is a fresh debounce. | LOW — adaptive debounce: extend the window if a render is in flight.        | Playwright burst-tap probe; assert one render per N-tap-burst, with N tunable.                |
| **S5. Capo selection mid-render** (user opens TransposerMenu mid-render, picks a capo shape) — current behavior is OK because the menu writes to the store and the effect re-fires after current render, but visually delayed | Same main-thread blocking.                                                                                       | LOW — overlay already covers this; arguably no fix needed.                                                       | Manual iPad probe.                                                                            |
| **S6. Loss of capo state on a transpose nudge** (if you nudge +/- after selecting a capo shape, `TransposerMenu.handleReset` semantics are unclear)  | Stepper-up button at `TransposerMenu.tsx:233-244` calls `setTransposition + setCapoFret(null)` — so nudging clears capo. Intentional? | Trivial — if intentional, no change; if not, decouple. | Manual test + Daniel call on intent.                                                          |
| **S7. `aiXmlContent` priority overrides MusicXML source** (`SmartScoreViewer.tsx:117`) — if AI transcription is in progress for a different (PDF) chart and `aiXmlContent` is still set in the store when we mount a MusicXML, the viewer renders the AI XML, not the MusicXML file. | Store slot is global; component reads `aiXmlContent || sourceUrl`. | LOW — clear `aiXmlContent` on viewer-type transitions, or make the priority MusicXML-aware. | Repro: open a PDF with AI on, transcribe, close, open a MusicXML — does the MusicXML render or the AI XML?  |

**LOC bounds:**
- S1 alone: ~30 LOC (one ref + 4 lines in the transpose effect).
- S1 + S4: ~80 LOC.
- S1 + S2 (off-screen): ~150–250 LOC (build a hidden `<div>`, mount a second OSMD instance there, swap).
- S1 + S4 + S7 cleanup: ~100–150 LOC.

**Recommended Daniel narrowing:** pick 1–2 of S1/S4/S7 for a tight Tier-1 follow-up. S2 (off-screen render-then-swap) is a much bigger lane and warrants its own DISCUSSION-style pre-flight if Daniel chooses it.

---

## 2. Proposed approach per subfeature

### 2.1 Build Lane A — Capo + Detected-Key for MusicXML (single Tier-1 commit lane)

**Scope:**
1. Add `musicXmlKey: string | null` + `setMusicXmlKey` to `useMusicStore` (`src/lib/store.ts`). NOT persisted across sessions (it's render-time state, not user preference).
2. In `SmartScoreViewer.tsx`:
   - After `osmd.load()` + first render succeeds, read `osmd.Sheet.SourceMusicalKey` (or whichever OSMD API confirms in Q-OSMD-API-1).
   - Convert to canonical key string ("D" / "Am" / "F#" / "Bb" / etc.) using a small helper (or `music-math.ts` if a similar fn exists).
   - `setMusicXmlKey(canonical)`.
   - On effect cleanup / `sourceUrl` change → `setMusicXmlKey(null)`.
3. In `TransposerMenu.tsx` (line 88-91):
   - Change `detectedKey` calc to `useMemo` over BOTH `allChords` AND `musicXmlKey`: return `estimateKey(allChords) ?? musicXmlKey ?? null`.
4. In `PerformanceToolbar.tsx` (line 75-81):
   - Parallel change to the toolbar's local `detectedKey` calc.
5. Tests:
   - `smart-score-viewer.test.tsx`: add a test that asserts `setMusicXmlKey` is called with the right key when OSMD's `Sheet.SourceMusicalKey` mock returns a known value.
   - Add a TransposerMenu unit test (new file, or extend existing) asserting the `musicXmlKey` fallback fires when `aiState.pageData` is empty.

**Files touched:**
- `src/lib/store.ts` (additive — new slot)
- `src/components/music/SmartScoreViewer.tsx` (write the key on load; clear on unmount)
- `src/components/music/TransposerMenu.tsx` (add fallback in detectedKey calc)
- `src/components/performance/PerformanceToolbar.tsx` (parallel fallback)
- `src/components/music/__tests__/smart-score-viewer.test.tsx` (new test for key-emit)
- (new file) `src/components/music/__tests__/transposer-menu-musicxml.test.tsx` — IF no existing test for TransposerMenu's key fallback

**Out of bounds:**
- ⛔ Do NOT touch `SmartTransposer.tsx` or `use-smart-transposer.ts` — AI chord-overlay subsystem is un-stress-tested (`[[project_smart_transposer_is_key_transcriber]]`).
- ⛔ Do NOT change the `aiState.pageData`-fed key path's behavior for PDFs — must remain authoritative for PDF charts.
- ⛔ Do NOT propagate `musicXmlKey` to Firestore. It's render-time only.
- ⛔ Do NOT add new UI components — feed the existing TransposerMenu grid.

**Gates:**
- Existing 4 SmartScoreViewer tests still pass.
- New test asserts the store write occurs.
- Deployed iPad probe (Playwright @ 820×1180) on a real MusicXML upload: open chart → TransposerMenu shows the chart's native key + capo grid populated.
- Manual UAT: pick "G with capo 5" on a D-major chart → OSMD re-renders showing G shapes; toolbar label shows "Capo 5".

**Honest LOC:** ~80–150 LOC across 4 prod files + 1–2 test files. Closer to 150 if the OSMD key-API needs a wrapper helper, closer to 80 if `osmd.Sheet.SourceMusicalKey` reads cleanly.

**Tier:** 1 (standard feature; per-finding deployed evidence + cross-lane sweep once-per-wave).

### 2.2 Build Lane B — Transpose-jank polish (Tier-1 follow-up, Daniel-narrowed)

**Scope:** depends on which symptoms Daniel picks (see §1.3, Q-TRANSPOSE-JANK-1). Recommended default if Daniel says "pick the easy ones":
- S1 (scroll-position preservation across transpose re-render).
- S4 (adaptive debounce — extend the window if a render is in flight).
- S7 (clear `aiXmlContent` on viewer-type transition, OR document it as expected).

**Files touched (for recommended default):**
- `src/components/music/SmartScoreViewer.tsx` (scroll-restore ref + adaptive-debounce flag)
- `src/components/music/__tests__/smart-score-viewer.test.tsx` (regression tests)

**Out of bounds:**
- ⛔ Off-screen render-then-swap (S2) is a separate, bigger lane — not in this default scope.
- ⛔ Don't touch the OSMD `compacttight` drawing parameters or the `FIT_*` constants — they're a separate tuning concern.

**Gates:**
- All 4+ existing SmartScoreViewer tests still pass.
- New regression tests for chosen symptoms.
- Deployed iPad probe measures scroll-position survival + adaptive-debounce burst behavior.

**Honest LOC:** ~80–150 LOC for the recommended default (S1 + S4 + S7 cleanup). Up to ~300 if Daniel adds S2.

**Tier:** 1.

### 2.3 Explicit non-goals for both lanes

- ⛔ NO change to the chord-overlay (PDF AI) subsystem.
- ⛔ NO Firestore migrations / new fields on `tracks` / `library_index` / `songs`.
- ⛔ NO change to PDF/Text/Image/Audio viewer behavior.
- ⛔ NO new viewer dispatch logic in `PDFOverlay.tsx`.
- ⛔ NO change to capo state shape (`useMusicStore.capoFret`) — additive store slot only.
- ⛔ NO mid-piece key-change UX (multiple `<key>` signatures). First-signature-only for v1; surface `keyChangesPresent` boolean as a future affordance.

---

## 3. Daniel-decisions enumerated

These are the questions whose answers shape the eventual build dispatch. Please annotate inline below (mirroring the live-director-gesture DISCUSSION.md ratification pattern).

### Q-CAPO-1 — Where does capo state live for MusicXML?

**Current state:** `useMusicStore.capoFret` (per-iPad-local, persisted in localStorage via store `partialize`).

**Option A — leave as is (per-iPad-local).** Simplest. Each iPad picks its own capo. Matches the existing PDF/AI behavior. No Firestore writes. Recommended default.

**Option B — lift to `track.capo` Firestore field.** Propagates "the band agreed: capo this song at 5" across all iPads. Matches `track.key` precedent (`[[project_live_director_gesture_spec]]`). But: capo is fundamentally a per-musician choice (guitarist on capo 5 ≠ keyboardist on no capo) — so propagating is arguably wrong.

**Recommendation:** **Option A.** Per-iPad-local. Capo is a per-musician fingering aid, not a band-wide truth.

**Daniel ratification:** ☐ A (recommended) ☐ B ☐ Other (annotate)

---

### Q-CAPO-2 — UI affordance shape for MusicXML capo

**Current state:** the "Play As" 8-shape grid in `TransposerMenu.tsx:247-309` (8 buttons; each shows shape label + computed fret; tapping writes transposition + capoFret).

**Option A — reuse the existing 8-shape grid.** Zero new UI. The grid auto-lights once `effectiveKey` is non-null. Recommended default.

**Option B — add a separate numeric capo input** (0–12 fret slider/stepper) for direct fret selection without picking a shape. Bigger UI surface. Asks "what fret are you on?" rather than "what shape do you want to read?" — different musical model.

**Option C — both.** Surface the existing grid + a numeric fallback. ~30 extra LOC. May confuse the user.

**Recommendation:** **Option A.** The shape-grid is the right musical idiom (guitarists pick shapes, not frets). Re-investigate if Daniel later finds players want direct fret entry.

**Daniel ratification:** ☐ A (recommended) ☐ B ☐ C ☐ Other (annotate)

---

### Q-DETECT-1 — How aggressive is detected-key surfacing for MusicXML?

**Current state for PDF:** TransposerMenu shows "Detected Key: D" + the transposed-to label "→ E" when transposition ≠ 0. (`TransposerMenu.tsx:177-204`). No "promote to track.key" action — the chart's key is informational; the band's key (`track.key`) is a separate field set elsewhere.

**Option A — same treatment for MusicXML.** Info chip in TransposerMenu + toolbar label. No action affordance. Recommended default. Identical UX to PDF.

**Option B — add "promote to track.key" action.** When MusicXML's native key differs from `track.key`, surface a "This chart is in D — set the setlist key to D?" prompt. Pulls in the live-director-gesture write path (`tracks/{id}.key` mutate). MORE UX SURFACE → more decision-fatigue mid-service.

**Option C — auto-set `track.key` from MusicXML's native key when `track.key` is empty.** Silent. If `track.key` is already set, do nothing. Aggressive heal but invisible.

**Recommendation:** **Option A.** Pure info; matches PDF behavior; no new write paths; lowest risk for the band-facing surface tomorrow.

**Daniel ratification:** ☐ A (recommended) ☐ B ☐ C ☐ Other (annotate)

---

### Q-TRANSPOSE-JANK-1 — Which residual jank symptoms are the priority?

(See §1.3 for the full symptom catalog with mechanism + cost + verifiability.)

**Option Recommended-default — S1 + S4 + S7.**
- S1 = scroll-position preservation (LOW cost, clear win).
- S4 = adaptive debounce (LOW cost; eliminates the stale-frame on rapid double-tap-after-render).
- S7 = `aiXmlContent` priority cleanup (LOW cost; defensive housekeeping).
- ~80–150 LOC.

**Option Heavy — Recommended-default + S2.** Adds off-screen render-then-swap. Up to ~300 LOC. Probably needs its own pre-flight DISCUSSION.

**Option Minimal — S1 only.** ~30 LOC. Lowest risk, smallest visible win.

**Option Skip — defer the jank lane entirely.** If Daniel's subjective experience after Build Lane A (Capo + Detected-Key) is "acceptable," skip the jank lane.

**Recommendation:** start with **Recommended-default (S1 + S4 + S7)** as Build Lane B; revisit S2 (off-screen render) only if subjective jank remains a band complaint.

**Daniel ratification:** ☐ Recommended-default (S1+S4+S7) ☐ Heavy (+S2) ☐ Minimal (S1) ☐ Skip ☐ Other (annotate)

---

### Q-OSMD-API-1 — Confirm OSMD's API for reading the parsed key

**Issue:** the build lane needs `SmartScoreViewer` to read the chart's parsed key from the OSMD instance. The probable API is `osmd.Sheet.SourceMusicalKey` (a `KeyInstruction` with `Key` enum + `Mode`). This **has not been verified live** in this discussion lane (no code changes per dispatch).

**Resolution:** the build-lane executor confirms via either:
- **A — local OSMD type-check** (`/// <reference types>` or just open `node_modules/opensheetmusicdisplay/build/dist/src/MusicalScore/MusicSheet.d.ts` and read the field). 5 min. Recommended.
- **B — one-shot deployed probe** that prints `osmd.Sheet.SourceMusicalKey` to console after load. 15 min.

**Build-lane note:** if the API differs from `Sheet.SourceMusicalKey`, the executor adapts in the same commit. Not a separate lane.

**Daniel ratification:** N/A — build-lane discovery, no Daniel decision required. Listed here for completeness so the build prompt knows to do it.

---

## 4. Pattern recommendation

**One Tier-1 build lane for Capo + Detected-Key** (Build Lane A above). Touchpoints overlap entirely (TransposerMenu, PerformanceToolbar, SmartScoreViewer, store) — splitting them into parallel lanes would race the same files. The two features are causally entangled (capo grid lights up *because* detected-key is non-null), so they ship together.

**Separate Tier-1 follow-up lane for transpose-jank polish** (Build Lane B above). Fires AFTER Lane A is auditor-ACCEPTed + Daniel ratifies §Q-TRANSPOSE-JANK-1. Different scope; different acceptance criteria; clean checkpoint.

**Sequencing:** A first, then B. A's audit window gives time to decide on B's symptom set.

**Owners:** any coder; no need for a single-owner constraint (no destructive writes, no AI-chord subsystem touch).

**Cross-cutting do-not-touch list (binding for both build lanes):**
- `src/components/music/SmartTransposer.tsx`
- `src/hooks/use-smart-transposer.ts`
- The AI-chord-overlay state shape (`aiState.pageData`)

---

## 5. Honest risk assessment

| Risk                                                                                              | Likelihood | Severity | Mitigation                                                                                                                                       |
|---------------------------------------------------------------------------------------------------|------------|----------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| OSMD `Sheet.SourceMusicalKey` API doesn't exist / has different shape                             | LOW        | LOW      | Q-OSMD-API-1 resolution in build lane; if API differs, adapter takes ~10 extra LOC.                                                              |
| Detected-key from MusicXML returns wrong key for transposed/transposing-instrument MusicXML files | LOW-MED    | MED      | MVP reads only the first `<key>` signature; documents this in code comment. Real-world test on Randy/David's MusicXML when seeded (post-launch). |
| `setMusicXmlKey(null)` on unmount races a new viewer's setMusicXmlKey — wrong key flashes briefly | LOW        | LOW      | Use a viewer-instance ref to write the latest key; latest-mount wins. Documented pattern.                                                        |
| Capo selection on a MusicXML that has a `<transposing-instrument>` (e.g. Bb trumpet part) misinterprets sounding vs written pitch | LOW (no transposing-instrument MusicXML in catalog) | MED      | Build-lane note: OSMD's transpose semantics treat the score's written notation as the input — capo just changes display. Verify with one transposing-instrument test fixture post-Daniel-ratify. |
| User's existing PDF AI-chord workflow breaks because detectedKey now prefers musicXmlKey         | LOW (only fires when AI chords are empty) | HIGH | The fallback ORDER is `aiState.pageData → estimateKey → musicXmlKey ?? null` — PDF path WINS when chords present. Regression test covers this.   |
| Transpose-jank polish (S2 off-screen render) breaks the existing fit-to-width logic               | MED        | MED      | S2 is out of the recommended default scope. If chosen, requires its own pre-flight.                                                              |

---

## 6. Out-of-scope (explicit boundaries for the build lane prompt)

- ⛔ AI chord-overlay subsystem (`SmartTransposer.tsx`, `use-smart-transposer.ts`) — un-stress-tested DO-NOT-TOUCH per `[[project_smart_transposer_is_key_transcriber]]`.
- ⛔ Non-MusicXML viewers (PDF / Text / Image / Audio) — out of scope. Their behaviors don't change.
- ⛔ Firestore writes — no `track.capo`, `track.musicXmlKey`, etc. The new state is render-time only.
- ⛔ OSMD upgrade / replacement — the version installed at base SHA is the floor.
- ⛔ `drawTitle: true` change — separate cosmetic concern (audit Item #6).
- ⛔ Multiple `<key>` signature handling — first-signature-only for MVP; `keyChangesPresent` boolean is a future affordance.
- ⛔ MusicXML seeding / authoring tools — content concern, not engineering.
- ⛔ Bridge / monitor / iPad-WebKit-specific WebKit polyfills.

---

## 7. Build-lane prompt skeleton (for the supervisor's eventual dispatch)

(Not authoritative — just a starter so the supervisor knows shape. The supervisor will write the real dispatch after Daniel ratifies §3.)

```
Lane: musicxml-phase2-capo-detected-key
Tier: 1
Branch: feat/musicxml-phase2-capo-detected-key
Worktree: sheet-music-app-musicxml-capo-detected-key/
Base: <origin/master at dispatch time>
Coder: any idle

Scope: implement BUILD-SPEC §2.1 of
  .paul/research/musicxml-phase2-discuss/DISCUSSION.md
ratified by Daniel <timestamp>.

Touchpoints (per DISCUSSION §2.1):
  - src/lib/store.ts          — additive `musicXmlKey` slot + setter
  - src/components/music/SmartScoreViewer.tsx  — write/clear musicXmlKey on load/unmount
  - src/components/music/TransposerMenu.tsx    — detectedKey fallback to musicXmlKey
  - src/components/performance/PerformanceToolbar.tsx  — parallel detectedKey fallback
  - src/components/music/__tests__/smart-score-viewer.test.tsx  — key-emit test
  - (new) src/components/music/__tests__/transposer-menu-musicxml.test.tsx  — fallback test

Out of scope (binding):
  - SmartTransposer.tsx / use-smart-transposer.ts — DO-NOT-TOUCH
  - any Firestore mutation
  - non-MusicXML viewer behavior

Gates:
  - Existing SmartScoreViewer tests PASS.
  - New tests PASS.
  - Deployed iPad probe @ 820×1180: open a MusicXML chart, TransposerMenu shows key + capo grid; pick "G with capo 5", toolbar shows "Capo 5", OSMD shows G-shape transposition.
```

(Build Lane B prompt skeleton omitted until Q-TRANSPOSE-JANK-1 is ratified.)

---

## 8. Hand-off

This DISCUSSION.md is the deliverable. The supervisor surfaces it to Daniel for inline ratification of §3 (Q-CAPO-1 / Q-CAPO-2 / Q-DETECT-1 / Q-TRANSPOSE-JANK-1). After ratification, the supervisor writes the actual build-lane dispatch using §7 as a starting point.

**Coder-3 sign-off:** SHIP-NOTICE will follow once this DISCUSSION.md is committed + pushed. Worktree teardown awaits supervisor sweep per `[[feedback_worktree_teardown_timing]]`.

— from coder-3
