import { describe, it, expect, vi, beforeEach } from "vitest"

const mockGetAllSongs = vi.fn()
const mockGetSongById = vi.fn()

vi.mock("@/lib/mcp/server-songs", () => ({
    getAllSongs: () => mockGetAllSongs(),
    getSongById: (id: string) => mockGetSongById(id),
}))

import { searchLibrary, getSong } from "../library"

const songs = [
    { id: "s1", title: "Lecha Dodi", key: "G", bpm: 72, status: "active" },
    { id: "s2", title: "Hashkiveinu", key: "Am", bpm: 60 },
    { id: "s3", title: "Mi Chamocha", key: "G", bpm: 96 },
    { id: "s4", title: "Old Lecha Setting", key: "D", bpm: 70, status: "archived" },
    { id: "s5", title: "Shalom Rav", key: "C" }, // no bpm
]

describe("searchLibrary", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetAllSongs.mockResolvedValue(songs)
    })

    it("substring-matches the title, case-insensitive, and excludes archived", async () => {
        const r = await searchLibrary("u", { query: "lecha" })
        expect(r.map((s) => s.id)).toEqual(["s1"]) // s4 "Old Lecha Setting" is archived
    })

    it("excludes archived songs even with an empty query", async () => {
        const r = await searchLibrary("u", { query: "" })
        expect(r.find((s) => s.id === "s4")).toBeUndefined()
        expect(r).toHaveLength(4)
    })

    it("filters by exact key, case-insensitive", async () => {
        const r = await searchLibrary("u", { query: "", key: "g" })
        expect(r.map((s) => s.id).sort()).toEqual(["s1", "s3"])
    })

    it("filters by BPM range; songs without a BPM are excluded when a bound is set", async () => {
        const r = await searchLibrary("u", { query: "", bpmMax: 80 })
        expect(r.map((s) => s.id).sort()).toEqual(["s1", "s2"]) // s5 has no bpm
    })

    it("applies the result limit", async () => {
        const r = await searchLibrary("u", { query: "", limit: 2 })
        expect(r).toHaveLength(2)
    })
})

describe("getSong", () => {
    beforeEach(() => vi.clearAllMocks())

    it("passes the id through to getSongById", async () => {
        mockGetSongById.mockResolvedValue({ id: "s1", title: "Lecha Dodi" })
        const r = await getSong("u", { id: "s1" })
        expect(mockGetSongById).toHaveBeenCalledWith("s1")
        expect(r).toEqual({ id: "s1", title: "Lecha Dodi" })
    })

    it("returns null for a missing song", async () => {
        mockGetSongById.mockResolvedValue(null)
        expect(await getSong("u", { id: "nope" })).toBeNull()
    })
})
