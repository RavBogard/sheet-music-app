import { describe, expect, it } from "vitest"

import { classifyService } from "@/lib/history/classify"
import { deviationsBySetlist, overlayPerformed } from "@/lib/history/performed-overlay"
import type { HistorySetlist, HistoryTrack, LibraryLite } from "@/lib/history/song-history"
import type { Deviation } from "@/lib/performance/tonight"
import { applyChoices, buildDraftRows, filledNoteFor, type ChartInfo } from "../draft"
import { buildReadback, settingOf, stripTrailingDate, type ReadbackRow } from "../readback"
import { modalOrder, seedProfile } from "../seed"
import { buildSlotUses } from "../slot-uses"
import { computeSlotTier, type SlotUse } from "../tiers"
import { vsLastOf } from "../vs-last"

/**
 * Bet 1 — the service memory rebuild. Pure behaviour: learned order, moment
 * slots, part collapse, fill-it-but-say-it, recall, vsLast, voice readback,
 * history as performed.
 */

const DANIEL_SAT = { serviceType: "shabbat_morning", rabbiSlot: "daniel_karen" as const }

function track(order: number, t: Partial<HistoryTrack> & { title: string }): HistoryTrack {
    return {
        id: `t${order}-${t.title}`,
        order,
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
        name: `Shabbat Morning ${date}`,
        eventDate: `${date}T15:00:00.000Z`,
        templateType: "shabbat_morning",
        rabbi: null,
        serviceType: DANIEL_SAT.serviceType,
        rabbiSlot: DANIEL_SAT.rabbiSlot,
        special: false,
        book: null,
        ownerName: null,
        isTest: false,
        tracks,
        ...extra,
    }
}

function lib(rows: Array<[string, string, string, string?]>): Map<string, LibraryLite> {
    return new Map(
        rows.map(([fileId, name, partGroup, setting]) => [fileId, { fileId, name, key: null, setting: setting ?? null, partGroup }]),
    )
}

const library = lib([
    ["mi-moshav", "Mi chamocha (Moshav) morning.pdf", "pg-mi-moshav", "Moshav"],
    ["mi-ana", "Mi Chamocha Ana B'Koach.pdf", "pg-mi-ana"],
    ["mi-68", "Mi Chamocha 6-8.pdf", "pg-mi-68"],
    ["barchu", "Barchu (Walkdown)", "pg-barchu"],
    ["fiddle", "Fiddley Tune", "pg-fiddle"],
    ["sa-piano", "Shalom Aleichem Greg Dallas Piano", "pg-sa-piano"],
    ["sa-lyrics", "Shalom Aleichem Lyrics", "pg-sa-lyrics"],
])

const head = (o: number) => track(o, { title: "Shacharit", type: "header" })
const barchu = (o: number) => track(o, { title: "Barchu", fileId: "barchu", key: "Dm" })
const mi = (o: number, fileId: string, title: string, key = "E") => track(o, { title, fileId, key })

describe("modalOrder", () => {
    it("keeps what most services agree on, in the order most of them use", () => {
        const order = modalOrder([
            ["a", "c", "b", "x"], // newest: c before b; x once
            ["a", "b", "c"],
            ["a", "b", "c", "d"],
            ["a", "b", "d"],
            ["a", "b", "c"],
        ])
        // d is in 2 of 5, x in 1: left out. b before c in 4 of 5.
        expect(order).toEqual(["a", "b", "c"])
    })

    it("one service is its own order", () => {
        expect(modalOrder([["h", "s1", "s2"]])).toEqual(["h", "s1", "s2"])
    })

    it("with fewer than 3 services that differ, the newest one is the order (no union)", () => {
        expect(modalOrder([["a", "b", "c"], ["a", "x", "y", "z"]])).toEqual(["a", "b", "c"])
    })
})

