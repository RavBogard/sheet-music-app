import { describe, expect, it } from "vitest"
import { chartVersionOf, isCachedChartStale } from "../chart-version"

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

describe("isCachedChartStale", () => {
    it("is never stale when the chart isn't cached (that is a plain save)", () => {
        expect(isCachedChartStale(undefined, "h:a")).toBe(false)
    })
    it("is never stale without a server version", () => {
        expect(isCachedChartStale("h:a", undefined)).toBe(false)
        expect(isCachedChartStale(null, null)).toBe(false)
    })
    it("treats an unversioned cached entry as stale once the server knows a version", () => {
        expect(isCachedChartStale(null, "h:a")).toBe(true)
    })
    it("compares versions", () => {
        expect(isCachedChartStale("h:a", "h:a")).toBe(false)
        expect(isCachedChartStale("h:a", "h:b")).toBe(true)
        expect(isCachedChartStale("u:1", "h:a")).toBe(true)
    })
})
