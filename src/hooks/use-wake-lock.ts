import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { logger } from "@/lib/logger"

/**
 * Probe-harness sentinel exposure flag — when
 * `NEXT_PUBLIC_PROBE_HARNESS_AUTH==='1'` (the same flag already gating the
 * Web-SDK auth bridge in `src/lib/firebase.ts:252`), `acquireLock` writes
 * the live `WakeLockSentinel` into `window.__c7_wakeLockSentinel__` so
 * Playwright iPad-WebKit specs can read sentinel state directly instead
 * of relying on a JS shim that this WebKit/Playwright build silently
 * bypasses (~25-40% fail rate — see
 * `.paul/research/ipad-wake-lock-toggle-fix/DIAGNOSIS.md`). The window
 * slot is cleared on release / re-acquire / unmount so the spec sees a
 * single live sentinel per session. Production builds (without the env
 * var) never run this branch. See `[[feedback_probe_harness_prod_flag]]`.
 */
const PROBE_HARNESS_ENABLED =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_PROBE_HARNESS_AUTH === "1"

function exposeSentinelForProbe(sentinel: WakeLockSentinel | null): void {
    if (!PROBE_HARNESS_ENABLED || typeof window === "undefined") return
    ;(window as unknown as { __c7_wakeLockSentinel__?: WakeLockSentinel | null }).__c7_wakeLockSentinel__ = sentinel
}

/**
 * Screen Wake Lock hook (iOS Safari 16.4+, modern Chromium, recent Firefox).
 *
 * **Gesture contract — CORRECTED 2026-08-31 (wake-lock-durability audit).**
 * The prior docstring here claimed the W3C Screen Wake Lock spec requires
 * transient user activation, and that a mount-time `request('screen')` is
 * *guaranteed* to reject on iPad. That was a misdiagnosis, and it cost this
 * app the "tap the toggle every single service" ritual for three months.
 *
 * What the spec actually says: `navigator.wakeLock.request('screen')` requires
 * only that the document be **visible** and **active**; user activation is NOT
 * in the algorithm. A mount-time call from a visible foregrounded document is
 * a legitimate request and normally succeeds.
 *
 * What actually broke the Yizkor service 2026-05-23: the iPad was running a
 * Home-Screen (standalone / `display-mode: standalone`) install on iPadOS
 * < 18.4, where WebKit bug **254545** left the screen wake lock non-functional
 * in standalone web apps — the sentinel resolved, the OS idle timer fired
 * anyway. Adding a header toggle appeared to fix it only because the band
 * also started tapping the screen constantly. See `KeepAwakeBanner`, which
 * now tells the truth about that OS on that install type (Auto-Lock: Never
 * is the only real remedy there).
 *
 * So: **arming on mount is correct and is now the default on Perform
 * surfaces** (`armOnMount`). A request CAN still be rejected — a hidden
 * document rejects with `NotAllowedError`, and some engines are stricter than
 * the spec — so every mount-time arm that fails to produce a live sentinel
 * registers a ONE-SHOT `pointerdown` retry, which lands the request inside a
 * real gesture the first time anyone touches the iPad. Belt and braces, not a
 * ritual.
 *
 * **Durable intent (`crc.keepAwakeIntent`):** the arm/disarm decision is the
 * musician's, and it now survives a reload, a tab eviction, and iPadOS killing
 * a backgrounded Home-Screen app mid-service. Stored as `'1'` (armed) / `'0'`
 * (explicitly disarmed by tapping the toggle off). Absent = never decided, and
 * `armOnMount` arms. `'0'` is honoured — an explicit disarm is not undone by
 * the next route mount. All storage access is try/catch'd: iOS private mode
 * throws on `localStorage` access, and a thrown quota error must never take
 * the wake lock down with it.
 *
 * **Visibilitychange re-acquisition:** iOS releases held WakeLocks whenever
 * the tab is hidden (lock screen, app switch). The hook stores the caller's
 * intent in `shouldLockRef` and re-fires `acquireLock` on
 * `visibilityState === 'visible'` when the sentinel is gone or released.
 *
 * **Why the live sentinel lives in a ref (the 2026-08-31 killer bug):** the
 * unmount-cleanup effect used to carry `[wakeLock]` deps. React re-runs an
 * effect's cleanup on every dep change, so the *first successful acquire*
 * (which set the `wakeLock` state) immediately ran that cleanup and executed
 * `shouldLockRef.current = false` — permanently disarming the visibilitychange
 * re-acquire path the instant it became useful. Every "the lock was on and
 * the screen still slept after an app-switch" report traces here. The sentinel
 * now lives in `sentinelRef` and the release-on-unmount effect has `[]` deps,
 * so `shouldLockRef` is only cleared at a TRUE unmount.
 *
 * `isSupported` is computed at mount from `navigator.wakeLock != null`; older
 * iPads / browsers without the API surface a disabled toggle with a tooltip
 * rather than a silent no-op.
 */
