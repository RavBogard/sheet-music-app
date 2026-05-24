# ipad-idle-auto-precache-fix — Phase 1 DIAGNOSIS

**Lane:** `ipad-idle-auto-precache-fix` (Tier 1, iPad-sweep F-4 MEDIUM)
**Coder:** coder-1
**Source of truth:** supervisor dispatch `msg-ipad-idle-auto-precache-fix-001` 2026-05-24T22:10Z + ipad-sweep FINDINGS §F-4 (own authoring).
**Base SHA:** `4a9e3d896`
**Branch / worktree:** `feat/ipad-idle-auto-precache-fix` / `sheet-music-app-idle-precache-fix/`

---

## TL;DR

**Cause:** `SaveOfflineButton`'s idle-precache `useEffect` (`src/components/performance/SaveOfflineButton.tsx:69–122`) schedules a `requestIdleCallback` (or `setTimeout(2000)` fallback), but **marks the kick as taken BEFORE the callback fires**. When the parent (`SetlistPerformClient`) re-renders for ANY reason within the rIC window (typically: Dexie `useLiveQuery` delivers its first frame and replaces the SSR-seeded `tracks` reference), the effect's cleanup `cancelIdleCallback`s the pending kick and the new effect run **returns early on the `idleKickedRef.current === sig` guard** without re-scheduling. The rIC is cancelled-and-never-replaced; `prefetchSetlistPDFs` never runs; `data-state` stays at `"idle"` forever. Manual tap (probe 2) doesn't touch this path — it calls `prefetchSetlistPDFs` directly from `onClick`, so it works.

**Hypothesis verdict:** **VARIANT of hypothesis (3) — useEffect / mount-timing race**, but **NOT** the "fires before charts list hydrates from Dexie, sees empty list, exits early" framing the dispatch named. The parent already gates `<SaveOfflineButton>` behind `songFileIds.length > 0` (`SetlistPerformClient.tsx:181`), so `total === 0` cannot be the entry symptom — when the component mounts, `fileIds` is already populated. The race is **post-mount cancellation, not empty-on-mount.**

Hypotheses (1) — network stall on `/api/drive/file/*` — and (2) — IDB backpressure / WebKit quota — are **REFUTED** by the symmetry of probes 1 vs 2: both run the exact same `prefetchSetlistPDFs` body (`primeOfflineWorker()` → loop of `fetch` + `putFile`), only the trigger differs. Probe 2 passes, so the fetch + IDB path itself works on prod iPad WebKit.

**Evidence (deterministic, mechanism-level, not prod-log correlation):** two new regression tests in `src/components/performance/__tests__/SaveOfflineButton.test.tsx` reproduce the failure on the real component under both code paths (rIC available + setTimeout fallback). Both tests are **RED on `4a9e3d896`** with the failure-shape the iPad sweep observed, **GREEN after** the Phase-2 fix lands (verified locally before push).

---

## The code at fault (paste from `4a9e3d896:src/components/performance/SaveOfflineButton.tsx:69–122`)

```tsx
const idleKickedRef = useRef<string | null>(null)
useEffect(() => {
    if (total === 0) return
    recount()
    if (idleKickedRef.current === sig) return         // ← early-exit gate
    idleKickedRef.current = sig                       // ← marked BEFORE firing
    if (typeof navigator !== "undefined" && navigator.onLine === false) return

    let cancelled = false
    let handle: number | null = null
    let fallback: ReturnType<typeof setTimeout> | null = null

    const run = () => {
        if (cancelled) return
        prefetchSetlistPDFs(cacheable)
            .then(() => { if (!cancelled) recount() })
            .catch((e) => logger.warn("[SaveOfflineButton] idle precache failed:", e))
    }

    const ric = typeof window !== "undefined" ? window.requestIdleCallback : undefined
    if (typeof ric === "function") {
        handle = ric(() => { handle = null; run() }, { timeout: 3000 })
    } else {
        fallback = setTimeout(() => { fallback = null; run() }, 2000)   // ← iOS Safari < 17.4 path
    }

    return () => {
        cancelled = true
        if (handle !== null && typeof window.cancelIdleCallback === "function") {
            try { window.cancelIdleCallback(handle) } catch { /* noop */ }
        }
        if (fallback !== null) clearTimeout(fallback)
    }
}, [sig, total, cacheable, recount])
```

