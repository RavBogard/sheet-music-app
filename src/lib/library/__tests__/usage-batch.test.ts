import { describe, it, expect, vi } from "vitest"
import {
    chunkIds,
    fetchUsageBatches,
    USAGE_BATCH_SIZE,
    type UsageMap,
} from "../usage-batch"

const ids = (n: number, prefix = "chart") =>
    Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(4, "0")}`)

describe("chunkIds", () => {
    it("splits into fixed-size chunks with a trailing partial", () => {
        const chunks = chunkIds(ids(250), 100)
        expect(chunks.map(c => c.length)).toEqual([100, 100, 50])
    })

    it("covers every id exactly once", () => {
        const all = ids(762)
        const flat = chunkIds(all, 100).flat()
        expect(flat).toEqual(all)
    })

    it("returns no chunks for an empty list", () => {
        expect(chunkIds([], 100)).toEqual([])
    })
})

describe("fetchUsageBatches", () => {
    const summary = { lastUsedDate: "2026-01-31T00:00:00.000Z", totalUses: 3 }
    const echo = async (batch: string[]): Promise<UsageMap> =>
        Object.fromEntries(batch.map(id => [id, summary]))

    // THE regression this module exists for. The prior inline implementation
    // was `fileIds.slice(0, 100)` with no loop, so ids 100..761 were never
    // requested and never appeared in the map.
    it("requests EVERY id at 762 charts, not just the first 100", async () => {
        const all = ids(762)
        const seen: string[] = []
        const { map, failedIds } = await fetchUsageBatches(all, async batch => {
            expect(batch.length).toBeLessThanOrEqual(USAGE_BATCH_SIZE)
            seen.push(...batch)
            return echo(batch)
        })

        expect(seen.slice().sort()).toEqual(all.slice().sort())
        expect(Object.keys(map)).toHaveLength(762)
        // The alphabetically-last chart — the acceptance case — has real data.
        expect(map["chart-0761"]).toEqual(summary)
        expect(failedIds).toEqual([])
    })

    it("never exceeds the server's 100-id cap per request", async () => {
        const sizes: number[] = []
        await fetchUsageBatches(ids(762), async batch => {
            sizes.push(batch.length)
            return echo(batch)
        })
        expect(Math.max(...sizes)).toBeLessThanOrEqual(100)
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(762)
    })

    it("de-duplicates ids so a repeat does not waste a slot", async () => {
        const seen: string[] = []
        await fetchUsageBatches(["a", "b", "a", "b", "c"], async batch => {
            seen.push(...batch)
            return echo(batch)
        })
        expect(seen).toEqual(["a", "b", "c"])
    })

    it("reports failed ids instead of swallowing them", async () => {
        const all = ids(250)
        const { map, failedIds } = await fetchUsageBatches(
            all,
            async batch => {
                if (batch.includes("chart-0100")) throw new Error("500")
                return echo(batch)
            },
            { concurrency: 1 },
        )
        expect(failedIds).toHaveLength(100)
        expect(failedIds).toContain("chart-0100")
        // The successful batches still land — partial data is usable for
        // badges, it just must not be mistaken for complete data.
        expect(map["chart-0000"]).toEqual(summary)
        expect(map["chart-0100"]).toBeUndefined()
    })

    it("treats a non-object response body as a failed batch", async () => {
        const { map, failedIds } = await fetchUsageBatches(
            ids(3),
            async () => ("<html>oops</html>" as unknown as UsageMap),
        )
        expect(failedIds).toHaveLength(3)
        expect(map).toEqual({})
    })

    it("streams each batch through onBatch as it lands", async () => {
        const onBatch = vi.fn()
        await fetchUsageBatches(ids(250), echo, { onBatch, concurrency: 1 })
        expect(onBatch).toHaveBeenCalledTimes(3)
        expect(Object.keys(onBatch.mock.calls[0][0])).toHaveLength(100)
        expect(Object.keys(onBatch.mock.calls[2][0])).toHaveLength(50)
    })

    it("no-ops on an empty id list", async () => {
        const fetchBatch = vi.fn()
        const result = await fetchUsageBatches([], fetchBatch)
        expect(fetchBatch).not.toHaveBeenCalled()
        expect(result).toEqual({ map: {}, failedIds: [] })
    })

    it("runs batches concurrently up to the concurrency limit", async () => {
        let inFlight = 0
        let peak = 0
        await fetchUsageBatches(
            ids(800),
            async batch => {
                inFlight++
                peak = Math.max(peak, inFlight)
                await new Promise(r => setTimeout(r, 1))
                inFlight--
                return echo(batch)
            },
            { concurrency: 4 },
        )
        expect(peak).toBeGreaterThan(1)
        expect(peak).toBeLessThanOrEqual(4)
    })
})
