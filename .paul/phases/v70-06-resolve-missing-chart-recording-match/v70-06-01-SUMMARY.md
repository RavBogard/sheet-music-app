---
phase: v70-06-resolve-missing-chart-recording-match
plan: 01
subsystem: api
tags: [setlist-import, library-match, fuzzy-match, levenshtein, recording-match, api-route]

requires:
  - phase: v70-05-gemini-structured-extraction
    provides: extractSetlistStructure + SetlistStructure/SetlistTrack/SetlistSection types — resolve consumes the { sections, tracks } output directly
  - phase: (existing) src/lib/server-library.ts + src/app/api/setlists/import/parse/route.ts
    provides: getServerLibrary() (library_index read with mimeType) + the proven levenshtein/0.82 match algorithm (mirrored, not refactored)
provides:
  - src/lib/setlist-import/resolve.ts — resolveSetlistStructure + ResolvedTrack/ResolvedStructure/ResolveResult/LibraryMatch types (annotates each track with libraryMatch | missingChart + recordingCandidates[]; discriminated never-throws; ZERO Firestore writes)
  - POST /api/setlists/import/resolve — JSON route, sibling of import/extract-structure + import/extract-document + import/parse
affects:
  - v70-07 (interview form + setlist preview + commit) — consumes the resolved { sections, tracks }: surfaces missingChart tracks for upload, presents recordingCandidates for selection, and the commit step persists everything

tech-stack:
  added: []
  patterns:
    - "Library resolution = a pure compute pass (lib + route) that annotates the v70-05 structure with match metadata and writes NOTHING — persistence is deferred to the commit step (v70-07). Same propose-only / foundation-slice shape as v70-04 + v70-05."
    - "The library is partitioned by mimeType prefix at resolve time: application/pdf + image/* → chart-match candidates; audio/* → recording-match candidates. One getServerLibrary() fetch serves both."

key-files:
  created:
    - src/lib/setlist-import/resolve.ts
    - src/app/api/setlists/import/resolve/route.ts
    - src/lib/setlist-import/__tests__/resolve.test.ts
  modified: []

key-decisions:
  - "Propose-only — resolveSetlistStructure performs ZERO Firestore writes (Daniel-confirmed 2026-05-14 via AskUserQuestion). Deliberate supersede of the ROADMAP's 'pre-creates recordings/* docs' wording: avoids orphaned docs if the import is abandoned; v70-07's commit owns all persistence."
  - "Single plan covering all three concerns (library-resolve + missing-chart flag + recording-match) — they are facets of one resolve pass over the same track list (Daniel-confirmed)."
  - "Match algorithm is MIRRORED from import/parse/route.ts (normalize → levenshtein → 1 - d/maxLen → 0.82 threshold, exact-match-only for <3-char normalized strings) — import/parse is NOT refactored; logic is intentionally duplicated to keep the change minimal and in-lane."
  - "Library partitioned by mimeType prefix: application/pdf + image/* = chart candidates; audio/* = recording candidates. getServerLibrary() (library_index) carries mimeType; post-v60-11 songs/* mirrors it, so library_index is the single read source."
  - "resolveSetlistStructure never throws — getServerLibrary already swallows internal errors and returns { files: [] } (an empty library is usable, not a failure); the defensive try/catch only guards a thrown error → typed { ok: false, reason: 'library_unavailable' }."

patterns-established:
  - "v7.0 doc-import pipeline stage shape: each stage is a thin lib + a sibling /api/setlists/import/* route + unit tests, consuming the prior stage's typed output and producing the next stage's typed input. extract-document → extract-structure → resolve; next is v70-07's interview/commit."

duration: ~30min
started: 2026-05-14T20:20:00Z
completed: 2026-05-14T20:50:00Z
---

# Phase v70-06 Plan 01: Resolve + Missing-Chart + Recording-Match Summary

