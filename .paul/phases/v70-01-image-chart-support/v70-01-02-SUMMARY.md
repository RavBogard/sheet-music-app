---
phase: v70-01-image-chart-support
plan: 02
subsystem: api
tags: [image-chart, png, jpeg, print-pipeline, pdf-lib, embedJpg, embedPng, print-modal, personal-packet, cache-version]

requires:
  - phase: v70-01-01
    provides: PrintTrack/PrintTrackPayload fileName+mimeType wire fields; isImageTrack() router + SKIP guard; PrintModal deferral banner; SetlistTrack.mimeType
provides:
  - Image-typed tracks (PNG/JPEG) embed into the main print packet via embedImageTrack() — letter-size page, 18pt margin, aspect-preserved scaleToFit, centered, no caption
  - /api/setlist/print/personal mapper propagates fileName + mimeType so personal packets embed images (previously silently dropped via the PDF-parse catch)
  - PrintModal image-skip deferral banner + local isImageTrack helper + unused ImageIcon import removed
  - computeContentHash cacheVersion bumped 2 → 3 — stale skip-era cached PDFs no longer serve
  - Graceful degradation: a corrupt/missing/unsupported image returns false (logged warn), the rest of the packet still prints
affects:
  - v70-05 (Gemini doc-driven setlist creation) — May 15 `dodi li (sher).png` canary is now fully unblocked: image charts upload, view, AND print
  - Any future print-pipeline work — embedImageTrack establishes the per-track image-embed pattern (try/catch resilience, contentType→mimeType→extension type resolution)

tech-stack:
  added: []
  patterns:
    - "embedImageTrack resilience: the ENTIRE fetch+decode+embed body is wrapped in one try/catch; embedJpg/embedPng decode throws return false (logged) rather than propagating — one bad image never kills the packet. Mirrors the PDF merge path's per-track try/catch."
    - "Image type resolution: contentType (from fetchFileById) → track.mimeType → fileName/fileId extension, lowercased into a single `signal` string matched with regex. Covers picker-bound (mimeType-bearing) and legacy (extension-bearing) tracks uniformly."
    - "cacheVersion as a rendering-logic correctness gate: any change to PDF rendering output bumps the constant in computeContentHash so the Storage result-cache cannot serve a stale-shape PDF."

key-files:
  created: []
  modified:
    - src/lib/print-pipeline.ts (embedImageTrack helper; SKIP→embed branch; cacheVersion 2→3)
    - src/lib/print-pipeline.test.ts (+4 tests: PNG+JPEG embed, non-square scaling math, corrupt-image degradation, missing-file skip)
    - src/app/api/setlist/print/personal/route.ts (mapper propagates fileName + mimeType)
    - src/components/setlist/PrintModal.tsx (removed banner IIFE + isImageTrack helper + ImageIcon import)
    - src/components/setlist/__tests__/print-modal.test.tsx (+1 test: banner absent for image-containing setlist)

key-decisions:
  - "Print-page image layout (/ui-ux-pro-max): 18pt margin (not the plan's proposed 36pt) — maximizes chart size for stage reading, consistent with edge-merged PDF chart pages. scaleToFit aspect-preserved + centered, never fill/crop (cropping loses bars/lyrics). No title caption — house style is max-density/no-decoration and the cover page already lists every track's title/key/lead."
  - "Oversized-image guard: NOT added in-helper — /api/library/upload already enforces MAX_FILE_SIZE = 25MB on all uploads including images. That is the documented ceiling; embedImageTrack relies on it (audit must-have #2 resolved via the documented-cap branch)."
  - "Upscaling allowed: scaleToFit will scale a low-resolution source image UP to fill the page — for stage reading, bigger-but-soft beats tiny-but-sharp. Low-res uploads will look soft; accepted, not a bug."

patterns-established:
  - "When replacing a deferred SKIP guard with real behavior, bump any content-hash cacheVersion in the same change — the result cache is keyed on rendering logic, and a stale-shape cached artifact is a silent correctness bug."

duration: ~75min
started: 2026-05-14T08:30:00Z
completed: 2026-05-14T09:00:00Z
---

# Phase v70-01 Plan 02: Image-Chart Print Embed Summary

