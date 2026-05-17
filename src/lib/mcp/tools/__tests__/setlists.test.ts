import { describe, it, expect, vi, beforeEach } from "vitest"

const mockGetAllSetlists = vi.fn()
vi.mock("@/lib/server-setlists", () => ({
    getAllSetlists: (opts?: { limit?: number }) => mockGetAllSetlists(opts),
    MAX_SETLIST_FETCH: 200,
}))

const mockGet = vi.fn()
const mockDoc = vi.fn(() => ({ get: mockGet }))
const mockCollection = vi.fn(() => ({ doc: mockDoc }))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({ collection: mockCollection })),
}))

const mockGetTracks = vi.fn()
vi.mock("@/lib/server-tracks", () => ({
    getTracksForSetlist: (...a: unknown[]) => mockGetTracks(...a),
}))

vi.mock("@/lib/server-auth", () => ({
    serializeSetlist: (id: string, data: Record<string, unknown>) => ({ id, ...data }),
}))

import { listSetlists, getSetlist } from "../setlists"

describe("listSetlists", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetAllSetlists.mockResolvedValue([
            {
                id: "a",
                name: "Shabbat 5/24",
                eventDate: "2026-05-24T00:00:00.000Z",
                date: "2026-05-20T00:00:00.000Z",
                trackCount: 12,
            },
            {
                id: "b",
                name: "Shabbat 5/17",
                eventDate: "2026-05-17T00:00:00.000Z",
                date: "2026-05-13T00:00:00.000Z",
                trackCount: 10,
                songCount: 8,
            },
            { id: "c", name: "Draft", trackCount: 0 }, // undated
        ])
    })

    it("returns id/name/dates/trackCount, including songCount only when present", async () => {
        const r = (await listSetlists("u", {})) as Array<Record<string, unknown>>
        expect(r).toHaveLength(3)
        expect(r[0]).toEqual({
            id: "a",
            name: "Shabbat 5/24",
            date: "2026-05-20T00:00:00.000Z",
            eventDate: "2026-05-24T00:00:00.000Z",
            trackCount: 12,
        })
        expect(r[1].songCount).toBe(8)
        expect("songCount" in r[0]).toBe(false)
    })

    it("filters by `from` date against the event date; undated setlists always pass", async () => {
        const r = (await listSetlists("u", { from: "2026-05-20" })) as Array<{
            id: string
        }>
        expect(r.map((s) => s.id).sort()).toEqual(["a", "c"])
    })

    it("filters by `to` date", async () => {
        const r = (await listSetlists("u", { to: "2026-05-20" })) as Array<{
            id: string
        }>
        expect(r.map((s) => s.id).sort()).toEqual(["b", "c"])
    })

    it("applies the limit", async () => {
        const r = (await listSetlists("u", { limit: 1 })) as Array<{
            id: string
        }>
        expect(r).toHaveLength(1)
        expect(r[0].id).toBe("a")
    })

    it("§7.7 paging: offset skips records, limit caps results", async () => {
        // Use a fresh, larger fixture to exercise paging.
        mockGetAllSetlists.mockResolvedValue(
            Array.from({ length: 30 }, (_, i) => ({
                id: `s${i}`,
                name: `Setlist ${i}`,
                date: `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
                eventDate: `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
                trackCount: 10,
            })),
        )

        const page1 = (await listSetlists("u", { limit: 10 })) as Array<{
            id: string
        }>
        expect(page1).toHaveLength(10)
        expect(page1[0].id).toBe("s0")
        expect(page1[9].id).toBe("s9")

        const page2 = (await listSetlists("u", {
            limit: 10,
            offset: 10,
        })) as Array<{ id: string }>
        expect(page2).toHaveLength(10)
        expect(page2[0].id).toBe("s10")
        expect(page2[9].id).toBe("s19")

        // Upstream getAllSetlists is asked for enough rows to cover offset+limit.
        expect(mockGetAllSetlists).toHaveBeenLastCalledWith({ limit: 20 })
    })

    it("rejects an unparseable `from` / `to` with the rich validation envelope (G-14 / MCP-003)", async () => {
        // Cycle-2 REG-001b: errors return the canonical rich envelope
        // (machine code in `error`, human-readable prose in `message`).
        expect(await listSetlists("u", { from: "not-a-date" })).toMatchObject({
            ok: false,
            error: "invalid_argument",
            field: "from",
            message: expect.stringContaining("from must be an ISO date"),
        })
        expect(await listSetlists("u", { to: "garbage" })).toMatchObject({
            ok: false,
            error: "invalid_argument",
            field: "to",
            message: expect.stringContaining("to must be an ISO date"),
        })
    })
})

describe("getSetlist", () => {
    beforeEach(() => vi.clearAllMocks())

    it("returns null when the setlist does not exist", async () => {
        mockGet.mockResolvedValue({ exists: false })
        expect(await getSetlist("u", { id: "missing" })).toBeNull()
    })

    it("returns the serialized setlist with tracks in order", async () => {
        mockGet.mockResolvedValue({
            exists: true,
            id: "a",
            data: () => ({ name: "Shabbat 5/24", trackCount: 2 }),
        })
        mockGetTracks.mockResolvedValue([
            {
                id: "t1",
                order: 0,
                title: "Lecha Dodi",
                songId: "s1",
                key: "G",
                bpm: 72,
                type: "song",
            },
            { id: "t2", order: 1, title: "Silence", type: "note" },
        ])
        const r = await getSetlist("u", { id: "a" })
        expect(r).not.toBeNull()
        expect(r!.id).toBe("a")
        expect(r!.name).toBe("Shabbat 5/24")
        expect(r!.tracks).toHaveLength(2)
        expect(r!.tracks[0]).toMatchObject({
            id: "t1",
            title: "Lecha Dodi",
            key: "G",
            type: "song",
        })
        expect(r!.tracks[1]).toMatchObject({ id: "t2", type: "note", key: null })
    })

    it("projects referenceLink through to the read view (F-4)", async () => {
        // Regression guard for F-4: write path persists the field but the read
        // projection used to omit it, silently dropping the value.
        mockGet.mockResolvedValue({
            exists: true,
            id: "a",
            data: () => ({ name: "Test", trackCount: 2 }),
        })
        mockGetTracks.mockResolvedValue([
            {
                id: "t1",
                order: 0,
                title: "With link",
                type: "song",
                referenceLink: "https://youtu.be/example",
            },
            { id: "t2", order: 1, title: "No link", type: "song" },
        ])
        const r = await getSetlist("u", { id: "a" })
        expect(r!.tracks[0]).toMatchObject({
            referenceLink: "https://youtu.be/example",
        })
        // Missing field projects as null (the field is always present in the
        // response shape — never `undefined` or missing).
        expect(r!.tracks[1]).toMatchObject({ referenceLink: null })
    })
})
