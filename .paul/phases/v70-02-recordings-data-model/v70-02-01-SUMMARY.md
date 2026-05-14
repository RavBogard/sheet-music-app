---
phase: v70-02-recordings-data-model
plan: 01
subsystem: database
tags: [recordings, firestore-rules, firestore-indexes, storage-paths, emulator-test, data-model, recordings-collection]

requires:
  - phase: v6.0 (v60-12)
    provides: @firebase/rules-unit-testing dev dep + the firestore-rules emulator test pattern (8-scenario read×write×auth matrix) reused here
provides:
  - NEW `recordings/{id}` Firestore collection — `Recording` TypeScript interface (id, songId? FK, title, fileName?, mimeType?, storagePath, durationSeconds?, notes?, createdAt, createdBy)
  - `getRecordingStoragePath(recordingId, ext)` exported helper — `recordings/{id}.{ext}` Storage path convention (own top-level prefix, parallel to library/{fileId})
  - `match /recordings/{recordingId}` Firestore rules block (read isMember, write band-leader/admin — mirrors songs/{id}); deployed to production
  - Composite index `recordings: songId ASC, createdAt DESC` for the recording-by-song query; deployed to production
  - Emulator-backed rules test (10-scenario read×write×auth matrix)
affects:
  - v70-03 (per-track media affordances) — recording-bind UI + inline `<audio>` builds directly on the Recording type + getRecordingStoragePath + the songId+createdAt index
  - v70-06 (resolve + recording-match) — pre-creates `recordings/*` docs against this model
  - v70-05/v70-07 (doc-driven creation + commit) — recordings are part of the produced setlist

tech-stack:
  added: []
  patterns:
    - "NEW top-level collection foundation phase: type (models.ts) + Storage path helper (firebase-storage.ts) + rules block + composite index + emulator rules test — all additive, all boundary-clean, no UI/route/lib coupling. The recordings/{id} collection mirrors songs/{id} rules shape."
    - "Recordings get their own `recordings/` Storage namespace (NOT `library/`) so the chart sync engine never touches them — clean separation of the chart and recording file domains."

key-files:
  created:
    - src/lib/recordings/__tests__/firestore-rules-recordings.emulator.test.ts
  modified:
    - src/types/models.ts (Recording interface)
    - src/lib/firebase-storage.ts (getRecordingStoragePath helper)
    - firestore.rules (recordings/{recordingId} block)
    - firestore.indexes.json (recordings songId+createdAt composite index)

key-decisions:
  - "Recordings rules mirror songs/{id} (read isMember, write band-leader/admin) — recordings are band-internal reference audio, NOT public-perform-view content, so unauthenticated read is REJECTED (unlike tracks/* which v60-12-01 opened to public)."
  - "songId is an OPTIONAL FK — a recording can exist standalone (uploaded before a song link is known) or song-linked (v7.0 constraint #5: NEW collection, not embedded)."
  - "Own `recordings/` Storage prefix rather than reusing `library/` — keeps the chart sync engine and the recording file domain fully separate."
  - "Composite index songId ASC + createdAt DESC shipped now (not deferred) — the recording-by-song chronological query is the obvious access pattern for v70-03/v70-06, and an index added later requires a deploy + build wait."

patterns-established:
  - "Data-model foundation phase shape: ship the type + Storage path + rules + index + emulator coverage as one boundary-clean additive slice; defer the lib helper / upload route / UI to the phase that actually needs them (avoids premature lib over-building)."

duration: ~30min
started: 2026-05-14T14:50:00Z
completed: 2026-05-14T15:05:00Z
---

# Phase v70-02 Plan 01: Recordings Data Model Summary

**The v7.0 recordings domain foundation: a NEW `recordings/{id}` Firestore collection with its `Recording` type, a `recordings/{id}.{ext}` Storage path convention, security rules + a composite index deployed to production, and emulator-backed rules coverage — no UI, no upload route, just the model v70-03 and v70-06 build on.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30min |
| Started | 2026-05-14T14:50:00Z |
| Completed | 2026-05-14T15:05:00Z |
| Tasks | 3 auto completed (autonomous — no checkpoints) |
| Files modified | 5 (1 created + 4 modified) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Recording type + Storage path helper | Pass | `Recording` interface added to `models.ts` with all specified fields (id, songId?, title, fileName?, mimeType?, storagePath, durationSeconds?, notes?, createdAt, createdBy). `getRecordingStoragePath(recordingId, ext)` exported from `firebase-storage.ts` — normalizes leading dots, guards against double-extension (mirrors getStoragePath). `npx next build` ✓ Compiled successfully; both symbols confirmed exported. |
| AC-2: Firestore rules for recordings/{recordingId} | Pass | `match /recordings/{recordingId}` block added immediately after `songs/{songId}`, mirroring its shape (read isMember; create/update/delete band-leader/admin). Deny-all `match /{document=**}` remains the last match block. `firebase deploy --only firestore:rules` — "rules file compiled successfully" + "released rules to cloud.firestore". |
| AC-3: Composite index for the recording-by-song query | Pass | `recordings: songId ASC + createdAt DESC` composite index appended to `firestore.indexes.json` (valid JSON — deploy parsed it). `firebase deploy --only firestore:indexes` — "deployed indexes successfully". |
| AC-4: Emulator-backed rules coverage (HFG-preserving) | Pass | `firestore-rules-recordings.emulator.test.ts` — 10 scenarios (unauth read REJECTED / member read SUCCEEDS / member songId query SUCCEEDS / unauth C-U-D REJECTED / member-only create REJECTED / band-leader create+update+delete SUCCEEDS / admin create SUCCEEDS). `npm run test:emulator` → 10/10 green (30/30 across all 5 emulator files). Reads the real `firestore.rules` via `readFileSync`. **HFG counter held at 0/3** — real-Firestore emulator coverage, no clause-(b) waiver. |
| AC-5: Type-safety + suite green | Pass | `npx next build` exits 0. `npx vitest run` main suite → 1650 passed / 52 failed — 52-failure baseline held exactly (zero new regressions; the "1 error" in the summary is pre-existing environmental noise — firebase-admin MetadataLookupWarning / jsdom navigation — not introduced here; the new emulator test is excluded from the main config). |

