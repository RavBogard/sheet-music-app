"use client"

import { useCallback } from "react"
import { useMonitorStore } from "@/lib/monitor-store"
import { ceilingFor } from "@/lib/monitor/limits"
import { busFaderKey, sendLevelKey } from "@/lib/monitor/target-key"

/**
 * BET-4: everything a fader on `busIndex` needs about limits and saved levels —
 * the cap tick (from `config/monitor.ceilings`, defaults when absent), the
 * double-tap home level (the newest saved mix) and the latest clamped ack.
 */
export function useFaderLimits(busIndex: number | null) {
    const config = useMonitorStore((s) => s.config)
    const home = useMonitorStore((s) => (busIndex == null ? undefined : s.homeLevels?.[busIndex]))
    const clamps = useMonitorStore((s) => s.clamps)
    const raw = (config as { ceilings?: unknown } | null)?.ceilings

    const sendCap = useCallback(
        (channelIndex: number) => (busIndex == null ? null : ceilingFor(raw, "send", busIndex, channelIndex)),
        [raw, busIndex],
    )
    const masterCap = busIndex == null ? null : ceilingFor(raw, "master", busIndex)
    const sendHome = useCallback((channelIndex: number) => home?.sends?.[channelIndex] ?? null, [home])
    const masterHome = home?.master ?? null
    const sendClamp = useCallback(
        (channelIndex: number) => (busIndex == null ? null : clamps?.[sendLevelKey(channelIndex, busIndex)] ?? null),
        [clamps, busIndex],
    )
    const masterClamp = busIndex == null ? null : clamps?.[busFaderKey(busIndex)] ?? null

    return { sendCap, masterCap, sendHome, masterHome, sendClamp, masterClamp }
}
