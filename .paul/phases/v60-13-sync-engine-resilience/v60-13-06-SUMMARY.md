---
phase: v60-13-sync-engine-resilience
plan: 06
subsystem: sync
tags: [dexie, react, useref, content-hash, dedup, hydrator, snapshot-listener, lww]

requires:
  - phase: v60-13-sync-engine-resilience
    provides: outbox-pending guard, tombstone guard, LWW-by-updatedAt at hydrator write sites (v5h-01-02, v60-13-03+04)

provides:
  - Per-doc content-hash dedup ref in SetlistGridHydrator (Map<`${collection}/${docId}`, string>)
  - stableContentHash() helper that JSON-stringifies sorted keys excluding `updatedAt`
  - Skip-write gate at db.setlists.put + db.tracks.bulkPut sites in hydrate() effect
  - Mid-edit edit-preservation: identical-content snapshot re-emissions no longer re-fire useLiveQuery → SetlistGrid no longer re-renders mid-edit

affects:
  - v60-14-mobile-date-picker (root cause may overlap — date picker reset could be the same hydrator-driven re-render)
  - v70-01-image-chart Task 3 (resumes cleanly; no hydrator interaction)
  - any future Hydrator-write change MUST update both write sites consistently with the dedup pattern

tech-stack:
  added: []
  patterns:
    - "Layered-guards pattern: outbox-pending → tombstone → content-hash dedup → LWW. Each guard cheap; order matters for correctness."
    - "Hash-after-write rule: record hash to ref AFTER bulkPut succeeds (not before) so a rolled-back tx doesn't poison future emissions."

key-files:
  created: []
  modified:
    - src/components/setlist/grid/SetlistGridHydrator.tsx
    - src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx

key-decisions:
  - "Hash content excludes updatedAt — the whole point is to skip when only the timestamp drifted"
  - "Dedup lives in hydrator, not snapshot-listener — listener contract locked per plan boundaries; hydrator owns its own write idempotency"
  - "useRef Map (not state, not memo) — must persist across renders without triggering re-renders itself"
  - "Hash recorded AFTER bulkPut, not before — tx rollback safety"

patterns-established:
  - "Content-hash dedup at React-effect-driven Dexie write sites for any future hydrator-style component"
  - "Spy on getDb().{table}.{put|bulkPut} via vi.spyOn for write-count assertions in fake-indexeddb tests"

duration: ~25min
started: 2026-05-14T00:30:00Z
completed: 2026-05-14T01:35:00Z
---

# Phase v60-13 Plan 06: Hydrator Content-Hash Dedup Summary

**Stops the SetlistGridHydrator from re-writing identical-content payloads to Dexie when only `updatedAt` advanced — eliminates Daniel's mid-edit "auto refresh" by preventing the redundant useLiveQuery re-render in SetlistGrid.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25min (read → implement → test → build → deploy → UAT) |
| Started | 2026-05-14T00:30:00Z |
| Completed | 2026-05-14T01:35:00Z |
| Tasks | 1 auto + 1 checkpoint:human-verify (both complete) |
| Files modified | 2 |
| Commits | 1 (`f684563`) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Identical-content snapshots → zero downstream re-renders | Pass | New dedup test asserts no additional `db.setlists.put` / `db.tracks.bulkPut` after re-render with newer `updatedAt` + same content |
| AC-2: Genuine remote changes still propagate | Pass | New dedup test's 3rd render with renamed setlist + renamed track triggers puts; local rows show new content |
| AC-3: Daniel UAT — no mid-edit refresh | Pass | Daniel approved post-deploy: typing within 3s of page load no longer interrupted |
| AC-4: Build + suite green | Pass | `npx vitest run SetlistGridHydrator.test.tsx` → 20/20 pass; `npx next build` exit 0 (only known Serwist+Turbopack info warning) |

## Accomplishments

