# tsc-hygiene-sweep — RESOLUTION

**Baseline:** `npx tsc --noEmit` against `54378d7e5` → **29 errors across 12 test files** (see `BASELINE-001.log` + `INVENTORY-001.md`).
**Final:** `npx tsc --noEmit` → **0 errors** (`POST-FIX-FINAL.log`).

## Per-file resolution

| # | File | Errs fixed | Fix shape |
|---|------|-----------|-----------|
| 1 | `src/app/api/auth/test-session/__tests__/test-session-route.test.ts` | 1 | Typed `mockSignRoleCookie` mock: `vi.fn<(...args: unknown[]) => Promise<string>>` so the `(...args) => mockSignRoleCookie(...args)` spread typechecks. |
| 2 | `src/app/api/cron/backup/__tests__/backup-route.test.ts` | 6 | Typed `backupsDocSet` / `configDocSet` / `requestSpy` mocks with explicit `(...args: unknown[]) => Promise<…>` signatures so `.mock.calls[i][j]` is no longer an empty tuple — the existing `as Record<string, unknown>` / `as { url; data }` casts now have a defined base to cast from. |
| 3 | `src/app/api/library/__tests__/upload-musescore.test.ts` | 1 | Typed `mockGetStorageObjectSize` with `vi.fn<(...args: unknown[]) => number>` for the `(...args) => mockGetStorageObjectSize(...args)` spread. |
| 4 | `src/components/performance/__tests__/performance-toolbar.test.tsx` | 2 | Annotate `mockStoreState.playbackQueue: [] as unknown[]` so per-test ad-hoc `{ … } as any` pushes type-check (was inferring `never[]`). Also removed 2 now-unused `eslint-disable-next-line @typescript-eslint/no-explicit-any` directives at lines 124/157 to satisfy the `--max-warnings=0` gate (they had been unused on the baseline too — verified against `sheet-music-app-auditor-validation/`). |
| 5 | `src/lib/http/__tests__/error-envelope.test.ts` | 5 | Introduce a local `const env = process.env as Record<string, string | undefined>` at the describe boundary and route all 5 NODE_ENV mutations through it. Bridges Node 22's read-only `@types/node` declaration; runtime is unchanged (`process.env` is still writable at the JS level in the test environment). The existing comment about Node-22 `defineProperty` non-configurability is now matched by the actual fix. |
| 6 | `src/lib/mcp/__tests__/auth.test.ts` | 2 | Typed `mockWhere` with `vi.fn<(...args: unknown[]) => { limit: typeof mockLimit }>` so the `mockWhere.mock.calls[0][2]` access has a valid tuple shape to cast from. |
| 7 | `src/lib/mcp/__tests__/list-library-enrichment-coverage.test.ts` | 1 | Added `as unknown as` bridge to the existing typed cast: `{ enrichmentStatus: undefined } as unknown as Parameters<…>[0][number]`. Standard TS pattern for cross-type narrowing through `undefined`. |
| 8 | `src/lib/mcp/__tests__/mcp-publish-setlist.emulator.test.ts` | 2 | (a) `r.recipients.map((x) => x.uid as string)` at both call sites (`r.recipients[].uid` is declared `string | undefined`; runtime always populates it for an emit). (b) Replace `s` regex flag with `[\s\S]` semantic equivalent in the `stringMatching` regex at line 448 — `/Publish refused.*won't render.*Mi Chamocha/s` → `/Publish refused[\s\S]*won't render[\s\S]*Mi Chamocha/`. Same match semantics, no `s`-flag dependency on target ≥ es2018. |
| 9 | `src/lib/mcp/__tests__/mcp-roster.emulator.test.ts` | 2 | Typed `mockCheckUserRateLimit` mock with explicit signature: `vi.fn<(uid: string, tier: string, opts?: unknown) => Promise<null | { error: string; retryAfterSec: number }>>`. Fixes both (a) the 3-arg call site `mockCheckUserRateLimit(uid, tier, opts)` (TS2554) and (b) the `mockResolvedValueOnce({error, retryAfterSec})` at line 700 (TS2345). |
| 10 | `src/lib/mcp/__tests__/mcp-salvage-chart-bytes.emulator.test.ts` | 1 | `new Response(r.body as unknown as BodyInit, …)` — Node `Buffer` is runtime-accepted by `Response` but isn't part of the DOM `BodyInit` union under the TS lib. |
| 11 | `src/lib/mcp/__tests__/tokens.test.ts` | 5 | `new Timestamp(N)` → `new Timestamp(N, 0)` at all 5 call sites. The runtime `FakeTimestamp` mock (hoisted by `vi.mock`) only reads the first arg (`public ms: number`) so the 2nd `, 0` is a no-op at runtime; TS sees the real `firebase-admin/firestore` `Timestamp(seconds, nanoseconds)` ctor and is satisfied. **No behavior change** — verified by `vitest --run tokens.test.ts` (7/7 pass). |
| 12 | `src/lib/mcp/tools/__tests__/bridge-recovery.test.ts` | 1 | `expect((res as { hint?: string }).hint ?? "")…`. The declared SUT return type is `BridgeRecoveryResult \| RichErrorEnvelope`; the runtime envelope shape (`errors.ts:193`) is actually `& { hint?: string }`. SUT signature widening is out of scope (test files only), so cast at the access boundary. |

