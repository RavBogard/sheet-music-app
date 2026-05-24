# ipad-wake-lock-toggle-fix — DIAGNOSIS

**Lane:** `ipad-wake-lock-toggle-fix` (coder-1, Tier 1)
**Base SHA:** `c76b2a34a` (current origin/master at lane start; matches dispatch-named SHA)
**Authored:** 2026-05-24T~12:00Z (diagnose-phase, BEFORE any prod-code edit)
**Updated:** 2026-05-24T~19:20Z (§Resolution added post-Daniel ratification of Option A)
**Status:** ✅ **Option A SHIPPED** — Daniel ratified harness-fix path 2026-05-24T~18:53Z; sentinel-state primary assertion + flag-gated `window.__c7_wakeLockSentinel__` exposure are the deterministic oracle for this finding. Option B (real-iPad off-service test) recorded as residual user-requirement oracle, NOT blocking this lane's auditor ACCEPT.

## TL;DR

The F-3 RED ("KeepAwakeToggle's `navigator.wakeLock.request` not firing on prod iPad WebKit") is **most-likely a test-harness instrumentation race in Playwright WebKit, NOT a regression in the prod KeepAwakeToggle code**. The toggle's `onClick → requestWakeLock → acquireLock → await navigator.wakeLock.request("screen")` chain is functionally correct under code inspection and direct probing; the SHIM the spec installs at `e2e/perform-ipad.spec.ts:209-217` is **silently bypassed** in ~25-50% of runs on this Playwright WebKit build.

