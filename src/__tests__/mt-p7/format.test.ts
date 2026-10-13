import { describe, expect, it } from "vitest"
import { format, formatDistance } from "date-fns"

import { createFormatter, formatDate, formatRelative, toDate } from "@/i18n/format"
import {
    DATE_CASES,
    DATE_FNS_CASES,
    DATE_FNS_INSTANT,
    GOLDEN_INSTANTS,
    GOLDEN_TZ,
    RELATIVE_BASE,
    RELATIVE_CASES,
} from "./golden/date-format-cases"

/**
 * Phase 7: the format helpers reproduce today's English output exactly
 * (golden table), and a Hebrew tenant gets Hebrew in Asia/Jerusalem.
 */
describe("English helpers equal today's output", () => {
    const chicago = createFormatter({ lang: "en", timeZone: GOLDEN_TZ })
    for (const c of DATE_CASES) {
        it(`golden: ${c.name}`, () => {
            const f = c.kind === "dateTime" ? chicago.dateTime : c.kind === "time" ? chicago.time : chicago.date
            expect(GOLDEN_INSTANTS.map((ms) => f(new Date(ms), c.opts))).toEqual(c.expected)
        })
    }

    it("runtime zone (CRC/BL: no zone configured) equals the raw call in this runtime", () => {
        const fmt = createFormatter({ lang: "en" })
        for (const c of DATE_CASES) {
            for (const ms of GOLDEN_INSTANTS) {
                const d = new Date(ms)
                const raw =
                    c.kind === "dateTime" ? d.toLocaleString("en-US", c.opts) : c.kind === "time" ? d.toLocaleTimeString("en-US", c.opts) : d.toLocaleDateString("en-US", c.opts)
                const got = c.kind === "dateTime" ? fmt.dateTime(d, c.opts) : c.kind === "time" ? fmt.time(d, c.opts) : fmt.date(d, c.opts)
                expect(got).toBe(raw)
            }
        }
        expect(fmt.number(1234567.891)).toBe((1234567.891).toLocaleString("en-US"))
    })

    it.each(DATE_FNS_CASES)("pattern $pattern equals date-fns", ({ pattern, expected }) => {
        expect(createFormatter({ lang: "en" }).pattern(DATE_FNS_INSTANT(), pattern)).toBe(expected)
        expect(createFormatter({ lang: "en" }).pattern(DATE_FNS_INSTANT(), pattern)).toBe(format(DATE_FNS_INSTANT(), pattern))
    })

    it.each(RELATIVE_CASES)("relative $secondsAgo s ago equals date-fns formatDistance", ({ secondsAgo, expected }) => {
        const d = RELATIVE_BASE - secondsAgo * 1000
        expect(formatRelative(d, { lang: "en" }, RELATIVE_BASE)).toBe(expected)
        expect(formatRelative(d, { lang: "en" }, RELATIVE_BASE)).toBe(formatDistance(d, RELATIVE_BASE, { addSuffix: true }))
    })

    it("accepts Firestore-like timestamps, numbers, strings; '' for missing/invalid", () => {
        const ms = GOLDEN_INSTANTS[1]
        const ts = { toDate: () => new Date(ms) }
        expect(toDate(ts)?.getTime()).toBe(ms)
        expect(formatDate(null, {}, { lang: "en" })).toBe("")
        expect(formatDate("not a date", {}, { lang: "en" })).toBe("")
        expect(formatDate(new Date(ms).toISOString(), { month: "short", day: "numeric" }, { lang: "en", timeZone: GOLDEN_TZ })).toBe("Oct 10")
    })
})

describe("Hebrew tenant: Hebrew text in Asia/Jerusalem", () => {
    const fmt = createFormatter({ lang: "he", timeZone: "Asia/Jerusalem" })

    it("dates fall on the Jerusalem day and read in Hebrew", () => {
        // 23:30Z Friday = 02:30 Saturday in Jerusalem (UTC+3 in October).
        const s = fmt.date(GOLDEN_INSTANTS[0], { weekday: "long" })
        expect(s).toBe(new Date(GOLDEN_INSTANTS[0]).toLocaleDateString("he-IL", { weekday: "long", timeZone: "Asia/Jerusalem" }))
        expect(s).toMatch(/שבת/)
        expect(fmt.time(GOLDEN_INSTANTS[0], { hour: "2-digit", minute: "2-digit" })).toBe("02:30")
    })

    it("an explicit timeZone in the options still wins", () => {
        expect(fmt.time(GOLDEN_INSTANTS[0], { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })).toBe("23:30")
    })

    it("patterns map to Intl; machine patterns stay date-fns", () => {
        expect(fmt.pattern(DATE_FNS_INSTANT(), "PPP")).toMatch(/2026/)
        expect(fmt.pattern(DATE_FNS_INSTANT(), "PPP")).toMatch(/באוקטובר/)
        expect(fmt.pattern(DATE_FNS_INSTANT(), "yyyy-MM-dd")).toBe("2026-10-09")
    })

    it("relative time in Hebrew", () => {
        expect(fmt.relative(RELATIVE_BASE - 3 * 86400_000, RELATIVE_BASE)).toBe(new Intl.RelativeTimeFormat("he-IL", { numeric: "auto" }).format(-3, "day"))
        expect(fmt.relative(RELATIVE_BASE - 5_000, RELATIVE_BASE)).toBe(new Intl.RelativeTimeFormat("he-IL", { numeric: "auto" }).format(0, "second"))
    })

    it("pseudo-locale wraps formatted output so the pseudo scan accepts it", () => {
        const q = createFormatter({ lang: "qps" })
        expect(q.date(GOLDEN_INSTANTS[1], { month: "short" })).toMatch(/^⟦.*⟧$/)
    })
})
