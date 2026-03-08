import { describe, it, expect, beforeEach } from "vitest"
import { useMonitorStore } from "@/lib/monitor-store"

describe("channel starring (store state)", () => {
    beforeEach(() => {
        // Reset the store to initial state
        useMonitorStore.getState().reset()
    })

    it("has empty starredChannels by default", () => {
        const state = useMonitorStore.getState()
        expect(state.starredChannels).toEqual([])
    })

    it("setStarredChannels sets the starred channels list", () => {
        useMonitorStore.getState().setStarredChannels([1, 3, 5])
        expect(useMonitorStore.getState().starredChannels).toEqual([1, 3, 5])
    })

    it("setStarredChannels replaces the entire list", () => {
        useMonitorStore.getState().setStarredChannels([1, 2])
        useMonitorStore.getState().setStarredChannels([3, 4, 5])
        expect(useMonitorStore.getState().starredChannels).toEqual([3, 4, 5])
    })

    it("setStarredChannels can set empty list", () => {
        useMonitorStore.getState().setStarredChannels([1, 2, 3])
        useMonitorStore.getState().setStarredChannels([])
        expect(useMonitorStore.getState().starredChannels).toEqual([])
    })
})
