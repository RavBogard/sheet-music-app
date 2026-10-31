// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

/**
 * TF-17 / TF-11: a failing guard for the Overlays seam. CLAUDE.md freezes the
 * setlist and track fields Overlays reads (`prepare_service_from_setlist` goes
 * through `get_setlist`). This parses that field list out of CLAUDE.md and
 * checks a built `get_setlist` result still carries every one of them, with
 * the types the contract names. Renaming or dropping a field breaks CI here
 * before it breaks Overlays.
 */

const h = vi.hoisted(() => ({
    setlistDoc: {
        name: "Shabbat Morning",
        date: "2026-11-07T00:00:00.000Z",
        eventDate: "2026-11-07T15:00:00.000Z",
        trackCount: 1,
        version: 3,
    } as Record<string, unknown>,
    tracks: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    getFirestore: () => ({
        collection: () => ({
            doc: (id: string) => ({
                get: async () => ({ exists: true, id, data: () => h.setlistDoc }),
            }),
        }),
    }),
}))
vi.mock("@/lib/server-tracks", () => ({
    getTracksForSetlist: vi.fn(async () => h.tracks),
}))
vi.mock("@/lib/server-setlists", () => ({ getAllSetlists: vi.fn(), MAX_SETLIST_FETCH: 500 }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { getSetlist } from "../tools/setlists"

/** The frozen field lists, read from the Overlays bullet in CLAUDE.md. */
function frozenFields() {
    const md = readFileSync(join(process.cwd(), "CLAUDE.md"), "utf8")
    const start = md.indexOf("Overlays reads setlists")
    const end = md.indexOf("See `docs/planning/2026-09-24-overlays-asks/`", start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const bullet = md.slice(start, end).replace(/\s+/g, " ")
    const names = (s: string) =>
        s
            .replace(/\{[^}]*\}/g, "")
            .replace(/\[\]/g, "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
    const setlist = names(/setlist `([^`]+)`/.exec(bullet)![1])
    const trackMatch = /track `([^`]+)`, `momentId`/.exec(bullet)!
    const track = [...names(trackMatch[1]), "momentId"]
    const liturgyRef = names(/liturgyRef \{([^}]*)\}/.exec(bullet)![1]).map((k) => k.replace("?", ""))
    return { setlist, track, liturgyRef }
}

describe("Overlays contract: CLAUDE.md field list against a built get_setlist", () => {
    it("parses the frozen lists out of CLAUDE.md", () => {
        const f = frozenFields()
        expect(f.setlist).toEqual(["id", "name", "date", "eventDate", "tracks"])
        expect(f.track).toEqual(expect.arrayContaining(["id", "order", "title", "type", "songId", "notes", "liturgyRef", "momentId"]))
        expect(f.liturgyRef).toEqual(["book", "folio", "unitId"])
    })

    it("a built setlist carries every frozen setlist and track field", async () => {
        h.tracks = [
            {
                id: "t1",
                order: 0,
                title: "Barechu",
                type: "song",
                songId: "song-1",
                notes: "slow",
                liturgyRef: { book: "crc-saturday", folio: 12, unitId: "barechu" },
                momentId: "bless-call",
            },
        ]
        const f = frozenFields()
        const out = (await getSetlist("u1", { id: "sl-1" }, "crc")) as Record<string, any>
        expect(out).not.toBeNull()
        for (const key of f.setlist) expect(out, `setlist.${key}`).toHaveProperty(key)
        expect(Array.isArray(out.tracks)).toBe(true)
        const track = out.tracks[0]
        for (const key of f.track) expect(track, `track.${key}`).toHaveProperty(key)
        // Types the contract names.
        expect(typeof track.id).toBe("string")
        expect(typeof track.order).toBe("number")
        expect(typeof track.title).toBe("string")
        expect(typeof track.type).toBe("string")
        expect(typeof track.songId).toBe("string")
        expect(typeof track.notes).toBe("string")
        expect(typeof track.momentId).toBe("string")
        for (const key of f.liturgyRef) expect(track.liturgyRef, `liturgyRef.${key}`).toHaveProperty(key)
        expect(typeof track.liturgyRef.folio).toBe("number")
    })

    it("an absent optional field stays present as null, never dropped", async () => {
        h.tracks = [{ id: "t2", order: 1, title: "Kaddish", type: "song" }]
        const out = (await getSetlist("u1", { id: "sl-1" }, "crc")) as Record<string, any>
        const track = out.tracks[0]
        for (const key of ["songId", "notes", "liturgyRef", "momentId"]) expect(track[key]).toBeNull()
    })
})
