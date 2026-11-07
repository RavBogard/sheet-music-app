import { describe, expect, it } from "vitest"

import type { HistorySetlist, HistoryTrack, LibraryLite } from "@/lib/history/song-history"
import { slotKeyFor, titleSlotStem } from "../keys"
import { applyPins, parsePins, type ProfilePin } from "../pins"
import { buildReadback } from "../readback"
import { seedProfile } from "../seed"
import { buildSlotUses, chartMomentsOf, partGroupLookup } from "../slot-uses"

/**
 * Service profile fixes (Daniel 2026-11-07): tag-based membership, count on
 * save, slots by moment then chart (never by row title), and pinned rows.
 * The fixtures follow the shape of CRC's B'nei Mitzvah history: one Ma Tovu
 * chart and one Oseh Shalom chart under a different row title every week.
 */

const BM = { serviceType: "bnei_mitzvah_saturday", rabbiSlot: null }

let n = 0
function track(t: Partial<HistoryTrack> & { title: string }): HistoryTrack {
    n += 1
    return {
        id: `t${n}`,
        order: n,
        type: "song",
        fileId: null,
        fileName: null,
        key: null,
        leadMusician: null,
        notes: null,
        momentId: null,
        ...t,
    }
}

function setlist(id: string, date: string, tracks: HistoryTrack[], extra: Partial<HistorySetlist> = {}): HistorySetlist {
    return {
        id,
        name: `Service ${date}`,
        eventDate: `${date}T15:00:00.000Z`,
        templateType: null,
        rabbi: null,
        serviceType: "bnei_mitzvah_saturday",
        rabbiSlot: null,
        special: false,
        book: null,
        ownerName: null,
        isTest: false,
        tracks,
        ...extra,
    }
}

const library = new Map<string, LibraryLite>(
    (
        [
            ["matovu", "Ma tovu_Hinei ma tov - trad.pdf", null],
            ["oseh-nava", "Oseh Shalom (Nava Tehila)", "pg-oseh-nava"],
            ["oseh-camp", "Oseh shalom (camp).pdf", null],
            ["simantov", "Simon Tov", null],
            ["barchu", "Barchu (Walkdown)", "pg-barchu"],
            ["adon", "Adon Olam", null],
        ] as Array<[string, string, string | null]>
    ).map(([fileId, name, partGroup]) => [fileId, { fileId, name, key: null, setting: null, partGroup }]),
)

const MA_TOVU_TITLES = ["Ma Tovu > Hinei Ma Tov", "Mah Tovu / Hineh Mah Tov", "Ma tovu / Hinei ma tov", "Ma Tovu / Hinei Ma Tov", "Ma tovu / Hinei ma tov "]
const OSEH_TITLES = ["Oseh Shalom (Nava Tehila)", "Silent Prayer -- Oseh Shalom (Nava Tehila)", "Oseh shalom - Nava tehila", "Oseh Shalom", "Oseh shalom - Nava tehila"]

/** Five B'nei Mitzvah services, newest first, each with a different opener and header layout. */
function bmHistory(): HistorySetlist[] {
    return [0, 1, 2, 3, 4].map((i) => {
        const date = `2026-${String(10 - i).padStart(2, "0")}-10`
        const rows: HistoryTrack[] = []
        if (i % 2 === 0) rows.push(track({ title: "Intro", type: "header" }))
        rows.push(track({ title: `Opener ${i}` }))
        rows.push(track({ title: MA_TOVU_TITLES[i], fileId: "matovu", key: "Cm" }))
        if (i === 1) rows.push(track({ title: "Morning blessings", type: "reading" }))
        rows.push(track({ title: "Barchu", fileId: "barchu", key: "Dm" }))
        rows.push(track({ title: OSEH_TITLES[i], fileId: "oseh-nava", key: "Dm" }))
        rows.push(track({ title: "Torah Service", type: "header" }))
        rows.push(track({ title: "Siman Tov", fileId: "simantov" }))
        return setlist(`bm${i}`, date, rows)
    })
}

