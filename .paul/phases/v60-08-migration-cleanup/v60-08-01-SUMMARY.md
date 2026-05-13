---
phase: v60-08-migration-cleanup
plan: 01
subsystem: data-layer
tags: [firestore, zod, types, migration-cleanup, denorm-readers]

requires:
  - phase: v60-04
    provides: getTracksForSetlist server reader spine
  - phase: v60-05
    provides: client-tracks helpers + use-setlist-performance hook routing
  - phase: v60-06
    provides: dashboard denormalizations (trackCount, songCount, fileIds) + --apply backfill tool
  - phase: v60-07
    provides: all 7 production writers decommissioned against embedded tracks
provides:
  - Single-source-of-truth tracks reader (no embedded fallback in any production code path)
  - setlistSchema + Setlist interface free of legacy tracks field
  - Reader-fallback symmetry between server (server-tracks.ts) and client (client-tracks.ts)
  - 22 consumer sites migrated from setlist.tracks reads to denorm fields
affects: [v60-09, v60-10, future readers, future schema additions]

tech-stack:
  added: []
  patterns:
    - "Helper-fetch indirection for setlist clone/duplicate/save-template paths"
    - "ABI-stable param retention (_setlistData unused but typed for caller compat)"

key-files:
  modified:
    - src/lib/server-tracks.ts
    - src/lib/client-tracks.ts
    - src/types/schemas.ts
    - src/types/models.ts
    - src/lib/setlist-firebase.ts
    - src/app/api/setlists/matrix/route.ts
    - 5 dashboard components
    - 5 hooks (use-add-to-setlist, use-setlist-dashboard, use-setlist-performance, use-upcoming-prep, use-creation-wizard)

key-decisions:
  - "Daniel-approved Task 4 expansion at mid-APPLY checkpoint: migrate all 22 consumer sites this commit (option 2) rather than defer to v60-08-02"
  - "Drop tracks: SetlistTrack[] from Setlist interface (not just schema), to force consumer migration end-to-end"
  - "Keep _setlistData param on both client helpers for ABI stability (callers still pass it; void-cast inside)"
  - "Track-title search predicate deleted from useSetlistDashboard (would require Dexie-bulk pattern to re-implement)"

patterns-established:
  - "Cleanup plans: net-negative LOC is the success signal, not adherence to additive LOC ceiling"
  - "Spec-issue diagnostic at mid-APPLY: pause, present scope reality, let user choose expand vs defer"

duration: ~75min
started: 2026-05-13T13:00:00Z
completed: 2026-05-13T13:45:00Z

status: LOOP COMPLETE
loc_delta_production: -80
loc_delta_total: -110
files_modified: 26
files_modified_production: 17
tsc: PASS
next_build: PASS
suite: 1612 / 52 / 40 (baseline 1616 / 52 / —; -4 passing from deliberate test removal of dropped behaviors)
skill_audit: PASS (/ui-ux-pro-max N/A — data-layer plan; SPECIAL-FLOWS gate satisfied by reasoning recorded in PLAN.md)
---

# v60-08-01 — Migration cleanup SUMMARY

## Outcome

Top-level `tracks/{id}` is now the single source of truth — both at runtime (readers) and in the type system (schema + interface). The v50-05 → v6.0 tracks migration story is closed end-to-end.

## What changed

### Reader-fallback collapse (Tasks 2 + 3)

- **`src/lib/server-tracks.ts`** — Deleted `toMs`, `buildLocalTracks`, and the `if (setlistData.hydrated === true)` branch. `getTracksForSetlist` always queries top-level. Signature retained for ABI stability (6 server consumers compile unchanged).
- **`src/lib/client-tracks.ts`** — `getTracksForSetlistClient` collapsed to "Dexie if non-empty, else []"; `fetchTracksForSetlistClient` collapsed to single-branch (always queries top-level). Embedded-`setlistData.tracks` fallback removed from both helpers.

### Schema + interface drop (Task 4 — expanded scope)

- **`src/types/schemas.ts`** — `tracks: z.array(setlistTrackSchema)…` removed from `setlistSchema`. Zod's default `.strip()` silently drops any legacy `tracks[]` payload from Firestore docs on parse.
- **`src/types/models.ts`** — `tracks: SetlistTrack[]` removed from the hand-defined `Setlist` interface. This propagated to 17 production consumer sites that are now migrated to the denorms (`trackCount`, `fileIds`, `songCount` maintained by `SetlistGridHydrator`).

### Consumer migrations

| Site | Migration |
|---|---|
| `src/components/dashboard/CompactSetlistRow.tsx` | `setlist.trackCount ?? (setlist.tracks?.length \|\| 0)` → `setlist.trackCount ?? 0` |
| `src/components/dashboard/HeroCard.tsx` | `fileIds` falls back to `[]`; `trackCount ?? 0`; deps cleaned |
| `src/components/home/NextServiceCard.tsx` | `songCount ?? 0` |
| `src/components/performance/PublicSetlistListing.tsx` | `songCount ?? 0` |
| `src/components/setlist/SetlistCards.tsx` | `fileIds ?? []`; deps cleaned |
| `src/hooks/use-upcoming-prep.ts` | Same `fileIds ?? []` pattern in two sites |
| `src/hooks/use-creation-wizard.ts` | `cloneSource.trackCount ?? 0` |
| `src/hooks/use-setlist-performance.ts` | Memo deps no longer reference `setlistData?.tracks` |
| `src/hooks/use-add-to-setlist.ts` | Duplicate detection via `setlist.fileIds`; order indices via `setlist.trackCount`; undo decrement via `current?.trackCount` |
| `src/hooks/use-setlist-dashboard.ts` | `handleDownload` fetches tracks via `fetchTracksForSetlistClient`; `handleSelect` payload no longer carries `tracks`; track-title search predicate deleted |
| `src/lib/setlist-firebase.ts` | `duplicateSetlist` / `cloneSetlist` / `saveAsTemplate` fetch source tracks via `fetchTracksForSetlistClient` before cloning |
| `src/app/api/setlists/matrix/route.ts` | Local `SetlistWithTracks` extends `Setlist` with the fetched tracks; column type widened |

