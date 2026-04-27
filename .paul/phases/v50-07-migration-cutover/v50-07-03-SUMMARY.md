---
phase: v50-07-migration-cutover
plan: 03
subsystem: ui-data-bridge
tags: [react, firestore, dexie, sync-engine, lazy-migration, onSnapshot, vitest, jest-axe-not-needed]

requires:
  - phase: v50-04
    provides: scripts/migrate-v50.ts shape spec (top-level tracks/{id} target collection)
  - phase: v50-05-01
    provides: ProductionFirestoreAdapter writes top-level tracks/{id}; SetlistGrid consumes via dexie-react-hooks
  - phase: v50-06-01
    provides: applyEdit + outbox engine + per-doc drain ordering invariant
  - phase: v50-06-03
    provides: SetlistGridHydrator post-Dexie-priming effect slot; perf-view audit Outcome 2 routing forward; snapshot-listener pattern
  - phase: v50-07-01
    provides: production audit (24 legacy setlists, 650 embedded tracks, 0 songIds, 0 top-level tracks/*) + Option C Hybrid selection
  - phase: v50-07-02
    provides: MARKER_PATH patch + liveState scrub (data-layer prereqs cleared)

provides:
  - LocalSetlist.hydrated?: boolean field (additive non-indexed schema bump per v50-04 rule)
  - SetlistGridHydrator lazy-hydration effect (one-shot per mount; skip-when-hydrated; skip-when-empty; warn-log-on-failure; fire-once guard ref)
  - useSetlistPerformance dual-read via top-level tracks subscription (onSnapshot + sort-by-order; prefer-when-non-empty fallback to embedded)
  - applyEdit test-seam prop on SetlistGridHydrator (mirrors startSnapshotListener pattern)

affects:
  - v50-07-04 (Playwright kitchen-sink — first cross-cutting integration of lazy-hydration + dual-read under random failure)
  - v50-07-05 (Sentry alarms — must surface lazy-hydration fan-out failures, not just user-facing edits)
  - v5.0 milestone close — all 24 legacy setlists now openable in editor (auto-migrate) AND viewable in perf-view (dual-read)

tech-stack:
  added: []  # no new deps
  patterns:
    - "Lazy migration via sync engine: app-layer effect hooks the sync engine (applyEdit), not a one-shot script — migration cascades arrive in production data through the same outbox + LWW + cross-tab-lock as user edits"
    - "Dual-read for split-brain data shapes: prefer new shape when non-empty; fall back to legacy until lazy migration completes"
    - "Test-seam injectable side-effect props: applyEdit + startSnapshotListener as React props with production defaults — unit tests assert the cascade without booting Firestore/Dexie outbox"

key-files:
  modified:
    - src/lib/local/types.ts (LocalSetlist.hydrated?: boolean)
    - src/components/setlist/grid/SetlistGridHydrator.tsx (+~75 LOC: applyEdit prop + fanoutStartedRef + lazy-hydration effect)
    - src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx (+5 cases + 2 fixtures marked hydrated:true)
    - src/hooks/use-setlist-performance.ts (+~45 LOC: collection/query/where/onSnapshot subscription + dual-read derivation)
    - src/hooks/__tests__/use-setlist-performance.test.ts (+4 cases + firebase/firestore mock extended with collection/query/where/onSnapshot)

key-decisions:
  - "Fire-once guard: useRef<boolean> not state — re-render churn must not retrigger the cascade and a state flip would itself re-render"
  - "Promise.all fan-out (not sequential): each applyEdit owns its own Dexie tx; no shared write contention; outbox drain handles per-doc ordering downstream"
  - "withoutUndo: true on every cascade write: this is system migration intent, not user intent — pollutes the undo stack otherwise"
  - "expectedUpdatedAt threaded into the final 'mark hydrated' update: avoids racing a remote concurrent edit on the setlist doc itself; if precondition fails the cascade is logged + retried on next mount"
  - "Errors warn-log not throw: the setlist stays unhydrated and retries on next mount — failure mode is degraded availability, not data loss"
  - "Dual-read derivation prefers top-level when length > 0 (not 'when hydrated:true'): the hydrator and the perf-view subscription are racy; preferring data over flag means perf-view follows actual arrived data without waiting for the marker"
  - "No Firestore index added for tracks.setlistId: ≤650 docs total fits inside Firestore's single-field auto-index for our scale; revisit if scale grows"
  - "Test-seam pattern (applyEdit prop) — explicit prop with production default — was already established by startSnapshotListener; reusing prevents test-only branches in production code"
  - "Two pre-existing priming-only tests marked hydrated:true: their intent (Dexie idempotent priming, no outbox enqueue) is preserved; the hydrated flag semantically means 'post-migration steady state' which matches what the test exercises"

patterns-established:
  - "Lazy migration via sync engine: future shape evolutions can ride this same hook — observe legacy → fan out via applyEdit → mark migrated → idempotent on next mount"
  - "Dual-read for cutover windows: any field/collection migration can use the same prefer-new-fallback-old shape until the migration completes"

duration: ~25min
started: 2026-04-27T11:30:00Z
completed: 2026-04-27T11:55:00Z
---

# Phase v50-07 Plan 03: Lazy Hydration + Perf-View Dual-Read Summary

**Option C Hybrid Lazy Hydration shipped at the application layer: SetlistGridHydrator now fans legacy embedded tracks into the top-level `tracks/{id}` collection via the sync engine on first edit-open, and useSetlistPerformance dual-reads top-level (preferred) / embedded (fallback) so the 24 not-yet-hydrated historical setlists keep rendering in perf-view.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min |
| Started | 2026-04-27T11:30:00Z |
| Completed | 2026-04-27T11:55:00Z |
| Tasks | 3 of 3 completed |
| Files modified | 5 (production + tests) |
| New tests | +9 (5 hydrator + 4 perf-view) |
| Suite | 1465 / 1465 passing (+9 from 1456) |
| Commits | 1 (60de2ff) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Hydrator lazy-hydrates legacy tracks on first mount | Pass | Test "lazy-hydrates legacy tracks then marks the setlist hydrated" — asserts 2 set('tracks') + 1 update('setlists', {hydrated:true}) calls with `withoutUndo:true` and correct expectedUpdatedAt |
| AC-2: Hydrator skips when already hydrated | Pass | Test "skips lazy-hydration when the setlist is already hydrated" — applyEditSpy not called |
| AC-3: Hydrator skips when initialTracks empty | Pass | Test "skips lazy-hydration when initialTracks is empty" — applyEditSpy not called |
| AC-4: Perf-view prefers top-level when present | Pass | Test "prefers top-level tracks (sorted by order) when the subscription has docs" — returns top-level even when legacy embedded array is non-empty |
| AC-5: Perf-view falls back to legacy when top-level empty | Pass | Test "falls back to legacy embedded tracks when top-level subscription is empty" — returns setlistData.tracks |
| AC-6: Top-level subscription updates trigger re-render | Pass | Test "updates tracks state when the top-level subscription re-emits" — second emission flips returned tracks array |
| AC-7: All existing tests still pass + new coverage | Pass | 1465/1465 (+9 from 1456); two pre-existing priming-only fixtures marked hydrated:true to preserve intent |

## Accomplishments

- **Lazy migration on first edit-open:** opening any of the 24 legacy setlists in the v5.0 editor now silently migrates its embedded tracks into the top-level `tracks/{id}` collection via the existing v50-03 sync engine — no manual script run, no human-in-the-loop, no separate code path. The sync engine's drain + LWW + cross-tab-lock guarantees apply automatically.
- **Perf-view backward-compat preserved:** all 24 historical setlists keep rendering in perf-view via the embedded `tracks[]` fallback until they are first opened in the editor (and migrated). Once migrated, perf-view live-updates via onSnapshot during a service.
- **Bulletproof loop extends to historical data:** the v50-06 reconciliation + cross-leader visibility + airplane-mode harnesses all apply to migrated data automatically (because lazy-hydration writes go through the same engine).
- **Zero schema migration risk:** the `hydrated` flag is additive optional non-indexed (per v50-04 rule); no Dexie version bump; no Firestore index change; no production data destruction (legacy `setlists/{id}.tracks[]` arrays preserved as backup until a future explicit cleanup plan).

## Task Commits

This plan's APPLY landed as one atomic commit covering all 3 tasks (the production change is a cohesive vertical slice — types + hydrator + perf-view + tests are tightly coupled). UNIFY adds the SUMMARY + STATE/ROADMAP updates as a close commit.

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Plan checkpoint | `3ff74bc` | chore | v50-07-03 PLAN — lazy hydration + perf-view dual-read |
| Pause handoff | `d629f59` | chore | session pause — handoff for v50-07-03 pickup |
| Tasks 1+2+3 | `60de2ff` | feat | lazy hydration in SetlistGridHydrator + perf-view dual-read (+9 tests, 1465/1465) |
| Close (this) | _pending_ | chore | v50-07-03 SUMMARY + STATE/ROADMAP — UNIFY ✓ |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/local/types.ts` | Modified | Added `hydrated?: boolean` to LocalSetlist (additive non-indexed) |
| `src/components/setlist/grid/SetlistGridHydrator.tsx` | Modified | Added lazy-hydration effect (fan-out applyEdit('set','tracks',…) + applyEdit('update','setlists',{hydrated:true})) + applyEdit test-seam prop + fanoutStartedRef guard |
| `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx` | Modified | +5 cases (lazy fan-out, skip-already-hydrated, skip-empty, fan-out-failure, fire-once-on-rerender); 2 pre-existing priming-only fixtures marked hydrated:true |
| `src/hooks/use-setlist-performance.ts` | Modified | Added top-level tracks onSnapshot subscription with order-asc sort + dual-read derivation (prefer top-level when non-empty, fall back to setlistData.tracks) |
| `src/hooks/__tests__/use-setlist-performance.test.ts` | Modified | +4 cases (fallback-empty, prefer-top-level-sorted, live-update, cleanup-unsubscribe); firebase/firestore mock extended with collection/query/where/onSnapshot |
| `.paul/STATE.md` | Modified | Loop position v50-07-03 → APPLY ✓ then UNIFY ✓; resume now points to /paul:plan v50-07-04 |
| `.paul/phases/v50-07-migration-cutover/v50-07-03-SUMMARY.md` | Created | This file |
| `.paul/ROADMAP.md` | Modified | v50-07 status row 2/TBD → 3/TBD; v50-07-03 ✓ entry replaces "(next)" line |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Promise.all fan-out (parallel, not sequential) | Each applyEdit owns its own Dexie tx; no shared write contention; outbox drain handles per-doc ordering downstream (v50-03 invariant) | Faster cascade; simpler code; no behavior change vs. sequential |
| useRef guard (not useState) for fire-once | A useState flip would itself re-render and risk re-firing the effect; useRef survives across renders without triggering one | Truly idempotent per-mount |
| `withoutUndo: true` on every cascade write | This is system migration intent, not user intent; otherwise the undo stack pollutes (50-cap) on every legacy open | User Cmd-Z behavior unchanged |
| `expectedUpdatedAt: initialSetlist.updatedAt` on the hydrated:true update | Avoids racing a concurrent leader edit on the setlist doc; if precondition fails the cascade logs + retries next mount | Conflict-free even under cross-leader churn |
| Warn-log on failure (not throw) | A throwing effect would crash the editor mount; degraded migration is acceptable, lost editor is not | Failure mode is "retry on next mount" |
| Dual-read prefers top-level when length > 0 (not when hydrated:true) | Subscription delivery is racy with the hydrated flag; preferring data over flag means perf-view follows actual arrived data | Smoother service-time experience; no flag-arrived-but-data-missing window |
| No Firestore index added for tracks.setlistId | ≤650 docs total fits inside Firestore's single-field auto-index at our scale; explicit index = scope creep | One less ops change |
| Test-seam props with production defaults (`applyEdit`, `startSnapshotListener`) | Established by v50-06-03; prevents test-only branches in production code | Tests assert the cascade without booting Firestore/Dexie outbox |
| Two pre-existing priming-only tests marked hydrated:true | Their intent (Dexie idempotent priming, no outbox enqueue) is preserved; `hydrated:true` semantically = post-migration steady state | Tests still cover their original invariant; no scope drift |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Tightening only — TS strict-tuple typing on test spy |
| Scope additions | 0 | None |
| Deferred | 0 | None |

**Total impact:** Plan executed exactly as written. The single auto-fix was a typing-ergonomics tightening in the test file with no behavior change.

### Auto-fixed Issues

**1. [TypeScript] Mock spy tuple-typing on `applyEditSpy.mock.calls.filter(...)`**
- **Found during:** Task 3 (tests) — initial vitest pass green, but `npx tsc --noEmit` flagged TS2352/TS2493 on tuple destructuring of an inferred-as-`[]` mock.calls.
- **Issue:** `vi.fn(async () => {})` infers the mock's call signature as `() => Promise<void>`, so `mock.calls` typed as `[][]` and indexed access (`c[0]`, `c[1]`) failed strict TS checks.
- **Fix:** Introduced a small `makeApplyEditSpy(impl?)` factory that types the spy with the real `(edit: EditDescriptor, options?: { withoutUndo?: boolean }) => Promise<void>` signature. Refactored the destructuring to `[edit]` / `[, options]` form, which TS narrows correctly. Added an `if (updateEdit.op !== 'update') throw` guard so the discriminated union narrows for the update assertions.
- **Files:** `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx`
- **Verification:** `npx tsc --noEmit -p tsconfig.json` clean; `npx vitest run` 1465/1465.
- **Commit:** Folded into `60de2ff` (no separate commit; the refactor was a typing-only improvement to the test file landed alongside the production change).

### Deferred Items

None — plan executed exactly as written. All scope items boundary-checked clean (no Firestore index added; legacy embedded `tracks[]` arrays preserved as backup; songId problem still parked for ChartBindPopover-driven future re-binds; no Playwright/Sentry creep into 04/05 territory).

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Two pre-existing tests broke after Task 1 because `makeSetlist()` returns no `hydrated` flag → real applyEdit fan-out fired and enqueued outbox rows / clobbered local edits | Marked those two fixtures with `hydrated: true` to preserve their intent (priming-only Dexie semantics under post-migration steady state). Documented in test comments. |
| TS strict-tuple typing on mock.calls filter chains | See Auto-fixed Issues #1 above |

## Skill Audit (v50-07-03)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | ✓ | Loaded at APPLY entry per SPECIAL-FLOWS.md mandate. Brief load — the plan's UI surface is data-correctness ("invisible correctness": same components render the same shapes), not new visual design. UX checklist (touch targets, color contrast, hover states, etc.) does not apply since no new pixels landed. |

All required skills invoked ✓

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit -p tsconfig.json` | Clean (no errors, no warnings) |
| `npx vitest run` | 1465 / 1465 passing in 32.65s; +9 new cases vs. 1456 pre-plan baseline; zero regressions |
| `npx vitest run` (focused — touched files) | 11 / 11 SetlistGridHydrator + 13 / 13 useSetlistPerformance |
| `npx next build` | Clean — production build passes; no new bundle warnings |
| Commit + push | `60de2ff` pushed `d629f59..60de2ff master -> master` (Vercel auto-deploys) |

## Next Phase Readiness

**Ready:**
- Lazy hydration cascades through the engine on first edit-open of any of the 24 legacy setlists — no script to run, no UAT step required.
- Perf-view dual-reads cleanly: pre-migration setlists render via embedded fallback; post-migration setlists live-update via onSnapshot.
- All v50-06 substrate (reconciliation, cross-leader visibility, per-doc drain ordering, airplane-mode harness) extends automatically to migrated data.
- v50-07-04 Playwright kitchen-sink can now exercise the full lazy-hydration + dual-read path under random failure injection without additional substrate.

**Concerns:**
- The fan-out cascade is parallel (Promise.all) — for a 27-track setlist it enqueues 27 outbox rows + 1 setlist update in a tight burst on first open. Engine drain and per-doc ordering should handle this, but Playwright kitchen-sink (v50-07-04) is the right place to validate at scale + under network failure.
- Sentry alarms (v50-07-05) should explicitly surface lazy-hydration fan-out failures (`logger.warn` from the catch block), not just user-facing edits — this is the only "background" code path that can silently degrade.
- Single-writer offline self-conflict gap from v50-06-03 Block B SUMMARY remains — if Playwright's airplane-mode toggles surface real-world divergence, route as additive plan within v50-07.
- Songs/* still empty in production; songId still missing on legacy tracks. Sticky-memory benefits only kick in for songs the v5.0 editor explicitly creates from now on (via ChartBindPopover re-binds). Documented; not in scope for this plan or v50-07.

**Blockers:**
- None for v50-07-04 (Playwright kitchen-sink) or v50-07-05 (Sentry + UAT + ship).

---
*Phase: v50-07-migration-cutover, Plan: 03*
*Completed: 2026-04-27*