**Total: 29 → 0 errors.** Zero `// @ts-expect-error` introduced. Zero new test utilities. Zero `src/` (app code) touched. Zero assertion logic / test behavior changed.

## Gates (final)

- **`npx tsc --noEmit`:** 0 errors (down from 29). Log: `POST-FIX-FINAL.log`.
- **`vitest --run`** on 12 touched files (non-emulator 9): **76/76 pass.** Log: `AFFECTED-VITEST-001.log`.
- **`vitest --run --config vitest.emulator.config.ts`** on 3 touched emulator files: **76/76 pass** (mcp-roster 44 + mcp-publish-setlist 21 + mcp-salvage-chart-bytes 11). Log: `EMULATOR-VITEST-001.log`.
- **Full `vitest --run`:** **244 files / 2595 passed / 7 files skipped / 79 tests skipped / 0 failed** — matches origin/master baseline (the 5 known parallel-load flakes are gone post `54378d7e5`'s `testTimeout` bump; no regressions introduced). Log: `FULL-VITEST-001.log`.
- **`eslint --max-warnings=0`** on all 12 touched files: clean. Log: `ESLINT-001.log` (initial 2 warnings) + post-fix clean (exit 0).
- **`next build --webpack`:** exit 0. Log: `NEXT-BUILD-001.log`.

## Out-of-scope (honored)

- ⛔ No `src/` app code touched (test files only).
- ⛔ No new test utilities (every fix is a 1-3 line typing repair in the file itself).
- ⛔ No assertion logic / test behavior changed (all 2595 tests pass, identical baseline). The `s`-flag regex rewrite preserves match semantics by construction.
- ⛔ No `// @ts-expect-error` introduced.
- ⛔ No `bridge/` tsconfig touched.
- ⛔ No tsconfig changes.
- ⛔ No widening of SUT types (e.g. `RichErrorEnvelope`).

## HEADS-UP

**None.** The dispatch warned that "Expected 0 arguments, but got 3" / "Expected 2 arguments, but got 1" patterns could be real test↔SUT mis-models. After investigation:

- `mcp-roster.emulator.test.ts(56): "Expected 0 arguments, but got 3"` → just an untyped `vi.fn(async () => null)` whose inferred signature was `() => Promise<null>`. The SUT mock takes 3 args at runtime; the mock-fn typing was wrong. **Hygiene, not bug.**
- `tokens.test.ts × 5: "Expected 2 arguments, but got 1"` → `import { Timestamp } from "firebase-admin/firestore"` resolves at type-check time to the real 2-arg constructor (`(seconds, nanoseconds)`); the runtime `vi.mock("firebase-admin/firestore", () => ({ Timestamp: class FakeTimestamp { constructor(public ms: number) {} } }))` is hoisted at module-load time so the actual ctor is 1-arg. **Type↔runtime mock skew, not a real bug** — `, 0` satisfies TS without changing the FakeTimestamp's `this.ms` runtime value.
- `bridge-recovery.test.ts:154: res.hint` → `dispatchBridgeControl`'s declared return type omits `& { hint?: string }` (the runtime envelope at `errors.ts:193` includes it). Could be argued as a SUT type-declaration gap, but **`hint` is intentionally optional** and the test compensates with `?? ""`. No real bug.

## Push posture

- Tier 1, single-commit lane.
- Cut from `54378d7e5` (origin/master tip).
- SHIP-NOTICE → `inbox/auditor.md` (Tier 1 — code-shape ACCEPT + the 0-error tsc rerun is the deployed verify).
- Worktree teardown awaits supervisor sweep per `[[feedback_worktree_teardown_timing]]`.
