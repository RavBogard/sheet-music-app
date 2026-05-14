---
phase: v70-05-gemini-structured-extraction
plan: 01
subsystem: api
tags: [setlist-import, document-extraction, gemini, zod, structured-extraction, api-route]

requires:
  - phase: v70-04-doc-upload-text-extraction
    provides: extractDocumentText (.docx/.pdf/.txt → raw text) + POST /api/setlists/import/extract-document — extract-structure consumes that raw text
  - phase: (existing) src/lib/gemini.ts
    provides: geminiFlash() — the chord-detection Gemini model setup (gemini-3-flash-preview), reused as-is
provides:
  - src/lib/setlist-import/extract-structure.ts — extractSetlistStructure + SetlistStructureSchema + StructureResult/SetlistStructure/SetlistSection/SetlistTrack types (raw text → Zod-validated { sections[], tracks[] }; discriminated never-throws result)
  - POST /api/setlists/import/extract-structure — JSON route, sibling of import/extract-document + import/parse + import/execute
affects:
  - v70-06 (resolve + missing-chart + recording-match) — consumes the `tracks` output of extractSetlistStructure for library fuzzy match + recording match
  - v70-07 (interview form + setlist preview + commit) — the ImporterModal "Document" option calls extract-document → extract-structure; the interview form fills gaps in the { sections, tracks } shape

tech-stack:
  added: []
  patterns:
    - "AI structure extraction = a thin lib (prompt build + fence-strip + JSON.parse + Zod safeParse → discriminated never-throws result) behind a sibling JSON route — mirrors v70-04's extract-document foundation-slice shape exactly."
    - "Malformed/empty AI output carries the raw model string in the result (`raw` field) and the route returns it in the 422 body — so a human can review what the model actually produced rather than just an error code."

key-files:
  created:
    - src/lib/setlist-import/extract-structure.ts
    - src/app/api/setlists/import/extract-structure/route.ts
    - src/lib/setlist-import/__tests__/extract-structure.test.ts
  modified: []

key-decisions:
  - "extractSetlistStructure returns a discriminated StructureResult and NEVER throws — empty input / malformed model output / gemini_error are all { ok: false } with a reason, so the route maps cleanly to 400/422/502 with no try/catch sprawl (same model as v70-04's extract-document)."
  - "Optional track/section fields use Zod .nullish() defensively (Gemini emits null despite being told to omit), then null is normalized to undefined after a successful parse — so consumers get a clean SetlistTrack with absent keys, not nulls."
  - "Output is exactly { sections, tracks } — no service-date/type meta inference (v70-07's job), no library/recording resolution (v70-06's job), no persistence."
  - "Route uses default auth (no role gate) — matches import/extract-document; import/parse's band_leader gate was NOT copied."

patterns-established:
  - "Foundation-slice continuation: when a pipeline spans phases, each phase ships lib + route + tests in the same shape as the prior slice (v70-04 → v70-05) so the next phase wires to a predictable sibling."

duration: ~20min
started: 2026-05-14T18:45:00Z
completed: 2026-05-14T19:05:00Z
---

# Phase v70-05 Plan 01: Gemini Structured Extraction Summary

