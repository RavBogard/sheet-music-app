import { describe, expect, it } from "vitest"
import { format, formatDistance } from "date-fns"
import {
    DATE_CASES,
    DATE_FNS_CASES,
    DATE_FNS_INSTANT,
    GOLDEN_INSTANTS,
    GOLDEN_TZ,
    RELATIVE_BASE,
    RELATIVE_CASES,
    type Case,
} from "./date-format-cases"

/**
 * Multi-tenant phase 7 golden — today's English date/number formats.
 *
 * Every pattern below is one the app calls today (`toLocaleDateString`,
 * `toLocaleString`, `toLocaleTimeString`, date-fns `format` /
 * `formatDistanceToNow`; inventory in P7-I18N-GUIDE.md). The expected strings
 * were captured from the unchanged code (master 745c1c16) with the zone pinned
 * to America/Chicago, CRC's and BL's zone. The phase 7 helpers
 * (src/i18n/format.ts) must reproduce every one of them for an English tenant:
 * see src/__tests__/mt-p7/format.test.ts, which runs the same table through
 * the helpers.
 */


function raw(c: Case, ms: number): string {
    const d = new Date(ms)
    const o = { ...c.opts, timeZone: GOLDEN_TZ }
    // `undefined` locale = the runtime default; CRC's browsers and this test runtime are en-US.
    const loc = c.locale ?? "en-US"
    if (c.kind === "dateTime") return d.toLocaleString(loc, o)
    if (c.kind === "time") return d.toLocaleTimeString(loc, o)
    return d.toLocaleDateString(loc, o)
}

describe("phase 7 golden: today's English date formats (America/Chicago)", () => {
    for (const c of DATE_CASES) {
        it(c.name, () => {
            expect(GOLDEN_INSTANTS.map((ms) => raw(c, ms))).toEqual(c.expected)
        })
    }

    it("number formatting (toLocaleString en-US)", () => {
        expect((1234567.891).toLocaleString("en-US")).toBe("1,234,567.891")
        expect((42).toLocaleString("en-US")).toBe("42")
    })
})


describe("phase 7 golden: today's date-fns output", () => {
    it.each(DATE_FNS_CASES)("format($pattern)", ({ pattern, expected }) => {
        expect(format(DATE_FNS_INSTANT(), pattern)).toBe(expected)
    })
    it.each(RELATIVE_CASES)("formatDistance $secondsAgo s ago", ({ secondsAgo, expected }) => {
        expect(formatDistance(new Date(RELATIVE_BASE - secondsAgo * 1000), new Date(RELATIVE_BASE), { addSuffix: true })).toBe(expected)
    })
})
