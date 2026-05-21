import { describe, it, expect, beforeEach } from "vitest"
import { useMonitorStore } from "@/lib/monitor-store"
import type { MixerSnapshot, MonitorConfig, BusAssignment } from "@/types/monitor"

function cfg(busAssignments: Record<string, BusAssignment[] | null>): MonitorConfig {
    return {
        bridgeUrl: "",
        x32Address: "",
        x32Port: 0,
        monitorBuses: [],
        busAssignments,
    }
}

function snapshot(buses: MixerSnapshot["buses"], embeddedConfig: MonitorConfig): MixerSnapshot {
    return { channels: [], buses, matrices: [], config: embeddedConfig }
}

const BUS = (index: number): MixerSnapshot["buses"][number] => ({
    index,
    name: `Bus ${index}`,
    fader: 0.5,
    sends: [],
})

describe("monitor-store P1-C hardening", () => {
    beforeEach(() => {
        useMonitorStore.getState().reset()
    })

    it("C-7: derives myBusIndex from config/monitor, IGNORING the embedded snapshot.config", () => {
        // Authoritative config/monitor assigns u1 → bus 3
        useMonitorStore.getState().setConfig(cfg({ "3": [{ userId: "u1", userName: "U1" }] }))
        // No userId yet → derivation defers
        expect(useMonitorStore.getState().myBusIndex).toBeNull()

        // The bridge-embedded snapshot.config DISAGREES (says bus 5) — must be ignored
        const snap = snapshot([BUS(3), BUS(5)], cfg({ "5": [{ userId: "u1", userName: "U1" }] }))
        useMonitorStore.getState().setSnapshot(snap, "u1", 1234)

        const s = useMonitorStore.getState()
        expect(s.myBusIndex).toBe(3) // config/monitor wins, not snapshot.config's 5
        // store.config stays the config/monitor copy — snapshot.config never clobbers it
        expect(Object.keys(s.config?.busAssignments ?? {})).toEqual(["3"])
        expect(s.stateUpdatedAt).toBe(1234)
    })

    it("C-7: re-derives myBusIndex when config/monitor changes after a snapshot", () => {
        useMonitorStore.getState().setConfig(cfg({ "3": [{ userId: "u1", userName: "U1" }] }))
        useMonitorStore.getState().setSnapshot(snapshot([BUS(3)], cfg({})), "u1", 1)
        expect(useMonitorStore.getState().myBusIndex).toBe(3)

        // Reassign u1 → bus 5 via config/monitor
        useMonitorStore.getState().setConfig(cfg({ "5": [{ userId: "u1", userName: "U1" }] }))
        expect(useMonitorStore.getState().myBusIndex).toBe(5)
    })

    it("C-6: setSnapshot tracks state.updatedAt", () => {
        useMonitorStore.getState().setConfig(cfg({}))
        useMonitorStore.getState().setSnapshot(snapshot([BUS(3)], cfg({})), "u1", 555)
        expect(useMonitorStore.getState().stateUpdatedAt).toBe(555)
    })

    it("empty/malformed snapshot freezes last-good buses but still advances stateUpdatedAt", () => {
        useMonitorStore.getState().setConfig(cfg({}))
        useMonitorStore.getState().setSnapshot(snapshot([BUS(3)], cfg({})), "u1", 100)
        expect(useMonitorStore.getState().buses).toHaveLength(1)

        // Empty buses while we already have data → frozen, but health/freshness advance
        useMonitorStore.getState().setSnapshot(snapshot([], cfg({})), "u1", 200)
        const s = useMonitorStore.getState()
        expect(s.buses).toHaveLength(1) // last-known-good frozen
        expect(s.stateUpdatedAt).toBe(200) // freshness still advanced (honest "we got a write")
    })

    it("reset clears stateUpdatedAt", () => {
        useMonitorStore.getState().setSnapshot(snapshot([BUS(3)], cfg({})), "u1", 999)
        expect(useMonitorStore.getState().stateUpdatedAt).toBe(999)
        useMonitorStore.getState().reset()
        expect(useMonitorStore.getState().stateUpdatedAt).toBeNull()
    })
})
