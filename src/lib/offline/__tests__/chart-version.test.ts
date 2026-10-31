import { describe, expect, it } from "vitest"
import { chartVersionOf, planForCachedChart } from "../chart-version"

describe("chartVersionOf", () => {
    it("prefers the content hash (object or string form)", () => {
        expect(chartVersionOf({ contentHash: { alg: "sha256", value: "abc" }, updatedAt: 5 })).toBe("h:abc")
        expect(chartVersionOf({ contentHash: "def" })).toBe("h:def")
    })

    it("falls back to updatedAt across timestamp shapes", () => {
        expect(chartVersionOf({ updatedAt: 1700000000000 })).toBe("u:1700000000000")
        expect(chartVersionOf({ updatedAt: { toMillis: () => 42 } })).toBe("u:42")
        expect(chartVersionOf({ updatedAt: { _seconds: 3 } })).toBe("u:3000")
        expect(chartVersionOf({ updatedAt: "2026-10-31T00:00:00.000Z" })).toBe(`u:${Date.parse("2026-10-31T00:00:00.000Z")}`)
    })

    it("returns null when the row carries neither", () => {
        expect(chartVersionOf(undefined)).toBeNull()
        expect(chartVersionOf({})).toBeNull()
        expect(chartVersionOf({ contentHash: { alg: "sha256" }, updatedAt: "nope" })).toBeNull()
    })
})

describe("planForCachedChart", () => {
    it("does nothing without a server version, or when already current", () => {
        expect(planForCachedChart("h:a", undefined)).toBe("none")
        expect(planForCachedChart(null, null)).toBe("none")
        expect(planForCachedChart("h:a", "h:a")).toBe("none")
        expect(planForCachedChart("u:1", "u:1")).toBe("none")
    })
    it("checks the bytes on the device first whenever the server knows a hash", () => {
        expect(planForCachedChart(null, "h:a")).toBe("hash-check")
        expect(planForCachedChart("h:a", "h:b")).toBe("hash-check")
        expect(planForCachedChart("u:1", "h:a")).toBe("hash-check")
    })
    it("refreshes a versioned entry whose updatedAt differs, but never assumes a legacy entry stale", () => {
        expect(planForCachedChart("u:1", "u:2")).toBe("refresh")
        expect(planForCachedChart("h:a", "u:2")).toBe("refresh")
        expect(planForCachedChart(null, "u:2")).toBe("none")
    })
})
