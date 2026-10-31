// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { fetchChartVersions } from "../chart-versions-server"

type Row = Record<string, unknown> | undefined

function fakeDb(rows: Record<string, Row>, opts: { fail?: boolean } = {}) {
    const getAll = vi.fn(async (...refs: Array<{ id: string }>) => {
        if (opts.fail) throw new Error("unavailable")
        return refs.map((r) => ({ exists: rows[r.id] !== undefined, data: () => rows[r.id] }))
    })
    const db = {
        collection: (name: string) => {
            expect(name).toBe("library_index")
            return { doc: (id: string) => ({ id }) }
        },
        getAll,
    }
    return { db: db as unknown as FirebaseFirestore.Firestore, getAll }
}

describe("fetchChartVersions", () => {
    it("returns the version of each bonded chart in the setlist's tenant", async () => {
        const { db } = fakeDb({
            a: { orgId: "crc", contentHash: { alg: "sha256", value: "aaa" } },
            b: { orgId: "crc", updatedAt: 1234 },
            c: { orgId: "crc" },
        })
        const v = await fetchChartVersions(db, ["a", "b", "c", "missing", "flow-x", "a"], "crc")
        expect(v).toEqual({ a: "h:aaa", b: "u:1234" })
    })

    it("never reads another tenant's row into the map", async () => {
        const { db } = fakeDb({
            crcChart: { orgId: "crc", contentHash: "c1" },
            blChart: { orgId: "brotherslazaroff", contentHash: "b1" },
            legacy: { contentHash: "l1" }, // no orgId reads as the default tenant (crc)
        })
        expect(await fetchChartVersions(db, ["crcChart", "blChart", "legacy"], "brotherslazaroff")).toEqual({
            blChart: "h:b1",
        })
        expect(await fetchChartVersions(db, ["crcChart", "blChart", "legacy"], "crc")).toEqual({
            crcChart: "h:c1",
            legacy: "h:l1",
        })
    })

    it("makes no read for a setlist with no charts, and returns empty on a read failure", async () => {
        const none = fakeDb({})
        expect(await fetchChartVersions(none.db, ["", "flow-1"], "crc")).toEqual({})
        expect(none.getAll).not.toHaveBeenCalled()
        const broken = fakeDb({}, { fail: true })
        expect(await fetchChartVersions(broken.db, ["a"], "crc")).toEqual({})
    })
})
