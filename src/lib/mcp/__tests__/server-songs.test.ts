import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const mockCollectionGet = vi.fn()
// Per-collection doc().get() so getSongById's `songs` read and its
// `library_index` fallback (F-016/F-017) can be driven independently.
const songsDocGet = vi.fn()
const libraryIndexDocGet = vi.fn()
// Back-compat alias used by the pre-existing getSongById tests (songs read).
const mockDocGet = songsDocGet
const mockCollection = vi.fn((name: string) => ({
    get: mockCollectionGet,
    doc: vi.fn(() => ({
        get: name === "library_index" ? libraryIndexDocGet : songsDocGet,
    })),
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({ collection: mockCollection })),
}))

import { getAllSongs, getSongById, resolveTrackBondDefaults } from "../server-songs"

function docOf(id: string, data: Record<string, unknown>) {
    return { id, exists: true, data: () => data }
}

// Default the library_index fallback to "absent" so the legacy getSongById
// tests (which only stub the songs doc) behave exactly as before.
beforeEach(() => libraryIndexDocGet.mockResolvedValue({ exists: false }))

describe("getAllSongs / toSongRecord", () => {
    beforeEach(() => vi.clearAllMocks())

    it("strips the file extension from the title", async () => {
        mockCollectionGet.mockResolvedValue({
            docs: [docOf("s1", { title: "Od Yavo Shalom Aleinu.pdf" })],
        })
        const [s] = await getAllSongs()
        expect(s.title).toBe("Od Yavo Shalom Aleinu")
    })

    it("uses defaults.key/bpm/lead when present", async () => {
        mockCollectionGet.mockResolvedValue({
            docs: [
                docOf("s1", {
                    title: "Lecha Dodi",
                    defaults: { key: "G", bpm: 72, lead: "Randy" },
                }),
            ],
        })
        const [s] = await getAllSongs()
        expect(s).toMatchObject({ key: "G", bpm: 72, lead: "Randy" })
    })

    it("falls back to recent[] for fields missing from defaults", async () => {
        mockCollectionGet.mockResolvedValue({
            docs: [
                docOf("s1", {
                    title: "Hashkiveinu",
                    defaults: { lead: "Daniel" }, // no key/bpm
                    recent: [
                        { setlistId: "x", performedAt: 2 }, // newest — carries neither
                        { key: "Am", bpm: 60, setlistId: "y", performedAt: 1 },
                    ],
                }),
            ],
        })
        const [s] = await getAllSongs()
        expect(s).toMatchObject({ lead: "Daniel", key: "Am", bpm: 60 })
    })

    it("omits key/bpm/lead when neither defaults nor recent carry them", async () => {
        mockCollectionGet.mockResolvedValue({ docs: [docOf("s1", { title: "Plain" })] })
        const [s] = await getAllSongs()
        expect(s).toEqual({
            id: "s1",
            title: "Plain",
            fileName: "Plain",
            status: "active",
        })
    })

    it("exposes the raw catalog title as fileName (the chart filename incl. extension)", async () => {
        mockCollectionGet.mockResolvedValue({
            docs: [docOf("s1", { title: "Od Yavo Shalom Aleinu.pdf" })],
        })
        const [s] = await getAllSongs()
        expect(s.title).toBe("Od Yavo Shalom Aleinu")
        expect(s.fileName).toBe("Od Yavo Shalom Aleinu.pdf")
    })

    it("passes through the archived status", async () => {
        mockCollectionGet.mockResolvedValue({
            docs: [docOf("s1", { title: "Old", status: "archived" })],
        })
        const [s] = await getAllSongs()
        expect(s.status).toBe("archived")
    })

    it("defaults status to 'active' when the catalog row omits one (G-15)", async () => {
        mockCollectionGet.mockResolvedValue({
            docs: [docOf("s1", { title: "Plain" })],
        })
        const [s] = await getAllSongs()
        expect(s.status).toBe("active")
    })

    it("returns [] on a Firestore error", async () => {
        mockCollectionGet.mockRejectedValue(new Error("boom"))
        expect(await getAllSongs()).toEqual([])
    })
})

