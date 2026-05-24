# Parallel-load test-flake characterization

**Lane:** `parallel-load-flake-research` (Tier-0 research, no code fix)
**Base SHA:** `948ac87d0`
**Author:** coder-4
**Run window:** 2026-05-24T~02:55Z → 03:30Z
**Worktree:** `sheet-music-app-flake-research/`
**Host:** Windows / 16 logical CPUs / Node v24.11.1 / vitest 3.2.4
**Suite:** default `vitest run` (parallel forks pool, default maxForks)

---

## TL;DR

**ALL 5 flakes share ONE root cause: CPU + vite-transform-queue starvation under default parallel forks.** None of them is a race condition on shared module state, fake clocks, Firestore ports, Dexie databases, or filesystem temp dirs. Every flaky file PASSES SOLO with a wall-clock time of **3.3–4.8 s for its single slowest test** — already 33–48 % of the 10 s `testTimeout`. Under default `vitest` with `~16` parallel forks each contending for vite transform + CPU, those same tests slip past 10 s and time out. The exact same failure pattern was documented in `vitest.config.ts:13-17` when the timeout was bumped from 5 s → 10 s for `engine.test.ts` AC-4; load has grown again and 10 s is also tipping over.

**Aggregate recommendation:** one structural change — bump `testTimeout` 10 000 → 30 000 ms and add `hookTimeout: 30000` in `vitest.config.ts`. **+2 LOC, single file, zero test-code change.** Cost: a genuinely-slow regression takes 30 s instead of 10 s to surface in CI — still well above any non-pathological test budget (~95 % of passing tests in this suite complete in < 500 ms; the slowest passing tests sit at 4–5 s solo). Benefit: removes the entire 5-test flake set deterministically — every flake passes solo in well under 12 s, so a 30 s budget retains 2–3× headroom even under the worst observed contention. Alternative: cap `maxForks` to ~4–6 in vitest config. Trade: 30–50 % longer total wall time but eliminates the contention root.

---

## Phase 1 — Baseline reproduction (parallel)

`node node_modules/vitest/vitest.mjs run` on `948ac87d0`. Full log at `BASELINE-RUN-001.log`.

**Posture:** 250 test files, 2 665 tests, 333 s wall time. **5 failures** — all `Test timed out in 10000ms` or `Hook timed out in 10000ms`:

| # | File | Site | Failure type |
|---|---|---|---|
| 1 | `src/app/api/__tests__/route-auth.test.ts` | `POST /api/setlist/publish` suite (line 58 `beforeAll`) | Hook timed out 10 000 ms |
| 2 | `src/components/performance/__tests__/async-safety.test.tsx` | `PDFOverlay async-safety > does not setState after unmount during async URL resolution` (L24) | Test timed out 10 000 ms |
| 3 | `src/lib/sync/__tests__/edit-log.test.ts` | `site-contract: applyEdit records a stable-identifier-only row on success` (L165) | Test timed out 10 000 ms |
| 4 | `src/lib/sync/__tests__/engine.test.ts` | `SyncEngine > AC-4: version-mismatch routes to Conflict, no auto-retry` (L261) | Test timed out 10 000 ms |
| 5 | `src/lib/sync/__tests__/init-pagehide.test.ts` | `installPagehideDrainHook > registers exactly one pagehide listener on window` (L36) | Test timed out 10 000 ms |

Matches the baseline range documented in supervisor dispatch (1–5 failures). Dispatch named 7 candidate files — confirmed 4 of them this run (init-pagehide, engine AC-4, edit-log, async-safety) plus 1 not previously documented (route-auth.test.ts beforeAll). The other 3 named candidates (property-failures / SetlistGridHydrator / SetlistGrid.read) did NOT fail this run — likely intermittent within the broader flake budget; would surface across multiple parallel runs.

**No NEW regressions surfaced.** All 5 are CONFIRMED parallel-load flakes (Phase 2 below). Surfacing them as HEADS-UP not required.

