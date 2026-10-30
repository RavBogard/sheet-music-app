import { describe, it, expect, vi, beforeEach } from "vitest"

const mockGetAllSetlists = vi.fn()
vi.mock("@/lib/server-setlists", () => ({
    getAllSetlists: (opts?: unknown) => mockGetAllSetlists(opts),
    MAX_SETLIST_FETCH: 200,
}))

const mockGetTracks = vi.fn()
vi.mock("@/lib/server-tracks", () => ({
    getTracksForSetlist: (...a: unknown[]) => mockGetTracks(...a),
}))

const mockGetAll = vi.fn()
const mockDoc = vi.fn((id: string) => ({ id }))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({
        collection: vi.fn(() => ({ doc: mockDoc })),
        getAll: (...refs: Array<{ id: string }>) => mockGetAll(...refs),
    })),
}))

import { getSongHistoryTool, exportSetlistsTool } from "../history"

const LIB: Record<string, Record<string, unknown>> = {
    f1: { name: "Mi Chamocha (Moshav)", key: "Dm", setting: "Moshav", orgId: "crc" },
}

function setlistRow(id: string, eventDate: string | null, extra: Record<string, unknown> = {}) {
    return { id, orgId: "crc", name: `Shabbat Morning ${id}`, eventDate, templateType: "shabbat_morning", ...extra }
}

const TRACKS: Record<string, Array<Record<string, unknown>>> = {
    a: [{ id: "a1", order: 0, type: "song", title: "Mi Chamocha", fileId: "f1", key: "Dm" }],
    b: [{ id: "b1", order: 0, type: "song", title: "Mi Chamocha", fileId: "f1", key: "Em" }],
    c: [{ id: "c1", order: 0, type: "song", title: "Mi Chamocha", fileId: "f1" }],
}

beforeEach(() => {
    vi.clearAllMocks()
    mockGetAllSetlists.mockResolvedValue([
        setlistRow("a", "2026-10-03T15:00:00.000Z"),
        setlistRow("b", "2026-09-12T15:00:00.000Z"),
        setlistRow("c", "2026-08-22T15:00:00.000Z"),
    ])
    mockGetTracks.mockImplementation(async (_db: unknown, id: string) => TRACKS[id] ?? [])
    mockGetAll.mockImplementation(async (...refs: Array<{ id: string }>) =>
        refs.map((r) => ({ id: r.id, exists: !!LIB[r.id], data: () => LIB[r.id] })),
    )
})

function code(r: unknown): string | undefined {
    return (r as { error?: { machine_code?: string } }).error?.machine_code
}

describe("getSongHistoryTool", () => {
    it("refuses a call with neither title nor fileId", async () => {
        expect(code(await getSongHistoryTool("u", {}))).toBe("invalid_argument")
    })

    it("returns the history for the caller's org", async () => {
        const r = await getSongHistoryTool("u", { title: "Mi Chamocha" }, "crc")
        expect(r).toMatchObject({ ok: true, truncated: false, total: 3 })
        const ok = r as { entries: Array<{ setlistId: string; chartName: string }>; byChart: Array<{ count: number }> }
        expect(ok.entries.map((e) => e.setlistId)).toEqual(["a", "b", "c"])
        expect(ok.entries[0].chartName).toBe("Mi Chamocha (Moshav)")
        expect(ok.byChart[0].count).toBe(3)
        expect(mockGetAllSetlists).toHaveBeenCalledWith(expect.objectContaining({ org: "crc" }))
    })

    it("flags truncation when the fetch hit MAX_SETLIST_FETCH", async () => {
        mockGetAllSetlists.mockResolvedValue(
            Array.from({ length: 200 }, (_, i) => setlistRow(`s${i}`, "2026-01-01T15:00:00.000Z")),
        )
        const r = await getSongHistoryTool("u", { title: "Mi Chamocha" }, "crc")
        expect(r).toMatchObject({ ok: true, truncated: true })
    })

    it("reads each library row once, batched", async () => {
        await getSongHistoryTool("u", { title: "Mi Chamocha" }, "crc")
        expect(mockGetAll).toHaveBeenCalledTimes(1)
        const ids = mockGetAll.mock.calls[0].map((r: { id: string }) => r.id)
        expect(ids).toEqual(["f1"])
    })

    it("drops a setlist stamped with another org even if the query returned it", async () => {
        mockGetAllSetlists.mockResolvedValue([
            setlistRow("a", "2026-10-03T15:00:00.000Z"),
            setlistRow("b", "2026-09-12T15:00:00.000Z", { orgId: "brotherslazaroff" }),
        ])
        const r = (await getSongHistoryTool("u", { title: "Mi Chamocha" }, "crc")) as { entries: Array<{ setlistId: string }> }
        expect(r.entries.map((e) => e.setlistId)).toEqual(["a"])
    })
})

describe("exportSetlistsTool", () => {
    beforeEach(() => {
        mockGetAllSetlists.mockResolvedValue([
            setlistRow("a", "2026-10-03T15:00:00.000Z"),
            setlistRow("a-bb", "2026-10-03T15:00:00.000Z", { name: "Shabbat Morning — Oct 3 · Bb" }),
            setlistRow("b", "2026-09-12T15:00:00.000Z"),
            setlistRow("c", "2026-08-22T15:00:00.000Z"),
            setlistRow("u", null),
        ])
    })

    it("applies from, and leaves out part copies and undated setlists by default", async () => {
        const r = (await exportSetlistsTool("u", { from: "2026-09-01" }, "crc")) as {
            ok: true
            count: number
            setlists: Array<{ id: string; tracks: unknown[] }>
        }
        expect(r.ok).toBe(true)
        expect(r.setlists.map((s) => s.id)).toEqual(["a", "b"])
        expect(r.count).toBe(2)
        expect(r.setlists[0].tracks).toHaveLength(1)
    })

    it("includes part copies and undated setlists when asked", async () => {
        const r = (await exportSetlistsTool("u", { includeParts: true, includeUndated: true }, "crc")) as {
            setlists: Array<{ id: string; part: string | null }>
        }
        expect(r.setlists.map((s) => s.id)).toEqual(["a", "a-bb", "b", "c", "u"])
        expect(r.setlists.find((s) => s.id === "a-bb")?.part).toBe("Bb")
    })

    it("refuses a malformed date", async () => {
        expect(code(await exportSetlistsTool("u", { from: "last week" }, "crc"))).toBe("invalid_argument")
    })
})
