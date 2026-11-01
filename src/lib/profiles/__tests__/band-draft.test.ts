import { describe, expect, it } from "vitest"
import { bandDraftProfileRows } from "@/lib/profiles/band-draft"
import { buildDraftRows, openIndexesOf } from "@/lib/profiles/draft"

describe("band draft from a past gig (TF-05)", () => {
    const source = { name: "Pageant show", eventDate: "2026-10-03T01:00:00.000Z" }
    const gigRows = [
        { track: { type: "header", title: "Set 1" }, slotKey: null, standing: null, chartName: null },
        {
            track: { type: "song", title: "Tune A", fileId: "f-a", key: "G", leadMusician: "Ben" },
            slotKey: "song:pg-a",
            standing: { fileId: "f-a2", chartName: "Tune A (new)", key: "A", leadMusician: "Sam" },
            chartName: "Tune A",
        },
        {
            track: { type: "song", title: "Tune B", fileId: "f-b", key: "D", segue: true },
            slotKey: "song:pg-b",
            standing: null,
            chartName: "Tune B",
        },
        { track: { type: "song", title: "Tune C" }, slotKey: "song:tune c", standing: null, chartName: null },
    ]

    it("keeps the order, fills only the standing choice, and leaves the rest open with recall", () => {
        const rows = buildDraftRows(bandDraftProfileRows(gigRows, source))
        expect(rows.map((r) => r.label)).toEqual(["Set 1", "Tune A", "Tune B", "Tune C"])
        expect(rows[0]).toMatchObject({ type: "header", tier: null, filled: false })

        expect(rows[1]).toMatchObject({ tier: "standard", filled: true, fileId: "f-a2", key: "A" })
        expect(rows[1].track.leadMusician).toBe("Sam")

        expect(rows[2]).toMatchObject({ tier: "last_time", filled: false })
        expect(rows[2].fileId).toBeUndefined()
        expect(rows[2].track.fileId).toBeUndefined()
        expect(rows[2].track.key).toBeUndefined()
        expect(rows[2].recall).toEqual({ fileId: "f-b", chartName: "Tune B", key: "D", date: "2026-10-03", service: "Pageant show" })

        expect(rows[3]).toMatchObject({ tier: "new", filled: false })
        expect(rows[3].recall).toBeUndefined()
        expect(openIndexesOf(rows)).toEqual([2, 3])
    })

    it("never recalls a dead chart", () => {
        const [row] = buildDraftRows(bandDraftProfileRows([{ ...gigRows[2], dead: true }], source))
        expect(row.recall).toBeUndefined()
        expect(row.filled).toBe(false)
    })
})