- Closes Daniel's #1 remaining "real pain" from v60-13 wave 1 UAT — last open P1 in the sync-engine resilience cluster after wave 1's two P0 fixes (v60-13-03 queue drain, v60-13-04 incognito storage probe).
- Layered-guards pattern formalized: `outbox-pending → tombstone → content-hash → LWW` — every existing guard preserved, dedup added on top with no contract changes to snapshot-listener / engine / write fanout.
- Test seam: `vi.spyOn(getDb().setlists, 'put')` + `vi.spyOn(getDb().tracks, 'bulkPut')` assertion pattern is now a reusable shape for any future Hydrator-write change.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1: Content-hash dedup at hydrator write sites + new test | `f684563` | fix | stableContentHash() helper + lastWrittenContentHashRef Map; dedup gates at both write sites; new "v60-13-06 content-hash dedup" describe block (3 assertions: initial puts, identical-content rerender no-op, changed-content rerender propagates) |

(Bundled task + plan metadata + handoff archive in single commit — phase-level commits per memory `feedback_paul_phase_commits` honored, but no PLAN/SUMMARY churn this turn since the PLAN was authored in the prior session.)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/grid/SetlistGridHydrator.tsx` | Modified | Add `stableContentHash()` module helper + `lastWrittenContentHashRef` useRef + dedup gates before `db.setlists.put` and inside the `initialTracks` loop. Hash recorded AFTER `bulkPut` succeeds. |
| `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx` | Modified | New `v60-13-06 content-hash dedup` describe block: spies on `db.setlists.put` + `db.tracks.bulkPut`, asserts (a) puts fire on initial render, (b) rerender with newer updatedAt + identical content fires no additional puts, (c) rerender with renamed setlist + renamed track fires puts and content lands in Dexie. |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Hash excludes `updatedAt` | The bug IS that updatedAt drifts while content stays identical — including it would defeat dedup | All future Hydrator-write logic must respect this |
| Dedup in hydrator, not listener | Plan boundary explicitly locks `snapshot-listener.ts` contract | Future listener edits should not duplicate this dedup |
| `useRef<Map>` (not `useState`, not `useMemo`) | Must persist across renders without itself causing renders; Map gives O(1) lookup keyed by `collection/docId` | Establishes the pattern for any future hydrator-side dedup |
| Hash recorded AFTER `bulkPut` succeeds | Tx rollback would otherwise leave the ref claiming we wrote rows that never landed | Future Hydrator-write changes must follow this ordering |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** None. Plan executed exactly as written.

### Auto-fixed Issues

None.

### Deferred Items

None — the plan's scope-limit boundaries (Issue 2 → v70-09, Issue 3 → v60-14, past delete propagation root-caused by v60-13-03) remain as-noted in the v60-13-06 PLAN.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Plan's prose described the bug as "the hydrator processes BOTH snapshot emissions" — but the hydrator does not directly subscribe to Firestore; the `snapshot-listener` does. | Mapped the plan's intent onto the hydrator's actual write surface: the `hydrate()` effect's two `db.put` sites. The dedup correctly catches the case where `initialSetlist` / `initialTracks` arrive with refreshed `updatedAt` but identical content (which is what reaches the hydrator from the page-level data refresh). The locked-boundary listener handles its own LWW with `>=`. Both layers cooperate. |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ○ (not applicable) | Change is internal sync-layer dedup logic in a frontend component file. No visual surface, no user-facing copy, no styling. The user-facing effect (no mid-edit refresh) is the REMOVAL of an unwanted side-effect, not a UI design change. UI/UX skill not invoked by judgment, not by gap. |

## Next Phase Readiness

**Ready:**
- v70-01-01 Task 3 can resume (toolbar disable + PrintModal banner — ~20 min, no hydrator interaction).
- v60-14-01 (mobile date picker reset) discovery task — root-cause may now auto-resolve since the hydrator no longer re-renders the grid mid-edit. Daniel should re-test the date-picker bug before that plan starts.
- v70-09-01 (setlist metadata editor) — bigger UX work; queue when Daniel has bandwidth for /ui-ux-pro-max consult.

**Concerns:**
- The diagnostic logging from wave 1 (DashboardClient.tsx subscription + outbox console dumps + visible diag strip) is still in code. Not blocking, but should be cleaned up in a follow-up commit before the next non-emergent phase ships.

**Blockers:** None.

---
*Phase: v60-13-sync-engine-resilience, Plan: 06*
*Completed: 2026-05-14*