describe("learned order with only 2 regular services", () => {
    it("is the most recent service's rows, not both services' rows together", () => {
        const two = [
            setlist("n", "2026-10-17", [head(0), barchu(1)]),
            setlist("o", "2026-10-10", [head(0), track(1, { title: "Fiddley Tune", fileId: "fiddle" }), mi(2, "mi-ana", "Mi Chamocha 6-8")]),
        ]
        const r = seedProfile(DANIEL_SAT, two, library, new Date("2026-11-01T00:00:00Z"), { before: "2026-11-07" })
        expect(r.learnedFrom?.count).toBe(2)
        expect(r.tracks).toHaveLength(2)
        expect(r.tracks.map((t) => t.title).join("|")).not.toMatch(/Fiddley|Mi Chamocha/i)
    })
})

describe("learned profile (MCP-02, -03, -14)", () => {
    const history = [
        // A special week is never learned from, however recent.
        setlist("special", "2026-10-31", [head(0), track(1, { title: "Camp song", fileId: "fiddle" })], { special: true }),
        // A Bat Mitzvah is its own service type now, so it never feeds the regular profile.
        setlist("bm", "2026-10-24", [head(0), track(1, { title: "Fiddley Tune", fileId: "fiddle" })], {
            serviceType: "bnei_mitzvah_saturday",
            rabbiSlot: null,
            name: "Eliana Bat Mitzvah",
        }),
        setlist("s1", "2026-10-17", [head(0), barchu(1), mi(2, "mi-ana", "Mi Chamocha 6-8")]),
        setlist("s2", "2026-10-10", [head(0), barchu(1), mi(2, "mi-moshav", "Mi chamocha (Moshav) morning.pdf")]),
        setlist("s3", "2026-10-03", [head(0), mi(1, "mi-moshav", "Mi Chamocha (Moshav)"), barchu(2)]),
        setlist("s4", "2026-09-26", [head(0), barchu(1), mi(2, "mi-moshav", "Mi Chamocha (Moshav)")]),
        setlist("s5", "2026-09-19", [head(0), barchu(1), mi(2, "mi-68", "Mi Chamocha 6-8")]),
        setlist("s6-old", "2026-09-12", [head(0), track(1, { title: "Fiddley Tune", fileId: "fiddle" })]),
    ]
    const seed = seedProfile(DANIEL_SAT, history, library, new Date("2026-11-01T00:00:00Z"), { before: "2026-11-07" })

    it("learns from the last 5 regular services only", () => {
        expect(seed.learnedFrom?.setlists.map((s) => s.setlistId)).toEqual(["s1", "s2", "s3", "s4", "s5"])
        expect(seed.basedOn?.setlistId).toBe("s1")
    })

    it("every Mi Chamocha setting is ONE moment slot, filled with the usual and flagged as differing", () => {
        expect(seed.tracks.map((t) => t.title)).toEqual(["Shacharit", "Bar’chu", "Mi Chamocha"])
        const miRow = seed.tracks[2]
        expect(miRow).toMatchObject({ slotKey: "moment:mi-chamocha", fileId: "mi-moshav", key: "E" })
        const index = buildSlotUses(history, library, { ...DANIEL_SAT, before: "2026-11-07" })
        const tier = computeSlotTier({ profileUses: index.profileUses("moment:mi-chamocha"), otherUses: [] })
        expect(tier.differsFromLast?.date.slice(0, 10)).toBe("2026-10-17")
    })

    it("a slot with a different song every week keeps its place and is drafted open (positional slot)", () => {
        const songs = ["Hinei Ma Tov", "Fiddley Tune", "Oseh Shalom", "Lo Yisa Goy", "Am Yisrael Chai"]
        const rotating = songs.map((title, i) =>
            setlist(`r${i}`, `2026-10-${String(17 - i * 7 + 14).padStart(2, "0")}`, [
                track(0, { title, fileId: `f-${i}` }),
                head(1),
                barchu(2),
            ]),
        )
        const s = seedProfile(DANIEL_SAT, rotating, library, new Date("2026-11-01T00:00:00Z"))
        expect(s.tracks.map((t) => [t.title, t.slotKind ?? null])).toEqual([
            ["Opening song", "open"],
            ["Shacharit", null],
            ["Bar’chu", "moment"], // usual: the same chart every week
        ])
        expect(s.tracks[0].fileId).toBeUndefined()
        expect(s.dropped).toBeUndefined()
    })

    it("a row of the latest service left out of the order is reported as dropped", () => {
        const sets = [
            setlist("d1", "2026-10-17", [head(0), barchu(1), track(2, { title: "Guest song", type: "note" })]),
            setlist("d2", "2026-10-10", [head(0), barchu(1)]),
            setlist("d3", "2026-10-03", [head(0), barchu(1)]),
        ]
        const s = seedProfile(DANIEL_SAT, sets, library)
        expect(s.dropped).toEqual([{ label: "Guest song", count: 1, of: 3 }])
    })

    it("collapses a song's piano and lyrics rows into one slot with its parts", () => {
        const two = [
            setlist("p1", "2026-10-16", [
                track(0, { title: "Shalom Aleichem - Greg Dallas Piano", fileId: "sa-piano" }),
                track(1, { title: "Shalom Aleichem Lyrics", fileId: "sa-lyrics" }),
            ], { serviceType: "shir_shabbat", rabbiSlot: null }),
        ]
        const s = seedProfile({ serviceType: "shir_shabbat", rabbiSlot: null }, two, library)
        expect(s.tracks).toHaveLength(1)
        expect(s.tracks[0].parts?.map((p) => p.fileId)).toEqual(["sa-piano", "sa-lyrics"])
    })
})

