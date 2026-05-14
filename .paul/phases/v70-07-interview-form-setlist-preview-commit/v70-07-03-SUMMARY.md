---
phase: v70-07-interview-form-setlist-preview-commit
plan: 03
subsystem: api
tags: [doc-import, commit, setlist-write, importer-modal, emulator, gemini-pipeline]

requires:
  - phase: v70-07-01 (server-callable setlist-write module)
    provides: createSetlistServerSide + ServerSetlistTrackInput / CreateSetlistResult types — commit.ts flattens onto these
  - phase: v70-07-02 (interview form + preview)
    provides: the ImporterModal preview step with the inert "Create Setlist" button (the TODO(v70-07-03) seam) + resolved {sections,tracks} + interview* state
  - phase: v70-06 (resolve)
    provides: ResolvedTrack / ResolvedStructure shape that commit.ts flattens
provides:
  - src/lib/setlist-import/commit.ts — commitDocumentSetlist + flattenResolvedStructure (resolved {sections,tracks} → ServerSetlistTrackInput[] → createSetlistServerSide)
  - POST /api/setlists/import/commit-document — band_leader-gated commit endpoint
  - ImporterModal preview "Create Setlist" button wired end-to-end (handleCommitDocument)
affects:
  - v70-08 (best-practice audit — the doc-import pipeline is now a complete surface to audit)

tech-stack:
  added: []
  patterns:
    - "Doc-import commit = flatten + delegate. commit.ts owns the doc-import-specific flatten (resolved {sections,tracks} → flat ServerSetlistTrackInput[] with interleaved section headers + libraryMatch→fileId binding); it delegates the actual write to v70-07-01's createSetlistServerSide. The route is a thin band_leader-gated validate+delegate wrapper — no write logic in the route."
    - "The doc-import pipeline is five independent sibling routes chained client-side: extract-document → extract-structure → resolve → (interview form) → commit-document. No orchestration route; each step is independently testable and the UI owns the chaining."

key-files:
  created:
    - src/lib/setlist-import/commit.ts
    - src/lib/setlist-import/__tests__/commit.emulator.test.ts
    - src/app/api/setlists/import/commit-document/route.ts
  modified:
    - src/components/setlist/importer/ImporterModal.tsx

key-decisions:
  - "commit.ts (not setlist-write.ts) owns the flatten logic — setlist-write.ts is the generic server-side write path; doc-import-specific section-header interleaving + libraryMatch→chart binding is setlist-import territory."
  - "flattenResolvedStructure is exported separately from commitDocumentSetlist — keeps the pure mapping logic (the real risk surface: header interleaving, vocalLead→leadMusician, libraryMatch→fileId, ungrouped-last) inspectable, though the emulator test exercises it through commitDocumentSetlist end-to-end rather than in isolation."
  - "The commit-document route is band_leader-gated (matches import/execute — creating a setlist is a band-leader action), unlike the extract/resolve routes which are any-authenticated (read-only compute passes)."
  - "recordingCandidates are ignored on commit — recording binding is deferred entirely for v70-07 (Daniel decision 2026-05-14). toSongInput drops them."
  - "No maxDuration on the commit route — unlike import/execute (Drive downloads) it only does a Firestore batch write."

patterns-established:
  - "When a doc-import step needs server-side persistence: add a thin band_leader-gated route that delegates to a setlist-import lib function; the lib does the domain mapping, createSetlistServerSide does the write, the route does auth + validation only."

duration: ~35min
started: 2026-05-14T23:15:00Z
completed: 2026-05-14T23:50:00Z
---

# Phase v70-07 Plan 03: Commit Wiring — commitDocumentSetlist + Route + Button Summary

