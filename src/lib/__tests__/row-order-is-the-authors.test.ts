import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { liturgyRuns } from "@/components/performance/liturgy-runs"
import type { SetlistTrack } from "@/types/models"

/**
 * R11-b — ROW ORDER IS THE AUTHOR'S, AND EVERY READER SAYS THE SAME THING.
 *
 * Daniel, 2026-09-16, after a row was found out of place: nothing in `.live`
 * may sort, move, insert or delete a row on an existing setlist except an
 * explicit author action — `reorder_setlist`, a drag, `add_track`,
 * `remove_track`. Everything else reads.
 *
 * Two halves, and they fail differently:
 *
 *   1. READERS. Every surface renders stored `order`. The subtle half is the
 *      TIE: production `order` is legacy-dirty (two setlists carry duplicate
 *      values, measured 2026-09-16), and a sort on `order` alone leaves a tied
 *      pair wherever the query put it. Firestore's `orderBy("order")` appends
 *      `__name__` implicitly and `addTrack` sorts `order || id` before
 *      renumbering, so `id` is already the canonical tie-break in the places
 *      that decide; the in-memory readers match it here.
 *
 *   2. WRITERS. The binder, the moment backfill and bind-on-type carry
 *      identity onto a row and must not touch `order` at all. The one writer
 *      that may is `addTrack`, and only because inserting a row IS an author
 *      action — `propose_service_frame` reaches it through an explicit
 *      `accept`, never on a dry run.
 *
 * The writer half is asserted against the source. The write happens several
 * frames deep inside a Firestore transaction, and what actually protects a
 * setlist is that the key is not written anywhere in those modules — which is
 * a property of the text, checkable exactly, and loud when someone adds one.
 */

type TrackDoc = Record<string, unknown> & { id: string }

function dbReturning(docs: TrackDoc[]) {
    return {
        collection(name: string) {
            if (name === "tracks") {
                return {
                    where: () => ({
                        get: async () => ({
                            docs: docs.map((t) => ({ id: t.id, data: () => t })),
                        }),
                    }),
                }
            }
            if (name === "library_index") return { doc: (id: string) => ({ __libId: id }) }
            throw new Error(`unexpected collection ${name}`)
        },
        async getAll() {
            return []
        },
    } as unknown as FirebaseFirestore.Firestore
}

const row = (id: string, order: number, title = id): TrackDoc => ({
    id,
    order,
    title,
    setlistId: "s1",
    type: "song",
})

describe("R11-b readers: every surface renders stored order", () => {
    it("getTracksForSetlist returns stored order however the query returned it", async () => {
        const shuffled = [row("c", 2), row("a", 0), row("d", 3), row("b", 1)]
        const rows = await getTracksForSetlist(dbReturning(shuffled), "s1", {})
        expect(rows.map((r) => r.id)).toEqual(["a", "b", "c", "d"])
        expect(rows.map((r) => r.order)).toEqual([0, 1, 2, 3])
    })

    it("a row with no stored order sorts as 0 rather than vanishing or floating", async () => {
        const docs = [row("b", 1), { id: "a", title: "a", setlistId: "s1", type: "song" } as TrackDoc]
        const rows = await getTracksForSetlist(dbReturning(docs), "s1", {})
        expect(rows.map((r) => r.id)).toEqual(["a", "b"])
    })

    it("two rows sharing an order break the tie by id, whichever way the query returned them", async () => {
        const one = await getTracksForSetlist(dbReturning([row("y", 4), row("x", 4), row("a", 0)]), "s1", {})
        const other = await getTracksForSetlist(dbReturning([row("x", 4), row("y", 4), row("a", 0)]), "s1", {})
        expect(one.map((r) => r.id)).toEqual(["a", "x", "y"])
        expect(other.map((r) => r.id)).toEqual(one.map((r) => r.id))
    })

    it("reading twice never changes the sequence", async () => {
        const docs = [row("m", 7), row("k", 7), row("z", 1), row("b", 7)]
        const first = await getTracksForSetlist(dbReturning(docs), "s1", {})
        const second = await getTracksForSetlist(dbReturning([...docs].reverse()), "s1", {})
        expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id))
    })
})

