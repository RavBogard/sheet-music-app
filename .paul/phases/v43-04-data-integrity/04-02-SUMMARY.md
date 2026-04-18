---
phase: v43-04-data-integrity
plan: 02
subsystem: data-integrity
tags: [zod, schema, write-boundary, flush, d02]

requires:
  - phase: v43-01-recursive-research
    provides: D02 finding (.passthrough() schema bypass)
provides:
  - flushMusicianSchema + flushTrackSchema (strict, write-boundary)
affects: [future API write boundaries — pattern established]

duration: ~12min
started: 2026-04-14T13:10:00Z
completed: 2026-04-14T13:22:00Z
---

# v4.3 P4 Plan 02: Flush Route Write-Boundary Hardening (D02)

Client field injection into Firestore `setlists[*].tracks[*]` and `[*].musicians[*]` closed. Write-boundary schemas are `.strict()`; unknown keys return 400.

## Performance

| Metric | Value |
|---|---|
| Duration | ~12 min |
| Tasks | 3 of 3 |
| Commits | 3 atomic + push |
| New tests | 11 |

## AC Results

| AC | Status |
|---|---|
| AC-1 track rejects unknown | Pass |
| AC-2 musician rejects unknown | Pass |
| AC-3 happy path preserved | Pass (6 track types + nullable fields + full/minimal musician) |
| AC-4 print route annotated | Pass (no functional change) |
| AC-5 read schemas untouched | Pass (`src/types/schemas.ts` diff = zero .passthrough changes) |
| AC-6 quality gates | Pass (tsc clean, 1197 tests, `npm run build` green) |

## Commits

| Task | Commit | Description |
|---|---|---|
| T1 | `9e334b3` | Strict flush schemas in `src/lib/flush-schema.ts` |
| T2 | `5920666` | Print route annotation |
| T3 | `8b90953` | 11 regression tests |

## Key Decisions

| Decision | Rationale |
|---|---|
| Extract schemas to `src/lib/flush-schema.ts` | Route files may only export handlers (P2-01 learning applied proactively) |
| Keep nullable fields nullable (not just optional) | Editor legitimately emits `null` for some fields; making them required-non-null would reject valid writes |
| Leave print route `.passthrough()` as-is with comment | No Firestore write — tracks go to PDF pipeline; tightening adds no security value and risks breaking print |
| Keep `src/types/schemas.ts` read-side `.passthrough()` unchanged | Converters must tolerate legacy/evolving Firestore docs; strict there would corrupt display of older setlists |

## Deviations

None. Scope executed exactly as planned.

## Next Phase Readiness

**Ready:** Pattern established for API write-boundary zod schemas (strict + separate file + regression tests).

**Concerns:** If the editor adds a new client-side track field in a future phase, the strict schema must be updated in lockstep or the flush will reject. Trade-off accepted — better to have a test-surfaced failure than silent Firestore drift.

**Next:** B02 (alert-store listener, small) or D01 (cascade delete, larger) or U01/U02 (mobile UX).

---
*Phase: v43-04-data-integrity, Plan: 02*
