import { describe, it, expect, vi, beforeEach } from "vitest"

const updateServer = vi.fn(async (..._a: unknown[]) => ({ ok: true }))
let STORED: Record<string, unknown> = {}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({
        collection: () => ({ doc: () => ({ get: async () => ({ data: () => STORED }) }) }),
    })),
}))
vi.mock("@/lib/setlist-write", () => ({
    createSetlistServerSide: vi.fn(),
    updateSetlistServerSide: (...a: unknown[]) => updateServer(...a),
}))
vi.mock("@/lib/mcp/server-tracks-write", () => ({
    assertEditor: vi.fn(),
    loadEditableSetlist: vi.fn(async () => ({ ok: true, data: { name: "x" } })),
    addTrack: vi.fn(),
    reorderTracks: vi.fn(),
    removeTrack: vi.fn(),
    updateTrack: vi.fn(),
    bulkUpdateTracks: vi.fn(),
    bulkAddTracks: vi.fn(),
}))

import { updateSetlist } from "../setlist-write"

function patchOf(): Record<string, unknown> {
    return updateServer.mock.calls[0][1] as Record<string, unknown>
}

beforeEach(() => {
    vi.clearAllMocks()
    STORED = {}
})

describe("update_setlist service class", () => {
    it("stores special and rabbiSlot", async () => {
        STORED = { rabbiSlot: "randy", special: true }
        const r = (await updateSetlist("u", { id: "s1", special: true, rabbiSlot: "randy" }, "crc")) as {
            ok: boolean
            setlist: { rabbiSlot: string | null; special: boolean | null }
        }
        expect(patchOf()).toMatchObject({ special: true, rabbiSlot: "randy" })
        expect(r.setlist).toMatchObject({ rabbiSlot: "randy", special: true })
    })

    it("rabbiSlot null clears the stored slot", async () => {
        await updateSetlist("u", { id: "s1", rabbiSlot: null }, "crc")
        expect(patchOf()).toMatchObject({ rabbiSlot: null })
    })

    it("new rabbi text without a slot drops the stored slot so it is read from the text", async () => {
        await updateSetlist("u", { id: "s1", rabbi: "Randy Fleisher" }, "crc")
        expect(patchOf()).toMatchObject({ rabbi: "Randy Fleisher", rabbiSlot: null })
    })

    it("a new service type also sets the stored catalog key", async () => {
        await updateSetlist("u", { id: "s1", serviceType: "kabbalat-shabbat" }, "crc")
        expect(patchOf()).toMatchObject({ serviceType: "kabbalat-shabbat", storedServiceType: "friday_night" })
    })

    it("leaves the class alone when not mentioned", async () => {
        await updateSetlist("u", { id: "s1", name: "New name" }, "crc")
        const p = patchOf()
        expect(p).not.toHaveProperty("rabbiSlot")
        expect(p).not.toHaveProperty("special")
        expect(p).not.toHaveProperty("storedServiceType")
    })
})
