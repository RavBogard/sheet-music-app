# Clusters — Pre-existing Issue Inventory

**Phase A deliverable.** Groups every issue from [PREEXISTING-ISSUES-2026-05-12.md](../PREEXISTING-ISSUES-2026-05-12.md) into clusters with domain, risk, ship-tier, and dependency on the Phase D collab pivot. The downstream `FIX-PLAN-V2.md` will use this as its sequencing skeleton.

---

## Tier definitions

Used in the cluster table below.

- **T1 (ship-now, data-integrity)** — risk of data loss or user-visible incorrect behavior. Ships before Phase D.
- **T2 (ship-now, hygiene)** — type debt, dead code, comment/code contradictions. Low risk; parallelizable with T1.
- **T3 (collab pivot)** — Phase D itself (the Y.js rollout).
- **T4 (post-pivot cleanup)** — issues that survive but whose fix shape changes after T3 lands. Defer until T3 is in.

---

## Cluster table

| # | Cluster | Domain | Tier | Phase D interaction | Estimate |
|---|---------|--------|------|---------------------|----------|
| 1 | Recovery primitives & SW interaction | sync / Firestore / SW | **T1** | Mostly **survives** (recovery is below the collab layer) | 1-2 sessions |
| 2 | Test harness restoration | tests | **T1** | **Survives** — needed to verify everything else | 1-2 sessions |
| 3 | Production + test type debt | types | **T2** | **Survives** | 1 session |
| 4 | Dead code cleanup | UI, sync | **T2** + some T4 | Partly **moots** (e.g., ChartBindPopover may be entirely gone post-pivot) | 0.5-1 session |
| 5 | Save-state UX semantics | UI | **T4** | **Reshapes** — state machine simplifies to `synced \| unsynced \| offline` | wait |
| 6 | Tombstone hygiene (TTL + observability) | sync / persistence | **T4** | **Reshapes** — Y.js handles deletes natively | wait |
| 7 | Reconciliation modal & conflict UX | UI / sync | **T3** (Phase D itself) | **Moots** — Y.js eliminates per-conflict modal | replaced by D |
| 8 | UX timings (long-press, animations) | UI | **T2** | **Survives** | 0.5 session |

---

## Cluster 1 — Recovery primitives & SW interaction

**Scope:** the firebase.ts auto-recovery layer and its interaction with the outbox engine + service worker.

**Issues:**

- **C.1** — `_shutdownRecoveryScheduled` in [src/lib/firebase.ts:164-173](../src/lib/firebase.ts:164) is commented as "Debounced: subsequent calls within 5s are no-ops" but is actually a one-shot — the flag is never reset. If the recovery reload is blocked the function never fires again in the session.
- **C.5** — Hardcoded 3-second timeout before SW-controllerchange reload at [src/lib/firebase.ts:151-154](../src/lib/firebase.ts:151). Not coordinated with `engine.notifyFromDb()` — could destroy in-flight outbox writes during a SW update.
- **C.6** — Auto-IDB-wipe at [src/lib/firebase.ts:130-141](../src/lib/firebase.ts:130) catches `INTERNAL ASSERTION FAILED` and deletes every IDB database matching `/firestore/i`. **Open question:** does the regex accidentally match the Dexie `crc-local` outbox database? If yes, this is a silent data-loss vector under SDK assertion failures.
- **Q4 (from RESEARCH-PLAN)** — same as C.6; needs verification.
- **Q5 (from RESEARCH-PLAN)** — same as C.1; needs decision (one-shot is fine, or should it reset?).

**Why T1:** these all sit in the recovery layer, below the collab abstraction. They will continue to matter after Y.js lands. A bad recovery path can corrupt local state regardless of the sync engine above it.

**Verification before fix:** the Phase B architecture map should answer the C.6 outbox-safety question definitively. If the regex does match, that's a P0.

---

## Cluster 2 — Test harness restoration

**Scope:** the 71 test failures pre-existing on master.

**Issues:**

- **A.1** — 3 failures in [src/components/setlist/grid/__tests__/SetlistGrid.dnd.test.tsx](../src/components/setlist/grid/__tests__/SetlistGrid.dnd.test.tsx) timing out on `findByTestId('drag-handle')`. Same pattern in:
- **A.2** — 11 failures in [src/components/setlist/grid/__tests__/SetlistGrid.contextmenu.test.tsx](../src/components/setlist/grid/__tests__/SetlistGrid.contextmenu.test.tsx).
- **A.3** — ~57 remaining failures, file-level distribution not yet enumerated. Sub-task: enumerate them first.

**Hypothesis:** shared test-harness setup gap. The SetlistGrid renders only the SyncIndicator (the "Saved" pill) in those tests — the grid body never paints. Likely a Dexie / hydration / auth-mock setup issue, not component bugs.

**Why T1:** every other fix is harder to verify without a working test suite. Cluster 2 unlocks Clusters 1, 3, 4, 5, 6.

