import { describe, expect, it } from "vitest"

import { parseEventDate } from "@/lib/parse-event-date"

/**
 * Cycle-12 FU-c12-2 regression — eventDate is a wall-clock-local
 * America/Chicago concept. Storage as Firestore Timestamps must reflect
 * the intended wall clock, not the process timezone. The traps:
 *
 *   - Naive `"YYYY-MM-DDTHH:MM"` → ECMAScript spec parses as process-local,
 *     which on Vercel (UTC) means 10am input = 10am UTC = 5am Chicago.
 *   - Explicit `"...Z"` from agents constructing ISO without thinking → same.
 *
 * The helper interprets naive inputs as America/Chicago (DST-aware) and
 * preserves explicit-offset/Z inputs literally.
 */

const iso = (ts: { toDate(): Date }) => ts.toDate().toISOString()

describe("parseEventDate", () => {
    it("Date instance: preserved verbatim", () => {
        const d = new Date("2026-05-30T10:00:00.000Z")
        expect(iso(parseEventDate(d))).toBe("2026-05-30T10:00:00.000Z")
    })

    describe("date-only (YYYY-MM-DD)", () => {
        it("May (CDT, UTC-5) → noon Chicago = 17:00Z", () => {
            expect(iso(parseEventDate("2026-05-30"))).toBe(
                "2026-05-30T17:00:00.000Z",
            )
        })

        it("January (CST, UTC-6) → noon Chicago = 18:00Z", () => {
            expect(iso(parseEventDate("2026-01-15"))).toBe(
                "2026-01-15T18:00:00.000Z",
            )
        })

        it("DST spring-forward (March): boundary is at 2am, noon is safe", () => {
            // 2026 spring-forward = 2026-03-08T02:00 CST → CDT
            expect(iso(parseEventDate("2026-03-08"))).toBe(
                "2026-03-08T17:00:00.000Z",
            )
        })

        it("DST fall-back (November): boundary is at 2am, noon is safe", () => {
            // 2026 fall-back = 2026-11-01T02:00 CDT → CST
            expect(iso(parseEventDate("2026-11-01"))).toBe(
                "2026-11-01T18:00:00.000Z",
            )
        })
    })

    describe("naive datetime (no TZ suffix) — interpret as America/Chicago", () => {
        it('"2026-05-30T10:00" (no seconds, CDT) → 15:00Z', () => {
            expect(iso(parseEventDate("2026-05-30T10:00"))).toBe(
                "2026-05-30T15:00:00.000Z",
            )
        })

        it('"2026-05-30T10:00:00" (with seconds, CDT) → 15:00Z', () => {
            expect(iso(parseEventDate("2026-05-30T10:00:00"))).toBe(
                "2026-05-30T15:00:00.000Z",
            )
        })

        it('"2026-05-30T10:00:00.123" (with millis) → 15:00:00.123Z', () => {
            expect(iso(parseEventDate("2026-05-30T10:00:00.123"))).toBe(
                "2026-05-30T15:00:00.123Z",
            )
        })

        it('winter "2026-01-30T10:00:00" (CST, UTC-6) → 16:00Z', () => {
            expect(iso(parseEventDate("2026-01-30T10:00:00"))).toBe(
                "2026-01-30T16:00:00.000Z",
            )
        })

        it("evening service: Friday 7pm Chicago (CDT) → 00:00Z next day", () => {
            // Friday May 29 7pm CDT = Saturday May 30 00:00Z
            expect(iso(parseEventDate("2026-05-29T19:00:00"))).toBe(
                "2026-05-30T00:00:00.000Z",
            )
        })
    })

    describe("explicit-offset / Z inputs — preserved verbatim", () => {
        it('"2026-05-30T10:00:00.000Z" (explicit UTC) → preserved as 10:00Z', () => {
            // This is the trap-shape: a caller saying "10am UTC literal".
            // We honor literal Z because the alternative (auto-remapping
            // to Chicago) would surprise legitimate UTC users. The MCP
            // docstring guides callers away from Z for eventDate.
            expect(iso(parseEventDate("2026-05-30T10:00:00.000Z"))).toBe(
                "2026-05-30T10:00:00.000Z",
            )
        })

        it('"2026-05-30T10:00:00-05:00" (explicit CDT) → 15:00Z', () => {
            expect(iso(parseEventDate("2026-05-30T10:00:00-05:00"))).toBe(
                "2026-05-30T15:00:00.000Z",
            )
        })

        it('"2026-01-30T10:00:00-06:00" (explicit CST) → 16:00Z', () => {
            expect(iso(parseEventDate("2026-01-30T10:00:00-06:00"))).toBe(
                "2026-01-30T16:00:00.000Z",
            )
        })

        it('"2026-05-30T15:00:00+00:00" (explicit UTC offset) → 15:00Z', () => {
            expect(iso(parseEventDate("2026-05-30T15:00:00+00:00"))).toBe(
                "2026-05-30T15:00:00.000Z",
            )
        })
    })

    describe("cd2010f4 round-trip — the load-bearing exemplar", () => {
        it("intent-as-naive: 10am Chicago Saturday May 30 → 15:00Z", () => {
            // The fix path: clone_setlist_from_template({newEventDate: "2026-05-30T10:00"})
            // now stores the correct wall-clock-local moment.
            expect(iso(parseEventDate("2026-05-30T10:00"))).toBe(
                "2026-05-30T15:00:00.000Z",
            )
        })

        it("intent-as-CDT-offset: 10am-05:00 Saturday May 30 → 15:00Z (equivalent)", () => {
            expect(iso(parseEventDate("2026-05-30T10:00:00-05:00"))).toBe(
                "2026-05-30T15:00:00.000Z",
            )
        })

        it("legacy/trap value: explicit Z preserved (would need data-fix to correct)", () => {
            // Documents the standing behavior; the data-fix path is a
            // follow-up update_setlist call with naive datetime.
            expect(iso(parseEventDate("2026-05-30T10:00:00.000Z"))).toBe(
                "2026-05-30T10:00:00.000Z",
            )
        })
    })
})