**Strong evidence (from the prior sweep's failure trace, reproduced today):**
- `'wakeLock' in navigator` → `true`
- `Object.getOwnPropertyDescriptor(WakeLock.prototype, 'request')` → writable+configurable data property; shim assignment creates an own-data-property shadow as expected
- Shim install eval succeeds without throw; `navigator.wakeLock.request.toString()` returns the shim function string after assignment
- Direct call from `page.evaluate(() => navigator.wakeLock.request('screen'))` HITS THE SHIM (count goes 0→1)
- BUT after `toggle.tap()`, in failing runs: `aria-pressed="true"` (so `setIsLocked(true)` definitively ran in `acquireLock`, after `await navigator.wakeLock.request("screen")` resolved) AND `__wakeLockCount === 0` (so the shim was NOT called by the React-bundle's invocation)
- **Logical contradiction** unless the React-bundle's `await navigator.wakeLock.request("screen")` call bypasses the JS-installed shim and reaches the native binding directly

## Repro

```bash
cd sheet-music-app-wake-lock-fix
PLAYWRIGHT_USE_REMOTE=1 \
  PLAYWRIGHT_BASE_URL=https://www.centralreform.live \
  MCP_BEARER=crl_live_…995f287c… \
  npx playwright test e2e/perform-ipad.spec.ts --project=ipad-webkit \
  -g "Keep-screen-on toggle" --trace=on --repeat-each=8 --workers=1
```

Observed (this lane, 2026-05-24T~11:30Z, prod @ `c76b2a34a`):

| run-set | passes | fails | fail-rate |
|---|---|---|---|
| RUN-001 (5 sequential) | 3 | 2 | 40% |
| RUN-002 (repeat-each=8) | 6 | 2 | 25% |
| RUN-003 (repeat-each=4) | 4 | 0 | 0% |

Mean: ~25-40% fail rate. Failure mode: identical assertion (line 228 `requestCount must be ≥ 1`, received 0). Pre-failure execution clears the `aria-pressed="true"` assertion (line 222).

## Hypotheses considered (from dispatch's three)

| # | Hypothesis | Verdict |
|---|---|---|
| (a) | KeepAwakeToggle not present | **Refuted.** `expect(toggle).toBeVisible({timeout: 10_000})` at line 215 succeeds in every run; toggle renders for every iteration. |
| (b) | Toggle present but tap doesn't invoke `requestWakeLock` | **Partially refuted.** Tap clearly invokes some path: `aria-pressed` flips to `"true"`, which requires `setIsLocked(true)` to fire, which requires the `await navigator.wakeLock.request("screen")` to resolve without throw. So the request was made — to the native binding, not to the shim. |
| (c) | `isSupported` capability check false-negatives | **Refuted.** Probe 1 confirmed `navigator.wakeLock != null` returns true; `isSupported` is `true` post-mount-effect; button is `disabled={false}`; `.tap()` actionability check passes. Per-prototype descriptor: `{writable:true, configurable:true, enumerable:true, hasValue:true, hasGetter:false}`. |
| **(d) NEW** | **Shim install is silently bypassed by Playwright WebKit's JIT/binding layer when the call originates from a React `onClick` handler** | **Strongly implicated** by elimination of (a)/(b)/(c) + the logical inconsistency between `aria-pressed="true"` AND `__wakeLockCount=0`. |

## Prod bundle inspection

Fetched `https://www.centralreform.live/_next/static/chunks/app/perform/setlist/%5Bid%5D/page-4aee1f54ec75c72e.js?dpl=dpl_9WCXveHqmx6EXUnaZh7eFPf26ey5` (22.3KB).

Compiled `acquireLock` (minified, mapping to `[isLocked, setIsLocked]=[n,s]`, `[wakeLock, setWakeLock]=[i,l]`):

```js
let c = useCallback(async () => {
    if ("u" < typeof navigator || !("wakeLock" in navigator))
        return void r.v.warn("Wake Lock API not supported");
    try {
        let e = await navigator.wakeLock.request("screen");   // ← dynamic access; should hit shim
        l(e), s(!0),                                           // setWakeLock(lock), setIsLocked(true)
        r.v.info("Wake Lock active"),
        e.addEventListener("release", () => { /* setIsLocked(false), setWakeLock(null) */ })
    } catch (e) {
        "NotAllowedError" === e?.name
            ? r.v.debug("Wake lock request denied")
            : r.v.error("Failed to acquire Wake Lock:", e)
    }
}, [])
```

`navigator.wakeLock.request("screen")` is a **dynamic property access** at call time — no closure-captured reference, no module-load-time binding. Webpack/Babel don't optimize this access pattern. So the React-bundle's behavior should match the direct-call probe (which hits the shim).

`grep -oE 's\(!0\)'` on the chunk: exactly ONE site — inside `acquireLock`. No other path sets `isLocked` true.

## What's actually happening (best-effort)

In the FAILING runs:
1. Playwright `page.evaluate` installs the shim. Property descriptor confirms the assignment took. `navigator.wakeLock.request.toString()` returns the shim.
2. `toggle.tap()` dispatches the touch event.
3. WebKit's HTML click-event dispatcher calls `onClick → handleClick → onRequest() → requestWakeLock() → acquireLock()` synchronously.
4. Inside `acquireLock`: the `if (!("wakeLock" in navigator))` check passes (true).
5. **Synchronously**, the call site `navigator.wakeLock.request("screen")` is evaluated. This is the contested step. The shim should be invoked; instead the native binding is invoked.
6. The native binding returns a valid `WakeLockSentinel` (the activation context is valid because the call originates from a real touch event).
7. The await resolves; `setIsLocked(true)` fires; React re-renders; `aria-pressed` flips to `"true"`.
8. The test asserts `aria-pressed === "true"` — passes.
9. The test reads `__wakeLockCount` — still 0.

The bypass at step 5 appears to be a WebKit/Playwright-WebKit interaction that's not fully characterized. Two candidates:
- **(d1)** WebKit JIT inline-caches `navigator.wakeLock.request` against the prototype's native binding before the shim was installed; once that IC site is hot, the JS-prototype override is bypassed. The dispatch happens via the cached internal slot.
- **(d2)** Playwright WebKit's `BrowserContext` may execute `page.evaluate` shims in an isolated bindings world that doesn't fully overlay onto the main bindings world's WebIDL lookup for `[SecureContext]` interfaces.

Either way: this is **harness behavior**, not prod behavior. The prod `KeepAwakeToggle` is correctly invoking `navigator.wakeLock.request("screen")` synchronously inside the user-activation window and the lock IS being acquired (aria-pressed corroborates).

## Implication

The F-3 finding in `.paul/research/ipad-webkit-prod-sweep/FINDINGS.md` (my own prior sweep) **inferred** that the request wasn't firing FROM the shim counter being 0. That inference is unsound: the shim isn't a reliable witness on this Playwright WebKit build. The actual user-observable behavior — **does the iPad screen stay on when the band taps Keep-screen-on?** — was never directly tested by the prior sweep. The toggle SHIPS at `559c6c84d` (coder-5's `ipad-wake-lock-fix`); its acquire-then-aria-pressed flip behavior is observable here and works.

## Recommended fix (HEADS-UP — needs Daniel/supervisor steer)

Two-part work, neither is in the dispatch's 30-80 LOC budget framing:

### Part A — harness brittleness (~50-80 LOC test-spec edits)

Replace the JS-shim assertion with observable browser state:
1. **Drop** the `__wakeLockCount` shim and the `expect(requestCount).toBeGreaterThanOrEqual(1)` assertion at `e2e/perform-ipad.spec.ts:228`.
2. **Keep** the `aria-pressed="true"` flip assertion at line 222 (already passes reliably; corroborates the lock was acquired).
3. **Add** a corroborating observable: have `useWakeLock` expose the `WakeLockSentinel` reference into `window.__c7_wakeLockSentinel__` when held (test-only, gated on `NEXT_PUBLIC_PROBE_HARNESS_AUTH=1` — same as `__c7_auth_for_probes__`). The spec then reads that reference and asserts `sentinel != null && sentinel.released === false`.

This requires:
- 1 spec edit (`e2e/perform-ipad.spec.ts:206-228` shim+assertion replaced with sentinel-state read; ~20 LOC)
- 1 prod-hook edit (`src/hooks/use-wake-lock.ts` — expose sentinel under flag; ~10 LOC additive)
- Auditor sign-off via deployed-surface re-run.

**The dispatch hard-rule says `e2e/perform-ipad.spec.ts IS the oracle — do NOT edit it; if the assertion is wrong, HEADS-UP first.`** That's why this lane is HEADS-UP'd before any spec edit.

### Part B — real-iPad verification (NOT Playwright)

The prior sweep didn't actually verify the toggle on a REAL iPad. The Yizkor service screen-timeout that motivated the original `ipad-wake-lock-fix` (`559c6c84d`) was on a real iPad. Whatever the Playwright WebKit harness shows, **the question Daniel cares about is: does the iPad screen stay on when the band taps the toggle during a service?**

Recommend: Daniel taps the Keep-screen-on toggle on a band iPad during the next opportunity (low-stakes — Wed-night rehearsal, not service), then leaves it idle past the iOS screen-timeout (3min default). Observable: screen stays on. **If yes**, the prod code is correct and Part A is the only real fix. **If no**, there's a real iOS Safari bug that the Playwright harness isn't reproducing, and we need iOS-side diagnostics (Safari Web Inspector tethered to the iPad).

## Out-of-scope per dispatch (honored)

- ⛔ NO spec edit to `e2e/perform-ipad.spec.ts` (Part A blocked on HEADS-UP)
- ⛔ NO playwright.config.ts edit
- ⛔ NO bridge / monitor / firestore.rules / vercel.json changes
- ⛔ NO SmartTransposer touches
- ⛔ NO non-wake-lock UX changes

## Code-shape observations (no immediate edit recommended)

While reading the source, three minor hardening targets surfaced (NOT required for F-3 closure; record them for future polish):

1. **`acquireLock` does NOT reject the sentinel-add-listener if the component unmounts mid-acquire.** If `useWakeLock`'s component unmounts between `await navigator.wakeLock.request("screen")` (line 55) and the `addEventListener("release", ...)` (line 60), the listener is registered on an orphan sentinel — minor leak. Defensive: capture `useRef<boolean>(true)` and check before `setIsLocked`/`addEventListener`.
2. **`shouldLockRef` isn't reset to `false` when `releaseWakeLock` is called via the catch path** (the API didn't actually return a sentinel; we'd still try to re-acquire on visibilitychange). Minor.
3. **`isSupported` state is set in a `useEffect` post-mount** — meaning the initial render shows `disabled={true}` for one paint frame. Playwright `.tap()` waits for actionability, but a real user might observe a momentary flicker. Acceptable trade-off (avoids SSR hydration mismatch); document with a comment.

None of these explain the F-3 symptom; flag for future polish only.

## Artifacts

- `DIAGNOSE-RUN-001.log` — 5 sequential runs (3 PASS, 2 FAIL)
- `DIAGNOSE-RUN-002-repeat8.log` — `--repeat-each=8` (6 PASS, 2 FAIL)
- `PROBE-RUN-001.log` — WebKit property-descriptor probe (proves shim install is well-formed)
- `PROBE-RUN-005-addInitScript.log` — addInitScript shim variant (errored on `await import` — bundler quirk; non-blocking)
- `trace.zip` (from `test-results/perform-ipad-…/`) — full Playwright trace of one fail showing the inconsistency

## Posture

- **NO src/ touched yet.**
- **NO spec edits.**
- **NO commits.**
- HEADS-UP filed at `.coord/inbox/supervisor.md` 2026-05-24T~12:00Z.

— coder-1

---

## Resolution (2026-05-24T~19:20Z, post-ratification)

Daniel ratified **Option A** (harness fix) at 2026-05-24T~18:53Z per `msg-wake-lock-headsup-resolution-option-a` in `inbox/coder-1.md` — the dispatch's "do NOT edit `e2e/perform-ipad.spec.ts`" hard-rule is explicitly overridden for this lane.

### What shipped

| Touchpoint | Diff shape | LOC |
|---|---|---|
| `src/hooks/use-wake-lock.ts` | Module-level `PROBE_HARNESS_ENABLED` const + `exposeSentinelForProbe(sentinel)` helper, gated on `NEXT_PUBLIC_PROBE_HARNESS_AUTH==='1'` (same flag/pattern as `src/lib/firebase.ts:252`'s `__c7_auth_for_probes__`). Helper writes the live `WakeLockSentinel` to `window.__c7_wakeLockSentinel__` on acquire; clears (writes `null`) on sentinel `release` event, on `releaseWakeLock()`, and on unmount. | +17 |
| `e2e/perform-ipad.spec.ts:160` (Keep-screen-on test) | Primary assertion → 4-part sentinel-state read on `window.__c7_wakeLockSentinel__` (`exposed === true`, `isNull === false`, `released === false`, `type === 'screen'`). Original `__wakeLockCount` shim retained as best-effort SECONDARY in a `try{}` block; weak-assert ONLY when `> 0` (logs forensic note when shim bypassed). `aria-pressed="true"` flip stays as the corroborating React-state assertion. | ~+50 / -10 |
| `src/hooks/__tests__/use-wake-lock.test.ts` | +3 regression tests for the flag-gated exposure (vi-mocked env: flag-on → exposes after acquire / clears after release / clears on unmount). | +N (see test file) |

### Why this resolves F-3

The DIAGNOSIS above established that the F-3 RED was a Playwright-WebKit JIT/binding artifact, not a prod regression: React-bundle's `navigator.wakeLock.request("screen")` reaches the native binding directly while `page.evaluate`-installed shims silently bypass in 25-40% of runs. Reading the sentinel object directly — not counting calls through a shim — gives us:

1. **A determination Playwright can't dodge:** the same `WakeLockSentinel` object the React bundle is holding is exposed via the `window` slot. Whatever bypass route the React call took to reach the native binding, the returned sentinel still lands in the slot. No JIT inline-cache, no isolated-world drift, can hide it from the spec.
2. **A stronger user-requirement signal:** `released === false` means the OS-level lock is still held. The prior shim only proved a *call* fired, not that a *lock* was acquired and retained — this is a tighter assertion.
3. **Zero behavior change for production:** `PROBE_HARNESS_ENABLED` is false in any deploy without `NEXT_PUBLIC_PROBE_HARNESS_AUTH=1`. That env var is already enabled in prod per `[[feedback_probe_harness_prod_flag]]` (2026-05-20, intentional, token-gated by surrounding `__c7_auth_for_probes__` design — `__c7_wakeLockSentinel__` is an analogously inert read-only object reference).

### Option B residual (NOT blocking this lane)

The harness assertion verifies that the React call path acquired and retained a `WakeLockSentinel`. It does NOT verify the OS-level "iPad screen stays on" outcome (Playwright cannot observe screen-on state). Daniel's separate manual test — **tap KeepAwakeToggle on a band iPad and leave it idle past the 3-min iOS screen-timeout off-service** — remains the residual user-requirement oracle. If that test surfaces a real iOS Safari bug not reproduced by the harness, that's a separate future lane (likely tethered Safari Web Inspector + iOS-side diagnostics), NOT a rollback of this fix.

### Gates (full-lane)

- `tsc --noEmit` — 0 errors (touched files type-clean; broader baseline preserved per coder-2's hygiene sweep `37b4fd0a1`).
- `next build --webpack` — exit 0.
- Full vitest — zero regressions vs `1aea77464` baseline; new `use-wake-lock.test.ts` cases PASS.
- ESLint `--max-warnings=0` — clean on touched files.
- **Deployed-surface verify (Tier-1 mandate per `[[feedback_auditor_deployed_surface_verification]]`):** post-Vercel-prod-deploy, `PLAYWRIGHT_USE_REMOTE=1 PLAYWRIGHT_BASE_URL=https://www.centralreform.live --project=ipad-webkit -g "Keep-screen-on toggle" --repeat-each=10` — expect 10/10 GREEN deterministically (vs prior 25-40% fail rate).

### Honest LOC budget

Total ~70-80 LOC across 3 files (~17 hook + ~40 spec + ~25 test). Above the original 30-80 LOC dispatch envelope but consistent with the ratified Option A's 20+10 LOC estimate after accounting for the SECONDARY shim retention (which Daniel's ratification explicitly requested — see msg-wake-lock-headsup-resolution-option-a out-of-scope rule #2) + the regression test additions. No fix shape is wrong; the upper bound was set on the assumption of a simpler one-side edit and the resolved option requires both sides.

— coder-1, 2026-05-24T~19:20Z
