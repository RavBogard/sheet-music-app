# Lane FINDINGS — `assertion-flake-refactor`

**Lane:** assertion-flake-refactor (Tier 1; coder-7)
**Branch:** feat/assertion-flake-refactor cut from `de1d96a34`
**Dispatch:** `inbox/coder-7.md` msg-assertion-flake-refactor-001 (supervisor 2026-05-25T19:30Z) — Daniel lifted the 48h "couple days" hold 2026-05-25T19:25Z; population stable at 3 known parallel-load flake instances.

---

## Phase 1 — shared-shape characterization

### Population located (3 instances)

| # | File | Test name(s) | Wall-clock margin |
|---|------|--------------|-------------------|
| 1 | `src/lib/sync/__tests__/property-failures.test.ts` | `v50-07-04: kitchen-sink under random failure mix > AC-1: invariants hold under randomized chaos` | 8 s per-iteration deadline (`Promise.race` vs `setTimeout(reject, 8_000)`) |
| 2 | `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx` | `v54-01-03 trackCount reconciliation > patches setlist.trackCount …`; `v54-01-03 > does NOT patch when trackCount already matches`; `fires lazy-hydration only once per mount (re-render does not retrigger)` | 3000 ms `waitFor` over 800 ms debounce; 1200 ms wall-wait past 800 ms debounce; 20 ms microtask drain |
| 3 | `bridge/src/__tests__/x32-r1-readback.test.ts` | `X32 read-of-own-write (R1) > refreshes the bridge's cached value from the desk after its own SET (R1 fixed)` | 120 ms `delay()` for ~75 ms CONFIRM_DEBOUNCE + UDP loopback RTT |

Note: dispatch quoted the property-failures path as `src/lib/__tests__/property-failures.test.ts`; actual path is `src/lib/sync/__tests__/property-failures.test.ts` (the sync subtree). Same file; minor typo in the dispatch body. ACKed in supervisor inbox.

### Read-through of each site

**Site 1 — runKitchenSink (`property-failures.test.ts:1653-1938`).**
fast-check property test (`fc.assert` / `fc.asyncProperty`) with `numRuns: 10 (local) / 50 (CI)`. Each iteration runs `runKitchenSink(actions)` (a SyncEngine + FakeClock + FakeChannelHub kitchen-sink driven by random `KSAction[]` of length 3-12). Inside the iteration the engine uses a `FakeClock`, but the **iteration deadline itself** is a real-time guard at L1922-1933:

```ts
let timer: ReturnType<typeof setTimeout> | undefined
const timeout = new Promise<void>((_, reject) => {
    timer = setTimeout(() => reject(new Error('iteration > 8s — runaway')), 8_000)
})
try {
    await Promise.race([runKitchenSink(actions), timeout])
} finally {
    if (timer) clearTimeout(timer)
}
```

The 8 s wall-clock guard exists to bound runaway pump-loop shapes that fast-check could shrink into. Under suite-wide parallel CPU pressure the guard occasionally fires on a legitimate (non-runaway) iteration whose `engine.pump()` + Dexie + drain cycle just got squeezed below the 8 s budget. The outer vitest timeout is 240 s; flake surfaces inside the inner 8 s, not the outer cap.

**Site 2 — SetlistGridHydrator (`SetlistGridHydrator.test.tsx`).** Three wall-clock-bound sub-cases:

- `v54-01-03 patches setlist.trackCount when Dexie count differs from initial snapshot` (L787-832): `waitFor({ timeout: 3000 })` wrapping a `setTimeout(handle, 800)` debounce inside the prod hydrator (`SetlistGridHydrator.tsx:450`) + applyEdit fan-out. Buffer is 3000 ms - 800 ms debounce - applyEdit settlement ≈ 2200 ms. Solo: fires at ~810-900 ms. Under suite-wide parallel load: occasionally the debounce + dexie live-query cycle exceeds 3000 ms.

- `v54-01-03 does NOT patch when trackCount already matches` (L834-875): `await new Promise(resolve => setTimeout(resolve, 1200))` — wait 400 ms past the 800 ms debounce window then assert NO applyEdit call. The 400 ms cushion is the smallest in the file. Under parallel load the debounce-fire-cancel timer can drift, in rare cases firing slightly later than its scheduled tick.

- `fires lazy-hydration only once per mount (re-render does not retrigger)` (L361-394): `await new Promise(r => setTimeout(r, 20))` to drain pending microtasks after rerender, then assert no additional applyEdit calls. 20 ms is fine on a quiet machine; flakes when other vitest workers are CPU-bound.

**Site 3 — x32-r1-readback (`x32-r1-readback.test.ts:38-68`).** Uses a real `dgram` UDP loopback socket pair (`X32MockServer` + `X32Client`). After `client.setBusFader(bus, target)` (a fire-and-forget OSC write), the test waits `await delay(120)` to span "CONFIRM_DEBOUNCE_MS (~75 ms) + the loopback round-trip". The 45 ms slack between 75 ms and 120 ms is the smallest absolute margin in the population. Under parallel load with multiple vitest workers contending for the Node event loop + dgram scheduler, the SET → mock-echo → client-listener cycle can land just past the 120 ms cutoff.

### Shared shape

All 3 sites share **the same shape**: a *wall-clock-bounded assertion window racing a real-time event whose latency depends on CPU/IO availability*. The events themselves differ (fast-check + fake-clock + Dexie drain / debounced applyEdit / dgram UDP RTT) but the timing-baseline pattern is identical:

