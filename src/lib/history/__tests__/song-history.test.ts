import { describe, it, expect } from "vitest"
import {
    buildSongHistory,
    historyStem,
    songSkeleton,
    spellingVariants,
    type HistorySetlist,
    type HistoryTrack,
    type LibraryLite,
} from "../song-history"
import { classifyService } from "../classify"

let trackSeq = 0
function track(p: Partial<HistoryTrack>): HistoryTrack {
    trackSeq += 1
    return {
        id: `t${trackSeq}`,
        order: trackSeq,
        type: "song",
        title: "Mi Chamocha",
        fileId: null,
        fileName: null,
        key: null,
        leadMusician: null,
        notes: null,
        momentId: null,
        ...p,
    }
}

function setlist(p: Partial<HistorySetlist> & { id: string }): HistorySetlist {
    const base = {
        name: "Shabbat Morning",
        eventDate: null,
        templateType: "shabbat_morning",
        rabbi: "Randy Fleisher",
        book: null,
        ownerName: "Daniel",
        isTest: false,
        tracks: [],
        ...p,
    }
    // The loader fills the class; a fixture infers it unless given.
    const cls = classifyService({ name: base.name, templateType: base.templateType, rabbi: base.rabbi })
    return {
        serviceType: cls.serviceType,
        rabbiSlot: cls.rabbiSlot,
        special: cls.special,
        ...base,
    }
}

function lib(rows: LibraryLite[]): Map<string, LibraryLite> {
    return new Map(rows.map((r) => [r.fileId, r]))
}

const LIBRARY = lib([
    { fileId: "f1", name: "Mi Chamocha (Moshav)", key: "Dm", setting: "Moshav", partGroup: "mi chamocha moshav" },
    { fileId: "f2", name: "Mi Chamocha (Friedman)", key: null, setting: "Friedman", partGroup: "mi chamocha friedman" },
])

const S1_HEADER = track({ type: "header", title: "Mi Chamocha" })
const S1_PRAYER = track({ type: "prayer", title: "Mi Chamocha" })

const FIXTURE: HistorySetlist[] = [
    setlist({
        id: "s1",
        name: "Shabbat Morning — Sep 5",
        eventDate: "2026-09-05T15:00:00.000Z",
        tracks: [
            S1_HEADER,
            S1_PRAYER,
            track({ title: "Mi Chamocha", fileId: "f1", key: "Dm", leadMusician: "Rachel" }),
            track({ title: "Shema", fileId: null }),
        ],
    }),
    setlist({
        id: "s2",
        name: "Shabbat Morning — Sep 12",
        eventDate: "2026-09-12T15:00:00.000Z",
        tracks: [track({ title: "Mi Chamocha (Moshav)", fileId: "f1", key: "Em" })],
    }),
    setlist({
        id: "s3",
        name: "Shabbat Morning — Sep 19",
        eventDate: "2026-09-19T15:00:00.000Z",
        tracks: [track({ title: "mi chamocha", fileId: "f2", key: "Dm" })],
    }),
    setlist({
        id: "s3-bb",
        name: "Shabbat Morning — Sep 19 · Bb",
        eventDate: "2026-09-19T15:00:00.000Z",
        tracks: [track({ title: "mi chamocha", fileId: "f2", key: "Dm" })],
    }),
    setlist({
        id: "s5",
        name: "David Sterneck Memorial Bar Mitzvah — Oct 31",
        eventDate: "2026-10-31T15:00:00.000Z",
        templateType: "bnei_mitzvah_saturday",
        tracks: [track({ title: "Mi Chamocha", fileId: "f1", key: null })],
    }),
    setlist({
        id: "s6",
        name: "Shabbat Morning (copy)",
        eventDate: null,
        tracks: [track({ title: "Mi Chamocha", fileId: "f1", key: "Dm" })],
    }),
    setlist({
        id: "s7",
        name: "[TEST] Shabbat Morning",
        eventDate: "2026-09-26T15:00:00.000Z",
        isTest: true,
        tracks: [track({ title: "Mi Chamocha", fileId: "f1", key: "Dm" })],
    }),
]

describe("historyStem / songSkeleton", () => {
    it("drops a trailing pdf token", () => {
        expect(historyStem("Shema pdf")).toBe(historyStem("Shema"))
    })

    it.each([
        [["Sh'ma", "Shema", "Shema pdf"]],
        [["Bar'chu", "Barchu", "Barchu (Friedman)"]],
        [["Adonai S'fatai (trad)", "Adonai s_fatai (chant)"]],
    ])("spelling variants share a skeleton: %j", (titles) => {
        const skeletons = new Set(titles.map((t) => songSkeleton(historyStem(t))))
        expect(skeletons.size).toBe(1)
    })

    it("keeps different songs apart", () => {
        expect(songSkeleton(historyStem("Sim Shalom"))).not.toBe(
            songSkeleton(historyStem("Shalom Rav")),
        )
    })

    it.each([
        [["Sh'ma", "Shema", "Shema pdf"]],
        [["Bar'chu", "Barchu", "Barchu (Friedman)"]],
        [["Adonai S'fatai (trad)", "Adonai s_fatai (chant)"]],
    ])("spelling variants match: %j", (titles) => {
        const [first, ...rest] = titles.map(historyStem)
        for (const t of rest) expect(spellingVariants(first, t), t).toBe(true)
    })

    it.each([
        ["Kaddish", "Kiddush"],
        ["Kadosh", "Kedusha"],
        ["Sim Shalom", "Shalom Rav"],
    ])("%s and %s are different songs", (a, b) => {
        expect(spellingVariants(historyStem(a), historyStem(b))).toBe(false)
    })
})