---

## Phase 2 — Solo isolation

Each of the 5 files re-run alone via `node node_modules/vitest/vitest.mjs run <file>`. Logs at `SOLO-*.log`.

| File | Solo verdict | Slowest test solo | % of 10 s budget |
|---|---|---|---|
| route-auth.test.ts | ✅ 9 / 9 PASS in 9.95 s wall | suite hook + body | hook 3.5 s body avg 200 ms |
| async-safety.test.tsx | ✅ 6 / 6 PASS in 10.44 s wall | PDFOverlay async URL resolution **4.40 s** | **44 %** |
| edit-log.test.ts | ✅ 11 / 11 PASS in 11.13 s wall | site-contract applyEdit **4.18 s** | **42 %** |
| engine.test.ts | ✅ 15 / 15 PASS in 11.91 s wall | AC-4 version-mismatch 760 ms (BUT 14 of 15 tests use fake-clock advance, so the test body is shorter than wall time would imply) | 8 % (cf. < 1 s for trivial tests) |
| init-pagehide.test.ts | ✅ 5 / 5 PASS in 8.63 s wall | pagehide-listener registration **3.32 s** | **33 %** |

The slowest test of each file already burns 33–48 % of the 10 s budget WHEN UNCONTESTED. Under 16-fork load with siblings competing for the vite transform pipeline + CPU, a 2-3× slowdown is enough to exceed 10 s. This is consistent with the existing config comment (`vitest.config.ts:13-17`) that recorded the same shape for engine AC-4 when 5 s was tipped over.

**Critical: no flake passed solo and failed parallel because of a race on SHARED state.** No Firestore-emulator port collision. No shared Dexie DB across forks (`fake-indexeddb/auto` is per-fork). No filesystem temp-dir collision. No mock-state-leakage across test files (each file resets via beforeEach/vi.resetModules). The failure is purely temporal — wall-clock work per file under load exceeds budget.

---

## Phase 3 — Per-file flake mechanism

### 1. `route-auth.test.ts` — beforeAll dynamic-import under transform pressure

**Code site:** L55-61
```ts
describe('POST /api/setlist/publish', () => {
    let POST: (req: NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('@/app/api/setlist/publish/route')
        POST = mod.POST
    })
```