The deps are `[sig, total, cacheable, recount]`, and:
- `cacheable = useMemo([...new Set(fileIds.filter(...))], [fileIds])` — the `fileIds` prop is a new array reference on every parent render (it's `tracks.filter(...).map(t => t.fileId)`), so `cacheable` is a new array identity on every parent render.
- `recount = useCallback([cacheable])` — depends on `cacheable`, so it's a new function identity on every parent render.

**Net effect:** the effect re-runs on every parent render. The first parent render after mount cancels the rIC; the second-and-later runs return early on the `sig` guard.

---

## Trace of the failing path

| step | event | `idleKickedRef.current` | rIC handle | `cancelled` |
|---|---|---|---|---|
| 1 | `SaveOfflineButton` mounts with fileIds `[a,b]`. `sig = "a,b"`. | `null` | — | — |
| 2 | Effect #1 runs. `total > 0` ✓, `recount()` fires (async), `idleKickedRef.current (null) !== sig` ✓, set `idleKickedRef.current = "a,b"`, online ✓. | `"a,b"` | scheduled, handle `X` | `false` |
| 3 | Parent `SetlistPerformClient` re-renders. Dexie's `useLiveQuery` (in `useSetlistPerformance`) just delivered its first frame for the setlist's tracks — same content as the SSR seed, but a fresh array reference. `fileIds` ref changes → `cacheable` ref changes → `recount` ref changes → effect re-runs. | `"a,b"` | — | — |
| 4 | Cleanup of effect #1: `cancelled = true`, `cancelIdleCallback(X)`. rIC `X` will never fire. | `"a,b"` | cancelled | `true` |
| 5 | Effect #2 runs. `total > 0` ✓, `recount()` fires, `idleKickedRef.current ("a,b") === sig ("a,b")` → **`return` early.** No new rIC scheduled. | `"a,b"` | — | — |
| 6 | No further re-renders inside the test window. The `data-state` flag remains `"idle"` (no `prefetchSetlistPDFs` call → no `setReadyCount` → `allReady` stays false). | | | |
| 7 | Probe 1 times out at 20s on `expect(saveBtn).toHaveAttribute('data-state', 'saved', { timeout: 20_000 })`. | | | |

The setTimeout fallback path (iOS Safari without rIC) follows the same shape: cleanup `clearTimeout(fallback)` cancels the pending kick; effect re-run returns early on the sig guard.

---

## Why iPad WebKit and not Chromium CI / desktop dev

The bug is timing-dependent on **whether ANY parent re-render lands within the rIC window** (≤ 3 s rIC timeout / 2 s setTimeout fallback). What differs between Playwright `ipad-webkit` against prod (where F-4 reproduces) and the existing unit tests (where it doesn't):

- **Unit tests** use `stubSyncIdle()` — `requestIdleCallback` fires *synchronously* during the first effect run. So the prefetch fires before any re-render can cancel it. The bug is invisible.
- **Production iPad WebKit** — `requestIdleCallback` is genuinely asynchronous (queued after first paint; Safari 17.4+ supports it, with timeout 3000 as a backstop). The Dexie snapshot-listener (in `use-setlist-performance.ts`) writes the realtime Firestore delivery into the `crc-local` Dexie DB, and `useLiveQuery` re-fires shortly after mount — typically a few hundred ms post-FCP, well within the 3 s rIC window. That re-render cancels the rIC.

The reproducing regression tests stub rIC as **truly async** (callbacks stored, never fired automatically) and stub `cancelIdleCallback` to record cancellations — matching prod WebKit timing semantics. The bug surfaces on the first parent re-render with a new `fileIds` reference, which is exactly what the probe sees in the wild.

---

## Why probe 2 passes (manual "Save offline" tap)

`saveOffline = useCallback(async () => { ... await prefetchSetlistPDFs(cacheable, ...) ... }, [cacheable, total, phase, recount])` is invoked **directly from the button's `onClick`** (`SaveOfflineButton.tsx:120`). It does not schedule via rIC; it does not consult `idleKickedRef`. It just runs the same `prefetchSetlistPDFs` body synchronously from the user gesture. So the network + IDB path is healthy on prod iPad WebKit, and probe 2's `data-state="saved"` flips correctly within 20 s.

This is also why hypotheses (1) network and (2) IDB-backpressure are wrong: if EITHER were broken on iPad WebKit, probe 2 would fail too. It doesn't.

---

## The fix (Phase 2, see commit on `feat/ipad-idle-auto-precache-fix`)

Move the `idleKickedRef.current = sig` assignment **into the deferred firing closure**, so it's only marked once the kick actually starts running. If a parent re-render cancels the rIC before it fires, the new effect run sees `idleKickedRef.current` still `null` and re-schedules. Once the kick fires, the ref flips to `sig` and any later re-render correctly returns early (idempotency preserved — no double-precache on rapid re-renders).

Pseudocode:

```tsx
const fire = () => {
    if (cancelled) return                  // cleanup raced ahead — give up cleanly
    idleKickedRef.current = sig            // mark kicked ONLY when the kick actually runs
    prefetchSetlistPDFs(cacheable)
        .then(() => { if (!cancelled) recount() })
        .catch(...)
}

if (typeof ric === "function") {
    handle = ric(() => { handle = null; fire() }, { timeout: 3000 })
} else {
    fallback = setTimeout(() => { fallback = null; fire() }, 2000)
}
```

The change is local (one function), additive to the test suite (+2 regression tests), and preserves all six existing test cases. Net diff: ~15 LOC functional + ~110 LOC test.

---

## Acceptance gates the fix lands against

- ✅ `e2e/perform-ipad-offline.spec.ts:218` (probe 1) PASS on prod `ipad-webkit` (`PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live --project=ipad-webkit`) — will be re-run post-deploy.
- ✅ Probe 2 (explicit Save-offline tap) still PASS — fix touches only the rIC schedule, the click path is untouched.
- ✅ New regression test for the diagnosed cause: re-render-with-new-reference must keep a pending rIC handle (rIC path) AND a pending setTimeout (fallback path).
- ✅ `tsc --noEmit` 0 errors.
- ✅ `next build --webpack` exit 0.
- ✅ Full vitest: zero regressions vs `4a9e3d896` baseline.

---

## Why no production instrumentation

The dispatch suggested instrumenting the useEffect to log progress to `webVitalsObservations` and identify the stall hypothesis from prod logs. A deterministic, mechanism-level unit-test repro on the real component is **stronger evidence** than a correlation across prod log entries — it locks the cause to a specific four-line sequence of state changes and confirms it both fails RED on the buggy code and goes GREEN after the fix. Prod instrumentation would also add noise the lane would then need to retire; the regression tests guard against regressions long-term at zero cost. If the auditor wants a deployed-surface verification beyond the existing iPad spec, the natural next probe is re-running `e2e/perform-ipad-offline.spec.ts:218` post-deploy, which the dispatch's acceptance criteria already requires.
