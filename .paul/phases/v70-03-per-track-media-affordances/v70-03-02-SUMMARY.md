---
phase: v70-03-per-track-media-affordances
plan: 02
subsystem: ui
tags: [recordings, recording-bind, audio-playback, api-route, firebase-storage, mobile-row-card, popover]

requires:
  - phase: v70-02 (recordings-data-model)
    provides: the Recording type, getRecordingStoragePath, the recordings/{id} Firestore rules, and the songId+createdAt composite index
  - phase: v70-03-01 (chart click-through)
    provides: the RENDER-PATH finding (MobileRowCard is the live path) + the stopPropagation gesture-isolation pattern for row-card interactive children
provides:
  - POST /api/recordings/upload — multipart audio upload → Storage + recordings/{id} doc (band-leader/admin gated)
  - GET /api/recordings/file/[id] — admin-side audio serving route (no client Storage SDK, no storage.rules change)
  - uploadRecordingToStorage + downloadFromStoragePath helpers in firebase-storage.ts
  - src/lib/recordings/recordings-client.ts — subscribeRecordingsForSong / uploadRecording / getRecordingPlaybackUrl
  - RecordingBindPopover + RecordingCell — per-row recordings UI with inline <audio> + gated upload
  - Recording affordance wired into MobileRowCard beside the chart indicator