**Investigation step:** run the failing tests one at a time with `--reporter=verbose`; look for the first console error or unhandled promise rejection. Likely converges to one or two root causes covering most of the 71.

---

## Cluster 3 — Production + test type debt

**Scope:** TypeScript errors that don't block the build but make refactors fragile.

**Issues:**

- **B.1** — `jest-axe` types not declared. `toHaveNoViolations` appears as a type error in:
  - [src/components/setlist/grid/__tests__/AddBar.test.tsx](../src/components/setlist/grid/__tests__/AddBar.test.tsx)
  - [src/components/setlist/grid/__tests__/ReconciliationProvider.test.tsx](../src/components/setlist/grid/__tests__/ReconciliationProvider.test.tsx)
  - [src/components/setlist/grid/__tests__/SetlistGrid.a11y.test.tsx](../src/components/setlist/grid/__tests__/SetlistGrid.a11y.test.tsx)
  - Fix: install `@types/jest-axe` OR declare ambient typings in `vitest.setup.ts`.
- **B.2** — Implicit `any` in test callbacks across multiple files. Fix: type the callbacks, or relax `noImplicitAny` for tests.
- **B.4** — Missing `@serwist/next` types in [next.config.ts](../next.config.ts) and [src/app/sw.ts](../src/app/sw.ts). Could be tsconfig include path or missing dev dep.

**Excluded from this cluster:**
- B.3 (missing `@tanstack/react-table` types when node_modules is unpopulated) is an install-discipline note, not a code bug. Fixed by running `npm install`. Document in CONTRIBUTING.md or CI checklist instead.

**Why T2:** doesn't break runtime; doesn't block users. Pure dev-experience win.

---

## Cluster 4 — Dead code cleanup

**Scope:** code paths made dead by the Bug 1/2/3 fixes or never wired up to begin with.

**Issues:**

- **C.2** — `isMobile` at [src/components/setlist/grid/SetlistGrid.tsx:925](../src/components/setlist/grid/SetlistGrid.tsx:925) — sole consumer (the mobile-anchor ChartBindPopover block) was removed by my Bug 3 fix. Now unused.
- **C.3** — `ChartBindPopover` may be partially dead — after Bug 3, the only remaining caller is the in-cell desktop click path. **Decision logged in RESEARCH-PLAN: migrate the in-cell path to Dialog too, then delete ChartBindPopover entirely.** Treat as T2 cleanup.
- **C.4** — `subscribeToSetlist` in [src/lib/setlist-firebase.ts:178-189](../src/lib/setlist-firebase.ts:178) looks vestigial; the live-edit visibility path uses `src/lib/sync/snapshot-listener.ts`. **Investigation step:** grep all callers; if none, delete. **Caution:** may have non-grep-visible references via the service factory.
- **D.2** — `clearFailedOutboxRows` is kept as a deprecated alias for the discard helper. Migrate any remaining test references to `discardFailedOutboxRows` and delete the alias.

**Phase D interaction:** if Y.js retires the outbox entirely (which Phase D will decide), then D.2 and likely chunks of `cleanup.ts` go away wholesale. **Recommend:** do C.2, C.3 immediately (independent of Phase D); defer C.4 and D.2 until Phase D scope is known.

**Why T2 + some T4:** trivial wins; doesn't affect behavior.

---

## Cluster 5 — Save-state UX semantics

**Scope:** the SyncIndicator's `idle | dirty | saving | conflict | failed | offline` state machine + its UI surface.

**Issues:**

- **C.7** — Relative-time label "Saved · just now" appears only in the tooltip, not the visible label, at [src/components/setlist/grid/SyncIndicator.tsx:124-128](../src/components/setlist/grid/SyncIndicator.tsx:124). Worth surfacing inline.
- **C.10** — `disabled` on a `<span>` element when `isAction` is false at [src/components/setlist/grid/SyncIndicator.tsx:184-186](../src/components/setlist/grid/SyncIndicator.tsx:184). Cosmetic; HTML span doesn't take `disabled`.
- **D.4 (from PREEXISTING-ISSUES architectural section)** — Is `dirty` actually reachable in the current state machine? Outbox enqueue → engine pump is fast enough that `dirty` may only flicker; investigate whether the state is dead.

**Why T4:** Phase D will simplify the state machine to roughly `synced | unsynced | offline`. Fixing UX semantics on a state machine that's about to be retired is wasted effort. Land Phase D first, then revisit Cluster 5 against the new shape.

---

## Cluster 6 — Tombstone hygiene (TTL + observability)

**Scope:** the tombstones table added by Bug 2 fix.

**Issues:**

- **D.1** — No tombstone TTL prune. The table grows monotonically. Pathological case: user creates+deletes many rows that never sync, growth is unbounded.
- **Decision logged in RESEARCH-PLAN:** 30-day prune on engine startup. Simple, defensive.
- **Open** — should we also instrument tombstone reads (Sentry breadcrumb / recordEdit entries) for observability? Useful for diagnosing future "deleted came back" reports.

