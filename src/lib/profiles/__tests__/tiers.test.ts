import { describe, it, expect } from "vitest"
import { computeSlotTier, phrase, type SlotUse, type StandingChoice } from "../tiers"

let day = 30
function use(p: Partial<SlotUse> & { partGroup: string }): SlotUse {
    day -= 1
    return {
        eventDate: `2026-10-${String(day).padStart(2, "0")}`,
        fileId: p.partGroup,
        chartName: p.partGroup,
        key: null,
        special: false,
        serviceLabel: "Friday Night",
        ...p,
    }
}

const BARCHU: StandingChoice = { fileId: "barchu-walkdown", chartName: "Barchu (Walkdown)", key: "D", partGroup: "barchu walkdown" }

describe("computeSlotTier", () => {
    it("standing beats history", () => {
        const profileUses = [
            use({ partGroup: "x", key: "G" }),
            use({ partGroup: "x", key: "G" }),
            use({ partGroup: "x", key: "G", special: true }),
        ]
        const t = computeSlotTier({ standing: BARCHU, profileUses, otherUses: [] })
        expect(t).toMatchObject({ tier: "standard", fileId: "barchu-walkdown", key: "D", keyOnRecord: true })
        expect(t.phrase).toBe("your standard Barchu (Walkdown) in D")
        expect(t.promotion).toBeUndefined()
    })

    it("3 of the last 5 regular uses → usual, with the most frequent key", () => {
        const profileUses = [
            use({ partGroup: "a", key: "Dm" }),
            use({ partGroup: "b" }),
            use({ partGroup: "a", key: "Em" }),
            use({ partGroup: "c" }),
            use({ partGroup: "a", key: "Dm" }),
        ]
        const t = computeSlotTier({ profileUses, otherUses: [] })
        expect(t).toMatchObject({ tier: "usual", fileId: "a", key: "Dm", keyOnRecord: true })
        expect(t.phrase).toBe("the usual a in Dm")
    })

    it("2 of 5 → last_time (the most recent use)", () => {
        const profileUses = [
            use({ partGroup: "b", key: "F" }),
            use({ partGroup: "a" }),
            use({ partGroup: "c" }),
            use({ partGroup: "a" }),
            use({ partGroup: "d" }),
            use({ partGroup: "a" }), // sixth: outside the window
        ]
        const t = computeSlotTier({ profileUses, otherUses: [] })
        expect(t).toMatchObject({ tier: "last_time", fileId: "b", key: "F" })
        expect(t.phrase).toBe("last time it was b in F")
    })

    it("special weeks never count: 3 special uses + 1 regular → last_time", () => {
        const profileUses = [
            use({ partGroup: "a", special: true }),
            use({ partGroup: "a", special: true }),
            use({ partGroup: "a" }),
            use({ partGroup: "a", special: true }),
        ]
        expect(computeSlotTier({ profileUses, otherUses: [] }).tier).toBe("last_time")
    })

    it("instrument part rows share a partGroup and count as one chart", () => {
        const profileUses = [
            use({ partGroup: "barchu walkdown", fileId: "barchu-bb", chartName: "Barchu (Walkdown) Bb", key: "D" }),
            use({ partGroup: "barchu walkdown", fileId: "barchu", chartName: "Barchu (Walkdown)", key: "D" }),
            use({ partGroup: "barchu walkdown", fileId: "barchu-eb", chartName: "Barchu (Walkdown) Eb", key: "D" }),
        ]
        const t = computeSlotTier({ profileUses, otherUses: [] })
        expect(t).toMatchObject({ tier: "usual", fileId: "barchu-bb" })
    })

    it("usual with no keys → keyOnRecord:false and 'key not on record'", () => {
        const profileUses = [use({ partGroup: "X" }), use({ partGroup: "X" }), use({ partGroup: "X" })]
        const t = computeSlotTier({ profileUses, otherUses: [] })
        expect(t).toMatchObject({ tier: "usual", keyOnRecord: false, key: null })
        expect(t.phrase).toBe("the usual X, key not on record")
    })

    it("other_service phrase", () => {
        const t = computeSlotTier({
            profileUses: [],
            otherUses: [use({ partGroup: "a", serviceLabel: "Shir Shabbat" })],
        })
        expect(t.tier).toBe("other_service")
        expect(t.phrase).toBe("done before at Shir Shabbat, not here")
    })

    it("new phrase", () => {
        const t = computeSlotTier({ profileUses: [], otherUses: [] })
        expect(t).toEqual({ tier: "new", keyOnRecord: false, phrase: "new — which chart?" })
    })

    it("promotion fires after 3 consecutive regular uses of a different chart+key", () => {
        const profileUses = [
            use({ partGroup: "barchu friedman", fileId: "bf", chartName: "Barchu (Friedman)", key: "Dm" }),
            use({ partGroup: "barchu friedman", fileId: "bf-bb", chartName: "Barchu (Friedman) Bb", key: "Dm" }),
            use({ partGroup: "barchu friedman", fileId: "bf", chartName: "Barchu (Friedman)", key: "Dm" }),
        ]
        const t = computeSlotTier({ standing: BARCHU, profileUses, otherUses: [] })
        expect(t.tier).toBe("standard")
        expect(t.promotion).toEqual({ fileId: "bf", chartName: "Barchu (Friedman)", key: "Dm", weeks: 3 })
    })

    it("a same-chart, different-key run also offers promotion; a matching run does not", () => {
        const sameChartNewKey = [1, 2, 3].map(() => use({ partGroup: "barchu walkdown", key: "Eb" }))
        expect(computeSlotTier({ standing: BARCHU, profileUses: sameChartNewKey, otherUses: [] }).promotion).toMatchObject({ key: "Eb" })
        const matching = [1, 2, 3].map(() => use({ partGroup: "barchu walkdown", key: "D" }))
        expect(computeSlotTier({ standing: BARCHU, profileUses: matching, otherUses: [] }).promotion).toBeUndefined()
    })

    it("no promotion when one of the 3 most recent uses is special", () => {
        const profileUses = [
            use({ partGroup: "barchu friedman", key: "Dm" }),
            use({ partGroup: "barchu friedman", key: "Dm", special: true }),
            use({ partGroup: "barchu friedman", key: "Dm" }),
            use({ partGroup: "barchu friedman", key: "Dm" }),
        ]
        expect(computeSlotTier({ standing: BARCHU, profileUses, otherUses: [] }).promotion).toBeUndefined()
    })

    it("no promotion when the 3 recent uses disagree", () => {
        const profileUses = [
            use({ partGroup: "barchu friedman", key: "Dm" }),
            use({ partGroup: "barchu friedman", key: "Em" }),
            use({ partGroup: "barchu friedman", key: "Dm" }),
        ]
        expect(computeSlotTier({ standing: BARCHU, profileUses, otherUses: [] }).promotion).toBeUndefined()
    })
})

describe("phrase", () => {
    it("uses the exact row strings", () => {
        expect(phrase("standard", "Oseh Shalom", "G")).toBe("your standard Oseh Shalom in G")
        expect(phrase("last_time", "Oseh Shalom", null)).toBe("last time it was Oseh Shalom, key not on record")
    })
})
