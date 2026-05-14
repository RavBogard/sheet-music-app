import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const mockCollectionGet = vi.fn()
const mockDocGet = vi.fn()
const mockDoc = vi.fn(() => ({ get: mockDocGet }))
const mockCollection = vi.fn(() => ({ get: mockCollectionGet, doc: mockDoc }))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({ collection: mockCollection })),
}))

import { getAllSongs, getSongById } from "../server-songs"

function docOf(id: string, data: Record<string, unknown>) {
    return { id, exists: true, data: () => data }
}

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
        expect(s).toEqual({ id: "s1", title: "Plain" })
    })

    it("passes through the archived status", async () => {
        mockCollectionGet.mockResolvedValue({
            docs: [docOf("s1", { title: "Old", status: "archived" })],
        })
        const [s] = await getAllSongs()
        expect(s.status).toBe("archived")
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
            key: "D",
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
})
