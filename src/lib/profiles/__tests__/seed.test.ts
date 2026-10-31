import { describe, expect, it } from "vitest"

import type { HistorySetlist, HistoryTrack, LibraryLite } from "@/lib/history/song-history"
import { seedProfile } from "../seed"

const RANDY_SAT = { serviceType: "shabbat_morning", rabbiSlot: "randy" as const }

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

function setlist(
    id: string,
    date: string,
    tracks: HistoryTrack[],
    extra: Partial<HistorySetlist> = {},
): HistorySetlist {
    return {
        id,
        name: `Shabbat Morning ${date}`,
        eventDate: `${date}T15:00:00.000Z`,
        templateType: "shabbat_morning",
        rabbi: null,
        serviceType: RANDY_SAT.serviceType,
        rabbiSlot: RANDY_SAT.rabbiSlot,
        special: false,
        book: null,
        ownerName: null,
        isTest: false,
        tracks,
        ...extra,
    }
}

function lib(rows: Array<[string, string, string]>): Map<string, LibraryLite> {
    return new Map(rows.map(([fileId, name, partGroup]) => [fileId, { fileId, name, key: null, setting: null, partGroup }]))
}

const library = lib([
    ["f-barchu", "Barchu (Walkdown)", "pg-barchu"],
    ["f-barchu-bb", "Barchu (Walkdown) Bb", "pg-barchu"],
    ["f-barchu-alt", "Barchu (Sulzer)", "pg-barchu-alt"],
    ["f-mi", "Mi Chamocha (Friedman)", "pg-mi"],
    ["f-mi-other", "Mi Chamocha (Klepper)", "pg-mi-other"],
    ["f-oseh-a", "Oseh Shalom (Hirsch)", "pg-oseh-a"],
    ["f-oseh-b", "Oseh Shalom (Zeira)", "pg-oseh-b"],
    ["f-oseh-c", "Oseh Shalom (Shalom)", "pg-oseh-c"],
])

const header = (order: number) => track(order, { title: "Shacharit", type: "header" })
const barchu = (order: number, fileId = "f-barchu", key = "Dm") =>
    track(order, { title: "Barchu", momentId: "barchu", fileId, key })
const mi = (order: number, fileId: string) => track(order, { title: "Mi Chamocha", momentId: "mi_chamocha", fileId, key: "G" })
const oseh = (order: number, fileId: string) => track(order, { title: "Oseh Shalom", fileId, key: "C" })

// Six Randy Shabbat mornings, newest first. The newest is special.
const fixture: HistorySetlist[] = [
    setlist("s1-special", "2026-10-24", [header(0), barchu(1, "f-barchu-alt"), mi(2, "f-mi"), oseh(3, "f-oseh-a")], { special: true }),
    setlist("s2", "2026-10-17", [header(0), barchu(1), mi(2, "f-mi"), oseh(3, "f-oseh-a")]),
    setlist("s3", "2026-10-10", [header(0), barchu(1, "f-barchu-bb", "Dm"), mi(2, "f-mi"), oseh(3, "f-oseh-b")]),
    setlist("s4", "2026-10-03", [header(0), barchu(1), mi(2, "f-mi-other"), oseh(3, "f-oseh-c")]),
    setlist("s5", "2026-09-26", [header(0), barchu(1, "f-barchu", "Em"), mi(2, "f-mi-other")]),
    setlist("s6", "2026-09-19", [header(0), barchu(1)]),
    // A newer Daniel Shabbat morning never becomes the Randy base.
    setlist("d1", "2026-10-31", [barchu(0, "f-barchu-alt")], { rabbiSlot: "daniel_karen" }),
]

describe("seedProfile", () => {
    const seed = seedProfile(RANDY_SAT, fixture, library, new Date("2026-10-30T00:00:00Z"))

    it("takes the running order from the most recent regular week of the profile", () => {
        expect(seed.basedOn).toEqual({ setlistId: "s2", eventDate: "2026-10-17T15:00:00.000Z" })
        expect(seed.tracks.map((t) => t.title)).toEqual(["Shacharit", "Bar’chu", "Mi Chamocha", "Oseh Shalom"])
    })

    it("copies header rows", () => {
        expect(seed.tracks[0]).toEqual({ type: "header", title: "Shacharit" })
    })

    it("keeps a usual chart (instrument parts count as one) and marks it house", () => {
        const row = seed.tracks[1]
        expect(row).toMatchObject({ slotKind: "moment", slotKey: "moment:barchu", fileId: "f-barchu", key: "Dm" })
        expect(row.house).toMatchObject({ source: "history", count: 5, of: 5 })
    })

    it("leaves every other slot open, without a chart, and lists it", () => {
        const [, , miRow, osehRow] = seed.tracks
        // Mi Chamocha is on 2 of the 5 regular weeks; the special week does not make it 3.
        expect(miRow).toMatchObject({ slotKind: "open", title: "Mi Chamocha" })
        expect(miRow.fileId).toBeUndefined()
        expect(osehRow).toMatchObject({ slotKind: "open", title: "Oseh Shalom" })
        expect(osehRow.fileId).toBeUndefined()
        expect(seed.unsure.map((u) => [u.label, u.reason])).toEqual([
            ["Mi Chamocha", "last_time"],
            ["Oseh Shalom", "last_time"],
        ])
    })

    it("returns nothing when the profile has no regular week", () => {
        const none = seedProfile({ serviceType: "shir_shabbat", rabbiSlot: null }, fixture, library)
        expect(none).toEqual({ tracks: [], unsure: [], basedOn: null })
    })
})