**The AI structure pass for v7.0 doc-driven setlist creation: a server-side `extractSetlistStructure` lib that sends v70-04's raw document text to Gemini (`geminiFlash()`) and returns a Zod-validated `{ sections[], tracks[] }` shape via a discriminated never-throws result, behind a new `POST /api/setlists/import/extract-structure` JSON route — malformed/empty extractions surface the raw model output for human review. No UI, no library resolution, no persistence.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~20min |
| Started | 2026-05-14T18:45:00Z |
| Completed | 2026-05-14T19:05:00Z |
| Tasks | 3 auto PASS (autonomous — no checkpoints) |
| Files modified | 3 created, 0 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Well-formed Gemini output → validated structure | Pass | `SetlistStructureSchema` (Zod) validates `{ sections: {name,order}[], tracks: {title, key?, vocalLead?, sectionName?, referenceLink?, notes?, order}[] }`. Markdown ```json fences stripped before `JSON.parse` (mirrors import/parse). Tests: well-formed JSON, fenced JSON, and null-optional-fields all → `{ ok: true }` with optional fields mapping through and nulls normalized away. |
| AC-2: Malformed output → typed human-reviewable failure | Pass | Non-JSON → `{ ok: false, reason: 'malformed', raw }`; valid JSON failing Zod (e.g. track missing `title`) → `{ ok: false, reason: 'malformed', raw }` with a per-issue detail message; empty/whitespace input → `{ ok: false, reason: 'empty' }` (Gemini never called). `raw` carries the model output for review. All paths resolve — never throws. |
| AC-3: Gemini/config errors → typed failure, not a crash | Pass | `generateContent` rejection AND `geminiFlash()` throwing (missing `GOOGLE_GENERATIVE_AI_API_KEY`) are both caught in one try/catch → `{ ok: false, reason: 'gemini_error', message }`. Two dedicated tests + a "never throws" test asserting `.resolves`. |
| AC-4: Route wraps the lib with validation + error mapping | Pass | `POST /api/setlists/import/extract-structure` — `createApiHandler` (default auth, `schema: z.object({ text: z.string() })`) + `checkRateLimit('upload')` + `maxDuration = 60`; blank text → 400, `gemini_error` → 502, `malformed`/`empty` → 422 `{ error, raw }`, success → 200 `{ success, sections, tracks }`. `next build` ✓ — route appears as `ƒ /api/setlists/import/extract-structure`. No route-level test (consistent with v70-04 — the build's route-compilation check + the lib's 9 unit tests cover this backend slice; plan explicitly permitted this). |

## Verification Results

- `npx next build` → ✓ Compiled successfully; `ƒ /api/setlists/import/extract-structure` present in the route list.
- `npx vitest run src/lib/setlist-import/` → 18/18 green (9 new `extract-structure.test.ts` + 9 `extract-document.test.ts` — zero regressions).
- `npx tsc --noEmit` → the three new files are type-clean. Two pre-existing errors remain in `src/components/performance/__tests__/performance-toolbar.test.tsx` (unrelated to this plan, not introduced by it, outside scope).

## Accomplishments

- **v7.0 doc-import AI structure pass shipped.** Raw document text now becomes a validated `{ sections, tracks }` setlist shape end to end. v70-06 can build library/recording resolution directly on `extractSetlistStructure`'s `tracks`.
- **No new dependencies.** `@google/generative-ai` and `zod` were already present; `geminiFlash()` is reused unchanged.
- **Clean discriminated failure model with human-review escape hatch.** Empty/malformed/gemini_error all return a typed `{ ok: false, reason }`; malformed/empty additionally carry the raw model output, which the route returns in the 422 body for human review.
- **Plan executed exactly as written** — 3 auto tasks, all PASS at qualify, zero deviations, zero deferred items.

## Task Commits

Project config has `auto_commit: false`; per memory `feedback_paul_phase_commits`, the entire `.paul/phases/v70-05-gemini-structured-extraction/` directory plus the three source files are committed as a single bundled phase commit at the v70-05 transition.

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 + plan/summary metadata | `<phase-commit>` | feat | extract-structure lib + extract-structure route + unit tests; v70-05 phase close |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/setlist-import/extract-structure.ts` | Created | `extractSetlistStructure` + `SetlistStructureSchema` + result/structure types — raw text → Gemini → Zod-validated `{ sections, tracks }`; discriminated never-throws result; null→undefined normalization |
| `src/app/api/setlists/import/extract-structure/route.ts` | Created | `POST` — JSON `{ text }`, default auth, rate-limited, `maxDuration=60`; 400/422/502 error mapping; `raw` returned on 422 for human review |
| `src/lib/setlist-import/__tests__/extract-structure.test.ts` | Created | 9 tests — well-formed / fenced / null-fields / non-JSON / schema-fail / empty-input / gemini-reject / flash-throw / never-throws; Gemini mocked via `vi.mock('@/lib/gemini')` + hoisted mutable state |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Discriminated `StructureResult`, `extractSetlistStructure` never throws | Empty/malformed/gemini-error are expected inputs, not exceptions — route maps `{ ok: false, reason }` to HTTP codes with no try/catch | No try/catch in the route; failure modes are typed and unit-tested |
| Zod `.nullish()` on optional fields + post-parse null→undefined normalization | Gemini emits `null` for unknown fields despite the prompt saying "omit" — accept it defensively, then hand consumers clean `SetlistTrack` objects with absent keys | v70-06/v70-07 never see `null`; optional fields are simply absent |
| Output limited to exactly `{ sections, tracks }` | ROADMAP specifies this shape; service-date/type meta is v70-07's interview-form concern, library/recording resolution is v70-06's | v70-05 stays a single-concern slice; downstream phases own their pieces |
| Route uses default auth (no role gate) | Matches `import/extract-document`; the doc-import pipeline routes are open to any authenticated user | Consistent auth posture across the import/* sibling routes |

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
| `npx tsc --noEmit` reports 2 errors | Pre-existing, in `performance-toolbar.test.tsx` — unrelated to this plan, not introduced by it. The 3 new files are type-clean. No action (outside scope; flag-only). |
| Bash shell cwd kept resetting to repo root | Prefixed build/test commands with an absolute `cd` into `sheet-music-app/` (same as v70-04). |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | N/A | SPECIAL-FLOWS.md requires `/ui-ux-pro-max` for "any phase that touches frontend UI/UX". v70-05 is a backend-only slice — new lib + API route + unit tests, no components/styling/user-facing surface. ROADMAP's `/ui-ux-pro-max` BLOCKING list (v70-01/v70-03/v70-04/v70-07) deliberately excludes v70-05. Consistent with v70-02 / v70-04 backend phases recording the gate as N/A. |

## Next Phase Readiness

**Ready:**
- v70-05 phase complete (single-plan phase, LOOP CLOSED) — transition runs next.
- v70-06 (resolve + missing-chart + recording-match) — the next ROADMAP phase (Wave 3, sequential). It consumes `extractSetlistStructure`'s `tracks` output for library fuzzy match (confidence scoring) + recording match against audio-mime `songs/*` entries, and pre-creates `recordings/*` docs.
- The full doc → text → structure chain is now in place: `POST /api/setlists/import/extract-document` → `POST /api/setlists/import/extract-structure`.

**Concerns:**
- Nothing committed/pushed until the transition runs (next step in this UNIFY).
- The real-Gemini path is exercised only by `next build` + production parity with the existing import/parse + chord-detection Gemini usage — the unit tests mock Gemini (the prompt's effectiveness on the real May 15 Shir Shabbat canary doc is verified later in the pipeline, at v70-07 UAT). If the prompt under-extracts on the real canary, that surfaces as a v70-07 UAT issue routed to a follow-up plan.
- `extractSetlistStructure` returns structure only — no library/recording resolution. That is entirely v70-06's job; v70-05 deliberately does not attempt matching.

**Blockers:** None.

---
*Phase: v70-05-gemini-structured-extraction, Plan: 01*
*Completed: 2026-05-14*
