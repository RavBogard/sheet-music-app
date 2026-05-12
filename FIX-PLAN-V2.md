# Fix Plan v2 — Master Implementation Plan (2026-05-12)

The synthesis deliverable for the research effort started in [RESEARCH-PLAN-2026-05-12.md](RESEARCH-PLAN-2026-05-12.md). Sequences every fix from [PREEXISTING-ISSUES-2026-05-12.md](PREEXISTING-ISSUES-2026-05-12.md), the new Bug 4/5/6 reports, the Phase B-discovered sync-engine bugs, and the Phase D collab pivot, into a tiered implementation roadmap.

**Read this doc to know what to do next. Read the linked research docs for justification.**

---

## How to read this plan

- **Tier 1 (ship-now, data-integrity)** — risk of data loss or user-blocking bugs. Ship first.
- **Tier 2 (ship-now, hygiene)** — type debt, dead code, console noise, UX polish. Parallelizable with Tier 1.
- **Tier 3 (collab pivot)** — Phase D Y.js rollout. ~6-7 weeks behind feature flag.
- **Tier 4 (post-pivot cleanup)** — fixes that become trivial or moot after Tier 3.

Each fix entry lists: scope · files · verification · rollback · dependencies · est. effort.

**The "resume on another computer" checklist** is at the bottom — read it last; it tells the next session exactly where to pick up.

---

## Document map

| Document | Purpose |
|----------|---------|
| [FIX-PLAN-V2.md](FIX-PLAN-V2.md) | **This file — the master plan.** |
| [BUGFIX-PLAN-2026-05-12.md](BUGFIX-PLAN-2026-05-12.md) | Diagnosis + v1/v2 of the Bug 1/2/3 fixes that already shipped. Historical reference. |
| [PREEXISTING-ISSUES-2026-05-12.md](PREEXISTING-ISSUES-2026-05-12.md) | Inventory of issues found during Bug 1/2/3 work. |
| [BUGS-4-5-6-PLAN.md](BUGS-4-5-6-PLAN.md) | Implementation plan for the post-deploy Bug 4 (drag-reorder), Bug 5 (song sync), Bug 6 (SW). |
| [RESEARCH-PLAN-2026-05-12.md](RESEARCH-PLAN-2026-05-12.md) | Meta-plan that produced this plan. |
| [RESEARCH/CLUSTERS.md](RESEARCH/CLUSTERS.md) | Phase A — 10 clusters with tiering. |
| [RESEARCH/ARCHITECTURE-MAP.md](RESEARCH/ARCHITECTURE-MAP.md) | Phase B — verified architecture map of all 7 flows. |
| [RESEARCH/COLLAB-PIVOT.md](RESEARCH/COLLAB-PIVOT.md) | Phase D — Y.js integration design + migration. |

---

## Tier 1 — Ship now, data integrity

### T1.1 — Bug 4: restore drag-reorder; remove Move Up/Down + multi-select

