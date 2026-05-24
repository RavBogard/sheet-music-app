# MusicXML Phase-2 — Surface Map (Phase 1)

**Lane:** `musicxml-phase2-discuss` · **Tier:** 0 (research/discussion) · **Author:** coder-3
**Base SHA:** `54378d7e5` (origin/master at lane creation)
**Companion:** `DISCUSSION.md` (gap map + ratified-build-spec proposal)
**Prior art:** `.paul/research/musicxml-health-FINDINGS.md` (coder-2, 2026-05-20, base `0343f4c49`) — Phase-1 audit. **Much of its Phase-2 plan has since shipped** (see §"What changed since the 2026-05-20 audit" below); this surface-map describes the current state at `54378d7e5`, not the audit state.

---

## 1. Current MusicXML pipeline — file → viewer → screen

### 1.1 Route + viewer dispatch (`src/components/performance/PDFOverlay.tsx`)

`PDFOverlay` (~409 LOC, the iPad Perform overlay) is the dispatcher. It now routes to **five** viewers based on type detection (the audio-viewer-f7 lane just added a 5th, `912ea2c3d`):

| condition                                                                                                                  | viewer                                                       | source            |
|----------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------|-------------------|
| `currentItem.type === 'musicxml'` OR `libMimeType.includes('xml')`                                                          | **`SmartScoreViewer`** (OSMD/SVG MusicXML renderer)          | `PDFOverlay.tsx:178-179, 329-330` |
| `currentItem.type === 'text'` OR `libMimeType.startsWith('text/')`                                                          | `TextScoreViewer`                                            | `PDFOverlay.tsx:180-181, 331-332` |
| `currentItem.type === 'image'` OR `libMimeType.startsWith('image/')`                                                        | `ImageScoreViewer`                                           | `PDFOverlay.tsx:182-183, 333-334` |
| `libMimeType.startsWith('audio/')` OR `track.fileName / fileId` ends `.mp3/.wav/.m4a/.ogg`                                  | `AudioViewer` (self-resolves via offline-idb)                | `PDFOverlay.tsx:191-194, 335-340` |
| fallthrough                                                                                                                | `PDFViewer` (IDB-first; networkUrl, NOT blob:)               | `PDFOverlay.tsx:341-347` |

The dispatch reads the type **twice** for resilience (`[[project_track_mimetype_gotcha]]`):
1. `currentItem.type` from the in-store `playbackQueue` (set by `toQueueItem`).
2. `useLibraryStore.allFiles.find(f => f.id === fileId)?.mimeType` (the authoritative library_index mime) — a legacy/bulk-bonded track may carry `type='pdf'` because mimeType wasn't stamped at bond time. The library-store backstop upgrades routing on the fly. (`PDFOverlay.tsx:172-194`)

`SmartScoreViewer` is dynamically imported (`PDFOverlay.tsx:21-25`), matching the lazy-load pattern used by the other viewers.

**URL handoff** (`PDFOverlay.tsx:209-239`): the non-PDF viewers (SmartScore/Text/Image) receive `fileUrl`, which starts empty and resolves to either:
- a cached `blob:` object URL (when `offline-idb` has the bytes), OR
- the `networkUrl` (`/api/drive/file/<fileId>`) on cache miss.

The IDB precache + `blob:` URL is the offline path. (PDF gets `networkUrl` direct because PDFViewer has its own IDB-first loader — `[[feedback_react_pdf_worker.md]]`-adjacent fix in `575bc47ae`.)

### 1.2 OSMD render core (`src/components/music/SmartScoreViewer.tsx`, ~293 LOC)

The MusicXML viewer mounts an OSMD instance into a ref'd `<div>` inside a white `<Card>` (OSMD draws dark text so the card forces a light background — `SmartScoreViewer.tsx:267-269`).

