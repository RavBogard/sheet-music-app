import { describe, it, expect } from "vitest"
import { splitPublicSetlists, isNonTestSetlist, firstUpcomingSetlist } from "../public-setlist-order"
import type { Setlist } from "@/lib/setlist-firebase"

// Minimal Setlist builder for ordering tests. Local-time event strings (no `Z`)
// keep the today@00:00 boundary unambiguous regardless of the runner's TZ.
function sl(partial: Partial<Setlist> & { id: string }): Setlist {
    return { name: partial.id, ownerId: "real-owner", ...partial } as Setlist
}

// Fri May 22 2026, evening (local) → today@00:00 = May 22.
const NOW = new Date("2026-05-22T18:00:00")

describe("splitPublicSetlists", () => {
    it("puts today's service ABOVE tomorrow's in upcoming (the May22-above-May23 regression)", () => {
        const tonight = sl({ id: "kabbalat-shabbat", eventDate: "2026-05-22T12:00:00" })
        const tomorrow = sl({ id: "shavuot-yizkor", eventDate: "2026-05-23T12:00:00" })
        // Pass tomorrow first (the buggy DESC order) — helper must reorder asc.
        const { upcoming } = splitPublicSetlists([tomorrow, tonight], NOW)
        expect(upcoming.map((s) => s.id)).toEqual(["kabbalat-shabbat", "shavuot-yizkor"])
    })

    it("places a past setlist in the past group, never in upcoming", () => {
        const past = sl({ id: "last-week", eventDate: "2026-05-15T12:00:00" })
        const tonight = sl({ id: "tonight", eventDate: "2026-05-22T12:00:00" })
        const { upcoming, past: pastGroup } = splitPublicSetlists([past, tonight], NOW)
        expect(upcoming.map((s) => s.id)).toEqual(["tonight"])
        expect(pastGroup.map((s) => s.id)).toEqual(["last-week"])
    })

    it("orders past most-recent-first, with undated rows trailing in original order", () => {
        const older = sl({ id: "two-weeks-ago", eventDate: "2026-05-08T12:00:00" })
        const recent = sl({ id: "last-week", eventDate: "2026-05-15T12:00:00" })
        const undatedA = sl({ id: "undated-a" })
        const undatedB = sl({ id: "undated-b" })
        const { past } = splitPublicSetlists([undatedA, older, undatedB, recent], NOW)
        expect(past.map((s) => s.id)).toEqual(["last-week", "two-weeks-ago", "undated-a", "undated-b"])
    })

    it("excludes isTest:true rows and test-uid-owned rows from both groups", () => {
        const flagged = sl({ id: "flagged", eventDate: "2026-05-24T12:00:00", isTest: true })
        const testOwned = sl({ id: "probe", eventDate: "2026-05-24T12:00:00", ownerId: "test-probe-1" })
        const real = sl({ id: "real", eventDate: "2026-05-23T12:00:00" })
        const allIds = (() => {
            const { upcoming, past } = splitPublicSetlists([flagged, testOwned, real], NOW)
            return [...upcoming, ...past].map((s) => s.id)
        })()
        expect(allIds).toEqual(["real"])
    })
})

describe("firstUpcomingSetlist (F1 'next service' selector, v11.5-02-01)", () => {
    it("returns the SOONEST upcoming setlist (today wins over tomorrow)", () => {
        const tonight = sl({ id: "kabbalat-shabbat", eventDate: "2026-05-22T12:00:00" })
        const tomorrow = sl({ id: "shavuot-yizkor", eventDate: "2026-05-23T12:00:00" })
        // Pass tomorrow first (buggy DESC order) — selector must still pick today's.
        expect(firstUpcomingSetlist([tomorrow, tonight], NOW)?.id).toBe("kabbalat-shabbat")
    })

    it("returns null when there are no upcoming setlists (all past / undated / empty)", () => {
        const past = sl({ id: "last-week", eventDate: "2026-05-15T12:00:00" })
        const undated = sl({ id: "undated" })
        expect(firstUpcomingSetlist([past, undated], NOW)).toBeNull()
        expect(firstUpcomingSetlist([], NOW)).toBeNull()
    })

    it("never returns an isTest / test-uid row even if it is dated soonest", () => {
        const flaggedToday = sl({ id: "probe-today", eventDate: "2026-05-22T09:00:00", isTest: true })
        const testOwnedToday = sl({ id: "test-today", eventDate: "2026-05-22T08:00:00", ownerId: "test-probe-1" })
        const realTomorrow = sl({ id: "real", eventDate: "2026-05-23T12:00:00" })
        expect(firstUpcomingSetlist([flaggedToday, testOwnedToday, realTomorrow], NOW)?.id).toBe("real")
    })
})

describe("isNonTestSetlist (shared /perform + dashboard predicate, BUG-5)", () => {
    it("returns false for an explicit isTest:true row", () => {
        expect(isNonTestSetlist({ isTest: true, ownerId: "real-admin" })).toBe(false)
    })

    it("returns false for a test-uid-owned row (legacy isTest:undefined)", () => {
        expect(isNonTestSetlist({ ownerId: "test-probe-1" })).toBe(false)
        expect(isNonTestSetlist({ ownerId: "c7i1-band_leader-abc" })).toBe(false)
    })

    it("returns true for a real setlist (isTest:false or absent, real owner)", () => {
        expect(isNonTestSetlist({ isTest: false, ownerId: "real-admin" })).toBe(true)
        expect(isNonTestSetlist({ ownerId: "real-admin" })).toBe(true)
        expect(isNonTestSetlist({ ownerId: null })).toBe(true)
    })
})