**Image charts (PNG/JPEG) now embed into print packets — main pipeline + personal-packet route — closing the v70-01 phase: image charts are end-to-end uploadable, viewable, and printable. A corrupt image degrades gracefully; the cacheVersion bump prevents stale skip-era cached PDFs from serving.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~75min |
| Started | 2026-05-14T08:30:00Z |
| Completed | 2026-05-14T09:00:00Z |
| Tasks | 3 auto completed + 1 human-verify (PENDING-UAT carry-forward) |
| Files modified | 5 (0 created) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Image charts embed into the main print packet | Pass | `embedImageTrack` adds a letter-size page per image (18pt margin, aspect-preserved scaleToFit, centered); SKIP guard replaced with embed branch; `appendedTracks` counts PDF + image tracks. Test: PNG + JPEG track → both count toward `appendedTracks`; `fetchFileById` receives the mimeType hint. |
| AC-2: Personal packet route embeds images | Pass | `print/personal/route.ts` mapper now propagates `fileName` + `mimeType`. `next build` confirms `SetlistTrack` carries both and the route compiles. Transposition logic untouched. |
| AC-3: PrintModal deferral banner removed | Pass | Banner IIFE, local `isImageTrack` helper, and unused `ImageIcon` import all removed. Test: banner text absent for an image-containing setlist. No other PrintModal behavior changed. |
| AC-4: Stale skip-era cache does not serve | Pass | `computeContentHash` `cacheVersion` bumped 2 → 3 — a post-plan request produces a different hash, forcing fresh generation with embedded images. |
| AC-5: Type-safety + suite green | Pass | `npx next build` → `✓ Compiled successfully in 13.6s`, no new tsc errors. `print-pipeline.test.ts` 26/26, `print-modal.test.tsx` 23/23. Full suite 1649 passed / 52 failed — 52-failure count matches the documented baseline exactly (v60-12 was 1636/52); zero new regressions, +5 passing tests added. |
| AC-6: Bad image track degrades gracefully (audit-added) | Pass | `embedImageTrack` wraps fetch+decode+embed in one try/catch; `embedJpg`/`embedPng` decode throws return `false` with a structured `logger.warn`. Tests: corrupt PNG (`embedPng` throws) in a mixed request → no throw, PDF + good JPEG still embed, `appendedTracks` = 2, warn logged naming the failed track; separate missing-file case asserts the same. |

## Accomplishments