**The resolution stage of the v7.0 doc-import pipeline: `resolveSetlistStructure` takes v70-05's Zod-validated `{ sections, tracks }` and annotates every track with a fuzzy library chart match (`libraryMatch` — fileId + name + confidence), a `missingChart` flag when no confident chart match exists, and a best-first list of audio-typed `recordingCandidates` — behind a new `POST /api/setlists/import/resolve` route. A pure compute pass: ZERO Firestore writes; v70-07's commit step does all persistence.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30min |
| Started | 2026-05-14T20:20:00Z |
| Completed | 2026-05-14T20:50:00Z |
| Tasks | 3 auto PASS (autonomous — no checkpoints) |
| Files modified | 3 created, 0 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Confident chart match annotates the track | Pass | `bestMatch` over `application/pdf` + `image/*` library entries; the best entry above the 0.82 similarity threshold sets `libraryMatch = { fileId, name, confidence }` and `missingChart = false`. Tests: a PDF entry and an `image/png` entry both resolve as chart matches. |
| AC-2: No confident chart match flags missingChart | Pass | When `bestMatch` returns undefined, `libraryMatch` is omitted and `missingChart = true`; the track is otherwise spread through unchanged (title/order/sectionName/key preserved). Test asserts the unmatched track keeps its fields. |
| AC-3: Audio-typed library entries become recording candidates | Pass | `allMatches` over `audio/*` entries returns every match above threshold, sorted by confidence desc → `recordingCandidates` (always present; `[]` when no audio match). Tests: a title with two audio entries → 2 candidates best-first; a title with none → `[]`. |
| AC-4: Sections pass through; the pass never throws | Pass | `sections` is returned by reference unchanged; every input track maps to exactly one output track preserving `order`. `resolveSetlistStructure` never throws — `getServerLibrary()` is wrapped in try/catch → typed `{ ok: false, reason: 'library_unavailable' }`; an empty `opts.library: []` resolves `{ ok: true }` with all tracks `missingChart`. Tests cover sections-passthrough, order preservation, and the empty-library case. |
| AC-5: The route wraps the lib with validation + error mapping | Pass | `POST /api/setlists/import/resolve` — `createApiHandler` (default auth, `schema: SetlistStructureSchema` reused from extract-structure) + `checkRateLimit('upload')` + `maxDuration = 60`; `ok` → 200 `{ success, sections, tracks }`, `library_unavailable` → 502, malformed body → 400 (via the wrapper's schema validation). `next build` ✓ — route appears as `ƒ /api/setlists/import/resolve`. No route-level test (consistent with v70-04 / v70-05 — `next build`'s route-compilation check + the lib's 8 unit tests are sufficient for this backend slice). |

## Verification Results

- `npx tsc --noEmit` → the 3 new files are type-clean. The only errors are the 2 pre-existing `performance-toolbar.test.tsx` errors (unrelated, not introduced — same as v70-04 / v70-05 / v70-09).
- `npx next build` → ✓ Compiled successfully; `ƒ /api/setlists/import/resolve` registered.
- `npx vitest run src/lib/setlist-import/` → **26/26 green** (8 new `resolve.test.ts` + 9 `extract-structure.test.ts` + 9 `extract-document.test.ts` — zero regressions).

## Accomplishments

- **v7.0 doc-import resolution stage shipped.** The chain is now `extract-document` → `extract-structure` → **`resolve`** — a doc's raw text becomes a fully library-resolved `{ sections, tracks }` with chart matches, missing-chart flags, and recording candidates, ready for v70-07's interview form + commit.
- **Propose-only — zero Firestore writes.** No orphaned `recordings/*` docs; persistence is cleanly deferred to v70-07's commit. No HFG/emulator burden on this phase.
- **No new dependencies, in-lane.** `levenshteinDistance` + `getServerLibrary()` already existed; the work is entirely within `src/lib/setlist-import/` + `src/app/api/setlists/import/` — no MCP territory, no shared files, no `SetlistGrid.tsx`.
- **Plan executed exactly as written** — 3 auto tasks, all PASS at first qualify, zero deviations, zero deferred items.

## Task Commits

Project config has `auto_commit: false`; per memory `feedback_paul_phase_commits`, the entire `.paul/phases/v70-06-resolve-missing-chart-recording-match/` directory + the 3 source files are committed as a single bundled phase commit at the v70-06 transition.

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 + plan/summary metadata | `<phase-commit>` | feat | resolve lib + resolve route + tests; v70-06 phase close |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/setlist-import/resolve.ts` | Created | `resolveSetlistStructure` + types — annotates each track with `libraryMatch` \| `missingChart` + `recordingCandidates[]`; mirrors import/parse's levenshtein/0.82 match; partitions library by mimeType; discriminated never-throws result; zero Firestore writes |
| `src/app/api/setlists/import/resolve/route.ts` | Created | `POST` — JSON `{ sections, tracks }` (validated by reused `SetlistStructureSchema`), default auth, rate-limited, `maxDuration=60`; 200 / 400 / 502 mapping |
| `src/lib/setlist-import/__tests__/resolve.test.ts` | Created | 8 tests — chart match (PDF + image), missingChart, recording candidates (sorted + empty), sections passthrough + order preservation, empty library, short-title exact-match-only; injected fixture library, no Firestore/network |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Propose-only — zero Firestore writes | Daniel-confirmed 2026-05-14. Avoids orphaned `recordings/*` docs if the import is abandoned; v70-07's commit step is the single persistence point | v70-06 is a pure compute slice — no HFG/emulator, no data-layer risk; supersedes the ROADMAP's "pre-creates recordings/* docs" wording |
| Single plan, all 3 concerns | Daniel-confirmed. library-resolve + missing-chart + recording-match are facets of one resolve pass over the same track list | One lib + one route + one test file; no duplicated track-iteration scaffold |
| Mirror import/parse's match algorithm (don't refactor parse) | Reuse the proven levenshtein/0.82 logic without touching a working production route; keeps the change minimal and in-lane | Intentional small duplication; a future cleanup could unify them (not this phase) |
| Partition library by mimeType prefix (pdf+image / audio) | One `getServerLibrary()` fetch carries mimeType for both chart-match and recording-match; prefix checks avoid an exhaustive mime list | Single library read per resolve call; image charts (v70-01) correctly count as chart candidates |
| `resolveSetlistStructure` never throws | `getServerLibrary()` already returns `{ files: [] }` on internal error; the defensive try/catch only guards a thrown error → typed `{ ok: false }` | Route needs no try/catch; failure modes are typed (same model as extract-document / extract-structure) |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** None. Plan executed exactly as written — 3 auto tasks, all PASS at first qualify, no checkpoints, no deviations.

### Auto-fixed Issues

None.

### Deferred Items

None — plan executed exactly as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `SetlistStructureSchema`'s Zod-inferred type uses `.nullish()` optional fields while `SetlistStructure` uses `string \| undefined` | The route casts `ctx.body as SetlistStructure` — `resolveSetlistStructure` only reads `track.title` (required) and spreads the rest, and v70-05's `extractSetlistStructure` already normalizes nulls→undefined in real pipeline data, so the cast is safe. Documented inline in the route. |
| `tsc` reports 2 `performance-toolbar.test.tsx` errors | Pre-existing, unrelated, not introduced (same as v70-04 / v70-05 / v70-09). Out of scope. |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | N/A | SPECIAL-FLOWS.md requires `/ui-ux-pro-max` for "any phase that touches frontend UI/UX". v70-06 is a backend-only slice — a resolve lib + a JSON API route + unit tests, no components/styling/user-facing surface. ROADMAP's `/ui-ux-pro-max` BLOCKING list (v70-01/v70-03/v70-04/v70-07) deliberately excludes v70-06. Consistent with v70-02 / v70-04 / v70-05 backend phases. |

## Next Phase Readiness

**Ready:**
- v70-06 phase complete (single-plan phase, LOOP CLOSED) — transition runs next (commit + push).
- v70-07 (interview form + setlist preview + commit) — the next ROADMAP phase (Wave 4). It consumes the resolved `{ sections, tracks }`: `missingChart` tracks route to `/api/library/upload`, `recordingCandidates` are presented for selection, and the commit step persists everything via `createSetlistService` + the `applyEdit` fanout.
- The full doc-import chain is in place: `extract-document` → `extract-structure` → `resolve`.

**Concerns:**
- **v70-07 coordination point (from Daniel's MCP-workstream handoff):** v70-07's commit step needs server-side setlist writes; `createSetlistService` is currently client-SDK only. v70-07 must author a **server-callable setlist-write module** — and the MCP write tools consume it. **Ping Daniel to agree the module's signature BEFORE designing it** — do not build a competing one.
- The match algorithm is duplicated from import/parse (intentional, documented). If a third consumer appears, a shared `library-match` helper would be worth extracting — not now.
- The 0.82 threshold + extension-in-name behavior is inherited from import/parse as-is. If real-canary resolution under-matches (e.g. library names carry `.pdf` extensions while extracted titles don't), that surfaces in v70-07 UAT and routes to a follow-up.

**Blockers:** None.

---
*Phase: v70-06-resolve-missing-chart-recording-match, Plan: 01*
*Completed: 2026-05-14*
