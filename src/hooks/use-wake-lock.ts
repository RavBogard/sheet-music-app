import { useState, useEffect, useCallback, useRef } from "react"
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
 * **Gesture contract — load-bearing:** iOS Safari rejects
 * `navigator.wakeLock.request('screen')` with `NotAllowedError` outside a
 * transient user-activation context. Callers MUST invoke `requestWakeLock`
 * from inside a user-gesture handler (`onClick`, `onTouchEnd`, etc.). Mount-
 * time `useEffect` calls silently fail on iPad — the lock never engages and
 * the screen still sleeps after the device idle timer. This was Daniel's
 * Yizkor-service regression 2026-05-23 (band iPad screen-timed-out during
 * the service); fix shipped in `ipad-wake-lock-fix` by moving the request
 * onto an explicit header toggle (`KeepAwakeToggle`).
 *
 * **Visibilitychange re-acquisition:** iOS releases held WakeLocks whenever
 * the tab is hidden (lock screen, app switch). The hook stores the caller's
 * intent in `shouldLockRef` and re-fires `acquireLock` on
 * `visibilityState === 'visible'`. This re-acquisition does NOT need a fresh
 * gesture because the lock was already user-activated once during the
 * session — iOS Safari treats the re-request as a continuation.
 *
 * `isSupported` is computed at mount from `'wakeLock' in navigator`; older
 * iPads / browsers without the API surface a disabled toggle with a tooltip
 * rather than a silent no-op.
 */
export function useWakeLock() {
    const [isSupported, setIsSupported] = useState(false)
    const [isLocked, setIsLocked] = useState(false)
    const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null)
    // Track whether we *should* be locked (survives sentinel releases on
    // backgrounding so visibilitychange can re-acquire automatically).
    const shouldLockRef = useRef(false)

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
        if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
            logger.warn("Wake Lock API not supported")
            return
        }
        try {
            const lock = await navigator.wakeLock.request("screen")
            setWakeLock(lock)
            setIsLocked(true)
            exposeSentinelForProbe(lock)
            logger.info("Wake Lock active")

            lock.addEventListener("release", () => {
                logger.info("Wake Lock released")
                setIsLocked(false)
                setWakeLock(null)
                exposeSentinelForProbe(null)
            })
        } catch (err: unknown) {
            const name = (err as { name?: string } | null)?.name
            // NotAllowedError surfaces when the call wasn't user-activated
            // (mount effect, programmatic re-request after long background).
            // Surface it as a non-fatal debug — the toggle stays visibly off
            // and the user can re-tap to retry.
            if (name === "NotAllowedError") {
                logger.debug("Wake lock request denied (no user gesture or background tab)")
            } else {
                logger.error("Failed to acquire Wake Lock:", err)
            }
        }
    }, [])

    const requestWakeLock = useCallback(async () => {
        shouldLockRef.current = true
        await acquireLock()
    }, [acquireLock])

    const releaseWakeLock = useCallback(async () => {
        shouldLockRef.current = false
        if (wakeLock) {
            try {
                await wakeLock.release()
                setWakeLock(null)
                setIsLocked(false)
                exposeSentinelForProbe(null)
            } catch (err) {
                logger.error("Failed to release Wake Lock:", err)
            }
        }
    }, [wakeLock])

    // Cleanup on unmount. NOTE: this effect's cleanup also fires on every
    // wakeLock-change re-render (React effect-cleanup semantics), so we
    // canNOT clear the probe-harness slot here — the slot is written in
    // `acquireLock` AFTER `setWakeLock(lock)`, which means the
    // wakeLock-change cleanup would race and wipe a freshly-exposed
    // sentinel. The probe-slot has its own mount-scoped cleanup below.
    useEffect(() => {
        return () => {
            shouldLockRef.current = false
            if (wakeLock) {
                wakeLock.release().catch(e => logger.error("Wake lock release:", e))
            }
        }
    }, [wakeLock])

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

    // Auto re-acquire on visibility change. Re-fires only if the user
    // previously tapped to enable the lock (shouldLockRef), so a tab that was
    // never armed never gets a surprise lock attempt.
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === "visible" && shouldLockRef.current) {
                await acquireLock()
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityChange)
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
    }, [acquireLock])

    return { isSupported, isLocked, requestWakeLock, releaseWakeLock }
}