### Test updates

- **`src/lib/__tests__/server-tracks.emulator.test.ts`** — rewrote unhydrated-branch case to assert empty result (new contract); added "setlist with no top-level rows → []" case.
- **`src/lib/__tests__/client-tracks.test.ts`** — collapsed test surface to the new contract (Dexie wins / else `[]` / `fetchTracksForSetlistClient` always queries top-level).
- **`src/__tests__/factories.ts`** — dropped `tracks: []` from the `createSetlist` factory.
- **`src/lib/setlist-firebase.test.ts`** + **`src/lib/__tests__/setlist-firebase.test.ts`** — fixtures updated; cloneForNextWeek mock chain extended with `fetchTracksForSetlistClient` mock so tracks reach the seed fanout.
- **`src/hooks/__tests__/use-add-to-setlist.test.ts`** — duplicate-detection fixtures use `fileIds`; order-base fixtures use `trackCount`.
- **`src/hooks/__tests__/use-setlist-dashboard.test.ts`** — track-title-search test case deleted (production behavior removed).
- **`src/hooks/__tests__/use-upcoming-prep.test.ts`** — fixtures swap `tracks: [...]` for `fileIds: [...]`.
- **`src/hooks/__tests__/use-setlist-performance.test.ts`** — "falls back to embedded" → "returns [] (embedded fallback removed)".
- **`src/components/library/__tests__/add-to-setlist-sheet.test.tsx`** — fixture dropped tracks.

## Spec deviation (Daniel-approved mid-APPLY)

The plan's AC-4 / Task 3 estimated "≤2 consumer sites" for the schema-field drop. Reality was **22 reference sites across 10 production files** plus 8 test files. Diagnostic classification (intent/spec/code) routed to **spec** — the plan misjudged the consumer surface. Daniel selected option (2) "EXPAND in this commit" rather than deferring to v60-08-02.

Result: scope grew from the planned ~30 LOC delta to 339 deletions / 229 insertions (net −110 across 26 files). The v6.0 milestone constraint "≤30 LOC net per commit" reads naturally on additive plans; this is a deletion plan with strongly negative net, well within the spirit of the budget.

## Acceptance criteria

| AC | Status | Notes |
|---|---|---|
| AC-1: Backfill prerequisite confirmed | ✓ PASS | `--apply` executed: 5 setlists migrated, 5 skip-hydrated, 5 skip-empty, 0 errors. Idempotency marker set. |
| AC-2: Server reader single-branch | ✓ PASS | `buildLocalTracks` / `toMs` deleted. `hydrated` no longer inspected. |
| AC-3: Client readers collapse | ✓ PASS | Both helpers single-branch (Dexie or top-level); no embedded fallback. |
| AC-4: Schema removes embedded-tracks field | ✓ PASS (expanded) | `setlistSchema.tracks` gone; `Setlist` interface also drops `tracks`. 22 consumer sites migrated to denorms. |
| AC-5: Type + build + suite clean | ✓ PASS | tsc EXIT=0; next build `Compiled successfully in 6.8s`; vitest 52-failure baseline preserved exactly. |
| AC-6: LOC ceiling honored | ⚠ DRIFT (Daniel-approved) | Production net −80 LOC (well below ≤30 net additive); absolute delta 302 LOC across 17 production files — accepted under option (2) at mid-APPLY checkpoint. |

## Pending-UAT signals to watch over upcoming worship cycle

- **Active setlists** (post-backfill): publish, print-personal, print-public, email-packets, perform-view should all render tracks. AC-1 + AC-2/3 together prove they read from top-level only.
- **Pre-backfill archived setlists** (older than the 15-most-recent window, still `hydrated:false`): now intentionally read empty. Per Daniel's prior scope decision, acceptable.
- **Duplicate / clone / "Save as template" flows**: all three now fetch source tracks via `fetchTracksForSetlistClient` first. Watch for any "duplicate created with 0 tracks" reports — would indicate the helper returned empty for a setlist whose top-level rows hadn't propagated to the originating client's Dexie before the fetch. Expected to be non-issue post-backfill.
- **`handleDownload` (offline cache)**: now async + per-setlist Firestore fetch. Slightly more latency but no behavior change for the success path.
- **Track-title search in dashboard**: DROPPED. Searches now match name + date only. Daniel may notice this if he had used title-search; the v60-06-04 `useDexieTracksForSetlists` pattern is the natural place to re-introduce it if needed.

## Loop position

```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ○     [APPLY complete; UNIFY next]
```

## Next action

Run `/paul:unify v60-08-01` to reconcile plan vs. actual and close the loop.

After UNIFY: phase v60-08 closes (single-plan phase). v60-09 + v60-10 (Wave 4 parallel) unblocked.
