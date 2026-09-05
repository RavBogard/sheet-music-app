import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * R-0904-live-cw-34 fail branch (R-0831-guards-2: shown, not promised).
 *
 * `library_index.status` is the source of truth; `songs/{id}.status` is a
 * mirror that cannot represent "unknown" — `server-songs.ts`'s G-15 default
 * rewrites an absent value to `"active"`, so a row archived in
 * `library_index` and stale (or absent) in `songs` reads `active` to every
 * caller of `getAllSongs()`. `searchLibrary` already joins `library_index`
 * for name/title/mimeType but gated status on the mirror, so archived and
 * duplicate rows kept surfacing in search while every hygiene tool — which
 * reads `library_index` — called them gone.
 *
 * Reverting the status join in `searchLibrary` (gating on `s.status` again)
 * must turn this file red.
 *
 * Lives in its own file for the reason `library-search-join.test.ts` gives
 * for being separate from `library.test.ts`: it needs a populated
 * `library_index`, whose status DIVERGES from `songs`.
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

const QUERY = "hashkivenu"
const TITLE = "Hashkivenu"

/** A `songs` row as `getAllSongs()` hands it over, with G-15 already applied. */
function song(id: string, status?: string) {
    return status === undefined
        ? { id, title: TITLE, key: "Am" }
        : { id, title: TITLE, key: "Am", status }
}

/** A `library_index` row; `status: undefined` means the field is ABSENT. */
function indexRow(id: string, status?: string) {
    const data: Record<string, unknown> = {
        name: `${TITLE}.pdf`,
        mimeType: "application/pdf",
    }
    if (status !== undefined) data.status = status
    return { id, data }
}

async function idsFor(args: Record<string, unknown> = {}) {
    const r = await searchLibrary("u", { query: QUERY, ...args })
    return r.map((s) => s.id)
}

describe("searchLibrary gates on library_index.status, not the songs mirror (R-0904-live-cw-34 §1/§2)", () => {
    beforeEach(() => {
        h.songs = []
        h.indexDocs = []
    })

    it("hides a row archived in library_index while songs still reads active", async () => {
        // The measured live shape: G-15 wrote `active` over an absent value,
        // so the mirror actively contradicts the source of truth.
        h.songs = [song("archived-row", "active")]
        h.indexDocs = [indexRow("archived-row", "archived")]
        expect(await idsFor()).toEqual([])
    })

    it("hides it when the songs row carries no status at all", async () => {
        h.songs = [song("archived-row")]
        h.indexDocs = [indexRow("archived-row", "archived")]
        expect(await idsFor()).toEqual([])
    })

    it("hides a row marked duplicate in library_index while songs reads active", async () => {
        h.songs = [song("dupe-row", "active")]
        h.indexDocs = [indexRow("dupe-row", "duplicate")]
        expect(await idsFor()).toEqual([])
    })

    it("hides a row orphaned in library_index while songs reads active", async () => {
        h.songs = [song("orphan-row", "active")]
        h.indexDocs = [indexRow("orphan-row", "orphaned")]
        expect(await idsFor()).toEqual([])
    })

    it("returns that orphan under includeOrphaned — the gate moved, it did not harden", async () => {
        h.songs = [song("orphan-row", "active")]
        h.indexDocs = [indexRow("orphan-row", "orphaned")]
        expect(await idsFor({ includeOrphaned: true })).toEqual(["orphan-row"])
    })

    it("SHOWS a row active in library_index whose songs mirror says archived", async () => {
        // The divergence in the other direction: the mirror hid a row the
        // source of truth calls live. `library_index` owns the answer both ways.
        h.songs = [song("live-row", "archived")]
        h.indexDocs = [indexRow("live-row", "active")]
        expect(await idsFor()).toEqual(["live-row"])
    })
})

describe("an absent library_index status joins as undefined, never as active (§1(b))", () => {
    beforeEach(() => {
        h.songs = []
        h.indexDocs = []
    })

    it("falls through to songs.status when the row exists but has NO status field", async () => {
        // Distinct from "no library_index row": the row is there, the field is
        // genuinely absent. Fabricating `active` here is the exact defect
        // -34 §1(b) named — it would resurrect an archived row.
        h.songs = [song("fieldless-row", "archived")]
        h.indexDocs = [indexRow("fieldless-row")]
        expect(await idsFor()).toEqual([])
    })

    it("shows a fieldless row whose songs.status is active", async () => {
        h.songs = [song("fieldless-row", "active")]
        h.indexDocs = [indexRow("fieldless-row")]
        expect(await idsFor()).toEqual(["fieldless-row"])
    })

    it("falls back to songs.status when there is no library_index row at all", async () => {
        // Unchanged behaviour — the case library-search-join.test.ts already
        // pins for the name join, restated here for the status predicate.
        h.songs = [song("no-index-row", "archived")]
        h.indexDocs = []
        expect(await idsFor()).toEqual([])
    })

    it("shows a row with no library_index entry whose songs.status is active", async () => {
        h.songs = [song("no-index-row", "active")]
        h.indexDocs = []
        expect(await idsFor()).toEqual(["no-index-row"])
    })
})

describe("the joined status gates but does not reach the wire", () => {
    beforeEach(() => {
        h.songs = []
        h.indexDocs = []
    })

    it("does not erase songs.status when the library_index row has no status field", async () => {
        // The regression the drop guards: `{...s, ...w02}` would spread
        // `status: undefined` over a perfectly good mirror value.
        h.songs = [song("fieldless-row", "active")]
        h.indexDocs = [indexRow("fieldless-row")]
        const r = await searchLibrary("u", { query: QUERY })
        expect(r[0]?.status).toBe("active")
    })

    it("leaves the wire status as the songs value — the predicate moved, the shape did not", async () => {
        // Making the wire authoritative is a separate change, unordered here.
        h.songs = [song("live-row", "active")]
        h.indexDocs = [indexRow("live-row", "orphaned")]
        const r = await searchLibrary("u", {
            query: QUERY,
            includeOrphaned: true,
        })
        expect(r.map((s) => s.id)).toEqual(["live-row"])
        expect(r[0]?.status).toBe("active")
    })
})
