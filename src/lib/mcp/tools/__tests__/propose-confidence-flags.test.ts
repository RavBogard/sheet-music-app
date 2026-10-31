import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/firebase-admin", () => ({ initAdmin: vi.fn(), getFirestore: vi.fn() }))

import { computeProposalEnvelope } from "../propose-changes"

/**
 * MCP-16 — bond confidence asks whether the chart fits the row and the
 * slot's history, not only how specific the chart's own title is.
 */
describe("propose_setlist_changes confidence flags", () => {
    const rows = new Map<string, Record<string, unknown> | null>([
        ["mi-moshav", { name: "Mi chamocha (Moshav).pdf", titleSpecificity: 0.9 }],
        ["adon", { name: "Adon Olam (IWITW).pdf", titleSpecificity: 0.9 }],
    ])

    it("a specific chart that does not fit the row's title is flagged and not high", () => {
        const e = computeProposalEnvelope({ action: "add", title: "Adon Olam", songId: "mi-moshav" } as never, rows)
        expect(e.flags).toContain("title_mismatch")
        expect(e.confidence).toBe("medium")
    })

    it("a key other than the slot's history is flagged", () => {
        const e = computeProposalEnvelope({ action: "add", title: "Mi Chamocha", songId: "mi-moshav", key: "D" } as never, rows, {
            match: false,
            stale: false,
            historyKey: "E",
        })
        expect(e.flags).toContain("key_differs_from_history")
        expect(e.confidence).toBe("medium")
    })

    it("a profile match is high, but capped at medium when its usual is stale", () => {
        const fresh = computeProposalEnvelope({ action: "add", title: "Mi Chamocha", songId: "mi-moshav", key: "E" } as never, rows, {
            match: true,
            stale: false,
            historyKey: "E",
        })
        expect(fresh).toMatchObject({ confidence: "high" })
        expect(fresh.flags).toEqual(["profile_match"])
        const stale = computeProposalEnvelope({ action: "add", title: "Mi Chamocha", songId: "mi-moshav" } as never, rows, {
            match: true,
            stale: true,
            historyKey: "E",
        })
        expect(stale.confidence).toBe("medium")
        expect(stale.flags).toEqual(expect.arrayContaining(["profile_match", "stale_usual"]))
    })
})