describe("getSongById", () => {
    beforeEach(() => vi.clearAllMocks())

    it("returns the record for an existing song", async () => {
        mockDocGet.mockResolvedValue(
            docOf("s1", { title: "Lecha Dodi.pdf", defaults: { key: "D" } }),
        )
        expect(await getSongById("s1")).toEqual({
            id: "s1",
            title: "Lecha Dodi",
            fileName: "Lecha Dodi.pdf",
            key: "D",
            status: "active",
        })
    })

    it("returns null for a missing song", async () => {
        mockDocGet.mockResolvedValue({ exists: false })
        expect(await getSongById("nope")).toBeNull()
    })

    it("returns null on a Firestore error", async () => {
        mockDocGet.mockRejectedValue(new Error("boom"))
        expect(await getSongById("s1")).toBeNull()
    })

    // ─── F-016/F-017 library_index fallback ──────────────────────────────────
    it("heals missing key/bpm/lead from library_index when songs.defaults is empty", async () => {
        // The Bar Mitzvah class: chart uploaded via upload_chart pre-fix —
        // songs/{id} exists (title only) but key/bpm/lead live in library_index.
        songsDocGet.mockResolvedValue(docOf("upload-x", { title: "Niggun.pdf" }))
        libraryIndexDocGet.mockResolvedValue(
            docOf("upload-x", { key: "Am", bpm: 96, leadMusician: "Bonia" }),
        )
        const rec = await getSongById("upload-x")
        expect(rec).toMatchObject({ key: "Am", bpm: 96, lead: "Bonia" })
    })

    it("prefers songs.defaults over the library_index fallback", async () => {
        songsDocGet.mockResolvedValue(
            docOf("s1", { title: "Lecha Dodi.pdf", defaults: { key: "D", bpm: 72 } }),
        )
        libraryIndexDocGet.mockResolvedValue(
            docOf("s1", { key: "G", bpm: 999, leadMusician: "Wrong" }),
        )
        const rec = await getSongById("s1")
        // defaults win for the fields it carries; lead still fills from index.
        expect(rec).toMatchObject({ key: "D", bpm: 72, lead: "Wrong" })
    })

    it("does not read library_index when songs.defaults already covers every field", async () => {
        songsDocGet.mockResolvedValue(
            docOf("s1", {
                title: "Full.pdf",
                defaults: { key: "C", bpm: 80, lead: "Randy" },
            }),
        )
        await getSongById("s1")
        expect(libraryIndexDocGet).not.toHaveBeenCalled()
    })
})

describe("resolveTrackBondDefaults (F-017 bpm denorm)", () => {
    beforeEach(() => vi.clearAllMocks())

    it("denorms key + bpm + lead from the bonded song", async () => {
        songsDocGet.mockResolvedValue(
            docOf("song-1", {
                title: "Mi Chamocha.pdf",
                defaults: { key: "Em", bpm: 110, lead: "David" },
            }),
        )
        const r = await resolveTrackBondDefaults({ songId: "song-1" })
        expect(r).toMatchObject({
            title: "Mi Chamocha",
            key: "Em",
            bpm: 110,
            leadMusician: "David",
            songMissing: false,
        })
    })

    it("denorms bpm from library_index for an uploaded-only row", async () => {
        songsDocGet.mockResolvedValue(docOf("upload-y", { title: "Hashkivenu.pdf" }))
        libraryIndexDocGet.mockResolvedValue(docOf("upload-y", { key: "Dm", bpm: 64 }))
        const r = await resolveTrackBondDefaults({ songId: "upload-y" })
        expect(r).toMatchObject({ key: "Dm", bpm: 64 })
    })

    it("lets a caller-supplied bpm override the catalog default", async () => {
        songsDocGet.mockResolvedValue(
            docOf("song-1", { title: "X.pdf", defaults: { bpm: 100 } }),
        )
        const r = await resolveTrackBondDefaults({ songId: "song-1", bpm: 132 })
        expect(r.bpm).toBe(132)
    })

    it("flags songMissing and leaves bpm undefined when the songId doesn't resolve", async () => {
        songsDocGet.mockResolvedValue({ exists: false })
        const r = await resolveTrackBondDefaults({ songId: "ghost" })
        expect(r).toMatchObject({ songMissing: true, bpm: undefined })
    })
})