- **v70-01 phase closed end-to-end.** With v70-01-01 (upload + view + toolbar) and v70-01-02 (print embed), image charts are now a first-class chart type: uploadable, viewable in the performance overlay, and printable in gig packets. The `dodi li (sher).png` blocker for the v70-05 May 15 canary is fully cleared.
- **Enterprise-audit-hardened embed path.** The audit's 3 must-haves shipped: try/catch around `embedJpg`/`embedPng` decode throws, the 25MB upload-cap documented as the size ceiling, and AC-6 graceful degradation backed by a degraded-path test. Failed embeds are observable via structured `logger.warn` — never a silent drop.
- **Single-flip discipline paid off.** v70-01-01's wire-payload scaffolding (`fileName` + `mimeType` on `PrintTrack`/`PrintTrackPayload`) meant the main-pipeline change was genuinely a guard flip + a helper — no contract changes. The only un-scaffolded gap was the personal route's mapper, caught by the plan as Task 2.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3: embedImageTrack + personal-route mapper + PrintModal banner removal + tests | `<feat-commit>` | feat | print-pipeline SKIP→embed branch, cacheVersion 2→3, personal route fileName/mimeType propagation, PrintModal banner/helper/import removal, +5 tests |
| Plan metadata (PLAN + AUDIT + SUMMARY + STATE + ROADMAP + PROJECT) | `<docs-commit>` | docs | v70-01-02 loop close + v70-01 phase transition |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/print-pipeline.ts` | Modified | `embedImageTrack()` helper (try/catch resilient, type-resolved, 18pt-margin aspect-fit page); track-loop SKIP guard replaced with embed branch (`trackIndex`/`appendedTracks` incremented); `cacheVersion` 2→3 |
| `src/lib/print-pipeline.test.ts` | Modified | pdf-lib mock extended with `embedJpg`/`embedPng`/`drawImage` + dimension-encoding mock-image factory; +4 tests (PNG+JPEG embed, non-square scaling math, corrupt-image degradation, missing-file skip); `logger.warn` made inspectable |
| `src/app/api/setlist/print/personal/route.ts` | Modified | `tracks.map()` mapper propagates `fileName` + `mimeType` so image tracks are detected + embedded (were silently dropped by the PDF-parse catch) |
| `src/components/setlist/PrintModal.tsx` | Modified | Removed the v70-01-01 image-skip banner IIFE, the local `isImageTrack` helper, and the now-unused `ImageIcon` import |
| `src/components/setlist/__tests__/print-modal.test.tsx` | Modified | +1 test: image-skip banner absent for an image-containing setlist |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| 18pt print-page margin (not the plan's proposed 36pt) | /ui-ux-pro-max: musicians read these on stage — maximize chart size; consistent with edge-merged PDF chart pages | Image pages render large; `embedImageTrack` uses `MARGIN = 18` |
| scaleToFit aspect-preserved + centered, never fill/crop | Cropping a chord/lead sheet loses bars or lyrics — unacceptable | Image always fully visible, centered in the margin box |
| No title caption on image pages | House style is max-density/no-decoration; merged PDF chart pages have no caption; the cover page already lists title/key/lead | Image pages are image-only — consistent with the rest of the packet |
| Oversized-image guard relies on the upload-route 25MB cap (not an in-helper guard) | `/api/library/upload` already enforces `MAX_FILE_SIZE = 25MB` on all uploads incl. images — that IS the documented ceiling | Audit must-have #2 resolved via the documented-cap branch; no redundant guard code |
| Upscaling of low-res images allowed | For stage reading, bigger-but-soft beats tiny-but-sharp | Low-resolution uploads will look soft when scaled up — accepted, documented, not a bug |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** None. Plan executed exactly as written (including all 7 audit-applied upgrades). The `stats.totalTracks` hedge the audit flagged was resolved at plan time, so APPLY had no ambiguity to resolve.

### Auto-fixed Issues

None — plan executed exactly as written.

### Deferred Items

None — all in-scope tasks shipped. Audit-deferred items (partial-failure cache poisoning, explicit revertibility note, main-route maxDuration review) remain deferred per the AUDIT.md rationale; none are blockers.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| pdf-lib mock in `print-pipeline.test.ts` had no `embedJpg`/`embedPng`/`drawImage` | Extended the `vi.mock('pdf-lib')` factory + `vi.hoisted` block with a mock-image factory that encodes intrinsic dims as `IMG:<w>:<h>` (and `IMG:BAD` to force a decode throw) so the non-square scaling math and degraded path are genuinely exercised |
| Pre-existing jsdom "navigation not implemented" noise in `print-modal.test.tsx` | Not a failure — all 23 tests pass; noise originates from an unrelated download test |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Invoked before Task 1 for the print-page image layout. Verdicts applied: 18pt margin (rejected the plan's 36pt proposal), scaleToFit aspect-preserved + centered (never crop), no title caption. All three recorded in Decisions above. |

## Next Phase Readiness

**Ready:**
- v70-01 phase COMPLETE — both plans LOOP CLOSED. Image charts are end-to-end (upload + view + toolbar-aware + print embed).
- v70-02 (recordings data model) — Wave 1 foundation, independent of image-chart work; ready to plan.
- v70-05 (Gemini doc-driven setlist creation) — image-chart prereq fully satisfied; the May 15 `dodi li (sher).png` canary path is unblocked end-to-end.

**Concerns:**
- **EXIF orientation (carry-forward):** `embedJpg` draws raw pixels and ignores EXIF orientation tags — a phone photo (incl. the HEIC→JPEG path from v70-01-01) may embed rotated. Flagged in `embedImageTrack`'s doc comment. If Daniel reports rotated images at UAT, it routes to a follow-up plan.
- **Low-res upscaling softness:** small source images scale up to fill the page and will look soft. Accepted trade-off for stage legibility.
- **shadcn Tooltip debt (inherited from v70-01-01):** still open — native `title=` is the floor on the transposer-disabled tooltip. Not touched by this plan.
- **v60-13 diagnostic logging** in `DashboardClient.tsx` still in code — carry-forward cleanup, not addressed here.

**Blockers:** None.

**PENDING-UAT carry-forward (v51-04 pattern, 8th use this milestone):** AC-1/AC-2/AC-3 are code-verified + test-green but the human-verify checkpoint (Daniel downloads a mixed PDF+image packet, confirms image pages render right-side-up + aspect-correct, banner gone, personal packet embeds too) is carried forward against the deployed commit over the worship cycle.

---
*Phase: v70-01-image-chart-support, Plan: 02*
*Completed: 2026-05-14*
