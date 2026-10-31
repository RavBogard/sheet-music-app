import { describe, it, expect } from "vitest"
import { boundedSurface, counterDocId, utcDay } from "../usage-counters"

describe("usage counters", () => {
    it("keeps known routes and the client's placeholders", () => {
        expect(boundedSurface("/perform/setlist/[id]")).toBe("/perform/setlist/[id]")
        expect(boundedSurface("/setlists")).toBe("/setlists")
        expect(boundedSurface("/")).toBe("/")
    })
    it("collapses invented or oversized paths so the collection cannot grow", () => {
        expect(boundedSurface("/evil/anything")).toBe("other")
        expect(boundedSurface("/perform/ABC123raw")).toBe("other")
        expect(boundedSurface("/" + "a/".repeat(80))).toBe("other")
        expect(boundedSurface("nope")).toBe("other")
    })
    it("builds a stable doc id per day, tenant and route", () => {
        expect(counterDocId("2026-10-31", "crc", "/perform/setlist/[id]")).toBe("2026-10-31__crc__~perform~setlist~[id]")
        expect(utcDay(new Date("2026-10-31T23:59:00Z"))).toBe("2026-10-31")
    })
})
