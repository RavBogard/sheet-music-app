import { describe, expect, it } from "vitest"
import type { HistorySetlist, LibraryLite } from "@/lib/history/song-history"
import { buildSlotUses } from "@/lib/profiles/slot-uses"
import { computeSlotTier } from "@/lib/profiles/tiers"
import {
    chartChangeKey,
    currentVersionOf,
    hasVersionMarker,
    proposeLineagePairs,
    stripVersionMarkers,
    type LineageCandidateRow,
} from "../lineage-pure"

describe("currentVersionOf", () => {
    const rows = new Map<string, { supersededBy?: string | null; status?: string | null }>([
        ["v1", { supersededBy: "v2", status: "archived" }],
        ["v2", { supersededBy: "v3", status: "archived" }],
        ["v3", { status: "active" }],
    ])
    const look = (id: string) => rows.get(id)

    it("follows supersededBy to the newest version", () => {
        expect(currentVersionOf("v1", look)).toBe("v3")
        expect(currentVersionOf("v3", look)).toBe("v3")
    })

    it("takes the newest version that is not archived when the newest one is", () => {
        const m = new Map(rows)
        m.set("v3", { status: "archived" })
        m.set("v2", { supersededBy: "v3", status: "active" })
        expect(currentVersionOf("v1", (id) => m.get(id))).toBe("v2")
    })

    it("stops on a cycle or a row it cannot see", () => {
        const m = new Map([
            ["a", { supersededBy: "b" }],
            ["b", { supersededBy: "a" }],
        ])
        expect(currentVersionOf("a", (id) => m.get(id))).toBe("b")
        expect(currentVersionOf("x", () => undefined)).toBe("x")
        expect(currentVersionOf("v1", (id) => (id === "v1" ? { supersededBy: "hidden" } : undefined))).toBe("v1")
    })
})

describe("chartChangeKey (MCP-18)", () => {
    it("keeps a played key the author gave", () => {
        const r = chartChangeKey({ rowKey: "E", oldWrittenKey: "D", newWrittenKey: "C" })
        expect(r).toMatchObject({ key: "E", source: "played", keyChanged: null })
    })

    it("takes the new chart's written key when the row only had the old chart's key", () => {
        const r = chartChangeKey({ rowKey: "D", oldWrittenKey: "D", newWrittenKey: "C" })
        expect(r).toMatchObject({ key: "C", source: "written", keyChanged: { from: "D", to: "C" } })
        expect(chartChangeKey({ rowKey: null, oldWrittenKey: null, newWrittenKey: "G" }).keyChanged).toEqual({ from: null, to: "G" })
    })

    it("a key passed in the same call always wins", () => {
        const r = chartChangeKey({ rowKey: "E", oldWrittenKey: "D", newWrittenKey: "C", explicitKey: "F" })
        expect(r).toMatchObject({ key: "F", source: "explicit", keyChanged: { from: "E", to: "F" } })
    })

    it("never drops a key when the new chart has none on record", () => {
        const r = chartChangeKey({ rowKey: "D", oldWrittenKey: "D", newWrittenKey: null })
        expect(r).toMatchObject({ key: "D", keyChanged: null })
    })
})

describe("version markers", () => {
    it.each([
        ["Adon Olam (IWITW) band chart DRAFT v2", "Adon Olam (IWITW) band chart"],
        ["Hashkivenu (Klepper) (updated PDF)", "Hashkivenu (Klepper)"],
        ["Oseh Shalom updated.pdf", "Oseh Shalom"],
        ["L'cha Dodi 2026-10-31", "L'cha Dodi"],
        ["L'cha Dodi - Oct 31, 2026", "L'cha Dodi"],
    ])("%s → %s", (name, base) => {
        expect(stripVersionMarkers(name)).toBe(base)
        expect(hasVersionMarker(name)).toBe(true)
    })

    it("a plain title has no marker", () => {
        expect(hasVersionMarker("Barchu (Friedman)")).toBe(false)
    })
})

function row(fileId: string, name: string, uploadedAt: string | null, over: Partial<LineageCandidateRow> = {}): LineageCandidateRow {
    return {
        fileId,
        name,
        uploadedAt,
        status: "active",
        partGroup: null,
        lineageId: null,
        supersedes: null,
        supersededBy: null,
        ...over,
    }
}