**Closed the v7.0 doc-driven pipeline: `commitDocumentSetlist` flattens a resolved `{ sections, tracks }` structure + interview metadata into a real setlist (section headers interleaved before their songs, matched library charts bound, recording candidates ignored), a thin band_leader-gated `POST /api/setlists/import/commit-document` route delegates to it, and ImporterModal's preview "Create Setlist" button is wired end-to-end. "Feed a doc, get a setlist" now works from upload to a created, chart-bound setlist.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~35min |
| Started | 2026-05-14T23:15:00Z |
| Completed | 2026-05-14T23:50:00Z |
| Tasks | 3 auto PASS (autonomous — no checkpoints) |
| Files modified | 3 created, 1 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: commitDocumentSetlist flattens a resolved structure and persists it | Pass | `flattenResolvedStructure` emits each section (sorted by `order`) as a `'header'` track followed by its `'song'` tracks (sorted by `order`), then ungrouped tracks last; `toSongInput` maps `vocalLead`→`leadMusician` and binds `libraryMatch.fileId`/`name` when present (missingChart → no `fileId`), ignoring `recordingCandidates`. `commitDocumentSetlist` delegates the write to `createSetlistServerSide`. Proven by `commit.emulator.test.ts` — 2 emulator tests (interleaved-headers + bound-charts + ungrouped-last round-trip; a no-sections structure → all-ungrouped). Emulator suite 56/56. |
| AC-2: The commit-document route persists for an authenticated band_leader | Pass | `POST /api/setlists/import/commit-document` — `createApiHandler` with `{ role: 'band_leader', schema }`; strict zod on the metadata (`name` min 1, `eventDate` string, `serviceType`/`rabbi` optional), `z.array(z.any())` on sections/tracks (import/execute precedent). Delegates to `commitDocumentSetlist`, returns `201 { success, setlistId }`. The wrapper maps the band_leader gate → 403 and schema failure → 400. `next build` ✓ lists the route in the tree. |
| AC-3: The ImporterModal preview commits the setlist | Pass | `handleCommitDocument` guards on `resolved` + `interviewDate`, POSTs `{ name, eventDate, serviceType, rabbi?, sections, tracks }` to the commit route, and on success `toast.success` → `onComplete(setlistId)` → `onOpenChange(false)`; on failure toasts the server error and stays on the preview (`setIsCommitting(false)`). The preview button is no longer `disabled` by default — it shows a `Loader2` spinner + "Creating..." while in flight; the "Back" button is disabled mid-commit. `next build` ✓. |

## Verification Results

- `npx tsc --noEmit` → no errors in `commit.ts`, `commit-document/route.ts`, or `ImporterModal.tsx` (filtered). Pre-existing MCP-test-file + `performance-toolbar.test.tsx` baseline errors are unrelated and not introduced here.
- `npx next build` → ✓ Compiled successfully in 10.1s; `/api/setlists/import/commit-document` appears in the route tree.
- `npm run test:emulator` → **56/56** across 10 emulator-test files, including the new `commit.emulator.test.ts` 2/2. Zero regressions. (Suite grew 38→56 since v70-07-01 — the parallel MCP workstream added emulator coverage; all green.)
- `npx vitest run src/lib/setlist-import` → **39/39** — the non-emulator setlist-import suite (interview-defaults / extract-document / extract-structure / resolve) shows zero regressions.

## Accomplishments

- **The v7.0 doc-driven pipeline is complete and connected end-to-end.** Upload a .docx/.pdf/.txt → extract → Gemini structure → resolve → interview → preview → **create a real setlist** with section headers and matched charts bound. The headline feature works.
- **commitDocumentSetlist is the doc-import write seam** — it owns the flatten (header interleaving, `vocalLead`→`leadMusician`, `libraryMatch`→bound chart, ungrouped-last) and delegates the actual Firestore write to v70-07-01's `createSetlistServerSide`. One write path, clean separation.
- **HFG coverage shipped** — this is a data-layer plan (the commit path writes to Firestore), so it ships a real-emulator test of the flatten + persist round-trip, not a clause-(b) waiver.
- **Zero deviations, in-lane.** No new dependencies, no orchestration route, no recording binding (correctly deferred), no engine touch, no edits outside the setlist-import / ImporterModal lane.

## Task Commits

