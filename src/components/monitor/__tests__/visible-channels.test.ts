import { describe, it, expect } from "vitest"
import { getVisibleChannels } from "@/lib/monitor-store"
import type { BusSend } from "@/types/monitor"

describe("getVisibleChannels", () => {
    it("returns union of defaults and starred, filtered to bus sends", () => {
        const busSends: BusSend[] = [
            { channelIndex: 1, level: 0.5, on: true },
            { channelIndex: 2, level: 0.5, on: true },
            { channelIndex: 3, level: 0.5, on: true },
            { channelIndex: 4, level: 0.5, on: true },
            { channelIndex: 5, level: 0.5, on: true },
        ]
        const result = getVisibleChannels([1, 2, 5], [3, 7], busSends)
        // 7 is not in busSends, so filtered out
        expect(result.sort()).toEqual([1, 2, 3, 5])
    })

    it("returns starred only when no defaults", () => {
        const busSends: BusSend[] = [
            { channelIndex: 1, level: 0.5, on: true },
            { channelIndex: 2, level: 0.5, on: true },
            { channelIndex: 3, level: 0.5, on: true },
        ]
        const result = getVisibleChannels([], [1, 2], busSends)
        expect(result.sort()).toEqual([1, 2])
    })

    it("returns defaults only when no starred", () => {
        const busSends: BusSend[] = [
            { channelIndex: 1, level: 0.5, on: true },
            { channelIndex: 2, level: 0.5, on: true },
        ]
        const result = getVisibleChannels([1, 2], [], busSends)
        expect(result.sort()).toEqual([1, 2])
    })

    it("returns empty when no bus sends", () => {
        const result = getVisibleChannels([1, 2], [3], [])
        expect(result).toEqual([])
    })

    it("deduplicates channels in both defaults and starred", () => {
        const busSends: BusSend[] = [
            { channelIndex: 1, level: 0.5, on: true },
            { channelIndex: 2, level: 0.5, on: true },
        ]
        // Channel 1 is in both defaults and starred
        const result = getVisibleChannels([1, 2], [1], busSends)
        expect(result.sort()).toEqual([1, 2])
        // No duplicates
        expect(result.length).toBe(2)
    })

    it("returns empty when defaults and starred have no overlap with bus sends", () => {
        const busSends: BusSend[] = [
            { channelIndex: 10, level: 0.5, on: true },
        ]
        const result = getVisibleChannels([1, 2], [3], busSends)
        expect(result).toEqual([])
    })
})