describe("proposeLineagePairs", () => {
    it("chains siblings that differ only by markers, oldest upload first", () => {
        const p = proposeLineagePairs([
            row("c", "Adon Olam band chart DRAFT v2", "2026-10-01T00:00:00Z"),
            row("a", "Adon Olam band chart", "2026-01-01T00:00:00Z", { partGroup: "adon olam band chart" }),
            row("b", "Adon Olam band chart DRAFT", "2026-05-01T00:00:00Z"),
        ])
        expect(p.pairs.map((x) => [x.from.fileId, x.to.fileId])).toEqual([
            ["a", "b"],
            ["b", "c"],
        ])
        expect(p.pairs.every((x) => x.lineageId === "a" && x.partGroup === "adon olam band chart")).toBe(true)
    })

    it("never links two instrument copies, or charts with no marker between them", () => {
        const p = proposeLineagePairs([
            row("a", "Barchu (Walkdown)", "2026-01-01T00:00:00Z"),
            row("b", "Barchu (Walkdown) Eb v2", "2026-02-01T00:00:00Z"),
            row("c", "Shalom Rav (Klepper)", "2026-01-01T00:00:00Z"),
            row("d", "Shalom Rav (Friedman)", "2026-02-01T00:00:00Z"),
        ])
        expect(p.pairs).toEqual([])
    })

    it("reports a group with two rows of one name instead of guessing", () => {
        const p = proposeLineagePairs([
            row("a", "Modeh Ani", "2026-01-01T00:00:00Z"),
            row("b", "Modeh Ani", "2026-02-01T00:00:00Z"),
            row("c", "Modeh Ani v2", "2026-03-01T00:00:00Z"),
        ])
        expect(p.pairs).toEqual([])
        expect(p.ambiguous).toEqual([expect.objectContaining({ fileIds: ["a", "b", "c"], reason: "same_name" })])
    })

    it("skips rows already in a lineage and rows that are not active", () => {
        const p = proposeLineagePairs([
            row("a", "Modeh Ani", "2026-01-01T00:00:00Z", { supersededBy: "z" }),
            row("b", "Modeh Ani v2", "2026-02-01T00:00:00Z"),
            row("c", "Modeh Ani v3", "2026-03-01T00:00:00Z", { status: "archived" }),
        ])
        expect(p.pairs).toEqual([])
    })
})

describe("memory follows lineage (goal 6)", () => {
    function setlist(id: string, day: number, fileId: string): HistorySetlist {
        return {
            id,
            name: "Shabbat Morning",
            eventDate: `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`,
            templateType: null,
            rabbi: null,
            serviceType: "shabbat_morning",
            rabbiSlot: "daniel_karen",
            special: false,
            book: null,
            ownerName: null,
            isTest: false,
            tracks: [
                { id: `${id}-t`, order: 0, type: "song", title: "Mi Chamocha", fileId, fileName: null, key: "E", leadMusician: null, notes: null, momentId: "mi-chamocha", liturgyRef: null },
            ],
        }
    }
    const library = new Map<string, LibraryLite>([
        ["old", { fileId: "old", name: "Mi Chamocha (Moshav)", key: "D", setting: "Moshav", partGroup: "mi chamocha moshav", status: "archived", supersededBy: "new" }],
        ["new", { fileId: "new", name: "Mi Chamocha (Moshav) v2", key: "D", setting: "Moshav", partGroup: "mi chamocha moshav", status: "active", lineageId: "old" }],
    ])
    const F = { serviceType: "shabbat_morning", rabbiSlot: "daniel_karen" as const }

    it("a usual chart that was revised fills its current version, with the played key", () => {
        const sets = [setlist("a", 26, "old"), setlist("b", 19, "old"), setlist("c", 12, "new")]
        const index = buildSlotUses(sets, library, F)
        const uses = index.profileUses("moment:mi-chamocha")
        expect(uses.map((u) => u.fileId)).toEqual(["new", "new", "new"])
        expect(uses.every((u) => !u.dead)).toBe(true)
        const tier = computeSlotTier({ profileUses: uses, otherUses: [] })
        expect(tier).toMatchObject({ tier: "usual", fileId: "new", key: "E" })
    })

    it("the setlists themselves keep the exact chart they had", () => {
        const sets = [setlist("a", 26, "old")]
        buildSlotUses(sets, library, F)
        expect(sets[0].tracks[0].fileId).toBe("old")
    })
})
