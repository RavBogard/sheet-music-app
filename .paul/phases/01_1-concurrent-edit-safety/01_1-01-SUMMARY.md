# Phase 1.1 — Concurrent-edit Safety — SUMMARY

**Completed:** 2026-04-13
**Status:** Code + tests + migration shipped to prod. Two-tab smoke test pending.

## What shipped

### Service layer (`src/lib/setlist-firebase.ts`)
- New `StaleWriteError` export (sentinel with `remoteUpdatedAt`).
- New `updateSetlistWithVersion(ref, expectedUpdatedAt, patch)` helper — runs inside `runTransaction`, verifies precondition, stamps `updatedAt: serverTimestamp()`.
- `updateSetlist(id, data, expectedUpdatedAt=null)` — rewired onto the helper. Null skips precondition (legacy-doc path).
- `swapTrack(id, idx, replacement)` — signature changed (no longer takes `currentTracks`). Reads current tracks **inside** the transaction; mutates the target index only.

### Editor hook (`src/hooks/use-setlist-logic.ts`)
- Imports `Timestamp` + `StaleWriteError`.
- New state: `lastSeenUpdatedAtRef`, `pendingRemoteSnapshotRef`, `staleDetected`.
- New subscription effect: on mount (given a `setlistId`), calls `subscribeToSetlist`. First snapshot adopted as baseline silently. Subsequent advances either silently merge (no pending edits) or set `staleDetected=true` and stash the remote snapshot.
- `performSave` threads `lastSeenUpdatedAtRef.current` as `expectedUpdatedAt`. On `StaleWriteError`, surfaces the banner instead of toasting an error.
- New actions exposed: `takeRemote` (discard local, adopt remote) and `keepLocalChanges` (force-save over remote).

### UI
- New `src/components/setlist/v2/SetlistChangedBanner.tsx` — amber alert between TopBar and track list with "Keep my changes" / "Take remote" buttons.
- `SetlistEditorV2` wires the banner; renders only when `staleDetected`.

### Propagation to other callers
- `src/hooks/use-add-to-setlist.ts:127` — passes `setlist.updatedAt` as precondition when it's a `Timestamp`; falls back to null.
- `src/components/setlist/ChatPanel.tsx:302` — uses default null precondition (ChatPanel writes to a non-editing setlist; race is minimal).
- `src/app/api/setlist/publish/route.ts` — publish writes explicitly **skip** precondition (documented inline) but now stamp `updatedAt` on both the initial-publish and re-notify branches so open editors see the change.
- `src/app/perform/setlist/[id]/page.tsx:69` — swap call site updated for the new `swapTrack` signature.

### Migration
- New `scripts/backfill-setlist-rev.ts` — idempotent, env-driven admin init matching `migrate-remove-isPublic.ts`.
- **Prod run:** `{ total: 26, touched: 10, skipped: 16 }`.
- **Re-run (idempotency check):** `{ total: 26, touched: 0, skipped: 26 }` ✓

### Tests
- Mock rewrite: `vi.hoisted(...)` for shared state + a new `runTransaction` mock that delegates to `hoisted.txRemoteDoc` / `hoisted.txUpdatePayloads`.
- 5 new cases in `setlist-firebase.test.ts`:
  1. `updateSetlist` runs inside the transaction and stamps `updatedAt`.
  2. Matching precondition commits successfully.
  3. Stale precondition throws `StaleWriteError` and writes nothing.
  4. Null precondition = skip-check path.
  5. Regression guard: every `updateSetlist` write advances `updatedAt`.
  6. `swapTrack` reads remote tracks (not caller-supplied), mutates only the target index.
- Full suite: **1089/1089 pass** (one unrelated file failure carried over from v4.1; env-validation bug in `song-charts-library.test.tsx`, not touched here).
- Typecheck: exit 0.

## Deviations from plan

- None significant. Plan called for a "local diff panel so unsaved edits are preserved after refresh." Implemented as the simpler binary "Keep / Take" — matches the plan's scope-limit note that a full diff UI is not required for v4.2.
- `swapTrack` signature changed (removed `currentTracks` parameter). Only one call site outside the service itself (`/perform/setlist/[id]/page.tsx`); updated. No public API change is expected to ripple further.

## Not yet done (Task 8 — needs human verification)

**Two-tab production smoke test.** Open the same setlist in two tabs (or two browsers). In tab A, swap track 1 or edit the name. In tab B (without refreshing), edit something else within the 1-second autosave debounce window. Expected: tab B either gets the banner *or* silently picks up tab A's change (if tab B had no pending edits). No data loss in either direction.

## Files changed

Code:
- `src/lib/setlist-firebase.ts`
- `src/lib/setlist-firebase.test.ts`
- `src/hooks/use-setlist-logic.ts`
- `src/hooks/use-add-to-setlist.ts`
- `src/components/setlist/v2/SetlistEditorV2.tsx`
- `src/components/setlist/v2/SetlistChangedBanner.tsx` (new)
- `src/app/perform/setlist/[id]/page.tsx`
- `src/app/api/setlist/publish/route.ts`

Scripts:
- `scripts/backfill-setlist-rev.ts` (new)

## Commit

`d6004bf` pushed to `origin/master`. Vercel auto-deploys to production.
