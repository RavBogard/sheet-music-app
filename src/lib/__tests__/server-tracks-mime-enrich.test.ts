import { describe, it, expect, vi } from "vitest"
import { getTracksForSetlist } from "@/lib/server-tracks"

// v11.5 chart-render outage regression: getTracksForSetlist must backfill a
// missing `track.mimeType` from library_index at read time so Perform's viewer
// routing picks the text/image viewer (not the default PDF viewer) for the
// band, regardless of which write path created the row.
// [[project_track_mimetype_render_outage]]

type TrackDoc = Record<string, unknown> & { id: string }

function makeDb(opts: {
    trackDocs: TrackDoc[]
    libMime: Record<string, string | undefined>
    libKey?: Record<string, string | undefined>
    getAllSpy?: (ids: string[]) => void
}) {
    const { trackDocs, libMime, libKey = {}, getAllSpy } = opts
    return {
        collection(name: string) {
            if (name === "tracks") {
                return {
                    where: () => ({
                        get: async () => ({
                            docs: trackDocs.map((t) => ({
                                id: t.id,
                                data: () => t,
                            })),
                        }),
                    }),
                }
            }
            if (name === "library_index") {
                return { doc: (id: string) => ({ __libId: id }) }
            }
            throw new Error(`unexpected collection ${name}`)
        },
        async getAll(...refs: Array<{ __libId: string }>) {
            getAllSpy?.(refs.map((r) => r.__libId))
            return refs.map((r) => {
                const m = libMime[r.__libId]
                const k = libKey[r.__libId]
                const exists = m !== undefined || k !== undefined
                return {
                    exists,
                    data: () =>
                        exists
                            ? {
                                  ...(m !== undefined ? { mimeType: m } : {}),
                                  ...(k !== undefined ? { key: k } : {}),
                              }
                            : undefined,
                }
            })
        },
    } as unknown as FirebaseFirestore.Firestore
}

describe("getTracksForSetlist — read-time mimeType enrichment", () => {
    it("stamps a missing mimeType on a bonded text chart from library_index", async () => {
        const db = makeDb({
            trackDocs: [
                { id: "t1", order: 0, setlistId: "s1", fileId: "upload-abc", title: "Wagon Wheel" },
            ],
            libMime: { "upload-abc": "text/plain" },
        })
        const [row] = await getTracksForSetlist(db, "s1", {})
        expect(row.mimeType).toBe("text/plain")
    })

    it("does NOT overwrite an already-stamped mimeType and performs zero reads (fully stamped row)", async () => {
        const getAllSpy = vi.fn()
        const db = makeDb({
            trackDocs: [
                // Fully stamped (mimeType AND key) → nothing to enrich → no read.
                { id: "t1", order: 0, setlistId: "s1", fileId: "upload-abc", mimeType: "application/pdf", key: "C", title: "Hava Nagila" },
            ],
            libMime: { "upload-abc": "text/plain" }, // would mis-stamp if consulted
            libKey: { "upload-abc": "A" }, // would mis-stamp if consulted
            getAllSpy,
        })
        const [row] = await getTracksForSetlist(db, "s1", {})
        expect(row.mimeType).toBe("application/pdf")
        expect((row as { key?: string }).key).toBe("C")
        expect(getAllSpy).not.toHaveBeenCalled()
    })

    it("ignores unbonded rows (headers) — no fileId, no enrichment", async () => {
        const getAllSpy = vi.fn()
        const db = makeDb({
            trackDocs: [
                { id: "h1", order: 0, setlistId: "s1", type: "header", title: "Set 1" },
            ],
            libMime: {},
            getAllSpy,
        })
        const [row] = await getTracksForSetlist(db, "s1", {})
        expect(row.mimeType).toBeUndefined()
        expect(getAllSpy).not.toHaveBeenCalled()
    })

    it("leaves mimeType unset when the library_index row has none (no crash)", async () => {
        const db = makeDb({
            trackDocs: [
                { id: "t1", order: 0, setlistId: "s1", fileId: "upload-xyz", title: "Mystery" },
            ],
            libMime: { "upload-xyz": undefined }, // row exists path / absent mime
        })
        const [row] = await getTracksForSetlist(db, "s1", {})
        expect(row.mimeType).toBeUndefined()
    })

    it("falls back to audioFileId as the library_index key when fileId is absent", async () => {
        const db = makeDb({
            trackDocs: [
                { id: "t1", order: 0, setlistId: "s1", audioFileId: "upload-aud", title: "Recording" },
            ],
            libMime: { "upload-aud": "audio/mpeg" },
        })
        const [row] = await getTracksForSetlist(db, "s1", {})
        expect(row.mimeType).toBe("audio/mpeg")
    })
})

// v11.5-05-02 (F4): the same read-time pass also resolves a missing `track.key`
// from library_index so SetlistRow's key badge renders for any bonded track
// whose write path didn't stamp the key — for ALL viewers (the consumer/anon
// SSR frame), with no extra reads.
describe("getTracksForSetlist — read-time key enrichment (F4)", () => {
    it("stamps a missing key on a bonded track from library_index", async () => {
        const db = makeDb({
            trackDocs: [
                { id: "t1", order: 0, setlistId: "s1", fileId: "upload-abc", title: "Lecha Dodi", mimeType: "application/pdf" },
            ],
            libMime: {},
            libKey: { "upload-abc": "G" },
        })
        const [row] = await getTracksForSetlist(db, "s1", {})
        expect((row as { key?: string }).key).toBe("G")
    })

    it("does NOT overwrite an already-set key and performs zero reads when mime+key present", async () => {
        const getAllSpy = vi.fn()
        const db = makeDb({
            trackDocs: [
                { id: "t1", order: 0, setlistId: "s1", fileId: "upload-abc", title: "Adon Olam", mimeType: "application/pdf", key: "D" },
            ],
            libMime: { "upload-abc": "text/plain" },
            libKey: { "upload-abc": "A" }, // would mis-stamp if consulted
            getAllSpy,
        })
        const [row] = await getTracksForSetlist(db, "s1", {})
        expect((row as { key?: string }).key).toBe("D")
        expect(getAllSpy).not.toHaveBeenCalled()
    })

    it("leaves key unset when the library_index row has no key (no crash) — the live BL gap", async () => {
        const db = makeDb({
            trackDocs: [
                { id: "t1", order: 0, setlistId: "s1", fileId: "upload-bl", title: "Queen Jane Approximately", mimeType: "application/pdf" },
            ],
            libMime: {},
            libKey: { "upload-bl": undefined }, // catalog also lacks a key
        })
        const [row] = await getTracksForSetlist(db, "s1", {})
        expect((row as { key?: string }).key).toBeUndefined()
    })

    it("one library_index read fills BOTH mimeType and key for a row missing both", async () => {
        const getAllSpy = vi.fn()
        const db = makeDb({
            trackDocs: [
                { id: "t1", order: 0, setlistId: "s1", fileId: "upload-abc", title: "Mi Chamocha" },
            ],
            libMime: { "upload-abc": "text/plain" },
            libKey: { "upload-abc": "Em" },
            getAllSpy,
        })
        const [row] = await getTracksForSetlist(db, "s1", {})
        expect(row.mimeType).toBe("text/plain")
        expect((row as { key?: string }).key).toBe("Em")
        expect(getAllSpy).toHaveBeenCalledTimes(1)
    })
})