**Initialization** (`SmartScoreViewer.tsx:99-188`):
1. Create `new OpenSheetMusicDisplay(containerRef.current, { autoResize: false, backend: 'svg', drawingParameters: 'compacttight', drawTitle: true })`. (`SmartScoreViewer.tsx:106-111`)
2. Attach `new TransposeCalculator()` to `osmd.TransposeCalculator`. (`SmartScoreViewer.tsx:112`)
3. Pick `contentToLoad = aiXmlContent || sourceUrl` — `aiXmlContent` is the AI-overlay's transcribed XML string (priority); otherwise the chart URL. (`SmartScoreViewer.tsx:117`)
4. `await sleep(50)` yield so React can paint the "Rendering Score…" overlay before the synchronous OSMD parse locks the main thread. (`SmartScoreViewer.tsx:128-129`)
5. If `contentToLoad` is a URL (`http`/`blob:`/`/`-prefix), `fetch()` it and content-sniff: text starting with `<?xml`/`<score-partwise`/`<!DOCTYPE` → pass as string; else → wrap in `Blob` (handles `.mxl` zips). (`SmartScoreViewer.tsx:136-148`)
6. `await osmd.load(finalContent)` → another `sleep(50)` yield → first render at `Zoom = 1` with `Sheet.Transpose = transposition`. (`SmartScoreViewer.tsx:151-160`)
7. **Fit-to-width:** measure rendered SVG `getBBox().width` against container width, derive a `fitBase` zoom multiplier (`SmartScoreViewer.tsx:76-97`), clamp to `[FIT_MIN=0.6, FIT_MAX=3.5]`, render again only if `|finalZoom - 1| > FIT_NOOP_EPSILON=0.04`. (`SmartScoreViewer.tsx:165-171`)
8. Track `appliedRef = {transposition, zoom}` to deduplicate later updates. (`SmartScoreViewer.tsx:173`)

### 1.3 Current transpose — how semitone deltas are applied

**Trigger:** the `useEffect` at `SmartScoreViewer.tsx:192-224` reads `transposition` and `zoom` from `useMusicStore()` (`SmartScoreViewer.tsx:35`).

**Mechanism:** debounced re-render on the **same** OSMD instance:
- On store change (and `appliedRef` mismatch + `readyRef.current === true`):
  1. `setTransposing(true)` **synchronously** so the "Rendering Score…" overlay paints over the score before the debounce timer expires. Important: comment notes the overlay is set *before* the heavy work, so the user never sees a stale frame mid-render. (`SmartScoreViewer.tsx:204`)
  2. `clearTimeout` any prior pending render; schedule a new one at `TRANSPOSE_DEBOUNCE_MS = 140ms`. (`SmartScoreViewer.tsx:206-219`)
  3. Inside the timer: `osmd.Sheet.Transpose = transposition; osmd.Zoom = clamp(fitBase * zoom); osmd.updateGraphic(); osmd.render()` — **all synchronous on the main thread.** (`SmartScoreViewer.tsx:208-213`)
  4. `appliedRef.current = {transposition, zoom}`; `setTransposing(false)`.

**Where transposition lives:** `useMusicStore` (zustand) holds a single number `transposition` (semitones). Per-iPad-local; persisted in localStorage via the store's `partialize` (verified: store §65-90 of `src/lib/store.ts`). NOT propagated via track/setlist Firestore. Two unrelated render surfaces also consume it: `SmartTransposer` (PDF chord-overlay) and `TextScoreViewer` (line-by-line transpose).

**Where capo lives:** `useMusicStore.capoFret: number | null` (`store.ts:67-68, 233`). Set by `TransposerMenu`'s "Play As" grid (`TransposerMenu.tsx:125-130`) — it writes BOTH `setTransposition(result.transposition)` and `setCapoFret(result.fret)`. **SmartScoreViewer does NOT subscribe to `capoFret`.** That means MusicXML's actual sounding transposition for a capo selection rides on the `transposition` semitone delta (correct numerically — the capo `transposition` is the negative semitone count); the `capoFret` value is purely a UI label / state for the popover badge. So picking "G with capo 5" while viewing a C-major MusicXML re-renders OSMD at transpose `-5` (showing G shapes), exactly what a capoed guitarist reads — provided the panel was ever populated for that chart, which it currently isn't (see §2.3).

**Why the same instance, not off-screen:** comment in source — OSMD "requires synchronous `SVGElement.getBBox()`", so true Web-Worker / off-screen rendering would have to use a hidden DOM node. Not done.

### 1.4 Resize / orientation (`SmartScoreViewer.tsx:227-261`)

`autoResize: false` is set on OSMD because the component owns resize via a `ResizeObserver`:
- Watches the container element.
- On a >4px width delta, `clearTimeout` any pending refit, schedule one at `RESIZE_DEBOUNCE_MS = 200ms`.
- Inside the timer: re-measure (`computeFitBase`) at `Zoom=1`, then push the clamped `fitBase * userZoom` + current `transposition` + `updateGraphic() + render()`.
- `transpositionRef` / `zoomRef` carry the latest store values into the non-reactive resize callback. (`SmartScoreViewer.tsx:43-46`)