describe("buildSongHistory", () => {
    it("returns dated, non-test, non-part song rows, newest first", () => {
        const r = buildSongHistory(FIXTURE, LIBRARY, { title: "Mi Chamocha" })
        expect(r.entries.map((e) => e.setlistId)).toEqual(["s5", "s3", "s2", "s1"])
        expect(r.total).toBe(4)
    })

    it("carries chart, setting and both keys", () => {
        const r = buildSongHistory(FIXTURE, LIBRARY, { title: "Mi Chamocha" })
        const s1 = r.entries.find((e) => e.setlistId === "s1")!
        expect(s1).toMatchObject({
            fileId: "f1",
            chartName: "Mi Chamocha (Moshav)",
            chartInLibrary: true,
            setting: "Moshav",
            playedKey: "Dm",
            writtenKey: "Dm",
            leadMusician: "Rachel",
            serviceType: "shabbat_morning",
            rabbiSlot: "randy",
            special: false,
            author: "Daniel",
        })
    })

    it("tallies charts by use, with played-key counts", () => {
        const r = buildSongHistory(FIXTURE, LIBRARY, { title: "Mi Chamocha" })
        expect(r.byChart[0]).toEqual({
            fileId: "f1",
            chartName: "Mi Chamocha (Moshav)",
            count: 3,
            keys: { Dm: 1, Em: 1, "": 1 },
            lastUsed: "2026-10-31T15:00:00.000Z",
        })
        expect(r.byChart[1]).toMatchObject({ fileId: "f2", count: 1 })
    })

    it("applies limit after counting", () => {
        const r = buildSongHistory(FIXTURE, LIBRARY, { title: "Mi Chamocha", limit: 2 })
        expect(r.entries).toHaveLength(2)
        expect(r.total).toBe(4)
        expect(r.byChart[0].count).toBe(3)
    })

    it("can leave out special services", () => {
        const r = buildSongHistory(FIXTURE, LIBRARY, { title: "Mi Chamocha", includeSpecial: false })
        expect(r.entries.map((e) => e.setlistId)).not.toContain("s5")
        expect(r.total).toBe(3)
    })

    it("filters by service type and rabbi slot", () => {
        const withDaniel = [
            ...FIXTURE,
            setlist({
                id: "s8",
                name: "Shabbat Morning — Oct 3",
                eventDate: "2026-10-03T15:00:00.000Z",
                rabbi: "Daniel Bogard",
                tracks: [track({ title: "Mi Chamocha", fileId: "f1" })],
            }),
        ]
        const r = buildSongHistory(withDaniel, LIBRARY, {
            title: "Mi Chamocha",
            serviceType: "shabbat_morning",
            rabbiSlot: "randy",
        })
        expect(r.entries.map((e) => e.setlistId)).toEqual(["s3", "s2", "s1"])
    })

    it("keeps a row whose chart is gone from the library", () => {
        const sets = [
            setlist({
                id: "g1",
                eventDate: "2026-09-05T15:00:00.000Z",
                tracks: [track({ title: "Mi Chamocha", fileId: "gone", fileName: "Mi Chamocha old.pdf" })],
            }),
        ]
        const r = buildSongHistory(sets, LIBRARY, { title: "Mi Chamocha" })
        expect(r.entries).toHaveLength(1)
        expect(r.entries[0]).toMatchObject({
            fileId: "gone",
            chartInLibrary: false,
            chartName: "Mi Chamocha old.pdf",
            setting: null,
            writtenKey: null,
        })
    })

    it("gives an unbound row no chart name", () => {
        const sets = [
            setlist({
                id: "u1",
                eventDate: "2026-09-05T15:00:00.000Z",
                tracks: [track({ title: "Mi Chamocha", fileId: null, fileName: null })],
            }),
        ]
        const r = buildSongHistory(sets, LIBRARY, { title: "Mi Chamocha" })
        expect(r.entries[0]).toMatchObject({ fileId: null, chartName: null, chartInLibrary: false })
    })

    it("matches by fileId whatever the title, and across a part group", () => {
        const library = lib([
            ...LIBRARY.values(),
            { fileId: "f1-bb", name: "Mi Chamocha (Moshav) Bb", key: null, setting: "Moshav", partGroup: "mi chamocha moshav" },
        ])
        const sets = [
            setlist({
                id: "p1",
                eventDate: "2026-09-05T15:00:00.000Z",
                tracks: [
                    track({ title: "Who is like you", fileId: "f1" }),
                    track({ title: "Horn part", fileId: "f1-bb" }),
                    track({ title: "Mi Chamocha", fileId: "f2" }),
                ],
            }),
        ]
        const r = buildSongHistory(sets, library, { fileId: "f1" })
        expect(r.entries.map((e) => e.fileId).sort()).toEqual(["f1", "f1-bb"])
    })

    it("a Kiddush query does not return Kaddish", () => {
        const sets = [
            setlist({
                id: "k1",
                eventDate: "2026-09-05T15:00:00.000Z",
                tracks: [track({ title: "Kaddish" }), track({ title: "Kiddush" }), track({ title: "Kedusha" })],
            }),
        ]
        const r = buildSongHistory(sets, LIBRARY, { title: "Kiddush" })
        expect(r.entries.map((e) => e.title)).toEqual(["Kiddush"])
    })

    it("only ever returns song rows", () => {
        const r = buildSongHistory(FIXTURE, LIBRARY, { title: "Mi Chamocha" })
        const ids = r.entries.map((e) => e.trackId)
        expect(ids).not.toContain(S1_HEADER.id)
        expect(ids).not.toContain(S1_PRAYER.id)
    })
})