describe("Havdalah B'nei Mitzvah is its own preset", () => {
    it("a Havdalah Bat Mitzvah name classifies to havdalah_bnei_mitzvah", () => {
        expect(classifyService({ name: "Noa Bat Mitzvah Havdalah", serviceType: "shabbat_morning" }).serviceType).toBe("havdalah_bnei_mitzvah")
        expect(classifyService({ name: "Noa Bat Mitzvah", serviceType: "shabbat_morning" }).serviceType).toBe("bnei_mitzvah_saturday")
    })
})

describe("fill it but say it (MCP-04)", () => {
    const usual = (over: Partial<SlotUse>, n: number, startDay = 17): SlotUse[] =>
        Array.from({ length: n }, (_, i) => ({
            eventDate: `2026-${String(over.eventDate ?? "10").slice(0, 2)}-${String(startDay - i * 7).padStart(2, "0")}T15:00:00Z`,
            fileId: "mi-moshav",
            partGroup: "pg-mi-moshav",
            chartName: "Mi chamocha (Moshav) morning.pdf",
            setting: "Moshav",
            key: "E",
            special: false,
            serviceLabel: "Shabbat Morning",
            recent: true,
            ...over,
        }))

    it("names a usual whose latest regular service played something else", () => {
        const uses: SlotUse[] = [
            { ...usual({}, 1)[0], eventDate: "2026-09-26T15:00:00Z", fileId: "mi-ana", partGroup: "pg-mi-ana", chartName: "Mi Chamocha (Ana B'Koach).pdf", setting: null },
            ...usual({}, 3, 19).map((u, i) => ({ ...u, eventDate: `2026-09-${String(19 - i * 7).padStart(2, "0")}T15:00:00Z` })),
        ]
        const tier = computeSlotTier({ profileUses: uses, otherUses: [] })
        const note = filledNoteFor(tier, "2026-10-03", 5)!
        expect(note.reasons.map((r) => r.kind)).toEqual(["differs"])
        const r = buildReadback({
            profileLabel: "Daniel Shabbat morning",
            date: "2026-10-03",
            book: null,
            special: false,
            openItems: [],
            now: new Date("2026-10-01T00:00:00Z"),
            rows: [{ index: 0, label: "Mi Chamocha", isSong: true, hasChart: true, tier: "usual", phrase: tier.phrase, keyOnRecord: true, filled: note }],
        })
        expect(r.exceptions.map((e) => e.kind)).toEqual(["filled"])
        expect(r.exceptions[0].text).toContain("Moshav, your usual in E")
        expect(r.exceptions[0].text).toContain("Sep 26 was Ana B'Koach")
        expect(r.text).not.toMatch(/\.pdf/)
    })

    it("names a stale usual, a missing key and a single-service profile; a plain usual stays folded", () => {
        const stale = computeSlotTier({ profileUses: usual({ key: null }, 3, 24).map((u, i) => ({ ...u, eventDate: `2026-06-${String(24 - i * 7).padStart(2, "0")}T15:00:00Z` })), otherUses: [] })
        expect(filledNoteFor(stale, "2026-11-07", 5)!.reasons.map((r) => r.kind)).toEqual(["stale", "no_key"])
        const fresh = computeSlotTier({ profileUses: usual({}, 3), otherUses: [] })
        expect(filledNoteFor(fresh, "2026-10-24", 5)!.reasons).toEqual([])
        expect(filledNoteFor(fresh, "2026-10-24", 1)!.reasons.map((r) => r.kind)).toEqual(["single"])
    })
})