function songTitles(tracks: Array<{ type: string; title: string }>): string[] {
    return tracks.filter((t) => t.type === "song").map((t) => t.title)
}

describe("slots: by moment, then chart, never by row title", () => {
    it("normalises a title only as a last resort", () => {
        const stems = new Set(["Ma tovu / Hinei ma tov ", "Ma Tovu > Hinei Ma Tov", "Ma tovu_Hinei ma tov - trad", "Ma Tovu / Hinei Ma Tov.pdf"].map(titleSlotStem))
        expect(stems.size).toBe(1)
        const partGroupOf = partGroupLookup(library)
        // With a chart, the chart decides, whatever the title says.
        expect(slotKeyFor({ title: "Anything at all", fileId: "matovu" }, partGroupOf)).toBe("song:matovu")
        expect(slotKeyFor({ title: "Oseh shalom - Nava tehila", fileId: "oseh-nava" }, partGroupOf)).toBe("song:pg-oseh-nava")
    })

    it("a chart played at one moment shares that moment's slot, so a standard set on either row fills both", () => {
        const history = [
            setlist("a", "2026-10-03", [track({ title: "Bar'chu (Siegel)", fileId: "barchu" })]),
            setlist("b", "2026-10-10", [track({ title: "Call to prayer", fileId: "barchu" })]),
        ]
        const partGroupOf = partGroupLookup(library)
        const momentOfChart = chartMomentsOf(history, partGroupOf)
        expect(momentOfChart("pg-barchu")).toBe("barchu")
        expect(slotKeyFor({ title: "Call to prayer", fileId: "barchu" }, partGroupOf, { momentOfChart })).toBe("moment:barchu")
        const index = buildSlotUses(history, library, { serviceType: "bnei_mitzvah_saturday", rabbiSlot: null })
        expect(index.slotKeyOf({ title: "Call to prayer", fileId: "barchu" })).toBe("moment:barchu")
        expect(index.profileUses("moment:barchu")).toHaveLength(2)
    })

    it("Brothers Lazaroff keeps song slots by chart", () => {
        const partGroupOf = partGroupLookup(library)
        expect(slotKeyFor({ title: "Barchu", fileId: "barchu" }, partGroupOf, { byTitle: false })).toBe("song:pg-barchu")
    })
})

