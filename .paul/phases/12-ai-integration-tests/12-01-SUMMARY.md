---
phase: 12-ai-integration-tests
plan: 01
subsystem: testing
tags: [vitest, gemini, pdfjs-dist, chord-extraction, key-detection, enrichment]
requires:
  - phase: 11-component-tests
    provides: test patterns and mock conventions
provides:
  - Gemini module test coverage (singleton, API key validation)
  - PDF chord extractor test coverage (merge algorithm, multi-page, filtering)
  - Key detection test coverage (happy path, error handling)
  - Enrichment engine test coverage (Gemini JSON parsing, Firestore writes)
affects: []
tech-stack:
  added: []
  patterns: [vi.hoisted for mock factories, mock pdfjs-dist text items]
key-files:
  created:
    - src/lib/gemini.test.ts
    - src/lib/pdf-chord-extractor.test.ts
    - src/lib/key-detection.test.ts
    - src/lib/enrichment-engine.test.ts
  modified: []
key-decisions:
  - "Use real chord-utils (isChord, cleanChordText) in pdf-chord-extractor tests for integration accuracy"
  - "Use vi.hoisted() for mock variables referenced in vi.mock factories (vitest hoisting)"
  - "Mock pdfjs-dist at module level with configurable text items per test"
patterns-established:
  - "vi.hoisted() pattern for mock variables used inside vi.mock factories"
  - "Mock PDF text item helper: textItem(str, x, y, w, h) for readable test setup"
  - "source: 'firebase-storage' as const required on all FetchedFile mock returns"
duration: 10min
started: 2026-03-12T08:30:00Z
completed: 2026-03-12T08:33:00Z
---

# Phase 12 Plan 01: AI & Extraction Module Tests Summary

**35 tests across 4 files covering gemini.ts, pdf-chord-extractor.ts, key-detection.ts, and enrichment-engine.ts**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10min |
| Tasks | 2 completed |
| Files created | 4 |
| Tests added | 35 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Gemini Module Tests | Pass | 5 tests: missing key throws, model names correct, singleton reuse |
| AC-2: PDF Chord Extractor Tests | Pass | 16 tests: merge algorithm, multi-page, filtering, coordinates, ArrayBuffer |
| AC-3: Key Detection Tests | Pass | 7 tests: valid PDF, not found, non-PDF, no chords, null extraction, errors |
| AC-4: Enrichment Engine Tests | Pass | 7 tests: valid JSON, markdown fences, invalid JSON, file not found, base64, Firestore |

## Accomplishments

- Comprehensive merge algorithm testing: adjacent items, slash bass, numeric suffixes, cross-line separation
- Full error path coverage for key-detection (6 of 7 tests are error/edge cases)
- Gemini response parsing tested for clean JSON, markdown-fenced JSON, and garbage text
- Firestore write verification: correct collection path, merge flag, enrichedAt timestamp

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/gemini.test.ts` | Created | Singleton pattern, API key validation, model names |
| `src/lib/pdf-chord-extractor.test.ts` | Created | Merge algorithm, chord filtering, multi-page, coordinates |
| `src/lib/key-detection.test.ts` | Created | Key estimation pipeline with mocked deps |
| `src/lib/enrichment-engine.test.ts` | Created | Gemini JSON parsing, Firestore writes |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Real chord-utils in extractor tests | Integration accuracy — tests prove real filtering works with merge algorithm | Higher confidence than double-mocking |
| vi.hoisted() for enrichment mocks | vi.mock factories are hoisted above variable declarations | Required pattern for complex mock setups |
| FetchedFile source field in mocks | Type requires `source: 'firebase-storage'` | All file-fetcher mocks must include this |

## Deviations from Plan

None — plan executed exactly as written. One type error fix needed (missing `source` field on FetchedFile mocks), resolved during execution.

## Next Phase Readiness

**Ready:**
- Plan 12-02 (print-pipeline edge cases) can proceed
- Mock patterns established for pdfjs-dist and Gemini reusable in 12-02

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 12-ai-integration-tests, Plan: 01*
*Completed: 2026-03-12*