describe("recall on open rows (MCP-06)", () => {
    const lastTime = computeSlotTier({
        profileUses: [
            { eventDate: "2026-07-24T00:30:00Z", fileId: "shema-a", partGroup: "pg-shema-a", chartName: "Shema (major).pdf", key: "E", special: false, serviceLabel: "Shabbat Morning", recent: true },
        ],
        otherUses: [],
    })
    const rows = buildDraftRows(
        [{ index: 0, type: "song", title: "Sh'ma", slotKey: "moment:the-shma", track: { type: "song", title: "Sh'ma" }, tier: lastTime, service: "Shabbat Morning" }],
        () => "2026-07-23",
    )

    it("an open row carries the exact chart it had, never filled", () => {
        expect(rows[0].filled).toBe(false)
        expect(rows[0].fileId).toBeUndefined()
        expect(rows[0].recall).toEqual({ fileId: "shema-a", chartName: "Shema (major).pdf", key: "E", date: "2026-07-23", service: "Shabbat Morning" })
    })

    it("useRecall takes that chart and key; a row without recall refuses", () => {
        const charts = new Map<string, ChartInfo>([["shema-a", { name: "Shema (major).pdf", partGroup: "pg-shema-a" }]])
        const ok = applyChoices(rows, [{ index: 0, useRecall: true }], charts)
        expect(ok.ok && ok.rows[0].track).toMatchObject({ fileId: "shema-a", key: "E" })
        const noRecall = buildDraftRows([{ index: 0, type: "song", title: "Adon Olam", slotKey: "song:x", track: { type: "song", title: "Adon Olam" } }])
        const bad = applyChoices(noRecall, [{ index: 0, useRecall: true }], charts)
        expect(bad.ok).toBe(false)
        expect(!bad.ok && bad.code).toBe("no_recall")
    })

    it("voice says the setting and a month, never the file name", () => {
        const r = buildReadback({
            profileLabel: "Daniel Friday night",
            date: "2026-11-06",
            book: null,
            special: false,
            openItems: [],
            now: new Date("2026-11-01T00:00:00Z"),
            rows: [{
                index: 0, label: "Sh'ma", isSong: true, hasChart: false, tier: "last_time", phrase: lastTime.phrase, keyOnRecord: true,
                recall: { setting: settingOf("Shema (major).pdf"), key: "E", date: "2026-07-23" },
            } satisfies ReadbackRow],
        })
        expect(r.exceptions[0].text).toContain("Shema (major)") // the screen keeps the chart
        expect(r.exceptions[0].voice).toBe("Sh'ma: last time major in E, in July")
        expect(r.text).toContain("in July")
        expect(r.text).not.toContain("(major)")
    })
})