describe("the learned order", () => {
    it("learns Ma Tovu and Oseh Shalom whatever their row titles and neighbours", () => {
        const seed = seedProfile(BM, bmHistory(), library, new Date("2026-11-07T12:00:00Z"))
        const songs = seed.tracks.filter((t) => t.type === "song")
        const matovu = songs.find((t) => t.fileId === "matovu")
        const oseh = songs.find((t) => t.fileId === "oseh-nava")
        expect(matovu).toMatchObject({ slotKey: "song:matovu", key: "Cm", house: { count: 5, of: 5 } })
        expect(oseh).toMatchObject({ slotKey: "song:pg-oseh-nava", key: "Dm", house: { count: 5, of: 5 } })
        // One row each, in the order the services gave them.
        expect(songs.filter((t) => t.fileId === "matovu")).toHaveLength(1)
        const order = songTitles(seed.tracks)
        expect(order.indexOf(matovu!.title)).toBeLessThan(order.indexOf(oseh!.title))
    })

    it("two charts that take turns in one place are one row, said by the newest", () => {
        const services = [0, 1, 2, 3].map((i) =>
            setlist(`alt${i}`, `2026-10-${String(30 - i * 7).padStart(2, "0")}`, [
                track({ title: "Barchu", fileId: "barchu" }),
                track({ title: "Oseh Shalom", fileId: i % 2 === 0 ? "oseh-camp" : "oseh-nava" }),
                track({ title: "Siman Tov", fileId: "simantov" }),
            ]),
        )
        const seed = seedProfile(BM, services, library, new Date("2026-11-07T12:00:00Z"))
        const songs = seed.tracks.filter((t) => t.type === "song")
        expect(songs).toHaveLength(3)
        expect(songs[1]).toMatchObject({ slotKind: "open", slotKey: "song:oseh-camp" })
        expect(seed.dropped ?? []).toEqual([])
    })

    it("a different song in a kept row's place one week never takes the row", () => {
        const services = [0, 1, 2, 3, 4].map((i) =>
            setlist(`hk${i}`, `2026-10-${String(30 - i * 6).padStart(2, "0")}`, [
                track({ title: i === 0 ? "Torah Service" : "TORAH SERVICE — Rabbi takes over", type: i % 2 ? "section" : "header" }),
                i === 0 ? track({ title: "Russian Sher No 3", fileId: "simantov" }) : track({ title: "Hakafah — Mizmor Shiru Ladonai", fileId: "adon" }),
            ]),
        )
        const seed = seedProfile(BM, services, library, new Date("2026-11-07T12:00:00Z"))
        expect(seed.tracks.map((t) => t.title)).toEqual(["Torah Service", "Hakafah — Mizmor Shiru Ladonai"])
        expect(seed.tracks[1]).toMatchObject({ fileId: "adon", house: { count: 4, of: 4 } })
        expect(seed.dropped).toEqual([{ label: "Russian Sher No 3", count: 1, of: 5 }])
    })

    it("learns only from setlists tagged with the profile's type", () => {
        const history = [
            ...bmHistory(),
            // An adult's B'nei Mitzvah, an untagged one and a Shabbat morning never feed the youth profile.
            setlist("adult", "2026-11-01", [track({ title: "Adon Olam", fileId: "adon" })], { serviceType: "adult_bnei_mitzvah" }),
            setlist("untagged", "2026-11-02", [track({ title: "Adon Olam", fileId: "adon" })], { serviceType: null, special: true }),
            setlist("sat", "2026-11-03", [track({ title: "Adon Olam", fileId: "adon" })], { serviceType: "shabbat_morning" }),
        ]
        const seed = seedProfile(BM, history, library, new Date("2026-11-07T12:00:00Z"))
        const ids = seed.learnedFrom!.setlists.map((s) => s.setlistId)
        expect(ids).not.toContain("adult")
        expect(ids).not.toContain("untagged")
        expect(ids).not.toContain("sat")
        const adult = seedProfile({ serviceType: "adult_bnei_mitzvah", rabbiSlot: null }, history, library)
        expect(adult.learnedFrom!.setlists.map((s) => s.setlistId)).toEqual(["adult"])
    })

    it("Shir Shabbat and Shir Keter never feed Friday night", () => {
        const fri = { serviceType: "friday_night", rabbiSlot: "daniel_karen" as const }
        const history = [
            setlist("ss", "2026-11-06", [track({ title: "Barchu", fileId: "barchu" })], { serviceType: "shir_shabbat", rabbiSlot: null }),
            setlist("sk", "2026-10-16", [track({ title: "Barchu", fileId: "barchu" })], { serviceType: "shir_keter", rabbiSlot: null }),
            setlist("fn", "2026-10-09", [track({ title: "Barchu", fileId: "barchu" })], { serviceType: "friday_night", rabbiSlot: "daniel_karen" }),
        ]
        expect(seedProfile(fri, history, library).learnedFrom!.setlists.map((s) => s.setlistId)).toEqual(["fn"])
        expect(seedProfile({ serviceType: "shir_keter", rabbiSlot: null }, history, library).learnedFrom!.setlists.map((s) => s.setlistId)).toEqual(["sk"])
    })

    it("counts a setlist as soon as it is saved, whatever its date", () => {
        const today = setlist("today", "2026-11-07", [track({ title: "Ma Tovu", fileId: "matovu" })])
        const later = setlist("later", "2026-11-21", [track({ title: "Ma Tovu", fileId: "matovu" })])
        const seed = seedProfile(BM, [later, today, ...bmHistory()], library, new Date("2026-11-07T09:00:00Z"))
        expect(seed.learnedFrom!.setlists.map((s) => s.setlistId).slice(0, 2)).toEqual(["later", "today"])
        // Only the setlists already on the date being drafted are left out.
        const draft = seedProfile(BM, [later, today, ...bmHistory()], library, new Date(), { excludeIds: ["later"] })
        expect(draft.learnedFrom!.setlists[0].setlistId).toBe("today")
    })
})