/**
 * Reactive failure verdict surfaced from `acquireLock` so the toggle UI can
 * tell the band WHY a tap didn't engage the lock (M3-001, 2026-05-28). The
 * prior swallow-to-debug path produced the Yizkor-class silent failure:
 * `KeepAwakeToggle` flipped its visual state optimistically while the
 * underlying `wakeLock.request('screen')` rejected, leaving Daniel staring
 * at a "Screen on" pill that wasn't actually holding a lock.
 *
 * - `'hidden'` — request rejected because the document is currently hidden
 *   (`document.visibilityState === 'hidden'`). The musician likely tapped
 *   the toggle from the home-screen icon or with the chart backgrounded;
 *   the fix is "tap the chart to re-focus and retry".
 * - `'denied'` — `NotAllowedError` from a non-hidden context: the browser,
 *   permissions policy, or system refused the request. Older Safari builds
 *   also required transient activation. The recovery is a deliberate tap.
 * - `null` — no error or last attempt succeeded. UI clears the alert.
 */
export type WakeLockError = 'hidden' | 'denied' | null

/**
 * localStorage key for the durable keep-awake intent (2026-08-31).
 *
 * `'1'` = armed, `'0'` = the musician explicitly tapped the toggle OFF.
 * Absent = never decided → `armOnMount` surfaces arm. Exported so tests (and
 * any future "reset my device" affordance) can reference the one true key
 * instead of re-typing the string.
 */
export const KEEP_AWAKE_INTENT_KEY = 'crc.keepAwakeIntent'

/**
 * Read the stored intent. Returns `null` when nothing is stored OR when
 * storage is unreachable — iOS private mode throws on `localStorage` access,
 * and Safari can throw `SecurityError` inside cross-origin iframes. Never let
 * a storage failure become a wake-lock failure.
 */
function readStoredIntent(): '1' | '0' | null {
    try {
        if (typeof window === 'undefined') return null
        const raw = window.localStorage.getItem(KEEP_AWAKE_INTENT_KEY)
        return raw === '1' || raw === '0' ? raw : null
    } catch {
        return null
    }
}

function writeStoredIntent(armed: boolean): void {
    try {
        if (typeof window === 'undefined') return
        window.localStorage.setItem(KEEP_AWAKE_INTENT_KEY, armed ? '1' : '0')
    } catch {
        /* iOS private mode / quota — intent is a convenience, not a contract */
    }
}

export interface UseWakeLockOptions {
    /**
     * Arm on mount: restore a stored `'1'` intent, or (when nothing is stored)
     * arm for the first time — then attempt `acquireLock()` immediately and,
     * if that produces no live sentinel, register the one-shot `pointerdown`
     * retry. A stored `'0'` (explicit disarm) is honoured and nothing happens.
     *
     * Perform surfaces pass `true` (via `<KeepAwakeAutoArm/>`). The public
     * `/perform` landing does NOT — FU-c12-3 made "the anonymous landing never
     * touches the WakeLock API" a structural property, and that still holds.
     */
    armOnMount?: boolean
    /**
     * `false` makes the whole hook inert: no requests, no mount arm, no
     * visibilitychange re-acquire. Used by `useKeepAwake()` when a
     * `KeepAwakeProvider` above it already owns the one real sentinel — two
     * live sentinels in one tree means "disarm" releases only one of them and
     * the screen stays on anyway.
     */
    enabled?: boolean
}

