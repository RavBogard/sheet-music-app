import { describe, expect, it } from "vitest"
import { Timestamp } from "firebase-admin/firestore"

import {
    STALE_STATE_THRESHOLD_SECONDS,
    computeStateAgeSeconds,
    isStateStale,
} from "../server-monitor"

/**
 * Pure-function coverage for the monitor state-staleness guard. Fixed clock so
 * exact ages are deterministic (no emulator, no Date.now() drift). The
 * end-to-end tool-surface assertions live in mcp-monitor.emulator.test.ts.
 */
describe("monitor state-staleness helpers", () => {
    // Fixed reference clock: 2026-05-21T18:00:00.000Z.
    const NOW = Date.parse("2026-05-21T18:00:00.000Z")

    describe("computeStateAgeSeconds — coercion across FirestoreDate shapes", () => {
        it("ISO string → whole-second age", () => {
            const threeHoursAgo = "2026-05-21T15:00:00.000Z"
            expect(computeStateAgeSeconds(threeHoursAgo, NOW)).toBe(3 * 3600)
        })

        it("epoch millis → age", () => {
            expect(computeStateAgeSeconds(NOW - 42_000, NOW)).toBe(42)
        })

        it("admin Timestamp (toMillis/toDate) → age", () => {
            const ts = Timestamp.fromMillis(NOW - 90_000)
            expect(computeStateAgeSeconds(ts, NOW)).toBe(90)
        })

        it("raw {seconds, nanoseconds} (deserialized Timestamp) → age", () => {
            const raw = { seconds: Math.floor((NOW - 120_000) / 1000), nanoseconds: 0 }
            expect(computeStateAgeSeconds(raw, NOW)).toBe(120)
        })

        it("rounds to the nearest whole second", () => {
            expect(computeStateAgeSeconds(NOW - 1_400, NOW)).toBe(1)
            expect(computeStateAgeSeconds(NOW - 1_600, NOW)).toBe(2)
        })

        it("missing / null / uncoercible → null", () => {
            expect(computeStateAgeSeconds(null, NOW)).toBeNull()
            expect(computeStateAgeSeconds(undefined, NOW)).toBeNull()
            expect(computeStateAgeSeconds("not-a-date", NOW)).toBeNull()
            expect(computeStateAgeSeconds({}, NOW)).toBeNull()
        })

        it("future timestamp (clock skew) → negative age, not null", () => {
            expect(computeStateAgeSeconds(NOW + 10_000, NOW)).toBe(-10)
        })
    })

    describe("isStateStale — threshold logic", () => {
        it("null age (no timestamp) is stale", () => {
            expect(isStateStale(null)).toBe(true)
        })

        it("age at or under the threshold is fresh", () => {
            expect(isStateStale(0)).toBe(false)
            expect(isStateStale(STALE_STATE_THRESHOLD_SECONDS)).toBe(false)
        })

        it("age over the threshold is stale", () => {
            expect(isStateStale(STALE_STATE_THRESHOLD_SECONDS + 1)).toBe(true)
            expect(isStateStale(3 * 3600)).toBe(true)
        })

        it("negative age (future timestamp) is not stale", () => {
            expect(isStateStale(-10)).toBe(false)
        })
    })

    it("threshold is the documented 90s", () => {
        expect(STALE_STATE_THRESHOLD_SECONDS).toBe(90)
    })
})