function pin(over: Partial<ProfilePin> & { title: string }): ProfilePin {
    return { id: over.title, type: "song", slotKey: null, by: "u", byName: "Daniel", at: "2026-11-07T00:00:00Z", ...over }
}

describe("pinned rows", () => {
    const learned = (): Record<string, unknown>[] => [
        { type: "header", title: "Intro" },
        { type: "song", title: "Ma Tovu > Hinei Ma Tov", slotKey: "song:matovu", fileId: "matovu" },
        { type: "song", title: "Bar'chu", slotKey: "moment:barchu", fileId: "barchu" },
        { type: "header", title: "Torah Service" },
        { type: "song", title: "Siman Tov", slotKey: "song:simantov", fileId: "simantov" },
    ]
    const slotOf = (row: Record<string, unknown>) => (typeof row.slotKey === "string" ? row.slotKey : null)

    it("adds a pinned row the history left out, in its place", () => {
        const pins = [
            pin({ title: "Hakafah", slotKey: "song:hakafah", after: "Torah Service" }),
            pin({ title: "Adon Olam", slotKey: "moment:adon-olam" }),
        ]
        const { tracks, notices } = applyPins(learned(), pins, slotOf)
        expect(tracks.map((t) => t.title)).toEqual(["Intro", "Ma Tovu > Hinei Ma Tov", "Bar'chu", "Torah Service", "Hakafah", "Siman Tov", "Adon Olam"])
        expect(tracks.filter((t) => t.pinned).map((t) => t.title)).toEqual(["Hakafah", "Adon Olam"])
        expect(notices).toEqual([])
    })

    it("moves a learned row rather than doubling it, matched by slot, chart or name", () => {
        const { tracks } = applyPins(learned(), [pin({ title: "Ma Tovu", slotKey: "song:matovu", position: 1 })], slotOf)
        expect(tracks.map((t) => t.title)).toEqual(["Ma Tovu > Hinei Ma Tov", "Intro", "Bar'chu", "Torah Service", "Siman Tov"])
        expect(tracks[0]).toMatchObject({ pinned: true, fileId: "matovu" })
        const byName = applyPins(learned(), [pin({ title: "Siman Tov" })], slotOf).tracks
        expect(byName.filter((t) => t.title === "Siman Tov")).toHaveLength(1)
        expect(byName.find((t) => t.title === "Siman Tov")).toMatchObject({ pinned: true })
    })

    it("places a pin whose anchor is missing last, and says so", () => {
        const { tracks, notices } = applyPins(learned(), [pin({ title: "Hakafah", after: "Hallel" })], slotOf)
        expect(tracks[tracks.length - 1].title).toBe("Hakafah")
        expect(notices[0]).toMatch(/Hakafah.*Hallel/)
    })

    it("parses stored pins and drops malformed ones", () => {
        expect(parsePins([{ id: "a", title: "Ma Tovu", position: 0 }, { title: "no id" }, null]).map((p) => [p.id, p.position])).toEqual([["a", null]])
    })

    it("the readback says when a pinned row has no chart", () => {
        const rb = buildReadback({
            profileLabel: "B'nei Mitzvah",
            date: "2026-11-14",
            book: null,
            special: false,
            rows: [
                { index: 0, label: "Hakafah", isSong: true, hasChart: false, tier: "new", phrase: "new — which chart?", keyOnRecord: false, pinned: true },
                { index: 1, label: "Barchu", isSong: true, hasChart: true, tier: "usual", phrase: "the usual Barchu in Dm", keyOnRecord: true },
            ],
            openItems: [],
            now: new Date("2026-11-07T00:00:00Z"),
        })
        expect(rb.exceptions).toEqual([{ kind: "pinned", index: 0, text: "Hakafah: pinned, no chart" }])
    })
})
