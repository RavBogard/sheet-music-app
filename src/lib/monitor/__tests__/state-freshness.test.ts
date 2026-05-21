import { describe, it, expect } from "vitest"
import {
    STALE_STATE_THRESHOLD_SECONDS,
    firestoreDateToMillis,
    computeStateAgeSeconds,
    isStateStale,
} from "@/lib/monitor/state-freshness"

describe("state-freshness (C-6)", () => {
    it("uses the 90s threshold (matches the MCP server-monitor copy)", () => {
        expect(STALE_STATE_THRESHOLD_SECONDS).toBe(90)
    })

    describe("firestoreDateToMillis", () => {
        it("coerces epoch millis", () => {
            expect(firestoreDateToMillis(1_700_000_000_000)).toBe(1_700_000_000_000)
        })
        it("coerces an ISO string", () => {
            const iso = "2026-05-21T12:00:00.000Z"
            expect(firestoreDateToMillis(iso)).toBe(Date.parse(iso))
        })
        it("coerces a raw {seconds, nanoseconds}", () => {
            expect(firestoreDateToMillis({ seconds: 1700, nanoseconds: 500_000_000 })).toBe(1700 * 1000 + 500)
        })
        it("coerces a Timestamp-like {toMillis}", () => {
            expect(firestoreDateToMillis({ toMillis: () => 12345 })).toBe(12345)
        })
        it("coerces a Date-like {toDate}", () => {
            const d = new Date("2026-01-01T00:00:00.000Z")
            expect(firestoreDateToMillis({ toDate: () => d })).toBe(d.getTime())
        })
        it("returns null for null / garbage / NaN", () => {
            expect(firestoreDateToMillis(null)).toBeNull()
            expect(firestoreDateToMillis(undefined)).toBeNull()
            expect(firestoreDateToMillis("not-a-date")).toBeNull()
            expect(firestoreDateToMillis(NaN)).toBeNull()
            expect(firestoreDateToMillis({})).toBeNull()
        })
    })

    describe("computeStateAgeSeconds", () => {
        it("computes whole-second age against an injected now", () => {
            const now = 1_000_000_000
            expect(computeStateAgeSeconds(now - 45_000, now)).toBe(45)
        })
        it("returns null when updatedAt is uncoercible", () => {
            expect(computeStateAgeSeconds(null, 1_000_000_000)).toBeNull()
        })
    })

    describe("isStateStale", () => {
        it("treats a missing timestamp (null age) as stale", () => {
            expect(isStateStale(null)).toBe(true)
        })
        it("is fresh at and below the threshold", () => {
            expect(isStateStale(0)).toBe(false)
            expect(isStateStale(90)).toBe(false)
        })
        it("is stale above the threshold", () => {
            expect(isStateStale(91)).toBe(true)
            expect(isStateStale(7_200)).toBe(true)
        })
    })
})