const SRC = (rel: string) => readFileSync(resolve(process.cwd(), "src", rel), "utf8")

/** Every way a Firestore write could name the field, ignoring reads. */
const WRITES_ORDER = /(^|[^\w.])order\s*:/gm

describe("R11-b readers: Perform's fold hides rows, it never moves them", () => {
    const t = (id: string, over: Partial<SetlistTrack> = {}): SetlistTrack =>
        ({ id, title: id, order: 0, ...over }) as SetlistTrack
    const foldable = (id: string) => t(id, { fixed: true })

    it("runs are ascending, contiguous and non-overlapping, so rendering follows the array", () => {
        const tracks = [
            t("song-1", { fileId: "f1" }),
            foldable("lit-1"),
            foldable("lit-2"),
            t("song-2", { fileId: "f2" }),
            foldable("lit-3"),
        ]
        const runs = liturgyRuns(tracks)
        expect(runs.map((r) => r.indexes)).toEqual([[1, 2], [4]])
        let last = -1
        for (const run of runs) {
            expect(run.indexes[0]).toBe(run.start)
            for (const i of run.indexes) {
                expect(i).toBeGreaterThan(last)
                last = i
            }
            expect(run.indexes).toEqual(
                run.indexes.map((_, k) => run.start + k),
            )
        }
    })

    it("expanding every run reproduces the stored sequence exactly", () => {
        const tracks = [foldable("a"), t("b", { fileId: "f" }), foldable("c"), foldable("d")]
        const runs = liturgyRuns(tracks)
        const rendered: string[] = []
        let i = 0
        while (i < tracks.length) {
            const run = runs.find((r) => r.start === i)
            if (run) {
                for (const k of run.indexes) rendered.push(tracks[k].id)
                i += run.indexes.length
            } else {
                rendered.push(tracks[i].id)
                i += 1
            }
        }
        expect(rendered).toEqual(tracks.map((x) => x.id))
    })

    it("a bonded fixed row is never folded, so a chart cannot hide behind a divider", () => {
        expect(liturgyRuns([t("bound", { fixed: true, fileId: "f" })])).toEqual([])
    })
})

describe("R11-b writers: identity work never writes order", () => {
    it.each([
        ["lib/mcp/tools/liturgy-bindings.ts", "the binder"],
        ["lib/liturgy/bind-on-type.ts", "bind-on-type"],
    ])("%s (%s) contains no order write", (rel) => {
        expect(SRC(rel).match(WRITES_ORDER)).toBeNull()
    })

    it("the moment backfill reaches updateTrack with no position, so no reorder runs", () => {
        const src = SRC("lib/mcp/server-tracks-write.ts")
        // The reorder is gated on an explicit author instruction and nothing else.
        expect(src).toContain("const wantsMove = patch.position !== undefined")
        // ...and the gate is the only thing that lets the renumber loop run.
        expect(src).toMatch(/if \(wantsMove && allTracks/)
    })

    it("update_track's patch cannot carry order at all", () => {
        const schema = SRC("lib/mcp/tools/index.ts")
        const patch = /update_track[\s\S]{0,4000}?patch[\s\S]{0,4000}?\}/.exec(schema)?.[0] ?? ""
        expect(patch).not.toMatch(/(^|[^\w.])order\s*:/m)
    })

    it("propose_service_frame writes order only by adding a row, and only off a dry run", () => {
        const src = SRC("lib/mcp/tools/service-frame.ts")
        // The module has no Firestore write of its own — every mutation goes
        // through addTrack, which is the author-action path. The only `order`
        // it names is the one addTrack hands back for the row just inserted,
        // reported to the caller and never assigned.
        expect(src).toContain("const { trackId, order } = await addTrack(db, {")
        expect(src).not.toMatch(/tx\.(set|update|delete)\(|\.doc\([^)]*\)\.(set|update)\(/)
        // Everything past the dry-run return is the accept path.
        expect(src).toContain("if (dryRun) return result")
        expect(src.indexOf("if (dryRun) return result")).toBeLessThan(src.indexOf("await addTrack(db, {"))
    })

    it("the today.json emitter asks Firestore for stored order", () => {
        expect(SRC("lib/today/emit-today.ts")).toContain('.orderBy("order", "asc")')
    })
})
