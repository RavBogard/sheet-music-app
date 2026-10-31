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
    const tier = (...newestFirst: SlotUse[]) => computeSlotTier({ standing: null, profileUses: newestFirst, otherUses: [] })

    it("history A,A,A then B,B: A is usual and filled, and says the latest was B", () => {
        const t = tier(u(25, "b"), u(18, "b"), u(11, "a"), u(4, "a"), u(1, "a"))
        expect(t).toMatchObject({ tier: "usual", fileId: "a", differsFromLast: { chartName: "b", date: d(25) } })
    })

    it("B,A,A,A,A: A is usual with differsFromLast", () => {
        const t = tier(u(25, "b"), u(18, "a"), u(11, "a"), u(4, "a"), u(1, "a"))
        expect(t).toMatchObject({ tier: "usual", fileId: "a" })
        expect(t.differsFromLast?.chartName).toBe("b")
    })

    it("A,B,A,B,A (A latest): usual with no flag", () => {
        const t = tier(u(25, "a"), u(18, "b"), u(11, "a"), u(4, "b"), u(1, "a"))
        expect(t.tier).toBe("usual")
        expect(t.differsFromLast).toBeUndefined()
    })

    it("a dead chart in the latest service takes its place but is never filled", () => {
        const t = tier(u(25, "b", { dead: true }), u(18, "a"), u(11, "a"), u(4, "a"))
        expect(t).toMatchObject({ tier: "usual", fileId: "a", differsFromLast: { chartName: "b" } })
        const allDead = tier(u(25, "b", { dead: true }), u(18, "b", { dead: true }), u(11, "b", { dead: true }))
        expect(allDead.tier).not.toBe("usual")
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