Project config has `auto_commit: false`. Per memory `feedback_paul_phase_commits`, the entire `.paul/phases/v70-07-interview-form-setlist-preview-commit/` directory + all v70-07 source files (plans 01 + 02 + 03) commit as ONE bundled `feat(v70-07): …` commit at the phase transition — which happens NOW (this is the final plan; the transition runs immediately after this SUMMARY).

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 + plans 01/02 source | `<v70-07 phase-commit>` (created by the transition, immediately after this UNIFY) | feat | Full v70-07: setlist-write module + import/execute refactor + doc-import UI + interview form + preview + commit pipeline |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/setlist-import/commit.ts` | Created | `commitDocumentSetlist` (flatten + delegate to `createSetlistServerSide`) + `flattenResolvedStructure` (resolved structure → interleaved-header `ServerSetlistTrackInput[]`, `libraryMatch`→bound chart) + `CommitDocumentInput` type. |
| `src/lib/setlist-import/__tests__/commit.emulator.test.ts` | Created | 2 emulator tests — interleaved-headers + bound-charts + ungrouped-last round-trip; no-sections structure → all-ungrouped, optional metadata omitted. |
| `src/app/api/setlists/import/commit-document/route.ts` | Created | `POST /api/setlists/import/commit-document` — band_leader-gated, strict-metadata zod schema, delegates to `commitDocumentSetlist`, returns `201 { success, setlistId }`. |
| `src/components/setlist/importer/ImporterModal.tsx` | Modified | Added `isCommitting` state + `handleCommitDocument`; wired the preview "Create Setlist" button (loading spinner / "Creating..." / success toast + `onComplete` + close / error stays on preview); removed the `TODO(v70-07-03)` seam + the "wired in the next step" helper note. |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `commit.ts` owns the flatten, not `setlist-write.ts` | setlist-write.ts is the generic server-side write path; doc-import section-header interleaving + chart binding is setlist-import domain logic | Clean separation — the generic write module stays generic; doc-import specifics live with the other setlist-import libs |
| `commit-document` route is `band_leader`-gated | Creating a setlist is a band-leader action — matches import/execute (the extract/resolve routes are any-authenticated because they are read-only compute) | Consistent auth posture across the import routes |
| `recordingCandidates` ignored on commit | Recording binding deferred entirely for v70-07 (Daniel decision 2026-05-14) | `toSongInput` drops them; recording binding is clean future work |
| No `maxDuration` export on the route | Unlike import/execute (Drive downloads) the commit only does a Firestore batch write | Smaller surface; default duration is sufficient |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** None. The plan executed exactly as written — `tsc`, `next build`, and the emulator suite were all clean on the first qualify pass for every task.

### Deferred Items

None — plan executed exactly as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Bash tool working directory intermittently reset to the repo root | Verified `pwd` before running verification commands (recurring environment quirk this session, not a code issue). |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Invoked before APPLY (BLOCKING per the plan's `<skills>` section). Guidance applied to Task 3: the commit button's loading/disabled states mirror the existing `handleExecute` "Finalize Import" precedent (Loader2 spinner, disabled while in flight, "Back" disabled mid-commit) — no layout shift, clear async feedback. |

**Skill audit: All required skills invoked ✓**

## Next Phase Readiness

**This is the final plan of v70-07 — the phase transition runs immediately after this UNIFY** (3 PLAN files, 3 SUMMARY files — the mechanical check correctly fires). The transition will: evolve PROJECT.md, mark v70-07 ✅ COMPLETE in ROADMAP.md, and create the bundled `feat(v70-07): …` commit covering all three plans' source.

**Ready:**
- v7.0 doc-driven setlist creation is feature-complete and end-to-end. Next milestone phase: **v70-08** — best-practice audit + remediation (4–5 parallel researcher agents; milestone close blocked on it). The whole doc-import pipeline (5 routes + the ImporterModal flow) is now a complete surface for that audit.

**Concerns:**
- Everything across v70-07 is uncommitted until the transition's bundled commit — including v70-07-01's `setlist-write.ts` (which WAS interim-committed + pushed earlier for the MCP workstream) and v70-07-02/03's files. The transition commit will stage `git add .paul/phases/v70-07-interview-form-setlist-preview-commit/` explicitly (memory `feedback_paul_phase_commits`) plus the source files.
- The full upload→commit pipeline is human-verify — three UAT-PENDING entries accumulated across v70-07 (plans 02 + 03). Daniel verifies against a deployed build over the worship cycle.

**Blockers:** None.

---
*Phase: v70-07-interview-form-setlist-preview-commit, Plan: 03*
*Completed: 2026-05-14*