This is the iPad-rotation path (portrait↔landscape).

### 1.5 Loading / error UI

A single overlay covers both load and transpose states (`SmartScoreViewer.tsx:263-283`):
- `showOverlay = loading || transposing` → a centered `Loader2` spinner + "Rendering Score…" caption on a `bg-white/70` backdrop with `backdrop-blur-[1px]`. `role="status"` + `aria-live="polite"`.
- Error path: `Music2` icon + "Failed to load music XML." (`SmartScoreViewer.tsx:285-290`)

---

## 2. Existing key-handling — where the user's key choice + the chart's key live

### 2.1 Chart-native key (the source of truth)

- For **PDF charts:** the chart bytes have no machine-readable key; the AI chord-overlay pipeline (`useSmartTransposer`) scans rendered chord text and computes a key via `estimateKey(chords)` (`src/lib/music-math.ts:176-232` — a weighted scoring system: first-chord +10, last-chord +3, second-chord +2, frequency baseline). Result is exposed via `aiState.pageData[*].chords` → consumed by `TransposerMenu` (`TransposerMenu.tsx:81-91`) and `PerformanceToolbar` (`PerformanceToolbar.tsx:75-81`).
- For **MusicXML:** the `<key fifths="…">` element is in the file itself, and OSMD parses it (the file's signature drives the rendered `<key signature>` on the staff — visible in the probe artifacts where transpose +2 added 2 sharps). **But the parsed key is NOT lifted out of OSMD into application state.** SmartScoreViewer never calls anything like `osmd.Sheet.SourceMusicalKey` or its equivalent. Downstream consumers (`TransposerMenu`, `PerformanceToolbar`) only see `aiState.pageData`-derived chords, which is empty for MusicXML → they fall through to `null`.

### 2.2 User's persisted key choice — `track.key`

`track.key: string` (Firestore) is the **setlist-scoped** lead key — what the setlist's key is currently set to for the band (`[[project_catalog_dual_read_surfaces]]` — also lives in `songs/{id}.defaults.key` for catalog defaults; `library_index/{id}.key` for browser/website display). `TransposerMenu` reads it via the playback queue item (`TransposerMenu.tsx:65-70`).

Bond between `track.key` and rendering:
- TransposerMenu surfaces it as a banner "Playing in Am (chart: Dm)" when it differs from the detected/native key. (`TransposerMenu.tsx:165-174`)
- The actual `transposition` semitone delta the renderer applies is purely user-driven (the +/- stepper + the "Play As" grid). **Picking a `track.key` does NOT auto-transpose OSMD.** The musician-profile path (`use-musician-transposition`) computes a per-user transposition for transposing instruments, but that's a separate auto-flow.

### 2.3 Live-director gesture: another path that writes `track.key`

`SetlistPerformClient.tsx` + the live-director long-press (`83c86e6c2`) lets a band-leader long-press a row to change the track's key. The key write IS propagated through `tracks/{id}.key`; the SmartTransposer / OSMD don't react automatically (the user still nudges +/-). This is intentional per `[[project_smart_transposer_is_key_transcriber]]` (the AI-chord subsystem is un-stress-tested, do-not-touch).

---

## 3. Tests

- `src/components/music/__tests__/smart-score-viewer.test.tsx` (197 LOC) — 4 tests, all in jsdom with mocked OSMD via `vi.hoisted`:
  1. TransposeCalculator is assigned post-init.
  2. TransposeCalculator is set BEFORE `osmd.load()` is called (order regression).
  3. Transposition change → `osmd.Sheet.Transpose` is set + `updateGraphic + render` called.
  4. Two rapid transposition changes inside the debounce window collapse to ONE render (140ms debounce regression).
  5. Loading overlay paints immediately on mount and clears after load settles (jsdom — no `getBBox` / `ResizeObserver`).
  - Uses `vi.useFakeTimers()` + `advance(ms)` helper for deterministic timing (project convention per CLAUDE.md / MEMORY.md).
- `src/components/music/__tests__/text-score-viewer.test.tsx` — XSS regression for `TextScoreViewer` (C5D-001); NOT MusicXML-related.

---

## 4. Existing jank — what's documented + what's measured

### 4.1 Documented anti-jank work ALREADY in place at `54378d7e5`

The component has visibly absorbed multiple rounds of jank-polish. Source comments at `SmartScoreViewer.tsx:14-20, 191-205`:
- **`TRANSPOSE_DEBOUNCE_MS = 140`** — "collapse rapid +/- taps into a single re-render."
- **`RESIZE_DEBOUNCE_MS = 200`** — for orientation refits.
- **`FIT_NOOP_EPSILON = 0.04`** — "skip a re-render when the fit zoom is ~1 (long scores already fill width)."
- **`await sleep(50)`** TWICE (before parse, before render) — "Yield so React can paint the 'Rendering Score…' overlay before the synchronous OSMD parse/render locks the main thread."
- **Overlay is set synchronously inside the effect**, before the debounce timer is scheduled — "the overlay is set now (synchronously) and paints during the debounce window, so it already covers the score before the blocking render starts." (`SmartScoreViewer.tsx:202-205`)
- **`appliedRef` deduplication** — "skip the redundant render that would otherwise fire on mount."

### 4.2 The 2026-05-20 audit's jank baseline (prior art)

From `.paul/research/musicxml-health-FINDINGS.md` and `.paul/research/musicxml-phase2-artifacts/phase2-baseline-out.json` (deployed iPad WebKit probe at `4f7179add`):
- Cold render: **2249–3326ms** for small-to-medium MusicXML.
- Single-tap transpose: **3326ms** wall-clock to a fully-transposed display (per the probe driver's measurement — includes click + popover open + OSMD re-render + paint). `osmd.updateGraphic() + osmd.render()` itself was reported ~1–1.6s per step.
- **"`overlaySeenSingle: false`"** at baseline — meaning the user saw a stale frame during the transpose because the overlay wasn't yet wired in.
- "Fast double-tap on a cold chart renders a stale frame."

The companion `phase2-fix-short-out.json` (`1d158780`) shows post-fix probe:
- `overlaySeenSingle: true` — overlay now intercepts before stale paint.
- `msSingle: 1769` — single-step transpose down from 3326ms (~47% improvement).

So **the 140ms debounce + overlay + sleep yields landed sometime between `4f7179add` and `1d158780`,** and the SmartScoreViewer in current master already carries that fix. (Source: file diff vs the audit's quoted line numbers — audit cited `SmartScoreViewer.tsx:126-141` for the synchronous transpose; current file's transpose effect is at L192-224, with all the debounce machinery in between.)

### 4.3 What jank remains (subjective + structural)

Even with the landed fixes, the **OSMD `updateGraphic() + render()` itself is still synchronous and still ~1–1.6s on iPad WebKit** for a moderate score. So:
- A single transposition step has a perceptible freeze — the overlay covers it correctly, but the toolbar / TransposerMenu inputs are also blocked during the render. The visible UI is "frozen with overlay."
- Repeated +/- taps inside the 140ms window collapse to one render (good), but a tap RIGHT AFTER a render completes will start another full ~1s render with no batching.
- Scroll position: not exhaustively verified — but the OSMD render replaces the `<svg>` inside the container, so any user scroll position WITHIN the score may reset on re-render. Not documented as a complaint; flagged as a candidate symptom for Phase 2 to probe.
- Capo state: store-resident, survives re-renders (just a number). Not a jank source.
- `aiXmlContent` priority: if `aiXmlContent` is set (the AI-overlay's transcribed XML for a PDF), it overrides `sourceUrl` and the load effect re-fires. This is **PDF-side AI-transcription cross-traffic** — irrelevant to genuine MusicXML files but lives in the same component and complicates the load effect's dependency array. Not a jank symptom per se; a complexity flag.
- The `await sleep(50)` yields are an effective belt-and-braces hack but they ALSO add ~100ms of unconditional latency to the cold render. Acceptable.

---

## 5. What changed since the 2026-05-20 audit

The 2026-05-20 `musicxml-health-FINDINGS.md` proposed a 7-item Phase-2 plan. Status at `54378d7e5`:

| # | Item                                                                | Status                                                                                                                                                       |
|---|---------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 | Normalize MusicXML/MuseScore mime at every intake                   | **✅ SHIPPED** — `34d7d0def fix(library): type MusicXML/MuseScore intake by extension when mime is octet/empty`.                                              |
| 2 | Make track routing self-sufficient (`track.mimeType` durably stamped) | **✅ SHIPPED** (path mostly via `[[project_track_mimetype_gotcha]]` work).                                                                                  |
| 3 | De-jank transpose (debounce + overlay)                              | **✅ SHIPPED** — 140ms debounce + `transposing` state + overlay-before-render — verified in current `SmartScoreViewer.tsx:192-224`.                          |
| 4 | Fit-to-screen by default                                            | **✅ SHIPPED** — `FIT_MARGIN/FIT_MIN/FIT_MAX/FIT_NOOP_EPSILON` + `computeFitBase()` + resize-refit. (`SmartScoreViewer.tsx:14-20, 76-97, 165-171, 227-261`) |
| 5 | Feed transpose panel from MusicXML natively (detected-key + capo)   | **❌ NOT SHIPPED** — this is the principal remaining gap. (`TransposerMenu` still says "WAITING FOR SCAN…" for MusicXML.)                                    |
| 6 | Decide on OSMD `drawTitle`                                          | **❌ NOT SHIPPED** — `drawTitle: true` still set (`SmartScoreViewer.tsx:110`). Cosmetic; low priority.                                                       |
| 7 | Seed a real renderable MusicXML chart                               | Out of scope for this lane — content/authoring concern. Library still has 3 byteless `.mxl` orphans + 0 active MusicXML rows.                                |

So the **Phase-2 scope this lane should propose is items 5 (capo + detected-key for MusicXML) and any further transpose-jank polish beyond what's landed.** Item 6 + Item 7 are out-of-scope for the lane the supervisor dispatched.

---

## 6. Touchpoints / files relevant to the eventual build lane

(For DISCUSSION.md to reference; not all of these will be edited.)

- `src/components/music/SmartScoreViewer.tsx` — would need to expose MusicXML's parsed key (OSMD `Sheet.SourceMusicalKey` or equivalent) into the store / via a callback prop, so TransposerMenu can read it.
- `src/components/music/TransposerMenu.tsx` — `detectedKey` calc would need a MusicXML-aware fallback (currently only reads `aiState.pageData` chords). The Capo "Play As" grid is already implemented and would light up automatically once `effectiveKey` is non-null for MusicXML.
- `src/lib/store.ts` — would need a `musicXmlKey: string | null` slot (or similar) for SmartScoreViewer to write into and TransposerMenu to read. Per-render-instance, not persisted.
- `src/lib/music-math.ts` — `calculateCapo`, `estimateKey`, `transposeChord` already exist; reusable.
- `src/components/performance/PerformanceToolbar.tsx` — its own `detectedKey` useMemo (`PerformanceToolbar.tsx:75-81`) would need parallel treatment so the button label ("Detected Key" / capo badge) lights up for MusicXML.
- `src/components/music/__tests__/smart-score-viewer.test.tsx` — would gain a test for the key-emission behavior (probably mocking `osmd.Sheet.SourceMusicalKey` and asserting the store write).

### Hard do-not-touch (per dispatch + `[[project_smart_transposer_is_key_transcriber]]`)

- `src/components/music/SmartTransposer.tsx` — AI chord-overlay on PDFs; un-stress-tested subsystem; off-limits.
- `src/hooks/use-smart-transposer.ts` — same subsystem.

The build lane will need to touch `TransposerMenu` to add the MusicXML-fallback path for `detectedKey`, which the dispatch flags as off-limits *for this discussion lane* but is unavoidable for the build lane.

---

## 7. Open questions for Phase 3 (DISCUSSION.md)

Listed here as a hand-off; resolved in `DISCUSSION.md`:

- **Q-CAPO-1:** where does capo state live for MusicXML? (Already store-resident in `capoFret`; question is whether the build lane lifts that to `track.capo` Firestore for per-musician propagation, or leaves it per-iPad-local.)
- **Q-CAPO-2:** UI affordance shape — the existing "Play As" grid lights up once `effectiveKey` is non-null. Is that the affordance? Or should we add a separate slider/numeric for direct fret selection?
- **Q-DETECT-1:** how aggressive is detected-key surfacing? Info chip vs "promote to track.key?" action.
- **Q-TRANSPOSE-JANK-1:** beyond the already-landed debounce + overlay + yield, which residual symptoms are the priority for the build lane?
- **Q-OSMD-API-1** *(new — build-lane discovery item):* confirm OSMD's API for reading the parsed key. Candidate: `osmd.Sheet.SourceMusicalKey` (a `KeyInstruction` carrying `Key` enum + `Mode`). The probe artifacts don't capture this directly, so the build lane will need a one-time deployed probe or local OSMD-API check.

---

**End SURFACE-MAP.md — Phase 1 complete.**
