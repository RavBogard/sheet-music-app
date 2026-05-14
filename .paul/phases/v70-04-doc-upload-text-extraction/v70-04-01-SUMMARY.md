---
phase: v70-04-doc-upload-text-extraction
plan: 01
subsystem: api
tags: [setlist-import, document-extraction, mammoth, pdfjs, docx, pdf, txt, api-route]

requires:
  - phase: (none — foundation slice; reuses the existing pdfjs server-side loader from pdf-chord-extractor.ts)
    provides: getPdfjs server-side pdfjs loader (legacy build, worker disabled)
provides:
  - src/lib/setlist-import/extract-document.ts — extractDocumentText + detectDocumentFormat (.docx/.pdf/.txt → raw text; discriminated ExtractResult, never throws)
  - POST /api/setlists/import/extract-document — multipart doc upload → extracted text (sibling of import/parse + import/execute)
  - getPdfjs is now an exported reusable server-side pdfjs loader from pdf-chord-extractor.ts
affects:
  - v70-05 (Gemini structured extraction) — consumes extractDocumentText's output text; the eventual ImporterModal "Document" option calls this route
  - v70-07 (interview form + commit) — doc-driven setlist creation pipeline

tech-stack:
  added:
    - "mammoth@^1.12.0 — .docx → raw text"
  patterns:
    - "Document text extraction = a thin lib (format dispatch + discriminated result, never throws) behind a multipart route — keeps the parsing concern out of the route and unit-testable in isolation."
    - "Server-side pdfjs is shared via the exported getPdfjs loader (pdf-chord-extractor.ts) — one legacy-build/worker-disabled loader, not duplicated per consumer."

key-files:
  created:
    - src/lib/setlist-import/extract-document.ts
    - src/app/api/setlists/import/extract-document/route.ts
    - src/lib/setlist-import/__tests__/extract-document.test.ts
  modified:
    - package.json (mammoth dependency)
    - src/lib/pdf-chord-extractor.ts (exported getPdfjs — one-line, no behavior change)

key-decisions:
  - "extractDocumentText returns a discriminated ExtractResult and NEVER throws — unsupported/corrupt/empty are all { ok: false } with a reason, so the route maps cleanly to 400/422 without try/catch sprawl."
  - "Reuse pdf-chord-extractor.ts's getPdfjs loader (export it) rather than duplicate the legacy-build/worker-disabled setup — one server-side pdfjs entry point."
  - "Route lives under the existing /api/setlists/import/ namespace as a sibling of parse + execute — so the v70-05 ImporterModal extension calls a sibling, not a route in a new namespace."
  - "The .pdf unit test mocks pdfjs-dist/legacy/build/pdf.mjs (the plan's permitted fallback) — real pdfjs cannot run under vitest's jsdom env; the sibling pdf-chord-extractor.test.ts mocks it for the identical reason."

patterns-established:
  - "Foundation-slice phase shape: ship the lib + route + tests with NO UI when the UI belongs to a later phase in the same pipeline — avoids building UI that the next phase reworks."

duration: ~40min
started: 2026-05-14T17:50:00Z
completed: 2026-05-14T18:30:00Z
---

# Phase v70-04 Plan 01: Doc Upload + Text Extraction Summary