describe("readback headline", () => {
    it("drops a trailing date that repeats the service date (MCP-20)", () => {
        expect(stripTrailingDate("Eliana Levine Bat Mitzvah — Oct 31", "2026-10-31")).toBe("Eliana Levine Bat Mitzvah")
        expect(stripTrailingDate("Shabbat 10/31", "2026-10-31")).toBe("Shabbat")
        expect(stripTrailingDate("Shabbat Oct 3", "2026-10-31")).toBe("Shabbat Oct 3")
    })

    it("says where the order came from and a book that differs, first", () => {
        const r = buildReadback({
            profileLabel: "Shir Shabbat",
            date: "2026-12-04",
            book: null,
            special: false,
            openItems: [],
            now: new Date("2026-11-01T00:00:00Z"),
            rows: [],
            origin: "Order from your last 5 regular Shir Shabbat services, Jul 3 – Nov 6.",
            notices: [{ kind: "book_differs", text: "Book differs from profile: your last Shir Shabbat (Nov 6) used CRC Friday Siddur" }],
        })
        expect(r.headline).toContain("Order from your last 5 regular")
        expect(r.exceptions[0].kind).toBe("book_differs")
    })
})

describe("vsLast (MCP-05)", () => {
    it("lists the last regular service's chart, setting and key per slot, skipping specials and itself", () => {
        const sets = [
            setlist("special", "2026-10-24", [barchu(0)], { special: true }),
            setlist("own", "2026-10-17", [barchu(0)]),
            setlist("last", "2026-10-10", [head(0), barchu(1), mi(2, "mi-moshav", "Mi Chamocha (Moshav)")]),
        ]
        const v = vsLastOf(sets, library, { excludeId: "own" })!
        expect(v.setlistId).toBe("last")
        expect(v.date).toBe("2026-10-10")
        expect(v.rows.map((r) => [r.slotKey, r.setting, r.key])).toEqual([
            ["moment:barchu", "Walkdown", "Dm"],
            ["moment:mi-chamocha", "Moshav", "E"],
        ])
    })
})

describe("history as performed (MCP-23)", () => {
    const dev = (rowId: string, performedFileId: string, eventDay = "2026-10-17"): Deviation => ({
        rowId,
        kind: "swap",
        plannedFileId: "mi-moshav",
        plannedTitle: "Mi Chamocha (Moshav)",
        beforeFileId: "mi-moshav",
        beforeTitle: "Mi Chamocha (Moshav)",
        performedFileId,
        performedTitle: "Mi Chamocha Ana B'Koach",
        at: 1,
        by: "u",
        eventDay,
        rev: 1,
    })
    const planned = setlist("s", "2026-10-17", [mi(0, "mi-moshav", "Mi Chamocha (Moshav)")])
    const rowId = planned.tracks[0].id

    it("a chart the band swapped in counts as played, with no key on record", () => {
        const out = overlayPerformed(planned, [dev(rowId, "mi-ana")], "2026-10-17")
        expect(out.tracks[0]).toMatchObject({ fileId: "mi-ana", key: null, performed: true })
        expect(planned.tracks[0].fileId).toBe("mi-moshav")
    })

    it("a swap for another day changes nothing", () => {
        expect(overlayPerformed(planned, [dev(rowId, "mi-ana", "2026-10-10")], "2026-10-17")).toBe(planned)
    })

    it("another tenant's swap records never reach this tenant's setlists", () => {
        const grouped = deviationsBySetlist(
            [
                { setlistId: "crc-setlist", deviation: dev(rowId, "mi-ana") },
                { setlistId: "bl-setlist", deviation: dev(rowId, "bl-chart") },
            ],
            new Set(["crc-setlist"]),
        )
        expect([...grouped.keys()]).toEqual(["crc-setlist"])
    })
})
