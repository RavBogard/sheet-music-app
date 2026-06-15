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
    getAllSpy?: (ids: string[]) => void
}) {
    const { trackDocs, libMime, getAllSpy } = opts
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
                return {
                    exists: m !== undefined,
                    data: () => (m !== undefined ? { mimeType: m } : undefined),
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

    it("does NOT overwrite an already-stamped mimeType and performs zero reads", async () => {
        const getAllSpy = vi.fn()
        const db = makeDb({
            trackDocs: [
                { id: "t1", order: 0, setlistId: "s1", fileId: "upload-abc", mimeType: "application/pdf", title: "Hava Nagila" },
            ],
            libMime: { "upload-abc": "text/plain" }, // would mis-stamp if consulted
            getAllSpy,
        })
        const [row] = await getTracksForSetlist(db, "s1", {})
        expect(row.mimeType).toBe("application/pdf")
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