**Why T4:** if Y.js's native delete markers replace the tombstones table, this cluster goes away. Phase D's D.7 interaction map will tell us. If tombstones survive in some form (e.g., legacy data during the one-shot migration window), the TTL fix still applies — but design then.

---

## Cluster 7 — Reconciliation modal & conflict UX

**Scope:** the per-conflict modal I un-stubbed in Bug 2 fix.

**Issues:**

- **D.3** — Modal now appears on every conflict; in a high-collaboration scenario this would be intrusive. (Currently low-collab so it works as a stopgap.)
- **C.8** — Pre-fix, the auto-resolution was silent (no telemetry); now the modal surfaces it. Still worth a Sentry breadcrumb so support can see frequency.
- **C.9** — Comment/code contradiction (`'mine'` default vs `'theirs'` documented) — fixed in Bug 2. Listed here for traceability only.

**Why T3:** the modal is **the thing Phase D replaces**. Don't iterate on it; replace it.

**Migration consideration:** the modal stays in place until Phase D Y.js cuts over. After cutover, delete:
- [src/components/setlist/grid/ReconciliationProvider.tsx](../src/components/setlist/grid/ReconciliationProvider.tsx)
- [src/components/setlist/grid/__tests__/ReconciliationProvider.test.tsx](../src/components/setlist/grid/__tests__/ReconciliationProvider.test.tsx)
- The `'conflict'` and `'failed'` branches of the state machine (becomes "Y.js sync failed" only if at all).

---

## Cluster 8 — UX timings

**Scope:** hardcoded timing constants in interaction code.

**Issues:**

- **D.5** — 500ms long-press at [src/components/setlist/grid/SetlistGrid.tsx:508](../src/components/setlist/grid/SetlistGrid.tsx:508). iPad system long-press is closer to 400ms. Worth user-testing and possibly tuning.
- **(Maybe surfacing from Phase B)** — TouchSensor 200ms delay, MouseSensor 5px distance — both reasonable defaults but worth confirming they don't conflict with iPad VoiceOver or other a11y modes.

**Why T2:** small, no architecture interaction. Could even be a single PR.

---

## Cross-cluster observations

### Dependencies between clusters

- **Cluster 2 (tests) blocks confidence on everything else.** Get the harness working before claiming "Cluster X is fixed." Many fixes will need test updates anyway.
- **Cluster 1 (recovery) is upstream of Cluster 6 (tombstones).** If recovery wipes IDB and the outbox is in IDB, tombstones go with it. Cluster 1's C.6 verification is a prerequisite for trusting tombstones.
- **Phase D outputs (the upcoming COLLAB-PIVOT.md) gate Clusters 5, 6, 7** at least partially. Once Phase D lands its design, Clusters 5-7 can be definitively tiered (right now they're marked T4 conservatively).

### What's NOT in any cluster

A few items from PREEXISTING-ISSUES are notes/context rather than fixable issues:

- F (Manual verification checklist for Bug 1/2/3) — that's a deploy concern, not a code fix.
- G (Open architectural questions) — captured in the research plan inputs; not standalone clusters.

### Risk-ranked ordering for FIX-PLAN-V2

Once Phase B + D return, the synthesis should ship in this order:

1. **Cluster 1.C.6** — auto-IDB-wipe outbox-safety verification. Potentially P0. Phase B should answer this.
2. **Cluster 2** — fix the test harness.
3. **Cluster 1.C.1, C.5** — recovery primitives once tests are working.
4. **Cluster 3 + Cluster 8 + Cluster 4 (T2 part)** — parallel hygiene PRs.
5. **Phase D** — Y.js pivot (huge; multi-phase per D.9).
6. **Cluster 4 (T4 part) + Cluster 5 + Cluster 6 + Cluster 7 cleanup** — post-pivot.

---

## Verification footer

**HEAD SHA:** `9fb45b5a185b13e134d23a764aa1b01dc1e9972a` (2026-05-12)

**Sources cited and verified:**
- [PREEXISTING-ISSUES-2026-05-12.md](../PREEXISTING-ISSUES-2026-05-12.md) — full read; every issue accounted for in clusters.
- All file:line refs in this doc are claims about HEAD; should be re-confirmed by Phase B's architecture map.

**Claims marked Inferred (must verify via Phase B):**
- Cluster 1.C.6 — "the regex `/firestore/i` *might* match the `crc-local` Dexie DB." Phase B should verify by enumerating IDB databases at runtime or by reading the Dexie schema name.
- Cluster 2 hypothesis — "shared harness setup gap." Phase B / Phase C-2 should drill into the actual first failing assertion.
- Cluster 5.D.4 — "`dirty` state may be dead/flickering only." Needs runtime tracing.
- Cluster 4.C.4 — "`subscribeToSetlist` may be vestigial." Needs caller-graph audit.

**Claims marked Open (decisions still needed):**
- Tombstone observability (Sentry breadcrumb) — defer until Phase D outcome is known.
- Cluster 7 — exact deletion order during Phase D cutover.
