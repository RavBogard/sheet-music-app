import { describe, it, expect } from "vitest"
import type { HistorySetlist, LibraryLite } from "@/lib/history/song-history"
import { buildSlotUses, dedupeServices, existingOnDate } from "../slot-uses"

function setlist(id: string, day: number, fileId: string, extra: Partial<HistorySetlist> = {}): HistorySetlist {
    return {
        id,
        name: `Shabbat Morning ${id}`,
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
        ...extra,
    }
}
function lib(...rows: Partial<LibraryLite>[]): Map<string, LibraryLite> {
    return new Map(rows.map((r) => [r.fileId!, { name: r.fileId!, key: null, setting: null, partGroup: r.fileId!, ...r } as LibraryLite]))
}
const F = { serviceType: "shabbat_morning", rabbiSlot: "daniel_karen" as const }
const SLOT = "moment:mi-chamocha"

describe("dedupeServices (MCP-07)", () => {
    it("keeps the newest version of two setlists for one service and date", () => {
        const a = setlist("old", 12, "x", { updatedAt: "2026-09-01T00:00:00Z" })
        const b = setlist("new", 12, "x", { updatedAt: "2026-09-02T00:00:00Z" })
        const c = setlist("other", 5, "x")
        expect(dedupeServices([a, b, c]).map((s) => s.id)).toEqual(["new", "other"])
    })

    it("two copies on one Saturday count once toward usual", () => {
        const sets = [setlist("a", 12, "x"), setlist("b", 12, "x"), setlist("c", 5, "x")]
        expect(buildSlotUses(sets, lib({ fileId: "x" }), F).profileUses(SLOT)).toHaveLength(2)
    })
})

describe("recent window (MCP-01)", () => {
    it("marks uses outside the profile's last 5 regular services", () => {
        const sets = [1, 2, 3, 4, 5, 6].map((d) => setlist(`s${d}`, d, "x"))
        const uses = buildSlotUses(sets, lib({ fileId: "x" }), F).profileUses(SLOT)
        expect(uses.map((u) => u.recent)).toEqual([true, true, true, true, true, false])
    })
})

describe("dead charts (MCP-09)", () => {
    it("never fills an archived chart", () => {
        const idx = buildSlotUses([setlist("a", 12, "dead")], lib({ fileId: "dead", status: "archived" }), F)
        expect(idx.profileUses(SLOT)).toHaveLength(0)
    })

    it("recalls the canonical chart of an archived one", () => {
        const idx = buildSlotUses(
            [setlist("a", 12, "dead")],
            lib({ fileId: "dead", status: "archived", canonicalFileId: "live" }, { fileId: "live" }),
            F,
        )
        expect(idx.profileUses(SLOT)[0].fileId).toBe("live")
    })
})

describe("existingOnDate (MCP-08)", () => {
    it("finds a setlist of that service on that date, not other dates, types or tests", () => {
        const sets = [setlist("a", 12, "x"), setlist("b", 13, "x"), setlist("t", 12, "x", { isTest: true })]
        expect(existingOnDate(sets, "2026-09-12", "shabbat_morning", "America/Chicago")).toEqual([
            { setlistId: "a", name: "Shabbat Morning a" },
        ])
        expect(existingOnDate(sets, "2026-09-12", "friday_night", "America/Chicago")).toEqual([])
    })
})
