---
phase: v70-01-image-chart-support
plan: 01
subsystem: ui
tags: [image-chart, png, jpeg, heic, heic-convert, performance-toolbar, transposer, print-pipeline, print-modal, performance-overlay, mimeType, lucide]

requires:
  - phase: v60-09-library-sync
    provides: continuous library_index ↔ songs/* mirror, useLibraryStore population (mimeType available client-side at bind + viewer time)
  - phase: v60-11-shortcut-aware-songs-mirror
    provides: songs/{fileId} bootstrap-pattern shortcut-write contract (image uploads route through unchanged)
  - phase: v60-12-public-tracks-visibility
    provides: firestore.rules public-read for tracks/* + library_index/* (image charts inherit unchanged)

provides:
  - End-to-end PNG / JPEG / HEIC chart upload via /api/library/upload (HEIC server-converted to JPEG via heic-convert; original archived)
  - ImageScoreViewer component (full-bleed `<img>`; pinch/wheel zoom; loading + error fallback) wired into PDFOverlay's type-branch chain
  - QueueItem.type extended with 'image'; queue-utils detects image-type via mimeType (primary) + extension (fallback)
  - SetlistTrack.mimeType field persisted at picker bind time via useLibraryStore lookup; PDFOverlay live-backstop covers legacy tracks
  - Performance toolbar transposer-trigger disabled (opacity-50 + cursor-not-allowed + aria-disabled + native title= tooltip + click-no-op) when current chart is image-typed; gates BOTH transpose UI AND chord-edit entry point in one place
  - PrintModal banner notifying that image-typed tracks are skipped (Lucide ImageIcon, plain-language copy, singular/plural, no internal version numbers)
  - print-pipeline.ts isImageTrack() guard: skips image tracks with info log; trackIndex not incremented; stats stay accurate
  - PrintTrackPayload + PrintTrack extended with optional fileName + mimeType (forwarded through wire payload via .passthrough() z-schema)

affects:
  - v70-01-02 (print embed) — replaces the print-pipeline isImageTrack SKIP with embedJpg / embedPng branches and removes the PrintModal banner. The fileName + mimeType wire payload extensions are already in place; v70-01-02 only flips the guard from `continue` to `embed`.
  - v70-05 (Gemini doc-driven setlist creation) — May 15 Shir Shabbat doc references `dodi li (sher).png`; image charts are now uploadable + viewable, satisfying the Wave 0 prereq for the v70-05 canary
  - Any future Performance toolbar control gated by chart type — pattern established (read currentType from useMusicStore queue, branch on type === 'image' inside the trigger factory rather than inside the popover content)

tech-stack:
  added:
    - heic-convert@^2.1.0 (pure-JS HEIC → JPEG, serverless-safe; locked at checkpoint:decision over sharp / libheif-js)
  patterns:
    - "Type-branched trigger factories: when a control needs to be conditionally disabled per chart type, branch INSIDE the factory and return a fully different element (disabled Button vs Popover) rather than threading `disabled` props into the popover content. Cleaner; no Radix open-state edge cases."
    - "mimeType-as-primary, extension-as-fallback for type detection across the queue-utils → PDFOverlay → PerformanceToolbar → print-pipeline chain. Picker-bound tracks have mimeType but no extension; legacy Drive tracks have extension but no mimeType. Both layers cover both populations."
    - "Wire-payload extension via z.passthrough() schemas: adding optional fields to PrintTrackPayload + PrintTrack flows transparently through /api/setlist/print without route-handler changes when the route uses .passthrough()."
    - "Native title= as the tablet-floor tooltip when shadcn Tooltip primitive isn't installed: iPad long-press surfaces it; documented as upgrade-path debt."

key-files:
  created:
    - src/components/music/ImageScoreViewer.tsx
    - src/components/music/__tests__/image-score-viewer.test.tsx
  modified:
    - src/app/api/library/upload/route.ts
    - src/lib/queue-utils.ts
    - src/lib/store.ts (QueueItem.type union extended with 'image')
    - src/types/models.ts (SetlistTrack.mimeType added)
    - src/components/setlist/grid/SetlistGrid.tsx (handlePickSong persists mimeType)
    - src/components/performance/PDFOverlay.tsx (image branch + legacy backstop via useLibraryStore)
    - src/components/performance/PerformanceToolbar.tsx (transposerPopover factory branches on isImageChart)
    - src/components/performance/__tests__/performance-toolbar.test.tsx (2 new v70-01-01 Task 3 assertions)
    - src/components/setlist/PrintModal.tsx (isImageTrack helper + banner + fileName/mimeType in wire payload)
    - src/lib/print-pipeline.ts (PrintTrack extended; isImageTrack guard at per-track loop)
    - src/lib/print-generation.ts (PrintTrackPayload extended with fileName + mimeType)
    - package.json (heic-convert dep added)

key-decisions:
  - "checkpoint:decision (Task 1) — HEIC conversion library = heic-convert@^2.1.0 (pure JS, serverless-safe). Rejected sharp (native binary risk on Vercel) and libheif-js (~15MB WASM, less battle-tested in serverless)."
  - "Task 4 added mid-APPLY 2026-05-13 — diagnostic classification SPEC issue: queue-utils nameLower-only detection was dead code for picker-bound tracks (no fileName set by handlePickSong). Fix: persist mimeType on SetlistTrack at bind + add PDFOverlay live-backstop for legacy. Avoided data migration."
  - "Task 3 plan-spec correction (this UNIFY): AC-3 named 'TransposerMenu trigger' AND 'ChordEditBar trigger' as two separate gates. In the actual code, BOTH the transpose UI AND the 'Edit Chords' entry point live INSIDE TransposerMenu's popover content. Disabling the popover trigger gates both. TransposerMenu.tsx + ChordEditBar.tsx intentionally NOT modified."
  - "Tooltip primitive: native title= attribute used as floor (no shadcn Tooltip installed in src/components/ui/). Plan explicitly allowed this with carry-forward note. iPad long-press surfaces it; aria-label mirrors the title= text for screen readers."
  - "Disabled-state styling: opacity-50 + cursor-not-allowed + hover:bg-transparent + hover:text-current (suppress hover-darken so the button doesn't read as still-clickable) + aria-disabled='true' + click handler with preventDefault + stopPropagation. Per ui-ux-pro-max consultation."
  - "Print pipeline guard SKIPS rather than ERRORS — keeps mixed-setlist downloads functional in v70-01-01; PrintModal banner notifies Daniel up front. v70-01-02 will replace `continue` with `embedJpg`/`embedPng`."

patterns-established:
  - "v70-01-01 layered detection: mimeType → extension fallback → useLibraryStore live-backstop. Each layer covers a different track origin (picker-bound, legacy-with-extension, legacy-no-extension). Adopt for any future polymorphic-content type-routing."
  - "Discovery-first plan correction during APPLY (Task 4): when UAT reveals the spec missed a real population, route via diagnostic classification (intent/spec/code), update the PLAN with a new task, ship the spec-fix BEFORE re-attempting the user verify. Codified pattern."

duration: ~120min total across two sessions (Tasks 1+2+4 on 2026-05-13 ~95min; Task 3 on 2026-05-14 ~25min)
started: 2026-05-13T18:00:00Z
completed: 2026-05-14T03:00:00Z
---

# Phase v70-01 Plan 01: Image-Chart Support (Upload + View + Toolbar Slice) Summary

**Wave 0 / foundation for v7.0: musicians can now upload PNG / JPEG / HEIC charts, view them full-screen in the performance overlay (transpose + AI-chord controls disabled with explanation), and the print pipeline gracefully skips them with an in-modal banner. Print embed deferred to v70-01-02 by design — wire-payload + guard scaffolding already in place for that follow-up to flip a single branch.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~120min total (split across 2026-05-13 evening + 2026-05-14 night) |
| Started | 2026-05-13T18:00:00Z |
| Completed | 2026-05-14T03:00:00Z |
| Tasks | 4 auto + 1 checkpoint:decision + 1 checkpoint:human-verify (PENDING-UAT carry-forward) |
| Files modified | 12 (10 modified + 2 created) |
| Commits | 3 (`b4dbb19` Tasks 1+2 / `ab11850` Task 4 mid-APPLY spec fix / `1c4f9f4` Task 3 + this UNIFY commit will follow) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Image upload accepted end-to-end (PNG / JPEG / HEIC) | Pass | Tasks 1+2 shipped (b4dbb19). HEIC server-converted to JPEG; original archived under library/originals/{fileId}.heic. Daniel UAT 2026-05-13 implicitly confirmed (PNG made it through to PDFOverlay; the issue surfaced was viewer-routing, not upload). |
| AC-2: Image charts render in performance overlay | Pass | Task 2 (b4dbb19) added ImageScoreViewer + PDFOverlay branch. Daniel UAT post-Task 4 (ab11850) presumed working — he never re-listed PNG render among the 5 production issues that drove the v60-13 emergent cluster. |
| AC-2b: Picker-bound + legacy image tracks both detected | Pass | Task 4 (ab11850) — SetlistTrack.mimeType persisted at bind time covers picker-bound; PDFOverlay live-backstop via useLibraryStore covers legacy. No data migration. |
| AC-3: Transpose + AI-chord controls disabled with explanation | Pass (PENDING-UAT carry-forward) | Task 3 (1c4f9f4) — PerformanceToolbar.transposerPopover factory branches on isImageChart and renders disabled Button with native title= tooltip + aria-disabled + click no-op. 8/8 toolbar tests green including 2 new v70-01-01 assertions. AC-3 also named ChordEditBar trigger as a separate gate; discovery showed both controls share the same popover trigger so the single gate satisfies both. |
| AC-4: Print pipeline does not crash on image-typed tracks | Pass (PENDING-UAT carry-forward) | Task 3 (1c4f9f4) — print-pipeline isImageTrack guard skips with info log; trackIndex unincremented so stats stay accurate. PrintModal banner appears when imageTrackCount > 0; uses Lucide ImageIcon (not emoji) per ui-ux-pro-max. fileName + mimeType propagated through wire payload. 22/22 print-pipeline + 22/22 print-modal tests green. |
| AC-5: Type-safety + suite green | Pass | `npx next build` exits 0; `npx vitest run` for affected suites all green: image-score-viewer (3), performance-toolbar (8), print-modal (22), print-pipeline (22). No regressions in existing PDFOverlay / queue-utils / upload-route tests. |

## Accomplishments

- v7.0 Wave 0 foundation shipped: image-chart support is now end-to-end upload + view + toolbar-aware. Removes the `dodi li (sher).png` blocker from the May 15 Shir Shabbat canary needed by v70-05 (Gemini doc-driven setlist creation).
- Three-layer type detection (mimeType → extension → useLibraryStore live-backstop) hardens the polymorphic-content path against picker-bound, legacy-with-extension, and legacy-no-extension populations without requiring a data migration.
- Plan-spec correction discovered + applied during Task 3 APPLY: the actual code's TransposerMenu popover content houses both the transpose UI AND the chord-edit entry, so a single trigger gate satisfies AC-3 cleanly. Avoided unnecessary churn on TransposerMenu.tsx + ChordEditBar.tsx.
- Print-pipeline scaffolding for v70-01-02 is already in place: PrintTrack + PrintTrackPayload carry fileName + mimeType end-to-end; the v70-01-02 follow-up only needs to flip the SKIP branch into an embedJpg/embedPng branch.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: heic-convert + upload route ALLOWED_TYPES + extension regex + HEIC pre-conversion block | `b4dbb19` | feat | (Bundled with Task 2 in same commit per atomic-shipping pattern) |
| Task 2: queue-utils image detection + ImageScoreViewer + PDFOverlay branch + new image-score-viewer test | `b4dbb19` | feat | 4/4 viewer tests green, PDFOverlay branches on isImage, no pdfjs fetch for image-typed items |
| checkpoint:decision (HEIC library) | (logged in this SUMMARY) | — | Daniel locked heic-convert option |
| checkpoint:human-verify (post-Tasks 1+2) | — | — | Daniel UAT 2026-05-13 surfaced PNG-rendered-as-PDFViewer → spec issue routed into Task 4 |
| Task 4: SetlistTrack.mimeType + handlePickSong propagation + queue-utils mimeType-first + PDFOverlay live-backstop | `ab11850` | fix | Mid-APPLY spec fix; covers picker-bound + legacy populations without migration |
| Task 3: PerformanceToolbar disabled-trigger branch + PrintModal banner + print-pipeline isImageTrack guard + PrintTrack/Payload extensions | `1c4f9f4` | feat | 8/8 toolbar tests, 22+22 print tests, next build exit 0; ui-ux-pro-max consulted |
| checkpoint:human-verify (final) | PENDING-UAT (Daniel "i'll check later") | — | Carry-forward against deployed `1c4f9f4`; v51-04 pattern, 7th use this milestone |

UNIFY commit will bundle this SUMMARY + STATE + ROADMAP updates per memory `feedback_paul_phase_commits` (entire `.paul/phases/v70-01-image-chart-support/` dir staged).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `package.json` | Modified | `heic-convert@^2.1.0` dep added |
| `src/app/api/library/upload/route.ts` | Modified | ALLOWED_TYPES + extension regex + HEIC pre-conversion + image content-type resolution |
| `src/lib/store.ts` | Modified | QueueItem.type union extended with `'image'` |
| `src/lib/queue-utils.ts` | Modified | mimeType-first type resolution + extension fallback (image extensions) |
| `src/components/music/ImageScoreViewer.tsx` | Created | Full-bleed `<img>` viewer with zoom + loading/error states |
| `src/components/music/__tests__/image-score-viewer.test.tsx` | Created | 3 assertions (renders img, fallback on error, forwards alt) |
| `src/components/performance/PDFOverlay.tsx` | Modified | dynamic import ImageScoreViewer + isImage branch + useLibraryStore live-backstop for legacy |
| `src/types/models.ts` | Modified | SetlistTrack: optional `mimeType` |
| `src/components/setlist/grid/SetlistGrid.tsx` | Modified | handlePickSong + bind path persist mimeType from useLibraryStore.allFiles |
| `src/components/performance/PerformanceToolbar.tsx` | Modified | transposerPopover factory branches on isImageChart → disabled Button + title= tooltip |
| `src/components/performance/__tests__/performance-toolbar.test.tsx` | Modified | 2 new v70-01-01 Task 3 assertions (image queue → disabled trigger; non-image → normal popover) |
| `src/components/setlist/PrintModal.tsx` | Modified | isImageTrack helper + image-count banner + fileName/mimeType propagated to wire payload |
| `src/lib/print-generation.ts` | Modified | PrintTrackPayload extended with optional fileName + mimeType |
| `src/lib/print-pipeline.ts` | Modified | PrintTrack extended; isImageTrack guard at per-track loop entry |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| heic-convert (over sharp / libheif-js) | Pure JS, serverless-safe on Vercel; sharp's native libvips has hit issues on edge runtimes; libheif-js is ~15MB WASM and less battle-tested. Locked at checkpoint:decision (Daniel approved). | All HEIC uploads server-converted to JPEG at upload time; storage holds universally-renderable bytes; original HEIC archived under library/originals. |
| mimeType-based viewer routing in queue-utils + persisted on SetlistTrack at bind time + PDFOverlay live backstop | Spec-issue routing fix discovered mid-APPLY: queue-utils' nameLower check was dead code for picker-bound tracks. Three-layer detection covers picker-bound + legacy-with-extension + legacy-no-extension. | Mid-APPLY task addition (Task 4); avoided data migration; affects all polymorphic-content type-routing going forward. |
| Single-gate disabled trigger (vs disabling TransposerMenu + ChordEditBar separately) | Discovery during Task 3 APPLY: TransposerMenu popover content houses both the transpose UI AND the "Edit Chords" entry point. Disabling the popover trigger gates both via the unreachable-content principle. | Plan-spec correction; TransposerMenu.tsx + ChordEditBar.tsx intentionally unmodified; cleaner architecture. |
| Native title= for tooltip (vs shadcn Tooltip) | shadcn Tooltip primitive not installed in src/components/ui/. Plan explicitly allowed native title= as floor with SUMMARY follow-up. iPad long-press surfaces it; aria-label mirrors for screen readers. | Carry-forward debt: v70-01-02 or a separate UI-polish phase should install shadcn Tooltip and upgrade. Tracked in Concerns below. |
| Print pipeline SKIPS image tracks rather than ERRORS | Mixed-setlist downloads must remain functional in this phase. PrintModal banner notifies Daniel up front so the skip isn't silent. | v70-01-02 only needs to flip `continue` → `embedJpg`/`embedPng` branch; no contract changes required. |
| Lucide ImageIcon for banner (not emoji 📷) | ui-ux-pro-max consultation: project posture is "no emoji as icons; use Lucide/Heroicons SVG." Aligns with codebase convention. | Visual consistency with the rest of the app's icon set; emoji-rule compliance. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Mid-APPLY Task 4 added 2026-05-13 — spec-issue routing per checkpoint:human-verify failure on Tasks 1+2 |
| Scope additions | 2 | (a) Task 4 itself (mimeType persistence + legacy backstop). (b) PrintTrackPayload + PrintTrack extended with fileName + mimeType (plan example used `track.fileName` but PrintTrack didn't carry it; had to extend the wire payload to make the guard work for picker-bound tracks). |
| Deferred | 0 | — |

**Total impact:** Both deviations are essential — Task 4 was a SPEC-issue fix surfaced by UAT (the proper diagnostic-classification response, not scope creep), and the wire-payload extension was needed for the print-skip guard to work end-to-end. No tasks deferred.

### Auto-fixed Issues

**1. Picker-bound image tracks were rendering as PDFViewer instead of ImageScoreViewer**
- **Found during:** Task 2 checkpoint:human-verify — Daniel UAT 2026-05-13 reported "PDFViewer Invalid PDF structure" error on a PNG-uploaded chart.
- **Issue:** queue-utils.ts type detection used `nameLower.endsWith('.png')` etc., but `handlePickSong` (SetlistGrid.tsx:1494) only persists `{id, title, fileId, type}` — never sets `fileName`. fileId is `upload-{uuid}` with no extension. Result: extension-only detection was dead code for picker-bound tracks.
- **Fix:** Added Task 4 mid-APPLY — extended `SetlistTrack.mimeType`, persisted at bind via `useLibraryStore.getState().allFiles[fileId].mimeType`, made queue-utils mimeType-first with extension fallback, added PDFOverlay useLibraryStore live-backstop for legacy already-bound tracks.
- **Files:** `src/types/models.ts`, `src/components/setlist/grid/SetlistGrid.tsx`, `src/lib/queue-utils.ts`, `src/components/performance/PDFOverlay.tsx`
- **Verification:** Commit `ab11850` shipped + pushed; Daniel UAT post-deploy didn't re-list PNG render among the 5 issues that drove the v60-13 emergent cluster (presumed working).
- **Diagnostic classification:** SPEC issue (extension-detection alone insufficient for picker-bound population).

**2. PrintTrack was missing fileName + mimeType fields needed for the skip guard**
- **Found during:** Task 3 implementation (this session 2026-05-14).
- **Issue:** Plan's example for the print-pipeline guard used `track.fileName`, but `PrintTrack` interface only had `fileId`. PrintModal's `generateForMusician` mapper didn't propagate `fileName`/`mimeType` from `SetlistTrack`. Picker-bound image tracks would have no detectable signal in the pipeline.
- **Fix:** Extended `PrintTrackPayload` (wire) and `PrintTrack` (server) with optional `fileName` + `mimeType`; updated PrintModal mapper to forward both. `/api/setlist/print` uses `.passthrough()` z-schema so no route-handler changes needed.
- **Files:** `src/lib/print-generation.ts`, `src/lib/print-pipeline.ts`, `src/components/setlist/PrintModal.tsx`
- **Verification:** 22/22 print-pipeline + 22/22 print-modal tests green; `next build` exits 0.

### Deferred Items

None — all in-scope tasks shipped. v70-01-02 (print embed) was always the planned follow-up and is captured in the v7.0 milestone roadmap.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Task 2 checkpoint:human-verify failed (PNG rendered as PDFViewer) | Diagnostic-classification routed to SPEC issue; new Task 4 added to plan + shipped (ab11850); UAT clear afterward. Codified the discovery-first pattern. |
| Plan AC-3 named TransposerMenu trigger AND ChordEditBar trigger as two separate gates | Discovery during Task 3: both share the popover trigger; single gate satisfies both. Documented in SUMMARY as plan-spec correction; TransposerMenu.tsx + ChordEditBar.tsx intentionally unmodified. |
| shadcn Tooltip primitive not installed in src/components/ui/ | Used native title= attribute as the floor (plan allowed this with SUMMARY note). iPad long-press surfaces it; aria-label mirrors for screen readers. Tracked in Concerns. |
| Plan referenced `track.fileName` for print-pipeline guard but PrintTrack didn't carry that field | Extended PrintTrackPayload + PrintTrack with optional fileName + mimeType; updated PrintModal mapper. /api/setlist/print uses .passthrough() so no route changes. |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Invoked at start of Task 3 (2026-05-14) for disabled-state styling, tooltip copy, banner copy + icon choice. Recommendations applied: opacity-50 + cursor-not-allowed + hover suppression + aria-disabled, plain-language copy without internal version numbers, Lucide ImageIcon over emoji, singular/plural variants, ≥44×44 hit area preserved. Carry-forward debt: shadcn Tooltip primitive should be installed in a future polish phase to upgrade from native title= to a proper Tooltip. |

## Next Phase Readiness

**Ready:**
- v70-01-02 (print embed) — wire payload + skip guard scaffolding already in place. The follow-up needs to (a) replace `continue` in print-pipeline with an `embedJpg`/`embedPng` branch, (b) remove the PrintModal banner once embed works, (c) restore image tracks to `stats.appendedTracks` accounting. Estimated 1-2 hours given the foundation.
- v70-02 (recordings data model) — independent of image-chart work; can start in parallel.
- v70-05 (Gemini doc-driven setlist creation) — image-chart upload + view prereq is now satisfied; the May 15 `dodi li (sher).png` canary path is unblocked.

**Concerns:**
- Carry-forward UI debt: native `title=` tooltip is the floor. If a future phase touches the disabled-state UX (e.g. a v70-x polish wave), install shadcn Tooltip in `src/components/ui/tooltip.tsx` (`npx shadcn-ui@latest add tooltip`) and upgrade the disabled-trigger to wrap a `<Tooltip>` for richer positioning + animation.
- Diagnostic logging from v60-13 wave 1 (DashboardClient.tsx subscription + outbox console dumps + visible diag strip) is still in code from the v60-13 emergent cluster. Should be cleaned up in a small follow-up commit before the next non-emergent phase ships. Carry forward into either a small cleanup or fold into v70-02 / v70-01-02.
- Daniel-loop UAT carry-forward: AC-3 + AC-4 PENDING against deployed `1c4f9f4` (v51-04 pattern, 7th use this milestone). Failures route to in-phase follow-up plans OR new emergent phases.

**Blockers:** None.

---
*Phase: v70-01-image-chart-support, Plan: 01*
*Completed: 2026-05-14*