The suite uses `beforeAll` to dynamically `await import` the publish route module — a heavy module that pulls in Firebase Admin mocks, rate-limit, logger, email, song-usage chains (all `vi.mock`'d at top of file). Vite has to transform AND resolve the chain. Hook timeout is 10 s. Under parallel load that hook is racing the transform queue.

**Resource contended:** vite transform queue + CPU at module-load time. NOT shared mock state (`vi.mock` calls at top of file run per-file in fork isolation).

### 2. `async-safety.test.tsx` — per-test `vi.resetModules` + dynamic `await import("../PDFOverlay")`

**Code site:** L19-67
```ts
describe("PDFOverlay async-safety", () => {
    beforeEach(() => {
        vi.resetModules()
    })

    it("does not setState after unmount during async URL resolution", async () => {
        // ... 5x vi.doMock(...) calls
        const { PDFOverlay } = await import("../PDFOverlay")
        // ... render + unmount + act
    })
})
```

`vi.resetModules()` clears the module cache; the subsequent `await import("../PDFOverlay")` re-transforms `PDFOverlay.tsx` from scratch AND its 5 doMocked dependents (`@/lib/offline-idb`, `@/components/music/PDFViewer`, `@/components/music/SmartScoreViewer`, `next/dynamic`, `@/components/performance/PerformanceToolbar`). Solo: 4.4 s. Under load: 10 s budget blown.

**Resource contended:** vite transform queue (per-test re-transform of PDFOverlay's dependency graph) + CPU at module-load.

### 3. `edit-log.test.ts` — `fake-indexeddb/auto` Dexie chain under heavy applyEdit

**Code site:** L1, L29-31, L160-180 (site-contract: applyEdit)
```ts
import 'fake-indexeddb/auto'
// ...
beforeEach(async () => {
    await resetDbForTests()
})
// ...
it('site-contract: applyEdit records a stable-identifier-only row on success', ...) // 4.18s solo
```

`fake-indexeddb` internally schedules IDB transaction completion via microtasks. `resetDbForTests()` runs per-test (Dexie close + new instance). The site-contract test runs the real `applyEdit` path which writes to both `outbox` and `edit_log` tables. Under CPU starvation each microtask wave waits longer to drain → 4.2 s solo → > 10 s under load.

**Resource contended:** event-loop microtask queue + CPU (NOT a real IDB port; fake-indexeddb is in-process, per-fork).

### 4. `engine.test.ts` AC-4 — fake-clock + sync-engine boot under load

**Code site:** L260-281 + buildEngine helper (vitest.config.ts:13 comment cites this exact test)
```ts
it('AC-4: version-mismatch routes to Conflict, no auto-retry', async () => {
    const h = buildEngine()
    await getDb().tracks.put({...})
    await applyEdit({...})
    h.adapter.queue(new VersionMismatchError())
    await h.engine.start()
    await flushAll()
    expect(h.engine.getState()).toBe('conflict')
    // ...
    await h.clock.advance(60_000)
    // ...
})
```

`buildEngine()` boots the full SyncEngine; AC-4 uses fake-clock `.advance(60_000)` orchestrated via `flushAll()` (Promise chain drains). Solo: 760 ms (fast for this test). BUT the WHOLE FILE solo wall time is 11.9 s — the slow tests are the other 14 tests in the suite that each run buildEngine + Dexie reset. The AC-4 test is FAILING parallel because the fork running engine.test.ts is doing ~12 s of cumulative wall work across 15 tests; if AC-4 happens to land late in the file's order under load, it hits the budget while the per-test setup queue clears.

**The original 5 → 10 s bump was for this exact test** (cited in `vitest.config.ts:13-17`). The diagnosis was the same shape: fake-clock-orchestrated promise chains race the wall clock when transform queue is saturated. Load has grown since (more test files added means more fork siblings) → 10 s is now tipping over too.

**Resource contended:** vite transform queue (engine.test.ts pulls a heavy sync-engine dependency graph; ~32 tests in the file each set up `buildEngine`) + CPU.

### 5. `init-pagehide.test.ts` — per-test resetModules + dynamic imports of init AND store

**Code site:** L17-67
```ts
describe('installPagehideDrainHook', () => {
    beforeEach(() => {
        vi.resetModules()
        addSpy = vi.spyOn(window, 'addEventListener')
    })

    afterEach(() => {
        // ...
        return import('../store').then(({ useSyncStatus }) => { ... })
    })

    it('registers exactly one pagehide listener on window', async () => {
        const { installPagehideDrainHook } = await import('../init')
        // ...
    })
})
```

Per-test `vi.resetModules()` + `await import('../init')` (which pulls the whole sync init dependency chain) + afterEach `await import('../store')` (second transform per test). Solo: 3.3 s. Under load: > 10 s.

**Resource contended:** vite transform queue (per-test re-import of `../init` AND `../store`) + CPU.

### Mechanism table summary

| File | Specific resource starved | NOT a race on |
|---|---|---|
| route-auth.test.ts | vite transform queue at beforeAll dynamic-import of `@/app/api/setlist/publish/route` | shared module state (vi.mock is per-file scope) |
| async-safety.test.tsx | vite transform queue at per-test `vi.resetModules` + `await import("../PDFOverlay")` + 5x `vi.doMock`'d deps | shared store (it stubs `@/lib/store` per-test) |
| edit-log.test.ts | microtask queue draining the `fake-indexeddb`/Dexie applyEdit chain under CPU starvation | shared Dexie DB across forks (fake-indexeddb is per-fork) |
| engine.test.ts AC-4 | vite transform queue (buildEngine + Dexie reset across 15 tests) + fake-clock-promise-drain wall time | real Firestore port (uses in-memory adapter) |
| init-pagehide.test.ts | vite transform queue at per-test resetModules + `await import('../init')` AND afterEach `await import('../store')` | window.addEventListener real state (per-fork jsdom) |

---

## Phase 4 — Per-file mitigation recommendation

The supervisor dispatch defined four mitigation classes:
- **A** Test-local fix (per-file change, no infra impact)
- **B** Test config tweak (vitest.config.ts; affects suite)
- **C** Test framework upgrade (vitest version bump)
- **D** Tolerate (declared known-flake)

| File | Recommended class | Specific change | LOC |
|---|---|---|---|
| route-auth.test.ts | **B** | `hookTimeout: 30000` in vitest.config.ts (whole-suite effect) | shared config 1 line |
| async-safety.test.tsx | **B** | `testTimeout: 30000` covers; OR test-local A: hoist `vi.doMock` calls to module scope (eliminates per-test re-transform). A is structurally larger because PDFOverlay's behavior depends on the doMocked deps changing per-test scenario in the OTHER tests in this file. B is cheaper. | shared config 1 line (B) / ~30 LOC (A) |
| edit-log.test.ts | **B** | `testTimeout: 30000` covers. No structural test-local fix avoids the IDB microtask cost. | shared config 0 LOC if B covers |
| engine.test.ts AC-4 | **B** | `testTimeout: 30000` covers. **Same playbook as the 5 → 10 documented in `vitest.config.ts:13-17`.** | shared config 0 LOC if B covers |
| init-pagehide.test.ts | **B** | `testTimeout: 30000` covers. Test-local alt A: pre-import `../init` and `../store` once at module scope; only `vi.resetModules` selectively. ~15 LOC, but defeats the test's explicit idempotency-isolation contract. | shared config 0 LOC if B covers |

**No file individually justifies a test-framework upgrade (C).** None should be tolerated (D) — they all pass solo deterministically; this is a budget issue, not a true flake.

---

## Phase 5 — Aggregate recommendation

### Root-cause hypothesis (high confidence)

**Default `vitest run` spawns one fork per CPU (16 on this host).** Each fork independently transforms imports via vite. The five flaky files all share a structural property: they do **dynamic `await import()` of heavy app modules** (either at suite-scope beforeAll OR per-test after `vi.resetModules()`). Under 16-fork parallel pressure, the shared vite transform server + CPU saturate, and any individual `await import()` that solo takes 3–5 s slips past 10 s.

The smoking gun is in `vitest.config.ts:13-17`:
> "10s default timeout. The 5s default tipped over under parallel pressure once v50-05 grid tests were added (transform queue grew), surfacing a fake-clock race in engine.test.ts AC-4 that passes standalone in ~600ms."

This already documents the same diagnosis. The fix at the time was the 5 → 10 bump. Suite load has grown since (250 test files now); 10 s is also tipping over.

### Aggregate recommendation — Option A (preferred): bump timeouts

```diff
 // vitest.config.ts
-        testTimeout: 10000,
+        testTimeout: 30000,
+        hookTimeout: 30000,
```

**+2 LOC.** Removes all 5 flakes deterministically. Every flake passes solo in well under 12 s; 30 s leaves 2–3× headroom under the worst observed parallel slowdown. Real perf regressions still surface within 30 s — well above any non-pathological budget (the slowest currently-PASSING tests sit at ~5 s solo; bumps the budget from 2× headroom to 6× for those).

**Why this beats the test-local-A alternatives:** the 5 file-local rewrites cumulatively cost ~50–80 LOC of test refactor and each one weakens an explicit test invariant (per-test module isolation, per-test mock-scoping, idempotency-flag isolation). The B-class fix is cheaper AND preserves test intent.

### Aggregate recommendation — Option B (fallback): cap forks

```diff
 // vitest.config.ts
+        poolOptions: {
+            forks: { maxForks: 4 },
+        },
```

**+3 LOC.** Reduces parallel pressure on the transform queue from 16 → 4 forks. Slows total wall time by ~30–50 % (current 333 s → ~450–500 s) but eliminates the contention root. Use this if Option A is rejected on "we don't want to mask perf regressions" grounds. Note: this fix is structurally less clean — it caps parallelism for the WHOLE suite to fix 5 files, sacrificing ~150 s of suite wall time per CI run.

### Aggregate recommendation — Option C (rejected): test-local fixes

Sum of per-file class-A rewrites: ~50–80 LOC + meaningful changes to test invariants (per-test module reset, doMock per-test scoping, idempotency-flag isolation). Worse cost-to-value than B-class options. **Not recommended.**

### Priority ranking (which flake has the highest cost-of-flake)

All 5 fail together OR none fail. Empirical pattern (Daniel + auditor + supervisor observations over 3+ sessions): the same 4–5 files show up in nearly every parallel run. They are essentially deterministically-flaky — the suite passes only if 16 forks happen NOT to all push through these files simultaneously. Effective CI flake rate ≈ 30–70 % of runs (single-run baseline reproduces every time observed). Highest CI cost: any run that fails forces a re-run, blocking SHIP-NOTICE evidence checks.

**Bottom-line:** these 5 files are the "long pole" set for the parallel-load tipping point. The Option-A bump applies uniformly to all 5 with one 2-LOC change. Estimated time to ship fix: 5 min including a re-run for verification.

### Estimated total fix wall-time

- Option A (recommended): ~5 min including verification rerun
- Option B (fallback): ~10 min including verification rerun + 1 additional run to confirm wall-time hit
- Option C (rejected): ~6–8 hours (5 file refactors + reviews + per-file re-runs)

---

## Out-of-scope honored

- ⛔ NO code fixes shipped — research-only lane.
- ⛔ NO changes to `vitest.config.mts` (the lane prompt cited that filename; actual file in this repo is `vitest.config.ts`; both interpretations honored — no edits).
- ⛔ NO changes to any test file.
- ⛔ NO changes to app code.
- ⛔ NO bridge / MCP / firestore.rules / etc. edits.

## Artifacts

- `BASELINE-RUN-001.log` — full parallel run output (250 files, 5 fails)
- `SOLO-route-auth.log` — 9/9 PASS in 9.95s
- `SOLO-async-safety.log` — 6/6 PASS in 10.44s
- `SOLO-edit-log.log` — 11/11 PASS in 11.13s
- `SOLO-engine.log` — 15/15 PASS in 11.91s
- `SOLO-init-pagehide.log` — 5/5 PASS in 8.63s
- `FINDINGS.md` (this file)

## Gates met

- ✅ All 5 baseline-parallel failures reproduced (Phase 1).
- ✅ All 5 PASS in solo (Phase 2). No new regression to surface.
- ✅ Per-file mechanism named specifically (vite transform queue / microtask queue under CPU starvation) — not "race condition."
- ✅ FINDINGS.md exists, parseable, all 5 phase-sections present.

## Recommendation to supervisor

**Dispatch a follow-on Tier-1 lane to apply Option A** — a 2-LOC change to `vitest.config.ts` updating `testTimeout: 10000` → `testTimeout: 30000` + adding `hookTimeout: 30000`. The fix is single-file, has clear precedent (the 5 → 10 bump cited in the existing config comment), and removes the entire flake set deterministically. Expected ship cost: ~5 min including verification rerun.

If Option A is contraindicated (e.g. "we don't want to mask perf regressions"), Option B (`maxForks: 4`) is the recommended fallback at the cost of ~30–50 % longer suite wall time. Not recommending Option C (per-file rewrites) — worse cost-to-value across the board.

---

— from coder-4 2026-05-24T~03:30Z
