/**
 * Cycle-7-fixes Lane 3 — unit tests for the trackCount-reconcile helper.
 * Pure mock; no emulator required. Covers no-op + drift + write-failure cases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/server-tracks", () => ({
    getTracksForSetlist: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { recomputeTrackCount } from "../setlist-track-count"
import { getTracksForSetlist } from "@/lib/server-tracks"

function mockDb(updateImpl: (patch: Record<string, unknown>) => Promise<unknown>) {
    return {
        collection: (name: string) => {
            void name
            return {
                doc: (id: string) => {
                    void id
                    return { update: updateImpl }
                },
            }
        },
    } as unknown as FirebaseFirestore.Firestore
}

describe("recomputeTrackCount", () => {
    beforeEach(() => {
        vi.mocked(getTracksForSetlist).mockReset()
    })

    it("no-op when declared === actual", async () => {
        vi.mocked(getTracksForSetlist).mockResolvedValue([
            { id: "t1" },
            { id: "t2" },
            { id: "t3" },
        ] as never)
        const updateSpy = vi.fn().mockResolvedValue(undefined)
        const db = mockDb(updateSpy)
        const result = await recomputeTrackCount(db, "s-1", { trackCount: 3 })
        expect(result).toEqual({
            setlistId: "s-1",
            declared: 3,
            actual: 3,
            drifted: false,
            written: false,
        })
        expect(updateSpy).not.toHaveBeenCalled()
    })

    it("C7I4-002 — repairs stale trackCount when subcollection is empty but parent claims 43", async () => {
        vi.mocked(getTracksForSetlist).mockResolvedValue([])
        const updateSpy = vi.fn().mockResolvedValue(undefined)
        const db = mockDb(updateSpy)
        const result = await recomputeTrackCount(db, "b12a5221", { trackCount: 43 })
        expect(result).toEqual({
            setlistId: "b12a5221",
            declared: 43,
            actual: 0,
            drifted: true,
            written: true,
        })
        expect(updateSpy).toHaveBeenCalledTimes(1)
        const patch = updateSpy.mock.calls[0]![0] as Record<string, unknown>
        expect(patch.trackCount).toBe(0)
        expect(patch.updatedAt).toBeInstanceOf(Date)
    })

    it("treats missing trackCount field as 0", async () => {
        vi.mocked(getTracksForSetlist).mockResolvedValue([{ id: "t1" }] as never)
        const updateSpy = vi.fn().mockResolvedValue(undefined)
        const db = mockDb(updateSpy)
        const result = await recomputeTrackCount(db, "s-2", {})
        expect(result.declared).toBe(0)
        expect(result.actual).toBe(1)
        expect(result.drifted).toBe(true)
        expect(result.written).toBe(true)
    })

    it("returns drifted+written:false when the write throws (logs warn, no propagation)", async () => {
        vi.mocked(getTracksForSetlist).mockResolvedValue([{ id: "t1" }] as never)
        const updateSpy = vi
            .fn()
            .mockRejectedValue(new Error("firestore permission_denied"))
        const db = mockDb(updateSpy)
        const result = await recomputeTrackCount(db, "s-3", { trackCount: 5 })
        expect(result.drifted).toBe(true)
        expect(result.written).toBe(false)
        expect(result.error).toMatch(/permission_denied/)
    })
})
