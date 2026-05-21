"use client"

import { useEffect, useState } from "react"
import { useMonitorStore } from "@/lib/monitor-store"
import {
    computeStateAgeSeconds,
    isStateStale,
} from "@/lib/monitor/state-freshness"

export interface MonitorStaleness {
    /** True once we have a snapshot timestamp AND it is older than the threshold. */
    stale: boolean
    /** Age of the live state in whole seconds, or null before the first snapshot. */
    ageSeconds: number | null
    /** False until the first state snapshot has been received. */
    hasState: boolean
}

/**
 * Live staleness of `monitor-live/state`, derived from the bridge's own
 * `updatedAt` (AUDIT-consumers C-6). Re-evaluates on a 2s tick so a frozen
 * desk crosses the threshold without needing a new snapshot to arrive
 * (idle-freeze never fires a fresh `onSnapshot`).
 *
 * Returns `stale: false` until the first snapshot arrives — the connection
 * indicator owns the "connecting" state, so the badge / per-fader cue must not
 * flash "stale" before any data exists.
 */
export function useMonitorStaleness(): MonitorStaleness {
    const stateUpdatedAt = useMonitorStore((s) => s.stateUpdatedAt)
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 2000)
        return () => clearInterval(id)
    }, [])

    const hasState = stateUpdatedAt != null
    const ageSeconds = hasState ? computeStateAgeSeconds(stateUpdatedAt, now) : null
    const stale = hasState && isStateStale(ageSeconds)

    return { stale, ageSeconds, hasState }
}
