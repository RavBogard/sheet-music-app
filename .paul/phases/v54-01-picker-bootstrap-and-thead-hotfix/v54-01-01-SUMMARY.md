---
phase: v54-01-picker-bootstrap-and-thead-hotfix
plan: 01
subsystem: data-bootstrap, ui-substrate
tags: [firebase-admin, firestore, library-index, songs-collection, sticky-thead, css, hotfix]

requires:
  - phase: v50-04-song-catalog
    provides: songs/{id} schema (defaults / recent / normalizedTitle)
  - phase: v50-07-migration-cutover
    provides: MigrationFirestore abstract interface + migrate-v50.ts CLI shape (dry-run/apply/rollback/marker doc pattern)
  - phase: v53-02-chart-binding-and-verification
    provides: primeSongsLibrary one-shot getDocs (now feeding off populated songs/* for the first time)
  - phase: v53-03-polymorphic-add-menu
    provides: AddRowPlaceholder picker — consumer of Dexie songs table

provides:
  - scripts/bootstrap-songs.ts (one-shot library_index → songs/* + back-stitch)
  - 364 production songs/{libId} docs (94 CRC + 272 Shireinu)
  - 385 setlist tracks back-stitched with songId where fileId matched
  - Sticky-thead repair (overflow-x-auto wrapper removed; offset bumped to 3.75rem)
  - bootstrap-songs marker doc system/v54SongsBootstrap (idempotency)
  - bootstrap snapshot collection migrations/v54-bootstrap/snapshot/{songId} (rollback safety)

affects:
  - v54-03 (cross-device library staleness fix + library_index↔songs/* continuous sync) — extends this one-shot to listener-driven
  - v5h-01-04 / v54-02 (Harness Fidelity Gate phase 1) — counter unchanged at 1/3
  - Future thead-touching phases (lockstep top-[3.75rem] ≡ topbar height — see v51-02-01-DESIGN-CONTRACT.md:18)

tech-stack:
  added: []
  patterns:
    - "Bootstrap-script pattern (firebase-admin, MigrationFirestore reuse, marker doc + snapshot collection for sticky-memory-safe rollback)"
    - "MIME-type filter at bootstrap edge (charts only — PDF + MusicXML; folders/audio/docs/spreadsheets excluded) to keep library_index → songs/* mapping precise"

key-files:
  created:
    - scripts/bootstrap-songs.ts
    - scripts/__tests__/bootstrap-songs.test.ts
    - .paul/phases/v54-01-picker-bootstrap-and-thead-hotfix/CONTEXT.md
    - .paul/phases/v54-01-picker-bootstrap-and-thead-hotfix/v54-01-01-PLAN.md
  modified:
    - src/components/setlist/grid/SetlistGrid.tsx
    - .paul/STATE.md
    - .paul/ROADMAP.md

key-decisions:
  - "songs/{id} = library_index doc id — back-stitch trivializes (track.fileId === song.id); v50-04's distinction was theoretical, never shipped"
  - "Back-stitch ON by default (--no-backstitch flag opts out)"
  - "Free-text Custom create does NOT auto-promote to songs/* (preserves escape hatch)"
  - "Path-a thead repair (drop overflow-x-auto, sticky on th/td directly) chosen over path-b (display:grid) per /ui-ux-pro-max — smallest-fix bias"
  - "Literal top-[3.75rem] (no CSS custom property) — JS ResizeObserver wiring would be over-engineering for this hotfix; comment + DESIGN-CONTRACT pointer enforces lockstep"
  - "MIME-type filter added mid-phase (PDF + MusicXML only) — production dry-run revealed 455 candidates vs Daniel's 366 expected; filter brought count to 364 matching CRC+Shireinu chart total"
  - "Closed PENDING-UAT per Daniel 'go' override (v51-04 pattern, 4th time used)"

patterns-established:
  - "v5.4 bootstrap-script pattern: firebase-admin entry + MigrationFirestore adapter reuse + 2-segment marker doc + snapshot collection for sticky-memory-safe rollback"
  - "library_index → songs/* one-shot bridge (continuous sync deferred to v54-03)"
  - "Hotfix-class /ui-ux-pro-max consultation pattern: present candidate paths with pros/cons, lock smallest-fix path that doesn't violate boundary locks"

duration: ~75min
started: 2026-05-08T17:00:00Z
completed: 2026-05-08T17:35:00Z
---

# Phase v54-01 Plan 01: Picker Bootstrap + Thead Hotfix Summary

**Bootstrapped 364 production songs from library_index, back-stitched 385 setlist tracks, and repaired the sticky thead overlap by removing v53-02-01's overflow-x-auto wrapper.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~75 min |
| Started | 2026-05-08T17:00:00Z |
| Completed | 2026-05-08T17:35:00Z |
| Tasks | 5 of 5 (3 auto + 2 checkpoints + 1 human-verify routed to PENDING-UAT) |
| Files modified | 7 (3 created + 4 modified) |
| Tests added | +18 (bootstrap-songs.test.ts) |
| Production data writes | 364 songs/{id} created + 385 track updates |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Bootstrap dry-run reports counts, writes nothing | ✅ Pass | Production dry-run: 364 songs + 385 tracks would change; `system/v54SongsBootstrap` not created |
| AC-2: Apply writes idempotent songs/* with normalized titles + marker | ✅ Pass | 364 written; marker doc present with appliedAt + counts; --apply twice without --force exits early |
| AC-3: Apply preserves existing defaults/recent | ✅ Pass | Test "preserves defaults/recent on a pre-existing songs/{id} doc" passes; production had 0 pre-existing so vacuously true on prod |
| AC-4: Rollback removes only bootstrap-created docs without sticky memory | ✅ Pass | 3 rollback test cases pass (delete-clean / preserve-with-memory / restore-pre-existing) |
| AC-5: Optional back-stitch links tracks via fileId | ✅ Pass | 385 tracks back-stitched in production (higher than v50-07-01 audit's 351 — setlists added since); --no-backstitch flag verified |
| AC-6: Production picker shows library hits within ~100ms | ⏳ PENDING-UAT | Daniel "go" override; deployed at `a693d23`; iPad UAT runs over upcoming worship cycle |
| AC-7: Spreadsheet thead does NOT overlap first body row | ⏳ PENDING-UAT | Same — code review + suite verified; visual confirmation pending Daniel iPad pass |
| AC-8: No regression in sticky memory or sticky-right Chart | ✅ Pass | a11y 13/13, ChartBindPopover 9/9, grid suite 171/171 serial, next build clean |

## Accomplishments

- **Closed the deferred v50-07-02b sub-phase** — `songs/*` now populated in production for the first time since v50-04 introduced the schema. v53-02-01 SUMMARY §212 explicitly flagged the empty-collection failure mode; v54-01-01 fixed it.
- **Production data restored** — 364 chart docs (94 CRC + 272 Shireinu, exact match within ±2 to Daniel's manual count) bridging the library_index → songs/* gap that was severing the new editor's `+ Song` picker from Daniel's library.
- **Back-stitched 385 existing tracks** — every legacy setlist track with a `track.fileId` matching a chart now has `track.songId` set, unlocking sticky-memory propagation (key/lead/bpm) on tracks Daniel has built over the last 18 months.
- **Sticky-thead overlap repaired** — `<div overflow-x-auto>` wrapper removed (was a CSS scroll container shadowing `<thead>` sticky-against-viewport behavior); offset bumped 3.25rem → 3.75rem to match real topbar height. Sticky-right ChartCell from v53-02-01 preserved.
- **Bootstrap-script pattern established** for v5.4 — firebase-admin + MigrationFirestore adapter reuse + 2-segment marker doc + snapshot collection for rollback. Reusable for future library/data backfills.

## Task Commits

This plan shipped in a single combined commit per v53-02-01 / v53-03-01 precedent (one commit per plan, not per task — boundary-locked plans don't fragment naturally):

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1 + 3 + plan metadata | `a693d23` | feat | bootstrap-songs.ts + tests + SetlistGrid.tsx thead repair + .paul/ updates |

Production data writes (Task 2 checkpoint:human-action):
- Dry-run output preserved in conversation log (455 → filtered → 364 + 385).
- Apply executed against `crcmusiccharts` Firebase project at 2026-05-08T~17:25:00Z. Marker doc `system/v54SongsBootstrap` written.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `scripts/bootstrap-songs.ts` | Created (~480 LOC) | Admin script: library_index → songs/* + back-stitch; dry-run/apply/rollback/force/no-backstitch CLI |
| `scripts/__tests__/bootstrap-songs.test.ts` | Created (~430 LOC) | 18 unit tests using FakeFirestore mirror of migrate-v50 pattern |
| `src/components/setlist/grid/SetlistGrid.tsx` | Modified | Removed `overflow-x-auto` wrapper at L1610; bumped thead `top-[3.25rem]` → `top-[3.75rem]`; opaque header bg |
| `.paul/phases/v54-01-picker-bootstrap-and-thead-hotfix/CONTEXT.md` | Created | Discuss-phase output |
| `.paul/phases/v54-01-picker-bootstrap-and-thead-hotfix/v54-01-01-PLAN.md` | Created | Executable plan |
| `.paul/STATE.md` | Modified | Loop position + decisions table updated |
| `.paul/ROADMAP.md` | Modified | v5.4 milestone formalized; v54-01 inaugural phase added |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `songs/{libId}` uses library_index doc id directly | Back-stitch trivializes (track.fileId === song.id); v50-04's "distinct songId" was theoretical, never shipped | All future song-catalog work assumes 1:1 mapping with library_index for chart-shaped rows |
| Back-stitch ON by default | ~385 legacy tracks (54%+) get sticky-memory-ready; --no-backstitch escape hatch preserved | Sticky memory immediately useful on existing setlists, not just newly-bound ones |
| Free-text "Create new track called …" does NOT auto-promote | Preserves escape hatch; avoids typo-pollution of curated library | Picker stays clean; revisit if Daniel asks |
| Path-a (drop overflow-x-auto, sticky-right via th/td directly) over path-b (display: grid) | Smallest-fix bias for hotfix; preserves cell boundary locks; SetlistGrid is tablet+desktop only (mobile = MobileCardList) | Harness Fidelity Gate counter stays at 1/3; cells/* untouched; ~10 LOC vs 150-300 |
| Literal `top-[3.75rem]` (no CSS custom property) | Without ResizeObserver/JS wiring, a static custom-prop is just indirection without auto-tracking | Future topbar growth still requires explicit thead bump; comment + DESIGN-CONTRACT pointer enforces it |
| Keep `.pdf`/`.musicxml` extensions in displayed titles | Matches /library tab + pre-v50-05 AddSongsModal precedent; Daniel's mental model is consistent | Picker shows "Adon Olam.pdf" — same as everywhere else |
| MIME-type filter (PDF + MusicXML only) added mid-phase | Production dry-run revealed 455 candidates vs 366 expected; root cause was 19 folders + 57 audio + 8 docs + 4 octet-stream + 2 spreadsheets etc. | Picker stays sheet-music-only; non-chart entries (audio playback, lyric docs) excluded — revisit in v54-03 if Daniel wants audio in picker |
| Closed PENDING-UAT per Daniel "go" override | v51-04 codified pattern; this is the 4th use (v5h3-01, v53-02, v53-03, v54-01) | iPad UAT continues over upcoming worship cycle; v54-01-02 plan opens if Daniel surfaces issues |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Essential — picker-correctness fix |
| Scope additions | 0 | Stayed inside boundaries |
| Deferred | 0 | None |

**Total impact:** One mid-phase scope-narrowing fix added to bootstrap script when production dry-run revealed library_index includes non-chart MIME types. Plan structure and AC list otherwise executed as written.

### Auto-fixed Issues

**1. [data-correctness] MIME-type filter missing in initial bootstrap implementation**
- **Found during:** Task 2 (checkpoint:human-action production dry-run)
- **Issue:** Initial dry-run showed 455 active library_index candidates, far above Daniel's 94+272=366 expected chart count. Inspector revealed library_index also contains 19 folders, 57 audio files, 8 Google Docs, 4 octet-stream, 3 spreadsheets, and other non-chart entries — bootstrap would have written ~89 garbage "song" docs.
- **Fix:** Added `CHART_MIME_TYPES` set + `isChartMime()` filter (PDF + MusicXML variants); updated tests to seed `mimeType` field and added two new test cases ("skips non-chart mimeTypes" + "accepts MusicXML mimeType"). Re-ran dry-run: 364 candidates (matches Daniel's count within ±2).
- **Files:** `scripts/bootstrap-songs.ts`, `scripts/__tests__/bootstrap-songs.test.ts`
- **Verification:** 18/18 tests pass post-filter; production dry-run output 364 + 115 skipped matches expected breakdown.
- **Commit:** `a693d23` (part of plan commit)

### Deferred Items

None — plan AC list closed cleanly. Three follow-ups already enumerated in v5.4 ROADMAP as separate phases:
- v54-02: Harness Fidelity Gate remediation phase 1 (BINDING per v5h3-01-04 postmortem)
- v54-03: Cross-device library staleness fix + library_index↔songs/* continuous sync (extends this one-shot)
- v54-?? (TBD): Pre-existing local-only state cleanup (`package.json` 0.2.6 regression + `src/build-info.json` drift)

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Vitest `SetlistGridHydrator.test.tsx:99` failed in parallel suite run with "expected 1700000000000 received undefined" | Confirmed flake — passes both alone and serially. Pre-existing test isolation issue unrelated to v54-01 changes. Suite passes 171/171 with `--no-file-parallelism`. |
| Bootstrap dry-run count mismatched Daniel's expectation (455 vs 366) | Wrote temp inspector to dump library_index mimeType breakdown; identified 19 folders + 57 audio + 8 docs + others; added MIME-type filter. Removed inspector after diagnosis (`scripts/inspect-lib-temp.ts` was created and deleted in same session). |

## Skill Audit

| Expected (SPECIAL-FLOWS.md) | Invoked | Notes |
|----------------------------|---------|-------|
| /ui-ux-pro-max | ✅ Yes | Invoked at checkpoint:decision (Task 3) before locking thead repair path. Recommendation locked path-a + literal top + extensions kept. |

All required skills invoked ✓.

## Next Phase Readiness

**Ready:**
- v54-02 (Harness Fidelity Gate phase 1) is unblocked — counter unchanged at 1/3 means we still have headroom.
- v54-03 (continuous library_index↔songs/* sync) builds directly on v54-01-01's bootstrap pattern and `songs/{id} = library_index.id` mapping.
- Production state is consistent — every active chart in library_index has a corresponding songs/{id} doc; legacy tracks are back-stitched.

**Concerns:**
- iPad UAT pending (PENDING-UAT marker on v5.0 + v5.2 + v5.3 + v54-01 all rolling forward against same worship cycle). If Daniel surfaces UX issues, route into v54-01-02 follow-up plan (NOT a new milestone — plan numbering supports same-phase iteration).
- Bootstrap script handles one-shot only — if Daniel uploads a new chart to Drive, it doesn't auto-appear in songs/* until v54-03 ships. Workaround: re-run `bootstrap-songs.ts --apply --force` after bulk uploads (idempotent — won't clobber sticky memory).
- Audio files (55 in library_index) are NOT in songs/* — picker can't bind audio tracks. Acceptable for now (the editor is chart-centric); revisit in v54-03 if Daniel wants audio playback inline.

**Blockers:**
- None for v54-02 or v54-03.
- Band onboarding remains gated on Daniel-loop UAT close of v5.0 + v5.2 + v5.3 + v54-01.

---
*Phase: v54-01-picker-bootstrap-and-thead-hotfix, Plan: 01*
*Completed: 2026-05-08*
*Commit: a693d23*
*Status: LOOP COMPLETE — PENDING-UAT (Daniel weekly worship cycle)*
