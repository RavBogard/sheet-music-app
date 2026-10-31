import { describe, expect, it } from "vitest"

import type { HistorySetlist, HistoryTrack, LibraryLite } from "@/lib/history/song-history"
import { learnedOrderGuard } from "@/lib/mcp/tools/service-profiles"
import { seedProfile } from "../seed"

/**
 * Prod, 2026-10-31: reseed_service_profile for Shabbat morning (Daniel) learned
 * an EMPTY order. Three of its five newest Shabbat mornings were empty shells
 * (made for a date, never filled: no tracks at all), so no row reached three of
 * five. Shells are not services; the window skips them and learns from the
 * services that were played.
 */
const DANIEL_SAT = { serviceType: "shabbat_morning", rabbiSlot: "daniel_karen" as const }

function track(order: number, title: string, type = "song", fileId: string | null = null): HistoryTrack {
    return { id: `t${order}`, order, type, title, fileId, fileName: null, key: null, leadMusician: null, notes: null, momentId: null }
}

function setlist(id: string, date: string, tracks: HistoryTrack[]): HistorySetlist {
    return {
        id,
        name: `Shabbat Morning — ${date}`,
        eventDate: `${date}T18:00:00.000Z`,
        templateType: "shabbat_morning",
        rabbi: "Daniel",
        serviceType: DANIEL_SAT.serviceType,
        rabbiSlot: DANIEL_SAT.rabbiSlot,
        special: false,
        book: null,
        ownerName: null,
        isTest: false,
        tracks,
    }
}

// The shape of the April Shabbat mornings: headers, prayers and charted songs.
const played = (id: string, date: string) =>
    setlist(id, date, [
        track(0, "Beginning", "header"),
        track(1, "Modeh ani - Klepper", "song", "f-modeh"),
        track(2, "Birchot HaShachar", "prayer"),
        track(3, "Psukei d_zimrah", "song", "f-psukei"),
        track(4, "Shma and Blessings", "header"),
        track(5, "Kedusha Em", "song", "f-kedusha"),
        track(6, "Oseh shalom - Nava tehila", "song", "f-oseh"),
        track(7, "Torah Service", "header"),
        track(8, "Mi shebeirach", "song", "f-mish"),
        track(9, "Eitz chayim   Weisenberg", "song", "f-eitz"),
    ])

const library = new Map<string, LibraryLite>(
    ["f-modeh", "f-psukei", "f-kedusha", "f-oseh", "f-mish", "f-eitz"].map((f) => [f, { fileId: f, name: f, key: null, setting: null, partGroup: `pg-${f}` }]),
)

// Newest first: played, played, then three shells interleaved with older played services.
const history: HistorySetlist[] = [
    played("aug29", "2026-08-29"),
    played("apr04", "2026-04-04"),
    setlist("mar28-shell", "2026-03-28", []),
    setlist("mar21-shell", "2026-03-21", []),
    setlist("feb28-shell", "2026-02-28", []),
    played("feb21", "2026-02-21"),
    played("feb14", "2026-02-14"),
    played("feb07", "2026-02-07"),
]

describe("seedProfile with empty setlists in history", () => {
    it("skips empty shells and learns a full running order from the services that were played", () => {
        const seed = seedProfile(DANIEL_SAT, history, library, new Date("2026-10-31T00:00:00Z"))
        expect(seed.learnedFrom?.setlists.map((s) => s.setlistId)).toEqual(["aug29", "apr04", "feb21", "feb14", "feb07"])
        expect(seed.tracks).toHaveLength(10)
        expect(seed.tracks.filter((t) => t.type === "header").map((t) => t.title)).toEqual(["Beginning", "Shma and Blessings", "Torah Service"])
        expect(seed.tracks.filter((t) => t.house).map((t) => t.fileId)).toEqual(["f-modeh", "f-psukei", "f-kedusha", "f-oseh", "f-mish", "f-eitz"])
    })

    it("learns nothing (no_history) when every service is a shell, rather than an empty order", () => {
        const shells = history.filter((s) => s.tracks.length === 0)
        const seed = seedProfile(DANIEL_SAT, shells, library, new Date("2026-10-31T00:00:00Z"))
        expect(seed.learnedFrom ?? null).toBeNull()
        expect(seed.tracks).toEqual([])
    })
})

describe("learnedOrderGuard", () => {
    it("refuses an empty order, and one under half of the stored rows", () => {
        expect(learnedOrderGuard(0, 30)).toMatchObject({ reason: "empty_order" })
        expect(learnedOrderGuard(0, 0)).toMatchObject({ reason: "empty_order" })
        expect(learnedOrderGuard(14, 30)).toMatchObject({ reason: "shrinks_by_half", learned: 14, stored: 30 })
    })

    it("allows half or more of the stored rows, and any order for a new profile", () => {
        expect(learnedOrderGuard(15, 30)).toBeNull()
        expect(learnedOrderGuard(40, 30)).toBeNull()
        expect(learnedOrderGuard(3, 0)).toBeNull()
    })
})