Full plan: [BUGS-4-5-6-PLAN.md § Bug 4](BUGS-4-5-6-PLAN.md#bug-4--drag-reorder-broken-move-updown-broken-multi-select-unwanted).

- **Scope:** add `@dnd-kit` drag-and-drop to `MobileCardList`; grip becomes drag handle; delete Move Up/Down + multi-select infrastructure (`BatchActionBar`, `useGridSelection`, `onSelectionClick` props).
- **Files:** `MobileCardList.tsx`, `MobileRowCard.tsx`, `SetlistGrid.tsx`. Tests delete/rewrite (4 test files affected).
- **Verification:** drag-reorder persists across reload; click grip = no-op; iPad long-press grip activates drag; undo restores order.
- **Rollback:** revert the implementation commit.
- **Dependencies:** none.
- **Estimate:** 1-2 sessions.

### T1.2 — Cluster 9.P9.1: engine idle pump-gap bug

- **Scope:** `applyEdit` ([src/lib/local/write.ts](src/lib/local/write.ts)) must call `engine.notifyEditCommitted()` after a successful Dexie commit so the engine pump is nudged. Currently only test code calls it — production edits can sit in the outbox indefinitely after pump idles.
- **Files:** `src/lib/local/write.ts` (add notify call), possibly `src/lib/sync/init.ts` (export a `getSyncEngine()` accessor for write.ts to use without circular import).
- **Verification:** edit a track while engine is idle (no other writes pending for ≥30s) → outbox row drains within 100ms. Add a regression test in `write.test.ts`.
- **Rollback:** trivial; remove the call.
- **Dependencies:** none.
- **Estimate:** 0.5 session.

### T1.3 — Cluster 9.P9.2: silent LWW when remote `updatedAt` is undefined

- **Scope:** the `expectedUpdatedAt` precondition silently passes when remote `updatedAt` is undefined ([Phase B map §1.8](RESEARCH/ARCHITECTURE-MAP.md)). Concurrent edits on pre-stamp legacy docs can clobber. Fix: when the outbox row carries `expectedUpdatedAt` (i.e., the editor saw a server stamp at read time) but the remote doc lacks `updatedAt`, throw `VersionMismatchError` instead of silently passing.
- **Files:** `src/lib/sync/init.ts` lines 75-88 (the `ProductionFirestoreAdapter.commitOutboxRow` `update` case). The bug is the `remoteMs !== undefined &&` guard: if local expected a stamp but remote has none, the guard short-circuits the precondition check. **Audit-confirmed location (Phase F 2026-05-12).** `setlist-firebase.ts:33-37` (`timestampsMatch`) is a parallel but DIFFERENT precondition path used only by the legacy direct-update API; do NOT edit it for this fix — it uses `null` as sentinel and behaves correctly.
- **Verification:** unit test: pre-stamp doc on server with `updatedAt === undefined`, outbox row with `expectedUpdatedAt === 1000` → commit should throw `VersionMismatchError`, not silently overwrite. Add to `engine.test.ts` or a new `init.test.ts`.
- **Rollback:** revert.
- **Dependencies:** none — audit confirmed file + line.
- **Estimate:** 0.5 session.

### T1.4 — Cluster 9.P9.3: reconciliation modal mislabels non-VersionMismatch failures

- **Scope:** the modal I un-stubbed in Bug 2 fix renders "Remote changes detected" for every row with `outbox.status === 'failed'`, but `failed` includes dead-letter (TransientError) + auth-failed paths. Fix: branch the modal copy by `outbox.lastError` patterns OR add an error-classification field to outbox rows.
- **Files:** `src/components/setlist/grid/ReconciliationProvider.tsx`.
- **Verification:** force a non-VersionMismatch failure (e.g., disconnect network + dead-letter). Modal shows correct cause + recovery affordance.
- **Rollback:** revert.
- **Dependencies:** none. **Will be deleted in Tier 3** but fix it in the interim — the modal is live and the user could see misleading copy.
- **Estimate:** 0.5 session.

### T1.5 — Cluster 1.C.6: verify `clearFirestoreIndexedDB` doesn't wipe outbox

**Phase B already verified this:** `crc-local` doesn't match the `/firestore/i` regex in [src/lib/firebase.ts:99-115](src/lib/firebase.ts:99). The outbox is **safe** from auto-IDB-wipe on assertion failure.

- **Scope:** **add a regression test** to lock the invariant in. The test verifies that the regex pattern in `clearFirestoreIndexedDB` does not match the Dexie DB name string. (`clearFirestoreIndexedDB` actually spans `firebase.ts:94-119` — audit-corrected from earlier `:99-115`.)
- **Files:** new test file (`src/lib/__tests__/firebase-recovery.test.ts`).
- **Verification:** test passes; if someone renames `crc-local` to `firestore-local` in the future, the test fails loudly.
- **Estimate:** 0.25 session.

### T1.6 — Cluster 2: fix the test harness

71 tests fail on master ([CLUSTERS.md § Cluster 2](RESEARCH/CLUSTERS.md#cluster-2--test-harness-restoration)). 14+ have the same `findByTestId('drag-handle')` timeout signature. After T1.1 lands, many tests become irrelevant (dragging tests were on the dead desktop table). Re-evaluate the failure surface post-T1.1.

- **Scope:** run the failing suite under `--reporter=verbose`. Group by first console error / unhandled rejection. Most likely converges to one or two shared setup gaps.
- **Files:** test setup (`vitest.setup.ts`), individual test files.
- **Verification:** `npx vitest run` shows 0 failing tests (or only pre-existing-and-acknowledged dead-code tests).
- **Dependencies:** T1.1 should land first — it deletes some dead tests.
- **Estimate:** 1-2 sessions.

### T1 sequencing summary

```
T1.1 (Bug 4 — drag) ────┐
T1.2 (pump-gap)         ├── parallel
T1.3 (silent LWW)       │
T1.4 (modal mislabel)   ┘
       ▼
T1.5 (regression test for IDB-wipe safety)
T1.6 (test harness restoration) — after T1.1
```

---

## Tier 2 — Ship now, hygiene

### T2.1 — Bug 5: re-prime songs library on dialog open

Full plan: [BUGS-4-5-6-PLAN.md § Bug 5](BUGS-4-5-6-PLAN.md#bug-5--new-library-song-doesnt-appear-in-chart-bind-picker).

- **Scope:** `useEffect` in `ChartBindDialog` that calls `primeSongsLibrary()` on `open: false → true` transitions, with a 5-second throttle.
- **Files:** `src/components/setlist/grid/ChartBindDialog.tsx`.
- **Estimate:** 0.5 session.

### T2.2 — Bug 6: silence SW console errors

Full plan: [BUGS-4-5-6-PLAN.md § Bug 6](BUGS-4-5-6-PLAN.md#bug-6--service-worker-invalidstateerror-console-noise).

- **Scope:** Step 1: check `serwist` 9.5.x → latest changelog. If a fix exists, bump. Otherwise drop `navigationPreload: true`; if errors persist, drop `clientsClaim: true`.
- **Files:** `src/app/sw.ts`, `package.json`.
- **Estimate:** 0.5 session.

### T2.3 — Cluster 1.C.1: rename `_shutdownRecoveryScheduled` to match its semantics

- **Scope:** flag is one-shot per session, not debounced. Rename to `_shutdownRecoveryAttempted` and update the comment. Optionally: reset the flag after the reload window (e.g., 60s) if it would be safer to allow a second recovery attempt.
- **Files:** [src/lib/firebase.ts:164-173](src/lib/firebase.ts:164).
- **Decision needed before fix:** keep as one-shot per Phase B verification, OR reset after timeout. **Recommend keeping one-shot** — a recurring assertion failure that doesn't resolve after the first reload means something is deeply broken; bombarding the user with reloads doesn't help.
- **Estimate:** 0.25 session.

### T2.4 — Cluster 1.C.5: coordinate SW reload with engine drain

- **Scope:** [src/lib/firebase.ts:150-154](src/lib/firebase.ts:150) reloads the page 3 seconds after `controllerchange` regardless of in-flight outbox state. Phase B notes this is uncoordinated. Fix: subscribe to engine state; only reload when `state === 'idle'` AND queued count is 0, OR after a hard timeout (e.g., 10s) as a safety net.
- **Files:** `src/lib/firebase.ts`. Needs access to engine state; might require an exported `whenEngineIdle()` helper from `src/lib/sync/init.ts`.
- **Verification:** edit a track immediately before a SW update; reload happens only after the outbox commits.
- **Dependencies:** none.
- **Estimate:** 1 session.

### T2.5 — Cluster 3: type debt (jest-axe, implicit any, @serwist types)

- **Scope:** install `@types/jest-axe` OR declare ambient types in `vitest.setup.ts`. Type the implicit-`any` test callbacks. Audit the `@serwist/next` type imports in `next.config.ts` + `src/app/sw.ts`.
- **Files:** `package.json`, `vitest.setup.ts`, test files, possibly `tsconfig.json`.
- **Estimate:** 0.5 session.

### T2.6 — Cluster 4: dead-code cleanup (minus C.4 — corrected)

- **Scope:**
  - Delete `isMobile` declaration in [SetlistGrid.tsx:925](src/components/setlist/grid/SetlistGrid.tsx:925) (unused after Bug 3).
  - Migrate the in-cell desktop `ChartBindPopover` to use `ChartBindDialog` too (per decision in RESEARCH-PLAN Q3). Then delete `ChartBindPopover.tsx` + its test.
  - Migrate test refs from `clearFailedOutboxRows` to `discardFailedOutboxRows`; delete the alias.
  - **After T1.1 ships:** delete the now-fully-dead `SortableRow`, `DragHandleCell`, `BatchActionBar`, `useGridSelection`, and the TanStack Table columns config in `SetlistGrid.tsx`. This is a big sweep but mechanical.
- **Do NOT delete `subscribeToSetlist`** — Phase B verified it's used by [src/hooks/use-add-to-setlist.ts:167](src/hooks/use-add-to-setlist.ts:167).
- **Estimate:** 1 session.

### T2.7 — Cluster 8: UX timings audit

- **Scope:** the 500ms long-press in `MobileRowCard.handlePointerDown` (and elsewhere — search for hardcoded ms values). Decision: lower to 400ms (matches iPad system) or leave as-is. User-test.
- **Files:** `MobileRowCard.tsx`.
- **Estimate:** 0.25 session.

### T2 sequencing summary

```
All T2 items are independent. Pick any order or parallelize.
T2.6 has an internal dep: dead-code sweep depends on T1.1.
```

---

## Tier 3 — Collab pivot (Y.js)

Full design: [RESEARCH/COLLAB-PIVOT.md](RESEARCH/COLLAB-PIVOT.md).

5 phases, ~6-7 weeks behind `useYjsForSetlists` feature flag. Each phase ships independently and is revertable.

### Locked decisions
- Self-hosted Y.js (not Liveblocks).
- One-shot migration ASAP (user is sole active user; bulk-convert is acceptable).
- Offline-first non-negotiable; Y.js + y-indexeddb must match outbox guarantees.
- Presence deferred to v2.

### Phase summaries (see COLLAB-PIVOT.md § D.9 for detail)

- **T3.1** — Y.Doc data model + per-field merge implementation (Y.Text / Y.Map / Y.Array).
- **T3.2** — Three-tier persistence: in-memory Y.Doc → y-indexeddb → Firestore custom adapter (binary updates in a `updates/` subcollection + state snapshot on the parent doc; compaction in `runTransaction` at 100 updates or 7 days).
- **T3.3** — One-shot migration script (Node + Admin SDK, idempotent via `schemaVersion`, `--dry-run` and `--verify` modes; legacy `/setlists` preserved 30 days for rollback).
- **T3.4** — Engine retirement: delete `engine.ts`, `snapshot-listener.ts`, `cleanup.ts`, `firestore-adapter.ts`, `ReconciliationProvider.tsx`. State machine collapses to `synced | unsynced | offline`.
- **T3.5** — Cutover behind feature flag + observability + rollback testing.

### Blocking research gaps (from D's verification footer)

Before T3 implementation can finish, these need answers:
- Y.Doc size envelope for realistic setlists (single-digit-tracks vs hundreds).
- Compaction race-safety test harness design.
- Firestore security rules rewrite (the binary-blob update model needs different rules than the per-field model).
- Multi-tab y-firestore-adapter race scenarios.

**Recommendation:** spike T3.1 (data model) and T3.2 (persistence) on a branch first; gather size + write-volume data; then commit to T3.3-T3.5.

---

## Tier 4 — Post-pivot cleanup

These become trivial or vanish after Tier 3 lands.

- **T4.1 — Cluster 5: save-state UX semantics.** State machine simplifies to 3 states; the C.7 + C.10 + D.4 items collapse.
- **T4.2 — Cluster 6: tombstone hygiene.** Tombstones table goes away entirely (Y.js native delete markers). Delete the table from Dexie schema; delete the guard code in hydrator + snapshot-listener; delete the engine clear-on-success branch.
- **T4.3 — Cluster 7: reconciliation modal.** Delete `ReconciliationProvider.tsx` + its test + state-machine `'conflict'`/`'failed'` branches. Delete `cleanup.ts` entirely (no more outbox to clean).
- **T4.4 — Phase D.7 moot items** (see [COLLAB-PIVOT.md § D.7](RESEARCH/COLLAB-PIVOT.md)): 8 issues from PREEXISTING-ISSUES whose entire surface goes away with the pivot.

---

## Verification & test strategy

Per-tier verification expectations:

### T1 — data-integrity gates

- T1.1 → 100% of drag-reorder paths covered by integration test. Manual smoke on desktop + iPad.
- T1.2-T1.4 → unit tests on the engine/sync modules; lock invariants.
- T1.6 → test suite green (zero failures) before any other tier proceeds.

### T2 — hygiene

- Each item lands as its own PR with a focused test or smoke check. No big bangs.

### T3 — collab pivot

- Feature flag `useYjsForSetlists` toggleable per user (Firebase Remote Config or local override).
- Side-by-side: legacy + Y.js routes share same UI shell; toggle between them per setlist for A/B testing.
- Per-phase rollback: each phase ships behind the flag and is revertable.

### T4 — cleanup

- Net code reduction tracked. Phase D estimates ~750 LoC removed.

---

## Sequencing & estimates

```
Week 0 (this week)
  ☐ T1.1 — Bug 4 drag-reorder              [1-2 sessions]
  ☐ T1.2 — pump-gap                         [0.5 session]
  ☐ T1.3 — silent LWW                       [0.5 session]
  ☐ T1.4 — modal mislabel                   [0.5 session]
  ☐ T2.1 — Bug 5 re-prime                   [0.5 session]
  ☐ T2.2 — Bug 6 SW                         [0.5 session]
  ☐ T1.5 — IDB-wipe safety test             [0.25 session]
  ☐ T2.3 — _shutdownRecovery rename         [0.25 session]
  ☐ T2.7 — long-press timing                [0.25 session]

Week 1
  ☐ T1.6 — test harness restoration         [1-2 sessions]
  ☐ T2.4 — SW reload coordination           [1 session]
  ☐ T2.5 — type debt                         [0.5 session]
  ☐ T2.6 — dead-code sweep                  [1 session]

Weeks 2-8 — Tier 3 (Y.js pivot)
  ☐ T3.1 — data model                       [1 week]
  ☐ T3.2 — persistence + adapter            [2 weeks]
  ☐ T3.3 — migration script + verification  [1 week]
  ☐ T3.4 — engine retirement                [1 week]
  ☐ T3.5 — cutover + observability          [1 week]

Post-pivot
  ☐ T4.x cleanup                             [1-2 sessions total]
```

Total greenfield estimate: ~8 weeks. T1 (data-integrity) ships first 1-3 days. T2 (hygiene) fills the gaps. T3 is the heavy lift.

---

## Resume-on-another-computer checklist

When you `git pull` on the other machine, here's what's on master and what to do next:

### What's on master right now (HEAD `63e3debc` + this commit)

- **Bug 1/2/3 fixes** — drag handle (applied to dead code; see Bug 4), persistence + tombstones + retry + reconciliation modal, bind chart dialog. Live.
- **Documentation:**
  - [BUGFIX-PLAN-2026-05-12.md](BUGFIX-PLAN-2026-05-12.md) — Bug 1/2/3 diagnosis.
  - [PREEXISTING-ISSUES-2026-05-12.md](PREEXISTING-ISSUES-2026-05-12.md) — issues found during 1/2/3 work.
  - [RESEARCH-PLAN-2026-05-12.md](RESEARCH-PLAN-2026-05-12.md) — meta-plan that produced FIX-PLAN-V2.
  - [RESEARCH/CLUSTERS.md](RESEARCH/CLUSTERS.md) — Phase A: 10 clusters.
  - [RESEARCH/ARCHITECTURE-MAP.md](RESEARCH/ARCHITECTURE-MAP.md) — Phase B: verified architecture map of all 7 flows.
  - [RESEARCH/COLLAB-PIVOT.md](RESEARCH/COLLAB-PIVOT.md) — Phase D: Y.js integration design.
  - [BUGS-4-5-6-PLAN.md](BUGS-4-5-6-PLAN.md) — implementation plan for Bug 4/5/6.
  - [FIX-PLAN-V2.md](FIX-PLAN-V2.md) — **this file. Read me first when resuming.**

### What to do next (in order)

1. **`npm install`** in the worktree. The branch tracks `origin/master`; latest is `63e3debc..HEAD`.
2. **Read this file** (FIX-PLAN-V2.md) — you're already here.
3. **Read [RESEARCH/ARCHITECTURE-MAP.md](RESEARCH/ARCHITECTURE-MAP.md)** end-to-end. It's the source of truth for what the codebase actually does at HEAD. Most of the v1 bug-fix plan was fabricated by subagents; this map is what we actually verified.
4. **Start T1.1 (Bug 4).** It's the most user-impactful. See [BUGS-4-5-6-PLAN.md § Bug 4](BUGS-4-5-6-PLAN.md#bug-4--drag-reorder-broken-move-updown-broken-multi-select-unwanted).
5. **Phase F (audit)** — independent agent verification of FIX-PLAN-V2.md was scheduled but may or may not have run yet (check for `RESEARCH/PLAN-AUDIT.md`). If it ran, address any flagged issues before implementing. If not, kick it off — see the audit prompt template in [RESEARCH-PLAN-2026-05-12.md § Phase F](RESEARCH-PLAN-2026-05-12.md#phase-f--independent-review).
6. **Tier 2 items** — pick any in any order while Tier 1 lands.
7. **Tier 3 spike** — start with T3.1 data model on a branch when ready; gather size + cost data before committing.

### Decisions already locked

These don't need re-litigation:

- Self-hosted Y.js for collab pivot (not Liveblocks).
- One-shot migration ASAP.
- Offline-first preserved via y-indexeddb.
- Presence deferred to v2.
- Tombstone TTL: 30-day prune on engine startup (only relevant pre-Y.js).
- Migrate in-cell ChartBindPopover → Dialog too (T2.6).
- Bug 4: drag-reorder only, no Move Up/Down buttons. Cards-everywhere is fine.
- Bug 5: re-prime on dialog open (with 5s throttle).
- Always push to master directly (memory file: [feedback_deploy_to_master.md](~/.claude/projects/.../memory/feedback_deploy_to_master.md)).

### Decisions locked (2026-05-12, while user was away)

- **T2.4 SW-reload coordination:** implement now (not a stopgap bump). Adds a `whenEngineIdle()` helper exported from `src/lib/sync/init.ts`; the controllerchange reload handler awaits idle (with a 10s safety-net hard timeout) instead of using the fixed 3s.
- **T2.3 `_shutdownRecoveryScheduled` reset:** keep one-shot per session. Rename to `_shutdownRecoveryAttempted` to match semantics. A recurring assertion failure that doesn't resolve after the first reload means something is deeply broken; bombarding the user with reloads doesn't help.
- **T3 spike scope:** spike T3.1 (data model) + T3.2 (persistence + adapter) on a branch BEFORE committing to the full T3.3-T3.5 rollout. Gather Y.Doc size envelope + Firestore write-volume data first. Recommended; user agreed.

### Anti-hallucination reminder

Before implementing any item in this plan: open the cited files at HEAD and verify the line refs match. The v1 plan failed precisely because subagents hallucinated file structure. The verification footers on each research doc list what was verified vs what's still inferred — trust verified, check inferred.

---

## Verification footer

**HEAD SHA at writing:** `63e3debc185b13e134d23a764aa1b01dc1e9972a` (2026-05-12 — confirm with `git rev-parse HEAD` when reading)

**Files cited and verified:** all references in this doc are cross-checked against [RESEARCH/ARCHITECTURE-MAP.md](RESEARCH/ARCHITECTURE-MAP.md) (Phase B) and [RESEARCH/COLLAB-PIVOT.md](RESEARCH/COLLAB-PIVOT.md) (Phase D). The architecture map's verification footer lists every file Phase B opened.

**Claims unverified at synthesis time (to resolve before/during implementation):**
- T1.3 exact location (Phase B reports `init.ts:80-87`; verify the file path and exact symbol).
- T2.4 viability — `whenEngineIdle()` helper doesn't exist yet; needs design.
- T3 size envelope, security rules, multi-tab adapter race — all in COLLAB-PIVOT.md verification footer.

**Phase F audit status:** to be run after this commit lands. If `RESEARCH/PLAN-AUDIT.md` exists when you read this, address any flagged items before implementing. If not, run it.
