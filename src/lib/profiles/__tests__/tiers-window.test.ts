import { describe, it, expect } from "vitest"
import { cleanLabel, computeSlotTier, phrase, type SlotUse } from "../tiers"

const d = (n: number) => `2026-09-${String(n).padStart(2, "0")}`
const u = (n: number, partGroup: string, extra: Partial<SlotUse> = {}): SlotUse => ({
    eventDate: d(n),
    fileId: partGroup,
    partGroup,
    chartName: partGroup,
    key: null,
    special: false,
    serviceLabel: "Shabbat Morning",
    ...extra,
})

describe("usual is over the last regular services (MCP-01)", () => {
    it("history A,A,A then B,B: A is not usual", () => {
        const newestFirst = [u(25, "b"), u(18, "b"), u(11, "a"), u(4, "a"), u(1, "a")]
        const t = computeSlotTier({ standing: null, profileUses: newestFirst, otherUses: [] })
        expect(t.tier).toBe("last_time")
        expect(t.fileId).toBe("b")
    })

    it("a chart still in the latest service and in 3 of the window is usual", () => {
        const t = computeSlotTier({
            standing: null,
            profileUses: [u(25, "a"), u(18, "b"), u(11, "a"), u(4, "a")],
            otherUses: [],
        })
        expect(t.tier).toBe("usual")
    })

    it("uses older than the profile's last 5 services (recent:false) do not count", () => {
        const t = computeSlotTier({
            standing: null,
            profileUses: [u(25, "a"), u(18, "a", { recent: false }), u(11, "a", { recent: false }), u(4, "a", { recent: false })],
            otherUses: [],
        })
        expect(t.tier).toBe("last_time")
    })

    it("phrases say the chart without a file extension or underscores (MCP-13)", () => {
        expect(phrase("usual", "Sim_shalom.pdf", "Dm")).toBe("the usual Sim shalom in Dm")
        expect(cleanLabel("Eitz chayim - Weisenberg.PDF")).toBe("Eitz chayim - Weisenberg")
    })
})