export function useWakeLock(options: UseWakeLockOptions = {}) {
    const { armOnMount = false, enabled = true } = options
    const [isSupported, setIsSupported] = useState(false)
    const [isLocked, setIsLocked] = useState(false)
    // Whether the musician's keep-awake INTENT is armed. Distinct from
    // `isLocked` (whether a sentinel is actually held right now) — the gap
    // between the two is exactly what `KeepAwakeBanner` surfaces.
    const [isArmed, setIsArmed] = useState(false)
    // M3-001 reactive failure verdict — see WakeLockError docstring above.
    const [lastError, setLastError] = useState<WakeLockError>(null)
    /**
     * The live sentinel. A REF, not state — see the "killer bug" paragraph in
     * the hook docstring: holding it in state put `[wakeLock]` on the cleanup
     * effect, whose cleanup then disarmed `shouldLockRef` on the first
     * successful acquire.
     */
    const sentinelRef = useRef<WakeLockSentinel | null>(null)
    // One acquire may be triggered by mount, foreground return, the heartbeat,
    // and a pointer in the same turn. Browsers return a distinct sentinel for
    // each request; losing track of even one means the UI can say "off" while
    // that orphan still keeps the screen awake. Coalesce every caller onto the
    // one in-flight request.
    const acquirePromiseRef = useRef<Promise<void> | null>(null)
    // Track whether we *should* be locked (survives sentinel releases on
    // backgrounding so visibilitychange can re-acquire automatically).
    const shouldLockRef = useRef(false)
    // Pending one-shot `pointerdown` retry handler, if any.
    const gestureRetryRef = useRef<(() => void) | null>(null)
    // Throttle clock for `ensureLock({ throttleMs })`.
    const lastEnsureAtRef = useRef(0)
    // `enabled` read from inside long-lived listeners without re-subscribing.
    // Synced in an effect, not during render (react-hooks/refs) — and declared
    // FIRST so it commits before the mount-arm effect below reads it.
    const enabledRef = useRef(enabled)
    useEffect(() => {
        enabledRef.current = enabled
    }, [enabled])

    // Capability detection: avoid `typeof navigator` SSR pitfalls — the hook
    // only runs in client components, but we read from `navigator` inside an
    // effect anyway so hydration sees the same `false` value as SSR. Value-
    // based check (not `in`) so a polyfill / test stub that defines the slot
    // as `undefined` still reads as unsupported.
    useEffect(() => {
        const nav =
            typeof navigator !== "undefined"
                ? (navigator as Navigator & { wakeLock?: unknown })
                : undefined
        setIsSupported(nav?.wakeLock != null)
    }, [])

    const acquireLock = useCallback(async () => {
        // Inert instance (a KeepAwakeProvider above us owns the sentinel).
        if (!enabledRef.current) return
        if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
            logger.warn("Wake Lock API not supported")
            return
        }
        const current = sentinelRef.current
        if (current && !current.released) return

        const pending = acquirePromiseRef.current
        if (pending) {
            await pending
            return
        }

        const attempt = (async () => {
            // M3-001: a hidden document rejects `wakeLock.request('screen')`
            // synchronously with NotAllowedError. Classify BEFORE the try so the
            // verdict isn't ambiguous with the "no gesture" path below.
            const hiddenAtRequest =
                typeof document !== "undefined" &&
                document.visibilityState === "hidden"
            try {
                const lock = await navigator.wakeLock.request("screen")

                // The musician can turn keep-awake off (or leave Perform mode)
                // while the browser request is pending. A late result must be
                // released immediately, never installed as an invisible lock.
                if (!shouldLockRef.current || !enabledRef.current) {
                    await lock.release()
                    return
                }

                // Defensive: if an engine or an older render produced another
                // live sentinel despite the single-flight gate, keep the one we
                // already own and release the duplicate handle.
                const live = sentinelRef.current
                if (live && !live.released) {
                    await lock.release()
                    return
                }

                sentinelRef.current = lock
                setIsLocked(true)
                setLastError(null)
                exposeSentinelForProbe(lock)
                logger.info("Wake Lock active")

                lock.addEventListener("release", () => {
                    logger.info("Wake Lock released")
                    // A delayed release event from an older sentinel must not
                    // make a newer, live lock look inactive (or clear its probe).
                    if (sentinelRef.current !== lock) return
                    sentinelRef.current = null
                    setIsLocked(false)
                    exposeSentinelForProbe(null)
                })
            } catch (err: unknown) {
                // A refusal that arrives after explicit disarm/unmount is no
                // longer actionable and must not resurrect a failure banner.
                if (!shouldLockRef.current || !enabledRef.current) return
                const name = (err as { name?: string } | null)?.name
                // NotAllowedError surfaces when the browser/system refuses the
                // request OR the document is currently hidden. Surface a reactive verdict
                // so the toggle can show the band WHY the lock didn't engage
                // (M3-001 — replaces the prior silent debug-log path).
                if (name === "NotAllowedError") {
                    const verdict: WakeLockError = hiddenAtRequest ? "hidden" : "denied"
                    setLastError(verdict)
                    logger.debug(
                        `Wake lock request denied (${verdict === "hidden" ? "document hidden" : "browser or system refusal"})`,
                    )
                } else {
                    setLastError("denied")
                    logger.error("Failed to acquire Wake Lock:", err)
                }
            }
        })()

        acquirePromiseRef.current = attempt
        try {
            await attempt
        } finally {
            if (acquirePromiseRef.current === attempt) {
                acquirePromiseRef.current = null
            }
        }
    }, [])

    /**
     * Cancel any pending one-shot `pointerdown` retry. Idempotent.
     * Stable (`[]` deps) so the unmount effect below can depend on it and
     * still run exactly once per mount.
     */
    const clearGestureRetry = useCallback(() => {
        const handler = gestureRetryRef.current
        gestureRetryRef.current = null
        if (handler && typeof document !== "undefined") {
            document.removeEventListener("pointerdown", handler, true)
        }
    }, [])

    /**
     * Register a ONE-SHOT `pointerdown` retry (capture phase, `{once:true}`).
     *
     * The mount-time arm is a legitimate spec-conformant request, but it can
     * still be refused — a hidden document rejects outright, and engines vary.
     * Rather than reinstating the "tap the toggle every service" ritual, we
     * piggyback on the very next touch anywhere in the document: that touch
     * carries transient user activation, so the retry lands inside a gesture
     * without the musician being asked to do anything at all.
     *
     * Capture phase so a `stopPropagation()` deep in the chart surface (the
     * live-director long-press gesture does this) can't eat it. `{once:true}`
     * so we never sit on a permanent document-level listener.
     */
    const scheduleGestureRetry = useCallback(() => {
        if (typeof document === "undefined") return
        if (gestureRetryRef.current) return // one pending retry is enough
        const handler = () => {
            gestureRetryRef.current = null
            if (!shouldLockRef.current || !enabledRef.current) return
            void acquireLock()
        }
        gestureRetryRef.current = handler
        document.addEventListener("pointerdown", handler, { once: true, capture: true })
    }, [acquireLock])

    /**
     * Arm the intent and attempt the lock. This is `requestWakeLock` — kept
     * under the old name because every existing call site (KeepAwakeToggle,
     * PerformanceToolbar, useSetlistPerformance) threads it through by that
     * name — but it now also PERSISTS the intent and arranges the gesture
     * retry, so a musician's single tap survives a reload.
     */
    const requestWakeLock = useCallback(async () => {
        shouldLockRef.current = true
        setIsArmed(true)
        writeStoredIntent(true)
        await acquireLock()
        // No live sentinel → the request was refused (hidden document, or a
        // stricter-than-spec engine). Catch the next touch instead of asking.
        if (shouldLockRef.current && !sentinelRef.current) scheduleGestureRetry()
    }, [acquireLock, scheduleGestureRetry])

    const releaseWakeLock = useCallback(async () => {
        shouldLockRef.current = false
        setIsArmed(false)
        // Disarm is an explicit decision and is recorded as one ('0'), so the
        // next `armOnMount` surface does NOT quietly re-arm behind the
        // musician's back. "Clearing" the key would do exactly that.
        writeStoredIntent(false)
        clearGestureRetry()
        // User-initiated release clears any prior failure verdict so the
        // alert pill doesn't linger on the next acquire attempt (M3-001).
        setLastError(null)
        const sentinel = sentinelRef.current
        if (sentinel) {
            try {
                await sentinel.release()
                sentinelRef.current = null
                setIsLocked(false)
                exposeSentinelForProbe(null)
            } catch (err) {
                logger.error("Failed to release Wake Lock:", err)
            }
        }
    }, [clearGestureRetry])

    /**
     * Self-healing re-acquire: if intent is armed but no live sentinel is
     * held, take one. Cheap no-op when the lock is fine, so it is safe to
     * call from a pointerdown handler and from a heartbeat.
     *
     * `throttleMs` bounds only REAL attempts — an already-held lock returns
     * before the throttle clock is touched, so a burst of taps during a
     * genuinely-dropped lock still gets one prompt retry rather than being
     * starved by an earlier successful check.
     */
    const ensureLock = useCallback(
        async (opts?: { throttleMs?: number }) => {
            if (!enabledRef.current) return
            if (!shouldLockRef.current) return
            const sentinel = sentinelRef.current
            if (sentinel && !sentinel.released) return
            // A hidden document rejects and would only manufacture a spurious
            // 'hidden' verdict; visibilitychange re-acquires on the way back.
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return
            const throttleMs = opts?.throttleMs ?? 0
            const now = Date.now()
            if (throttleMs > 0 && now - lastEnsureAtRef.current < throttleMs) return
            lastEnsureAtRef.current = now
            await acquireLock()
        },
        [acquireLock],
    )

    /**
     * Release on TRUE unmount only — `[]` deps (2026-08-31 fix).
     *
     * This effect used to carry `[wakeLock]`. React runs an effect's cleanup
     * on every dep change, so the first successful acquire (which set the
     * `wakeLock` state) immediately ran this cleanup and executed
     * `shouldLockRef.current = false`. From that moment the visibilitychange
     * re-acquire below could never fire again: the lock was armed, the
     * sentinel was live, and the ONE flag that says "re-take this after an
     * app-switch" had been silently cleared by the act of succeeding. Screen
     * slept on the next lock-screen / app-switch, every time, and the toggle
     * still read "Screen on".
     *
     * The sentinel now lives in `sentinelRef`, so this effect needs no deps
     * and runs its cleanup exactly once, at unmount, which is the only moment
     * clearing `shouldLockRef` is correct.
     */
    useEffect(() => {
        return () => {
            shouldLockRef.current = false
            clearGestureRetry()
            const sentinel = sentinelRef.current
            sentinelRef.current = null
            if (sentinel) {
                sentinel.release().catch(e => logger.error("Wake lock release:", e))
            }
        }
    }, [clearGestureRetry])

    /**
     * Durable-intent restore + auto-arm on mount (B + C, 2026-08-31).
     *
     * Runs only for surfaces that opt in via `armOnMount` (the Perform chart
     * surfaces, through `<KeepAwakeAutoArm/>`). A stored `'0'` — the musician
     * deliberately tapped the toggle off — is honoured and nothing happens.
     * Anything else (stored `'1'`, or no decision recorded yet) arms.
     */
    useEffect(() => {
        if (!enabled || !armOnMount) return
        if (readStoredIntent() === '0') return

        let cancelled = false
        shouldLockRef.current = true
        setIsArmed(true)
        writeStoredIntent(true)
        void (async () => {
            await acquireLock()
            if (cancelled) return
            // Refused (hidden at mount, or a stricter engine) — take the next
            // touch instead of demanding a deliberate toggle tap.
            if (!sentinelRef.current) scheduleGestureRetry()
        })()

        return () => {
            cancelled = true
        }
    }, [enabled, armOnMount, acquireLock, scheduleGestureRetry])

    // Probe-harness slot cleanup — scoped to actual unmount only (empty
    // deps), so wakeLock-state-change re-renders do NOT clobber the slot.
    // The `acquireLock` / `release-event-listener` / `releaseWakeLock`
    // paths already keep the slot in sync during the hook's lifetime;
    // this final clear covers a component that unmounts while holding a
    // lock (the held sentinel becomes inaccessible to the page anyway).
    useEffect(() => {
        return () => {
            exposeSentinelForProbe(null)
        }
    }, [])

    // Auto re-acquire on visibility change. Re-fires only if the intent is
    // armed (shouldLockRef), so a tab that was never armed never gets a
    // surprise lock attempt. This is THE path bug A disarmed — see the
    // unmount-effect comment above and the regression test in
    // `use-wake-lock.test.ts` ("re-acquires after visibilitychange").
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (!enabledRef.current) return
            if (document.visibilityState === "visible" && shouldLockRef.current) {
                // Don't stack a second sentinel on a lock that survived.
                const sentinel = sentinelRef.current
                if (sentinel && !sentinel.released) return
                await acquireLock()
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityChange)
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
    }, [acquireLock])

    // M3-001: explicit dismiss helper so the toggle can clear its inline
    // alert pill on the next user interaction (e.g. tap-to-retry) without
    // racing the request flow's own setLastError.
    const dismissWakeLockError = useCallback(() => {
        setLastError(null)
    }, [])

    // Memoised so `KeepAwakeProvider` can hand this straight to a context
    // value without re-rendering every Perform consumer on each parent render.
    return useMemo(
        () => ({
            isSupported,
            isLocked,
            /** Intent armed — NOT the same as `isLocked`. The gap is the bug. */
            isArmed,
            lastError,
            requestWakeLock,
            releaseWakeLock,
            /** Self-healing re-acquire; no-op when the lock is healthy. */
            ensureLock,
            dismissWakeLockError,
        }),
        [
            isSupported,
            isLocked,
            isArmed,
            lastError,
            requestWakeLock,
            releaseWakeLock,
            ensureLock,
            dismissWakeLockError,
        ],
    )
}