> Hard-coded `setTimeout(deadline_ms)` (or `waitFor({ timeout: deadline_ms })`, or `new Promise(r => setTimeout(r, wait_ms))`), where `deadline_ms ≈ underlying_event_latency × small_constant_margin` (1.3-1.6×).

Under solo isolation the small margin is enough. Under suite-wide parallel load the margin gets squeezed.

None of the three can be FakeClock-converted without touching prod code (fast-check shrinking + real dgram + react-testing-library waitFor are all wall-clock-bound by construction in the surface they're testing — and the dispatch is explicit: NO prod-code edits, NO disabling).

This is **the same shape** ([[feedback_parallel_load_flake_baseline]] confirms 3 instances all sharing parallel-load-only failure mode + solo-PASS). Option (b) per-flake fixes are NOT cleaner here — the shapes are too similar to justify distributing the fix.

---

## Phase 2 — design choice

**Decision: Option (a) — shared timing-baseline helper.**

A small module at `src/test-utils/load-adjusted-timing.ts` exports:

```ts
export const LOAD_FACTOR: number
export function loadAdjusted(ms: number): number
export function loadAdjustedDelay(ms: number): Promise<void>
```

`LOAD_FACTOR` defaults to **1.5**, with override via `VITEST_LOAD_FACTOR` env var. Reads once at module load (process-global; no per-call overhead).

Each of the 3 flake sites wraps its existing wall-clock window in `loadAdjusted()`:

- runKitchenSink: `setTimeout(reject, loadAdjusted(8_000))` (12 s default, 16 s under LOAD=2).
- SetlistGridHydrator: 3 wall-clock windows → `waitFor({ timeout: loadAdjusted(3000) })`, `setTimeout(resolve, loadAdjusted(1200))`, `setTimeout(r, loadAdjusted(20))`.
- x32-r1-readback: `await loadAdjustedDelay(120)` (180 ms default, 240 ms under LOAD=2).

### Why not the alternatives

- **Option (b) — per-flake margin bumps without a helper.** Each site gets a hard-coded slightly larger margin. Simpler diff. But the dispatch explicitly prefers consolidation ("consolidate parallel-load timing-baseline pattern"). Spreading the rationale across 3 files makes future flakes (when a 4th site appears) harder to harmonize.
- **Option (c) — vitest config change (`pool: "forks"`, `singleThread: true`, isolation).** `pool: "forks"` ships process isolation but adds per-test process spin-up cost — moves around the slowdown rather than removing it. `singleThread: true` for these 3 files would slow them down (no parallelism even when the rest of the suite is parallel) and only masks the issue without surfacing the calibration knob. Neither addresses the root cause: wall-clock margin too tight under load.

### Why default 1.5 (not 2.0 / not 1.0)

- 1.0 default = no behavior change baseline-side, requires CI to set the env every time → fragile (env-var bit-rot).
- 2.0 default = doubles all wall-clock margins → baseline runtime grows more than needed.
- 1.5 default = +50 % margin absorbs the parallel-load worst case observed in this population (memory `[[feedback_parallel_load_flake_baseline]]`'s "specific fast-check seeds fail under suite-wide parallel load"), with baseline runtime impact ~5 s on a ~120 s suite (well inside the 20 % gate).

Env override remains available — CI can set `VITEST_LOAD_FACTOR=2` (or higher) without code change if a new contention regime appears.

### Out-of-scope (hard boundaries, restated from dispatch)

- No production code touched — only test files + new test-utility module.
- No tests disabled (`it.skip`, `describe.skip`).
- No edits to `src/lib/mcp/errors.ts`, `error-envelopes.ts`, repo-root `mcp/`, `bridge/` (non-test), `SetlistGrid.tsx`.
- No SmartTransposer changes ([[project_smart_transposer_is_key_transcriber]]).
- No coder-6 `bridge-analysis` overlap (she reads bridge prod for AUDIT; this lane writes only `bridge/src/__tests__/x32-r1-readback.test.ts`).

---

## Phase 3 — implementation sketch (to confirm)

1. Create `src/test-utils/load-adjusted-timing.ts` (~25 LOC).
2. Create `src/test-utils/__tests__/load-adjusted-timing.test.ts` (~30 LOC) — env override + multiplier math + delay timing.
3. Edit `src/lib/sync/__tests__/property-failures.test.ts` — wrap the 8 s timer in `loadAdjusted(8_000)`.
4. Edit `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx` — wrap 3 timing windows (3000 ms waitFor, 1200 ms delay, 20 ms drain) in `loadAdjusted` / `loadAdjustedDelay`.
5. Edit `bridge/src/__tests__/x32-r1-readback.test.ts` — replace local `delay(120)` with `loadAdjustedDelay(120)` (or wrap the existing delay's `ms`). Bridge test imports via relative path `../../../src/test-utils/load-adjusted-timing` (verified bridge tsc does not currently compile `bridge/src/__tests__/**`; runtime resolution is via vitest).

Honest LOC estimate: ~120-160 LOC total (helper + helper unit tests + 4 test-file edits). Well inside 150-250 budget.

---

## Phase 4 — validation plan (to run)

- `node node_modules/vitest/vitest.mjs run` 5× consecutive (full parallel suite) — all 3 flakes GREEN every run.
- Solo isolation for each flake instance — confirm no regression vs solo-baseline.
- `npx tsc --noEmit` — 0 new errors.
- `npm run build` (== `next build --webpack`) — exit 0.
- Compare 5-run mean wall-time vs an immediate pre-edit baseline (run on the same machine, ideally back-to-back) — within 20 %.

If any 5-run iteration fails: HEADS-UP supervisor with the failing seed/iteration + leave WIP commits + status update. Do NOT mark complete without 5/5 green.