**The document text-extraction foundation for v7.0 doc-driven setlist creation: a server-side `extractDocumentText` lib that turns `.docx` (mammoth) / `.pdf` (shared server-side pdfjs loader) / `.txt` files into raw text via a discriminated never-throws result, behind a new `POST /api/setlists/import/extract-document` multipart route — no UI, no Gemini, no persistence.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~40min |
| Started | 2026-05-14T17:50:00Z |
| Completed | 2026-05-14T18:30:00Z |
| Tasks | 3 auto PASS (autonomous — no checkpoints) |
| Files | 3 created + 2 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: .txt and .docx extraction | Pass | `.txt` → `buffer.toString('utf-8')`; `.docx` → `mammoth.extractRawText({ buffer })` → `.value`. Tests: `.txt` exact-match (`{ ok: true, format: 'txt', text, charCount: 20 }`); `.docx` against a real minimal docx built in-test with jszip → `text` contains the known line. |
| AC-2: .pdf extraction | Pass | `extractPdfText` reuses the exported `getPdfjs` loader (legacy build, `workerSrc=''`), iterates pages, joins `item.str` values, `\n` between pages. Test exercises the page-iteration + text-join logic against a mocked `pdfjs-dist/legacy/build/pdf.mjs` (real pdfjs can't run under jsdom — see Deviations). Real pdfjs path proven by `next build` ✓ and is the same loader production chord-extraction uses. |
| AC-3: Unsupported / unreadable input is a clean failure, not a crash | Pass | `detectDocumentFormat` returns null for non-doc formats → `{ ok: false, reason: 'unsupported_format' }`. mammoth + pdfjs calls wrapped in try/catch → `{ ok: false, reason: 'extraction_failed' }`. Empty-text → `{ ok: false, reason: 'empty' }`. Tests cover all three; `extractDocumentText` never throws. |
| AC-4: The route wraps the lib with upload validation | Pass | `POST /api/setlists/import/extract-document` — `createApiHandler` (default auth) + `checkRateLimit('upload')` + `maxDuration = 60`; multipart `file`, 25MB cap, missing-file → 400, `unsupported_format`/`empty` → 400, `extraction_failed` → 422, success → 200 `{ success, text, format, fileName, charCount }`. `next build` ✓ — route appears as `ƒ /api/setlists/import/extract-document`. No route-level test (the project's API-route harness is heavy; the build's route-compilation check + the lib's 9 unit tests are sufficient coverage for this foundation slice — plan explicitly permitted this). |

## Accomplishments

- **v7.0 doc-import pipeline foundation shipped.** Any `.docx` / `.pdf` / `.txt` document can now be turned into raw text server-side, end to end. v70-05 (Gemini structured extraction) can build directly on `extractDocumentText`.
- **No new client dependency, one new server dependency.** Only `mammoth` added; `pdfjs-dist` was already present and its server-side loader is now a shared export.
- **Clean discriminated failure model.** `extractDocumentText` never throws — unsupported/corrupt/empty all return a typed `{ ok: false, reason }`, so the route maps to HTTP status codes with no try/catch sprawl.
- **Plan executed as specified** — 3 auto tasks, all PASS at qualify; the single deviation (the .pdf test's mocking approach) was explicitly anticipated and permitted by the plan.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 + plan metadata | `<phase-commit>` | feat | mammoth dep + extract-document lib + extract-document route + tests + getPdfjs export; v70-04 phase close |

Single bundled phase commit at the v70-04 transition (per the transition workflow + memory `feedback_paul_phase_commits`).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/setlist-import/extract-document.ts` | Created | `detectDocumentFormat` + `extractDocumentText` — format dispatch (.docx/.pdf/.txt), discriminated `ExtractResult`, never throws |
| `src/app/api/setlists/import/extract-document/route.ts` | Created | `POST` — multipart doc upload → extracted text; 25MB cap; 400/422 error mapping |
| `src/lib/setlist-import/__tests__/extract-document.test.ts` | Created | 9 tests — format detection, .txt/.docx (real fixtures), .pdf (mocked loader), unsupported/empty/corrupt |
| `package.json` | Modified | `mammoth@^1.12.0` dependency |
| `src/lib/pdf-chord-extractor.ts` | Modified | Exported `getPdfjs` (one-line `export` keyword — no behavior change) so the doc extractor reuses the same server-side pdfjs loader |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Discriminated `ExtractResult`, `extractDocumentText` never throws | Unsupported/corrupt/empty are expected inputs, not exceptions — the route maps `{ ok: false, reason }` to 400/422 cleanly | No try/catch in the route; failure modes are typed and testable |
| Export + reuse `getPdfjs` from pdf-chord-extractor.ts | One server-side pdfjs loader (legacy build, worker disabled) instead of duplicating the setup | Minimal one-line change to the existing file; shared module-level pdfjs cache |
| Route under `/api/setlists/import/` (sibling of parse/execute) | The v70-05 ImporterModal extension will call import routes; keep the doc route in the same namespace | v70-05 wiring calls a sibling, not a new namespace |
| `.pdf` unit test mocks the pdfjs loader | Real pdfjs cannot run under vitest's jsdom env; `pdf-chord-extractor.test.ts` mocks it for the same reason; plan explicitly permitted this fallback | The .pdf page-iteration/join logic is unit-tested; real pdfjs is covered by `next build` + production parity |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Test-approach correction caught at qualify — no production impact |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Minimal. One qualify-time test-approach correction, which the plan had explicitly anticipated and permitted. No scope creep, no deferred items, no escalations.

### Auto-fixed Issues

**1. [Test] .pdf test could not use a real pdf-lib fixture under jsdom**
- **Found during:** Task 3 (tests) — first qualify run: 8/9 pass, the real-.pdf-fixture test returned `{ ok: false }`.
- **Issue:** The first test version generated a real PDF with `pdf-lib` and extracted it with real pdfjs. Real `pdfjs-dist` does not run under vitest's `jsdom` environment — the extraction threw and was caught as `extraction_failed`. (The sibling `pdf-chord-extractor.test.ts` mocks pdfjs for exactly this reason.)
- **Fix:** Rewrote the `.pdf` test to mock `pdfjs-dist/legacy/build/pdf.mjs` with a controlled fake document (`%PDF-` magic-header check → resolves with known text items, else rejects) — mirroring the proven sibling-test pattern. This exercises `extractDocumentText`'s pdf dispatch + page-iteration + text-join logic; the real pdfjs path is covered by `next build` and production parity.
- **Files:** `src/lib/setlist-import/__tests__/extract-document.test.ts`
- **Verification:** `npx vitest run src/lib/setlist-import/` → 9/9 green.

### Deferred Items

None — plan executed as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Real pdfjs cannot run under vitest's jsdom env | Mocked `pdfjs-dist/legacy/build/pdf.mjs` in the test (plan's permitted fallback) — see Auto-fixed #1. |
| `getPdfjs` was a private (non-exported) function in pdf-chord-extractor.ts | Added the `export` keyword — a one-line, behavior-preserving change (verified: `pdf-chord-extractor.test.ts` still 16/16 green). |
| Bash shell cwd kept resetting to the repo root | Prefixed build/test commands with an absolute `cd` into `sheet-music-app/`. |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | N/A | SPECIAL-FLOWS.md requires /ui-ux-pro-max for "any phase that touches frontend UI/UX". v70-04 is a backend-only foundation slice — no components, no styling, no user-facing surface. Consistent with v70-02 (data-layer phase) recording the gate as N/A. |

## Next Phase Readiness

**Ready:**
- v70-04 phase complete (single-plan phase, LOOP CLOSED) — transition runs next.
- v70-05 (Gemini structured extraction) — the next ROADMAP phase (Wave 3, sequential). It consumes `extractDocumentText`'s output and the `/api/setlists/import/extract-document` route; the agreed UI direction is to extend the existing `ImporterModal` with a "Document" option.

**Concerns:**
- Nothing committed/pushed until the transition runs (next step in this UNIFY).
- The `.pdf` extraction path's real-pdfjs behavior is verified only by `next build` + production parity with chord-extraction, not by a unit test (jsdom limitation). If v70-05 surfaces a real-PDF extraction bug, an emulator-style or HUMAN-VERIFY check may be warranted — but the loader is the same one production chord-extraction has used reliably.
- `extractDocumentText` returns raw text only — no structure. Section/song detection is entirely v70-05's (Gemini) job; v70-04 deliberately does not attempt any parsing.

**Blockers:** None.

---
*Phase: v70-04-doc-upload-text-extraction, Plan: 01*
*Completed: 2026-05-14*
