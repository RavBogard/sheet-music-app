# tsc-hygiene-sweep — Phase 1 inventory

**Baseline:** `npx tsc --noEmit` against worktree cut from `54378d7e5`.
**Total errors:** **29** (confirmed; matches supervisor pre-flight).
**Log:** `BASELINE-001.log` (33 lines incl. wrap-around for multi-line TS messages).

## Per-file group

| # | File | Errs | Dominant TS code | Class |
|---|------|------|------------------|-------|
| 1 | `src/app/api/auth/test-session/__tests__/test-session-route.test.ts` | 1 | TS2556 | Untyped `vi.fn()` mock spread |
| 2 | `src/app/api/cron/backup/__tests__/backup-route.test.ts` | 6 | TS2352 / TS2493 | Untyped `vi.fn()` → `.mock.calls[0][0]` is `[][]` |
| 3 | `src/app/api/library/__tests__/upload-musescore.test.ts` | 1 | TS2556 | Untyped `vi.fn()` mock spread |
| 4 | `src/components/performance/__tests__/performance-toolbar.test.tsx` | 2 | TS2322 | `playbackQueue: []` infers `never[]` |
| 5 | `src/lib/http/__tests__/error-envelope.test.ts` | 5 | TS2540 | Node 22 + `@types/node` makes `process.env.NODE_ENV` read-only |
| 6 | `src/lib/mcp/__tests__/auth.test.ts` | 2 | TS2352 / TS2493 | Untyped `vi.fn()` → `.mock.calls[0][2]` empty-tuple |
| 7 | `src/lib/mcp/__tests__/list-library-enrichment-coverage.test.ts` | 1 | TS2352 | `{ ...: undefined }` cast to typed param needs `unknown` bridge |
| 8 | `src/lib/mcp/__tests__/mcp-publish-setlist.emulator.test.ts` | 2 | TS2345 / TS1501 | `r.recipients[].uid` is `string \| undefined`; `/.../s` flag requires es2018+ |
| 9 | `src/lib/mcp/__tests__/mcp-roster.emulator.test.ts` | 2 | TS2554 / TS2345 | `vi.fn(async () => null)` inferred 0-arg / `Promise<null>` |
| 10 | `src/lib/mcp/__tests__/mcp-salvage-chart-bytes.emulator.test.ts` | 1 | TS2345 | `new Response(Buffer)` — Node Buffer not in DOM `BodyInit` |
| 11 | `src/lib/mcp/__tests__/tokens.test.ts` | 5 | TS2554 | `import { Timestamp } from "firebase-admin/firestore"` → real ctor wants `(seconds, nanoseconds)`; mock is hoisted at runtime but TS sees real type |
| 12 | `src/lib/mcp/tools/__tests__/bridge-recovery.test.ts` | 1 | TS2339 | `RichErrorEnvelope` doesn't declare `hint?`, but runtime envelope (per `errors.ts:193`) returns `& { hint?: string }` |

Total: **12 files / 29 errors**.

## Classification

All 29 errors are **pure type-shape hygiene** — none represent real test/SUT mis-models. Every class has a minimal-diff fix that preserves the existing assertion/behavior at runtime:

- **Untyped `vi.fn()` mock spreads (8 errs, files 1/2/3/6):** type the mock with `vi.fn<(...args: unknown[]) => …>(…)` so `.mock.calls[i][j]` is no longer an empty tuple and spread args type-check.
- **`process.env.NODE_ENV` Node 22 readonly (5 errs, file 5):** cast at the boundary — `(process.env as Record<string, string | undefined>).NODE_ENV = …`. Behavior preserved.
- **`playbackQueue: []` → `never[]` (2 errs, file 4):** annotate `playbackQueue: [] as unknown[]` at the literal — keeps `mockStoreState` initial shape, lets `as any` shape pushes type-check.
- **`new Timestamp(ms)` 1-arg call vs real 2-arg ctor (5 errs, file 11):** add the `, 0` nanoseconds arg. Runtime is the hoisted FakeTimestamp which ignores the 2nd arg (only stores `public ms: number`). Real TS-resolved type satisfied. **NO behavior change** (FakeTimestamp ignores the 2nd arg).
- **`{ enrichmentStatus: undefined }` cast through union (1 err, file 7):** `as unknown as Parameters<…>[0][number]` bridge.
- **`r.recipients[].uid as string | undefined → .doc(uid)` (1 err, file 8):** cast `uid` at the array boundary — `r.recipients.map((x) => x.uid as string)`. Runtime identical.
- **`/Publish refused.*won't render.*Mi Chamocha/s` (1 err, file 8):** replace `s` flag with `[\s\S]` semantic equivalent in the regex source. Same match semantics.
- **`new Response(Buffer)` (1 err, file 10):** cast `r.body as unknown as BodyInit`. Runtime identical (Node's `fetch` polyfill accepts Buffer just fine).
- **`RichErrorEnvelope` lacks declared `hint` (1 err, file 12):** cast at the access site — `(res as { hint?: string }).hint`. Doesn't touch SUT.
- **`vi.fn(async () => null)` inferred 0-arg / `Promise<null>` (2 errs, file 9):** type the mock with explicit signature so 3-arg calls + `mockResolvedValueOnce({...})` resolve.

## HEADS-UP

**None** — no error in the baseline reveals a real test↔SUT mis-model. The dispatch's "Expected 0 arguments, but got 3" / "Expected 2 arguments, but got 1" cases both turned out to be **type-only** issues (untyped mocks resp. shadow-import of `Timestamp` whose runtime is the hoisted fake). No real-bug HEADS-UPs to send.

## Plan

One commit. Per-file minimum-diff edits in the order above. After each file: `vitest --run <file>` confirms behavior preserved. Then full-suite + build + final tsc.
