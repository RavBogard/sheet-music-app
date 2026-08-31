"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useWakeLock } from "@/hooks/use-wake-lock"

/**
 * Shared keep-awake ownership for the /perform route tree (2026-08-31,
 * wake-lock-durability wave).
 *
 * WHY A PROVIDER AND NOT "just call the hook where you need it":
 * `/perform/setlist/[id]` needs the toggle in its header AND in the chart
 * overlay's toolbar; `/perform/[fileId]` needs it in the overlay; the status
 * banner needs to know whether the lock is actually held. Every independent
 * `useWakeLock()` call takes its OWN `WakeLockSentinel`, and the screen stays
 * awake while ANY sentinel lives — so with two instances, tapping the toggle
 * off releases one and the screen still refuses to sleep, and the banner
 * reports on a sentinel nobody else is using. One owner, one sentinel.
 *
 * The provider itself does NOT arm on mount. `/perform` (the public setlist
 * landing) lives under this same layout, and FU-c12-3 made "the anonymous
 * landing never touches the WakeLock API" a structural property. Arming is
 * requested by the chart surfaces via `<KeepAwakeAutoArm/>`.
 */
export type KeepAwakeApi = ReturnType<typeof useWakeLock> & {
    /**
     * Ask the provider to arm on mount (durable-intent restore + auto-arm).
     * Idempotent; called from `<KeepAwakeAutoArm/>`'s mount effect.
     */
    requestAutoArm: () => void
}

const KeepAwakeContext = createContext<KeepAwakeApi | null>(null)

/**
 * Belt-and-braces self-heal cadence.
 *
 * `HEARTBEAT_MS` — iPadOS drops a held sentinel for reasons the page never
 * hears about (low-power mode kicking in, a Control Centre pull, the
 * standalone-app suspend/resume cycle). A 30s poll costs nothing (it returns
 * immediately when the sentinel is healthy) and closes a gap that would
 * otherwise last until the next visibilitychange — which, mid-service with
 * the iPad untouched on a music stand, may never come.
 *
 * `POINTER_THROTTLE_MS` — every touch on the perform surface is also a chance
 * to re-take a dropped lock inside real user activation. Throttled so a
 * musician scrubbing through pages doesn't fire a request per tap; the
 * throttle only counts attempts that actually needed to happen.
 */
const HEARTBEAT_MS = 30_000
const POINTER_THROTTLE_MS = 30_000

export function KeepAwakeProvider({ children }: { children: React.ReactNode }) {
    const [armOnMount, setArmOnMount] = useState(false)
    const wakeLock = useWakeLock({ armOnMount })
    const { ensureLock } = wakeLock

    // Heartbeat: re-check that the sentinel is still live (and not
    // `released`), re-acquire if it is gone. `ensureLock` no-ops when the
    // intent is disarmed, when the document is hidden, or when the lock is
    // healthy — so this is a cheap timer, not a polling request loop.
    useEffect(() => {
        const id = setInterval(() => {
            void ensureLock()
        }, HEARTBEAT_MS)
        return () => clearInterval(id)
    }, [ensureLock])

    // Self-heal on touch. Capture phase so the chart surface's own gesture
    // handlers (live-director long-press calls stopPropagation) can't swallow
    // it, and passive by omission — we never preventDefault here.
    useEffect(() => {
        if (typeof document === "undefined") return
        const onPointerDown = () => {
            void ensureLock({ throttleMs: POINTER_THROTTLE_MS })
        }
        document.addEventListener("pointerdown", onPointerDown, true)
        return () => document.removeEventListener("pointerdown", onPointerDown, true)
    }, [ensureLock])

    // Stable identity: `<KeepAwakeAutoArm/>` depends on `requestAutoArm` in an
    // effect, so a fresh closure per render would re-run that effect on every
    // state change of the lock.
    const requestAutoArm = useCallback(() => setArmOnMount(true), [])
    const value = useMemo<KeepAwakeApi>(
        () => ({ ...wakeLock, requestAutoArm }),
        [wakeLock, requestAutoArm],
    )

    return <KeepAwakeContext.Provider value={value}>{children}</KeepAwakeContext.Provider>
}

/** The shared API, or `null` when rendered outside a `KeepAwakeProvider`. */
export function useKeepAwakeContext(): KeepAwakeApi | null {
    return useContext(KeepAwakeContext)
}

/**
 * Use the shared provider's lock when there is one, otherwise own a private
 * instance.
 *
 * Both hooks are always called (no conditional hooks); the private one is
 * created `enabled: false` whenever a provider exists, which makes it fully
 * inert — no requests, no listeners, no mount arm — so there is never a second
 * live sentinel in the tree. Existing standalone call sites
 * (`KeepAwakeControl` on the public landing, `useSetlistPerformance` under a
 * test harness with no provider) keep working unchanged.
 */
const NOOP_AUTO_ARM = () => {}

export function useKeepAwake(): KeepAwakeApi {
    const shared = useKeepAwakeContext()
    const own = useWakeLock({ enabled: shared === null })
    const fallback = useMemo<KeepAwakeApi>(
        () => ({ ...own, requestAutoArm: NOOP_AUTO_ARM }),
        [own],
    )
    return shared ?? fallback
}

/**
 * Mount this on a Perform CHART surface to ask the provider to arm.
 *
 * Renders nothing. Kills the per-service ritual: the musician no longer has
 * to find and tap "Keep screen on" before every service — opening a chart is
 * the intent. The toggle remains as a manual override that can disarm, and a
 * disarm is remembered (see `KEEP_AWAKE_INTENT_KEY`), so this never overrides
 * someone who deliberately turned it off.
 */
export function KeepAwakeAutoArm() {
    const ctx = useKeepAwakeContext()
    const requestAutoArm = ctx?.requestAutoArm
    useEffect(() => {
        requestAutoArm?.()
    }, [requestAutoArm])
    return null
}
