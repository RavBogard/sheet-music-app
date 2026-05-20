# MusicXML "work well" — Phase 1 health audit (FINDINGS)

**Lane:** musicxml-health-audit · **Role:** research/probe (NO src fixes)
**Author:** coder-2 · **Date:** 2026-05-20
**Base:** `0343f4c49` (origin/master at audit time) · **Prod SHA probed:** `0343f4c49`
**Surface:** deployed `https://www.centralreform.live`, iPad WebKit (Playwright `webkit`, `devices['iPad Pro 11']`, viewport 820×1180 — the band's 11" iPad Perform target)
**Artifacts:** `.paul/research/musicxml-health-artifacts/` (drivers + `render-out.json` + screenshots)

> **STANDING GOAL (Daniel, ratified):** MusicXML is the PREFERRED chart format — must render AND
> transpose WELL on the band's iPad Perform surface, NOT a fallback to PDF.
> Refs: `[[project_musicxml_goal]]`, `[[project_track_mimetype_gotcha]]`.

---

## TL;DR verdict

**The MusicXML *renderer* is in good shape; the *intake/routing* is the weak link, and there is
zero MusicXML in live use today.**

- ✅ **Render works** for `.musicxml`, `.mxl`, and `.mscz` on the deployed iPad Perform surface —
  OSMD/VexFlow SVG, never the PDF "Failed to render" path. Load 2.4–3.3s cold.
- ✅ **Transpose works** for all three — notation **and** chord symbols transpose correctly
  (C→D major, "C/Gm"→"D/Am" at +2; key signature gains 2 sharps). This is THE core value
  (vocalists change key live) and it is functionally correct.
- ✅ **`.mscz`→MusicXML conversion works** (server-side XSLT) — clean notation, chord symbols,
  and title preserved.
- ⚠️ **Transpose re-render is slow + janky** (~1–1.6s synchronous OSMD `updateGraphic()+render()`
  per step; a fast double-tap on a cold chart can render a stale frame). Noticeable lag for a
  live key change mid-service.
- ⚠️ **Layout wastes the iPad screen** — a short score paints in the top ~25%; ~65% of the
  820×1180 viewport is blank. Default zoom 100% does not scale a single-system score to fill.
- ⚠️ **Capo / "Play As" guitar-shape helper + detected-key are unavailable for MusicXML**
  (the transpose popover shows "WAITING FOR SCAN…"). That panel is driven by the AI chord-scan
  used for PDF/text charts; MusicXML never scans, even though its key is in the file.
- 🔴 **Intake mis-routes MusicXML to the PDF viewer** on the Drive path (`import_chart_from_drive`)
  and **rejects** raw `.mxl/.musicxml` browser uploads — the octet-stream weak link. This is the
  thing that will bite Daniel the moment he imports real MusicXML at scale.
- 📊 **Data:** 0 MusicXML rows among 438 active library entries; the only MusicXML in the catalog
  (3 `.mxl` rows) is byteless/orphaned. So none of the above is currently user-visible — but it
  must be solid before MusicXML is adopted.

---

## How this was probed

1. **Static trace** of the render + routing + intake paths (source @ `0343f4c49`).
2. **Data probe** of prod library via MCP (pool ROOT bearer) — `probe-data.mjs`.
3. **Inject** 3 formats via `upload_chart` + bond to a test setlist — `inject.mjs`
   (sample: `public/demo.musicxml`; a `.mxl` built by zipping it into a MusicXML container;
   `src/lib/__tests__/fixtures/sample.mscz`).
4. **Render/transpose probe** on deployed iPad WebKit with **real Web-SDK client auth** via the
   prod probe hook `window.__c7_auth_for_probes__.signIn(customToken)` (META-003) —
   `probe-render.mjs` + `retest-xml-transpose.mjs`.
5. **Cleanup** — all fixtures deleted **by id** (`cleanup.mjs`); 0 residue, library back to 438.
   Never used `cleanup_all_test_data` (`[[feedback_sandbox_test_isolation]]`).

**Probe evidence (render-out.json):**

| format | render (cold) | viewer | transpose (notation+chords) |
|---|---|---|---|
| `.musicxml` (uncompressed) | 3250 ms | OSMD SVG (vf=28) ✅ | ✅ C→D, +2 sharps (see `retest-xml-second.png`) |
| `.mxl` (compressed) | 2369 ms | OSMD SVG (vf=28) ✅ | ✅ |
| `.mscz` → MusicXML | 2504 ms | OSMD SVG (vf=47) ✅ | ✅ "Test Score", chords C/Gm→D/Am (`render-mscz-transposed.png`) |

> ⚠️ Note: a first naïve probe reported xml transpose "unchanged" — that was the **slow
> re-render** (screenshot taken <1s after a double-tap). With ≥1.5s settle it transposes
> correctly. Reproduced 3× in `retest-xml-transpose.mjs`.

---

## Findings (prioritized)

### 🔴 HIGH — Intake mis-types MusicXML → mis-routes to PDF viewer (the octet-stream weak link)

**`import_chart_from_drive`** (`src/lib/mcp/tools/library-upload.ts:547`):
```ts
const mimeType = driveMime || "application/pdf"   // line 547
```
then calls `processChartUpload({ mimeType, originalFileName: driveName, … })`. Depending on what
Google Drive reports as the file's mime, a MusicXML Drive file resolves three ways:

- **`driveMime` empty/missing** → defaults to **`application/pdf`**. In `processChartUpload` the
  contentType derivation checks the pdf branch *before* the filename-xml rescue
  (`library-upload.ts:334-338`), so `application/pdf` wins even for a file named `Song.mxl`.
  → `library_index.mimeType = "application/pdf"` → `queue-utils` / `PDFOverlay` route to the **PDF
  viewer** → **"Failed to render PDF."**
- **`driveMime = "application/octet-stream"`** → `processChartUpload` **rejects** it outright
  (G-7 rule, `library-upload.ts:203-211`: "mimeType must be specific"). Import fails.
- **`driveMime` is a real xml type** (`application/xml`, `text/xml`, recordare) → normalized to
  `application/xml` → routes correctly. (This is the only happy path.)

**Browser file-picker upload of raw `.mxl/.musicxml`** hits the same G-7 wall: browsers send
`application/octet-stream` (or empty) for these unregistered extensions → `processChartUpload`
rejects. (Daniel's MCP `upload_chart` with an explicit `mimeType` is unaffected — which is exactly
why the audit's correctly-typed uploads rendered fine.)

**Why it isn't biting yet:** 0 active MusicXML rows; Daniel authors via MCP with explicit mimes.
**Why it will:** the moment MusicXML is imported from Drive (the documented `import_chart_from_drive`
flow) or via the in-app picker, it silently mis-routes or fails.

---

### 🔴 HIGH (latent) — Bonded track carries no durable routing signal; relies on a backstop

A track bonded to a setlist carries **no `mimeType` and no file extension** (`fileId =
upload-{uuid}`, `fileName = bare title`). Routing to the MusicXML viewer survives only via:
1. `addTrackToSetlist` threading `readLibraryMimeType()` → `track.mimeType` (shipped in the
   scraped-text fix `41b75f70a`, 2026-05-20) — works for **new** MCP bonds; **but**
2. tracks bonded **before** that fix have no `mimeType` and fall back to the **`PDFOverlay`
   `libMimeType` backstop** (`PDFOverlay.tsx:153-157`, `isMusicXml = … || libMimeType?.includes('xml')`),
   which reads `useLibraryStore.allFiles` — i.e. it only works **if the library store is hydrated**
   in the viewing context.

So a MusicXML chart bonded pre-fix, or viewed in any context where `useLibraryStore` isn't
populated, mis-routes to PDF. (`get_setlist` does not project `track.mimeType`, so this is invisible
from the MCP read surface — verify from Firestore, not the tool.)

---

### ⚠️ MED — Transpose re-render is slow / janky (the "performs smoothly?" question)

`SmartScoreViewer` transposes by setting `osmd.Sheet.Transpose` then calling `updateGraphic()` +
`render()` **synchronously** on the main thread (`SmartScoreViewer.tsx:126-141`). Measured ~1–1.6s
per step on iPad WebKit; the component comment notes OSMD "does not support true background Web
Workers because it requires synchronous `SVGElement.getBBox()`." A fast double-tap on a cold chart
renders a stale frame (caught + reproduced in the probe). For a vocalist nudging the key live
mid-service, every semitone tap is a ~1s freeze.

---

### ⚠️ MED — Score does not fill the iPad screen (render quality / legibility)

On 820×1180 portrait, a short score paints in the top ~25% of the viewport inside a
`min-h-[400px]` white Card; the lower ~65% is blank indigo (`render-mscz-initial.png`). Default
zoom is 100% and there is no fit-to-width/height scaling, so a single-system chart reads small.
Performers will want it larger by default. (Zoom +/- exists but is a manual per-chart chore.)

---

### ⚠️ MED — Capo "Play As" + detected-key panel unavailable for MusicXML

The transpose popover's "Detected Key", "Play As (with capo)" guitar-shape grid, and chord-count
are all driven by the **AI chord-scan** (`aiState.pageData`) used for PDF/text charts. MusicXML is
never scanned, so the popover shows **"WAITING FOR SCAN…"** indefinitely and the capo helper — a
real feature for the guitarists — is missing. The native key + harmony **are** in the MusicXML and
could feed these panels directly (OSMD exposes the key; harmony elements are in the file).

---

### ℹ️ LOW — OSMD draws its own title ("Untitled Score" / "Test Score")

`drawTitle: true` (`SmartScoreViewer.tsx:64`) renders the MusicXML's own movement/work title at the
top of the score, separate from (and sometimes contradicting) the track title shown in the toolbar
(`demo.musicxml` has none → "Untitled Score"). Minor visual redundancy/inconsistency.

### ℹ️ LOW — `.mxl` stored under `application/xml` with the compressed bytes intact

A `.mxl` upload is stored with `library_index.mimeType = "application/xml"` but the **bytes remain
the compressed zip**. Rendering is fine because `SmartScoreViewer` content-sniffs (`<?xml` prefix →
text; else Blob → OSMD zip loader, `SmartScoreViewer.tsx:99-105`). Noting only because the
mime label and the byte format disagree — anything that trusts the label to `TextDecoder` the bytes
would choke.

---

## What works well (keep)

- **Content-sniffing load** in `SmartScoreViewer` (text vs zip) makes the *renderer* robust to mime
  mislabeling once routing reaches it — good defensive design.
- **OSMD/VexFlow output quality** is genuinely good on iPad: crisp notation, chord symbols, clefs,
  time/key signatures, multi-measure layout.
- **Transpose correctness** (notation + harmony) via OSMD `TransposeCalculator` — the hard part is
  already right.
- **`.mscz` XSLT conversion** (`musescore-converter.ts` + SaxonJS) produces clean MusicXML.

---

## Phase-2 fix plan (proposed — HOLD for Daniel review)

Ordered by value-for-effort. None shipped in this lane.

1. **[HIGH] Normalize MusicXML/MuseScore mime at every intake** so routing never depends on what
   Drive/the browser guessed.
   - In `import_chart_from_drive` (`library-upload.ts`), before `processChartUpload`: when
     `driveMime` is empty or `application/octet-stream`, derive the effective mime from the Drive
     file's **extension** (`.mxl/.musicxml/.xml` → `application/vnd.recordare.musicxml+xml`;
     `.mscz/.mscx` → `application/x-musescore`). Do **not** fall back to `application/pdf`.
   - In `processChartUpload` contentType derivation (`library-upload.ts:328-339`): let the
     `.xml/.musicxml/.mxl` (and `.mscz/.mscx`) **filename** check take precedence over both the
     octet-stream G-7 rejection and the `application/pdf` branch, so a music file is never typed
     as PDF and never rejected for a generic mime.
   - Net target: every MusicXML/MuseScore intake lands as `application/xml` (or the recordare type)
     in `library_index` → the existing `queue-utils` + `PDFOverlay` routing already handles it.
   - **Verify:** Drive-import a `.mxl` whose `driveMime` is octet-stream/empty → `library_index`
     mime is xml, Perform routes to SmartScoreViewer (this audit could not repro the Drive path —
     no live Drive MusicXML — so a Phase-2 deployed REPRO is required).

2. **[HIGH-latent] Make track routing self-sufficient.** Confirm `addTrackToSetlist`/`swap_chart`
   durably stamp `track.mimeType` for MusicXML (they do post-`41b75f70a`); add `track.mimeType` to
   the `get_setlist` projection for observability; consider a one-shot backfill that stamps
   `mimeType` on pre-fix MusicXML tracks so render never depends on `useLibraryStore` hydration.

3. **[MED] De-jank transpose.** Debounce rapid taps; show the "Rendering Score…" overlay during the
   transpose re-render; consider rendering at the new transposition off-screen then swapping. Goal:
   no stale frame, clear "working" feedback, ≤ perceptible lag for a single step.

4. **[MED] Fit-to-screen by default.** Compute an initial OSMD `Zoom` (or container scale) so a
   single-system score fills the iPad width/height instead of painting tiny at the top. Keep manual
   zoom for override.

5. **[MED] Feed the transpose panel from MusicXML natively.** Read the score's key (OSMD exposes it)
   to populate "Detected Key" + the capo "Play As" grid for MusicXML, instead of leaving it
   "WAITING FOR SCAN…". (Harmony/lyrics already render; this is the helper panel only.)

6. **[LOW] Decide on `drawTitle`.** Either suppress OSMD's own title in Perform (the toolbar already
   shows the track title) or reconcile the two.

7. **[strategic] Seed a real renderable MusicXML chart.** There is currently nothing to dogfood
   (3 byteless `.mxl` orphans). Import or author one genuine CRC chart as MusicXML to validate the
   end-to-end weekly flow and catch regressions.

---

## Probe limitations / honesty notes

- The Drive mis-route (Finding 1, octet-stream/empty path) is **static-confirmed only** — there is
  no live Drive-hosted MusicXML to repro against, and the audit's `upload_chart` injects use an
  explicit correct mime (so they render). A Phase-2 fix must include a deployed Drive-import REPRO.
- The **setlist Perform view** ("tap a track → PDFOverlay") could not be exercised end-to-end: the
  test setlist was root-owned but viewed as a test `band_leader`, and it rendered "0 songs" (a
  cross-user data-scoping artifact of the test setup, **not** a MusicXML finding). Per-chart render
  was proven via the equivalent `/perform/[fileId]` route, which mounts the same
  `PDFOverlay → SmartScoreViewer` stack.
- Sample content was a tiny 3-measure demo + the repo's `sample.mscz`; render-quality findings about
  multi-page scroll/large scores are extrapolated, not measured on a full-length chart.
