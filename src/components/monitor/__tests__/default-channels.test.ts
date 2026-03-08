import { describe, it, expect, beforeEach } from "vitest"
import { useMonitorStore } from "@/lib/monitor-store"

describe("default channels (store state)", () => {
    beforeEach(() => {
        useMonitorStore.getState().reset()
    })

    it("has empty defaultChannels by default", () => {
        const state = useMonitorStore.getState()
        expect(state.defaultChannels).toEqual([])
    })

    it("setDefaultChannels sets the default channels list", () => {
        useMonitorStore.getState().setDefaultChannels([1, 2, 5, 6, 15, 16])
        expect(useMonitorStore.getState().defaultChannels).toEqual([1, 2, 5, 6, 15, 16])
    })

    it("setDefaultChannels replaces the entire list", () => {
        useMonitorStore.getState().setDefaultChannels([1, 2])
        useMonitorStore.getState().setDefaultChannels([5, 6, 7])
        expect(useMonitorStore.getState().defaultChannels).toEqual([5, 6, 7])
    })

    it("setDefaultChannels can set empty list", () => {
        useMonitorStore.getState().setDefaultChannels([1, 2, 3])
        useMonitorStore.getState().setDefaultChannels([])
        expect(useMonitorStore.getState().defaultChannels).toEqual([])
    })

    it("defaultChannels survives config updates via setConfig", () => {
        useMonitorStore.getState().setDefaultChannels([1, 2, 5])
        // setConfig should not clear defaultChannels
        useMonitorStore.getState().setConfig({
            bridgeUrl: "wss://test",
            x32Address: "192.168.1.100",
            x32Port: 10023,
            monitorBuses: [1, 2],
            busAssignments: {},
            defaultChannels: [3, 4],
        })
        // After setConfig, defaultChannels should reflect config value
        expect(useMonitorStore.getState().defaultChannels).toEqual([3, 4])
    })
})