affects:
  - v70-06 (resolve + recording-match) — pre-creates recordings/* docs against this model; can reuse recordings-client
  - any future phase touching the setlist row card — MobileRowCard now has both a chart link and a recording affordance

tech-stack:
  added: []
  patterns:
    - "Recordings playback via an admin-side serving route (GET /api/recordings/file/[id]) — mirrors /api/drive/file. The admin SDK bypasses Storage rules, so the client never needs the Firebase Storage SDK and storage.rules needs no recordings/ block."
    - "Recordings-specific Storage helpers (uploadRecordingToStorage, downloadFromStoragePath) — kept separate from getStoragePath/uploadToStorage which hardcode the library/ prefix."
    - "Per-row popover subscribes to Firestore only while open (not a per-row always-on listener) — avoids 40+ listeners across a large setlist."

key-files:
  created:
    - src/app/api/recordings/upload/route.ts
    - src/app/api/recordings/file/[id]/route.ts
    - src/lib/recordings/recordings-client.ts
    - src/components/setlist/grid/RecordingBindPopover.tsx
    - src/components/setlist/grid/cells/RecordingCell.tsx
    - src/components/setlist/grid/__tests__/RecordingBindPopover.test.tsx
  modified:
    - src/lib/firebase-storage.ts (uploadRecordingToStorage + downloadFromStoragePath helpers)
    - src/components/setlist/grid/MobileRowCard.tsx (recording affordance beside the chart indicator)
    - src/components/setlist/grid/__tests__/MobileRowCard.test.tsx (+3 tests)

key-decisions:
  - "Recording playback goes through an admin-side serving route, not the client Storage SDK — storage.rules has no recordings/ block and the client never uses firebase/storage; the route IS the access control."
  - "RecordingBindPopover manages its own (uncontrolled) open state — unlike the chart path there is no context-menu handoff, so no controlled-open wiring is needed."
  - "RecordingCell is keyboard-focusable (no tabIndex={-1}, unlike the dead-path ChartCell) — it is a real interactive trigger in the live card, matching the v70-03-01 chart link's focusability."
  - "hasRecordings stays optional/usually-undefined — no per-row Firestore subscription just to colour the cell; the popular subscribes only on open."

patterns-established:
  - "New top-level-collection UI surface = serving route + thin client lib + popover + cell, wired into MobileRowCard — parallels the chart affordance, all gesture-isolated with stopPropagation on the trigger."

duration: ~70min
started: 2026-05-14T16:30:00Z
completed: 2026-05-14T17:40:00Z
---

# Phase v70-03 Plan 02: Recording-Bind UI Summary

**Per-track recording affordance shipped: a row-card popover (`RecordingBindPopover`) that lists a song's reference recordings newest-first, plays them inline via native `<audio>`, and lets band-leaders/admins upload new ones — backed by two new API routes (`/api/recordings/upload` + `/api/recordings/file/[id]`) and a thin `recordings-client` lib, all built on the v70-02 recordings data model with no `storage.rules` change.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~70min |
| Started | 2026-05-14T16:30:00Z |
| Completed | 2026-05-14T17:40:00Z |
| Tasks | 4 auto PASS + 1 checkpoint:human-verify → UAT-PENDING |
| Files | 6 created + 2 modified (+ 1 test file modified) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Upload a recording for a song | Pass (API layer) | `POST /api/recordings/upload` — `createApiHandler` + `checkRateLimit('upload')`; band-leader/admin gate (403 otherwise); audio-mime ALLOWED map + extension fallback + 25MB cap (400 otherwise); `rec-${uuid}` id; `uploadRecordingToStorage` → `recordings/{id}.{ext}`; writes the v70-02 `Recording`-shaped doc; 201. `next build` ✓. Runtime upload (real Storage write + member-403) is in `.paul/UAT-PENDING.md`. |
| AC-2: List + play recordings inline | Pass | `RecordingBindPopover` subscribes via `subscribeRecordingsForSong` (the v70-02 `songId+createdAt` index), lists newest-first, each with `<audio controls preload="none" src={getRecordingPlaybackUrl(rec)}>`; empty state present. `RecordingBindPopover.test.tsx` 3/3: lists 2 recordings + 2 `<audio>` with correct src; empty state; upload-affordance gating. |
| AC-3: Serving route is auth-gated and streams audio | Pass (API layer) | `GET /api/recordings/file/[id]` — `requireAuth:false` + Bearer-or-`hasBrowserFetchMetadata` (mirrors `/api/drive/file`); 404 on unknown id / missing storagePath; streams bytes with the doc's `mimeType` + `Content-Disposition: inline` via `downloadFromStoragePath`. `next build` ✓. Runtime stream + unauth-reject is in `.paul/UAT-PENDING.md`. |
| AC-4: Recording affordance wired into the row card | Pass | `MobileRowCard` renders `RecordingCell` (AudioLines icon) beside the chart indicator — wrapped in `RecordingBindPopover` when `track.songId` is set, rendered `disabled` (no popover) otherwise. The trigger `onClick` calls `e.stopPropagation()` so opening the popover does not toggle the card's tap-to-edit. `MobileRowCard.test.tsx` +3: enabled-when-songId, disabled-when-no-songId, click-does-not-call-onTap. Long-press / drag-handle logic untouched. |

## Accomplishments

- **The recordings domain is now usable end-to-end.** v70-02 shipped the data model; v70-03-02 is the first surface that lets a musician actually open, play, and upload reference recordings — straight from a setlist row.
- **No `storage.rules` change, no client Storage SDK.** Playback flows through an admin-side serving route that mirrors the established `/api/drive/file` pattern — the route is the access control.
- **Clean build + zero new regressions.** `next build` ✓ after every task (4 builds); `RecordingBindPopover.test.tsx` 3/3 + `MobileRowCard.test.tsx` 11/11 + `MobileCardList.test.tsx` (live-path) green — 17/17 across the live-path grid files.
- **Plan executed exactly as the re-spec'd PLAN specified** — 4 auto tasks, no deviations, no escalations, no GAP/DRIFT at qualify.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–4 + v70-03-01 + plan metadata | `<phase-commit>` | feat | Recording API routes + recordings-client lib + RecordingBindPopover/RecordingCell + MobileRowCard wiring; bundled with the v70-03 phase commit (covers v70-03-01 chart click-through too — see feedback_paul_phase_commits) |

Committed at the v70-03 phase transition (single bundled phase commit — v70-03-01 + v70-03-02 + all `.paul/` phase files together).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/recordings/upload/route.ts` | Created | `POST` — band-leader/admin audio upload → Storage + `recordings/{id}` doc |
| `src/app/api/recordings/file/[id]/route.ts` | Created | `GET` — admin-side auth-gated audio serving (streams from Storage) |
| `src/lib/recordings/recordings-client.ts` | Created | Client lib — `subscribeRecordingsForSong` / `uploadRecording` / `getRecordingPlaybackUrl` |
| `src/components/setlist/grid/RecordingBindPopover.tsx` | Created | Per-row popover — recordings list + inline `<audio>` + gated upload affordance |
| `src/components/setlist/grid/cells/RecordingCell.tsx` | Created | `forwardRef` button trigger (AudioLines icon), enabled/disabled states |
| `src/components/setlist/grid/__tests__/RecordingBindPopover.test.tsx` | Created | 3 tests — list+audio, empty state, upload-gating |
| `src/lib/firebase-storage.ts` | Modified | `uploadRecordingToStorage` + `downloadFromStoragePath` helpers (recordings-specific; do not reuse the `library/`-prefixed helpers) |
| `src/components/setlist/grid/MobileRowCard.tsx` | Modified | Recording affordance wired beside the chart indicator |
| `src/components/setlist/grid/__tests__/MobileRowCard.test.tsx` | Modified | +3 tests (recording affordance enabled/disabled/gesture-isolation); `Harness` already had the `onTap` spy from v70-03-01 |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Admin-side serving route for playback, not the client Storage SDK | `storage.rules` has no `recordings/` block and the client never imports `firebase/storage`; an admin-side route mirrors `/api/drive/file` and IS the access control | No `storage.rules` change; no new client dependency |
| Recordings-specific Storage helpers (`uploadRecordingToStorage`, `downloadFromStoragePath`) | `getStoragePath`/`uploadToStorage` hardcode the `library/` prefix; `downloadFromStorage` guesses paths — recordings know their exact `storagePath` | Clean separation of the chart and recording file domains |
| `RecordingBindPopover` uncontrolled open state | No context-menu handoff for recordings (unlike the chart path) — internal `useState` is simpler | Less wiring in `MobileRowCard` than the chart affordance needed |
| `RecordingCell` is keyboard-focusable (dropped `tabIndex={-1}`) | It is a real interactive trigger in the live card; the dead-path `ChartCell`'s `tabIndex={-1}` was a grid-nav artifact; matches the v70-03-01 chart link | Keyboard users can reach the recording affordance |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Trivial — a typo'd import line, caught + fixed before any build |
| Scope additions | 0 | — |
| Deferred | 1 | The human-verify checkpoint → `.paul/UAT-PENDING.md` (standing pattern) |

**Total impact:** None of consequence. The plan executed exactly as the re-spec'd PLAN specified — 4 auto tasks, all PASS at qualify, no GAP/DRIFT, no escalations.

### Auto-fixed Issues

**1. [Typo] Garbage import line in RecordingBindPopover.tsx**
- **Found during:** Task 3 (RecordingBindPopover authoring), immediately on review before the build.
- **Issue:** The React import block contained a nonsense line (`useРef as _unused` — a stray Cyrillic character) introduced while writing the file.
- **Fix:** Removed the bogus line; the import block is just `useEffect, useRef, useState, type ChangeEvent, type ReactNode`.
- **Files:** `src/components/setlist/grid/RecordingBindPopover.tsx`
- **Verification:** `next build` after Task 3 ✓ Compiled successfully.

### Deferred Items

- **v70-03-02 human-verify checkpoint** → appended to `.paul/UAT-PENDING.md` (the standing `feedback-uat-checklist` pattern — checkpoints accumulate, Daniel verifies the whole list against the deployed build at milestone end). 7-item checklist covering upload, inline playback, persistence, disabled-when-no-song, gesture isolation, member-403, and the iPad pass.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `getBucket()` in firebase-storage.ts is a private (non-exported) function | Added the new recordings helpers (`uploadRecordingToStorage`, `downloadFromStoragePath`) inside `firebase-storage.ts` itself so they can use `getBucket()` directly — no need to export it. |
| MobileRowCard test would otherwise pull in the real Firestore client via `RecordingBindPopover` → `recordings-client` → `@/lib/firebase` | Mocked `../RecordingBindPopover` as a pass-through in `MobileRowCard.test.tsx` so the MobileRowCard tests stay isolated unit tests (RecordingBindPopover behavior is covered in its own file). |
| Bash shell cwd kept resetting to the repo root | Prefixed build/test commands with an absolute `cd` into `sheet-music-app/`. |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Invoked this session; re-consulted (targeted UX search) before Task 3 for the popover/list/audio/upload UI. Guidance applied: helpful empty state (not blank), `role="alert"` for the upload error, focusable interactive trigger, ≥44px touch target, distinct icon (`AudioLines`) from the chart `Music` icon, native `<audio controls>` (no custom player), `preload="none"` so the popover doesn't fetch every file on open. |

## Next Phase Readiness

**Ready:**
- v70-03 phase is complete (2/2 plans LOOP CLOSED) — transition runs next: PROJECT.md evolve, ROADMAP v70-03 → complete, bundled phase commit + push.
- v70-04 (doc upload + text extraction) is the next ROADMAP phase (Wave 2, parallel-eligible with v70-03 which is now done).
- v70-06 (resolve + recording-match) can build on `recordings-client.ts` and the upload route to pre-create `recordings/*` docs.

**Concerns:**
- Nothing is committed/pushed until the transition runs (next step in this UNIFY). The two `.paul/UAT-PENDING.md` entries (v70-03-01 + v70-03-02) get their deployed-commit SHA at that point.
- The dead `SetlistGrid` TanStack-table block (COLUMNS, SortableRow, useReactTable, ChartCell, ChartBindPopover in-cell usage) remains real tech debt — a future phase should delete it. Out of scope for v70-03.
- `durationSeconds` on the `Recording` type is never populated (no media-metadata parser added, by design) — the inline `<audio>` shows duration once loaded, so this is cosmetic-only; revisit only if a recordings list view needs it.

**Blockers:** None.

---
*Phase: v70-03-per-track-media-affordances, Plan: 02*
*Completed: 2026-05-14*
