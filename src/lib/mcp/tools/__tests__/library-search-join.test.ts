import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * R-0901-live-cw-4 §5 fail branch (R-0831-guards-2: shown, not promised).
 *
 * `edit_library_entry` writes a rename into `library_index/{rowId}` and never
 * mirrors it into `songs/{id}`. `searchLibrary` used to both filter and
 * display on `songs.title`, so every chart Daniel had ever renamed was
 * findable only by the name he could no longer see anywhere in the product.
 *
 * These tests seed a row whose `library_index.name` and `songs.title` differ.
 * Neutralising the join in `searchLibrary` — reverting either the filter or
 * the displayed title to `songs.title` — must turn this file red.
 *
 * Lives in its own file because `library.test.ts` deliberately leaves
 * `loadLibraryW02Map` to fail-soft into an empty map; this one needs a
 * populated `library_index`.
 */
const h = vi.hoisted(() => ({
    indexDocs: [] as { id: string; data: Record<string, unknown> }[],
    songs: [] as Record<string, unknown>[],
}))

vi.mock("@/lib/mcp/server-songs", () => ({
    getAllSongs: async () => h.songs,
    getSongById: vi.fn(),
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(),
    getFirestore: () => ({
        collection: (name: string) => {
            if (name === "library_index") {
                return {
                    get: async () => ({
                        docs: h.indexDocs.map((d) => ({
                            id: d.id,
                            data: () => d.data,
                        })),
                    }),
                }
            }
            // aiEnrichmentRetryQueue — ids-only read, empty is fine.
            return { select: () => ({ get: async () => ({ docs: [] }) }) }
        },
    }),
}))

vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: vi
        .fn()
        .mockResolvedValue({ status: "ok", source: "firebase-storage" }),
    fetchFileById: vi.fn(),
}))

import { searchLibrary } from "../library"

/** The live case: renamed so the parenthetical could seed `arrangement`. */
const RENAMED_ID = "1-NavaOsehShalomRow"
const CURRENT_NAME = "Oseh Shalom (Nava Tehila)"
const STALE_TITLE = "Oseh Shalom"

describe("searchLibrary reads the name the browse shows (R-0901-live-cw-4 §5)", () => {
    beforeEach(() => {
        h.songs = [
            // The drifted row: songs/* still carries the pre-rename title.
            { id: RENAMED_ID, title: STALE_TITLE, key: "C", status: "active" },
            // Control: no library_index row at all — must still match on
            // songs.title, which is the only name it has.
            { id: "no-index-row", title: "Hashkiveinu", key: "Am" },
        ]
        h.indexDocs = [
            {
                id: RENAMED_ID,
                data: {
                    name: CURRENT_NAME,
                    mimeType: "application/pdf",
                    status: "active",
                },
            },
        ]
    })

    it("finds the row by the CURRENT name — the browse's name, absent from songs/*", async () => {
        const r = await searchLibrary("u", { query: CURRENT_NAME })
        expect(r.map((s) => s.id)).toEqual([RENAMED_ID])
    })

    it("returns the CURRENT name as the title, not the stale songs/* one", async () => {
        const r = await searchLibrary("u", { query: CURRENT_NAME })
        expect(r[0]?.title).toBe(CURRENT_NAME)
    })

    it("still finds the row by its OLD name — the join is a strict superset", async () => {
        const r = await searchLibrary("u", { query: STALE_TITLE })
        expect(r.map((s) => s.id)).toEqual([RENAMED_ID])
        // Even matched by the old name, the title rendered is the current one.
        expect(r[0]?.title).toBe(CURRENT_NAME)
    })

    it("falls back to songs.title for a row with no library_index entry", async () => {
        const r = await searchLibrary("u", { query: "hashkiveinu" })
        expect(r.map((s) => s.id)).toEqual(["no-index-row"])
        expect(r[0]?.title).toBe("Hashkiveinu")
    })

    it("resolves through library_index.title when the row carries no name", async () => {
        h.indexDocs = [
            {
                id: RENAMED_ID,
                data: {
                    title: "Oseh Shalom (index title)",
                    mimeType: "application/pdf",
                },
            },
        ]
        const r = await searchLibrary("u", { query: "index title" })
        expect(r.map((s) => s.id)).toEqual([RENAMED_ID])
        expect(r[0]?.title).toBe("Oseh Shalom (index title)")
    })

    it("does not leak the join-only indexTitle field onto the wire shape", async () => {
        const r = await searchLibrary("u", { query: CURRENT_NAME })
        expect(r[0]).not.toHaveProperty("indexTitle")
        expect(r[0]).not.toHaveProperty("name")
        expect(r[0]).not.toHaveProperty("mimeType")
    })
})