## Accomplishments

- **v7.0 Wave 1 foundation shipped.** The `recordings/{id}` collection now exists end-to-end as a data model: type, Storage path convention, security rules, and a composite index — all deployed to production. v70-03 (recording-bind UI) and v70-06 (recording-match) can build directly on it with zero further data-model work.
- **HFG counter preserved at 0/3 on a data-layer phase** via emulator-backed rules coverage — no clause-(b) waiver consumed (the v6.0-established discipline: every data-layer phase ships real-Firestore coverage).
- **Boundary-clean additive slice** — every change is purely additive (one new interface, one new exported function, one new rules block, one new index entry, one new test file). Zero existing code paths touched; the v6.0 tracks/songs/library_index data layer is entirely unaffected.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 + plan metadata | `<phase-commit>` | feat | Recording type + getRecordingStoragePath + recordings rules block + composite index + emulator rules test; v70-02 phase close |

(Single bundled phase commit per the transition workflow + memory `feedback_paul_phase_commits`.)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/types/models.ts` | Modified | `Recording` interface — the recordings/{id} document shape |
| `src/lib/firebase-storage.ts` | Modified | `getRecordingStoragePath(recordingId, ext)` exported helper — `recordings/{id}.{ext}` convention |
| `firestore.rules` | Modified | `match /recordings/{recordingId}` block — read isMember, write band-leader/admin |
| `firestore.indexes.json` | Modified | `recordings` composite index (songId ASC, createdAt DESC) |
| `src/lib/recordings/__tests__/firestore-rules-recordings.emulator.test.ts` | Created | 10-scenario emulator-backed rules test |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Recordings rules mirror `songs/{id}` (read isMember, write band-leader/admin) | Recordings are band-internal reference audio — not public-perform-view content like tracks/* | Unauthenticated read REJECTED; recordings stay band-gated |
| `songId` is an OPTIONAL FK | A recording may be uploaded standalone before a song link exists, or be song-linked (v7.0 constraint #5) | v70-03/v70-06 must handle both standalone and song-linked recordings |
| Own `recordings/` Storage prefix (not `library/`) | Keeps the chart sync engine and the recording file domain fully separate | The chart sync/cron never touches recordings |
| Composite index shipped now, not deferred | The recording-by-song chronological query is the obvious v70-03/v70-06 access pattern; a later index add costs a deploy + build wait | v70-03 can run `where('songId','==',x).orderBy('createdAt','desc')` immediately |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** None. Plan executed exactly as written — 3 auto tasks, no checkpoints, no GAP/DRIFT at qualify, all 5 ACs Pass.

### Auto-fixed Issues

None — plan executed exactly as written.

### Deferred Items

None — all in-scope work shipped. Out-of-scope items (recording upload route, recording-bind UI + playback, `recordings` lib helper, doc pre-creation) were scoped out by the plan's SCOPE LIMITS and belong to v70-03/v70-06 by design.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `firebase deploy` warned "4 indexes defined in your project that are not present in your firestore indexes file" | Pre-existing index drift, NOT caused by this change — this plan only ADDED the recordings index. Did NOT run `--force` (would delete the drifted indexes). Out of scope; noted for a future cleanup if desired. |
| Initial `Edit` on `firestore.rules` failed ("File has not been read yet") | The file had been read via `Bash cat` earlier, not the `Read` tool. Re-read via `Read`, then the edit applied cleanly. |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | N/A | SPECIAL-FLOWS.md requires /ui-ux-pro-max for "any phase that touches frontend UI/UX". v70-02 is a data-layer-only phase — no components, no styling, no user-facing surface. Consistent with v60-04..v60-12 data-layer phases that recorded the gate as N/A. |

## Next Phase Readiness

**Ready:**
- v70-03 (per-track media affordances — chart click-through + recording-bind UI with inline `<audio>`) — builds directly on the `Recording` type, `getRecordingStoragePath`, the rules, and the `songId+createdAt` index. /ui-ux-pro-max BLOCKING for v70-03.
- v70-06 (resolve + missing-chart + recording-match) — pre-creates `recordings/*` docs against this model.

**Concerns:**
- Pre-existing `firestore.indexes.json` drift (4 indexes in the project not in the file) — benign, but a future `firebase firestore:indexes` reconciliation could tidy it. Not a blocker.
- v70-03 will need a `recordings` lib helper (subscribe/fetch-for-song) and a recording upload route — intentionally NOT built here to avoid premature lib over-building; v70-03 owns that.

**Blockers:** None.

---
*Phase: v70-02-recordings-data-model, Plan: 01*
*Completed: 2026-05-14*
