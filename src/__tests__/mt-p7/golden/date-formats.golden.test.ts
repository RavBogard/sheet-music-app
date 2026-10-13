import { describe, expect, it } from "vitest"
import { format, formatDistance } from "date-fns"

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

export const GOLDEN_TZ = "America/Chicago"

/** Fri 18:30:05 Chicago; Sat 10:00 Chicago; Fri 19:05 Chicago across a year boundary in UTC. */
export const GOLDEN_INSTANTS = [Date.UTC(2026, 9, 9, 23, 30, 5), Date.UTC(2026, 9, 10, 15, 0, 0), Date.UTC(2027, 0, 2, 1, 5, 0)]

type Case = { name: string; kind: "date" | "dateTime" | "time"; locale: string | undefined; opts: Intl.DateTimeFormatOptions; expected: string[] }

export const DATE_CASES: Case[] = [
    { name: "weekday short + month short + day (dashboard rows, HeroCard, TaskCards)", kind: "date", locale: undefined, opts: { weekday: "short", month: "short", day: "numeric" }, expected: ["Fri, Oct 9", "Sat, Oct 10", "Fri, Jan 1"] },
    { name: "month short + day (AddToSetlistSheet, NotificationBell, matrix)", kind: "date", locale: "en-US", opts: { month: "short", day: "numeric" }, expected: ["Oct 9", "Oct 10", "Jan 1"] },
    { name: "month short + day + year (SetlistCards, TemplatesSection)", kind: "date", locale: "en-US", opts: { month: "short", day: "numeric", year: "numeric" }, expected: ["Oct 9, 2026", "Oct 10, 2026", "Jan 1, 2027"] },
    { name: "month long + day + year (notify-band, resend-email)", kind: "date", locale: "en-US", opts: { month: "long", day: "numeric", year: "numeric" }, expected: ["October 9, 2026", "October 10, 2026", "January 1, 2027"] },
    { name: "month long + day (use-setlist-dashboard, liturgical-templates)", kind: "date", locale: "en-US", opts: { month: "long", day: "numeric" }, expected: ["October 9", "October 10", "January 1"] },
    { name: "month long + year (UnifiedCalendar)", kind: "date", locale: "en-US", opts: { month: "long", year: "numeric" }, expected: ["October 2026", "October 2026", "January 2027"] },
    { name: "weekday long + month short + day (SetlistCards)", kind: "date", locale: "en-US", opts: { weekday: "long", month: "short", day: "numeric" }, expected: ["Friday, Oct 9", "Saturday, Oct 10", "Friday, Jan 1"] },
    { name: "numeric month/day (use-setlist-dashboard search)", kind: "date", locale: "en-US", opts: { month: "numeric", day: "numeric" }, expected: ["10/9", "10/10", "1/1"] },
    { name: "month short (LibraryFileRow)", kind: "date", locale: "en-US", opts: { month: "short" }, expected: ["Oct", "Oct", "Jan"] },
    { name: "weekday long (firestore-helpers)", kind: "date", locale: "en-US", opts: { weekday: "long" }, expected: ["Friday", "Saturday", "Friday"] },
    { name: "default date (calendar data-day)", kind: "date", locale: "en-US", opts: {}, expected: ["10/9/2026", "10/10/2026", "1/1/2027"] },
    { name: "default date-time (AccessAuditLog, UserRow title)", kind: "dateTime", locale: "en-US", opts: {}, expected: ["10/9/2026, 6:30:05 PM", "10/10/2026, 10:00:00 AM", "1/1/2027, 7:05:00 PM"] },
    { name: "default time (DashboardClient diag)", kind: "time", locale: "en-US", opts: {}, expected: ["6:30:05 PM", "10:00:00 AM", "7:05:00 PM"] },
    { name: "history short date-time (SetlistHistoryPanel)", kind: "dateTime", locale: "en-US", opts: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, expected: ["Oct 9, 6:30 PM", "Oct 10, 10:00 AM", "Jan 1, 7:05 PM"] },
]

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

/** date-fns patterns in use today (setlist modals, wizard, importer, meta sheet). Local-midday instant so the runtime zone cannot move the day. */
export const DATE_FNS_CASES: Array<{ pattern: string; expected: string }> = [
    { pattern: "PPP", expected: "October 9th, 2026" },
    { pattern: "MMM d", expected: "Oct 9" },
]
export const DATE_FNS_INSTANT = () => new Date(2026, 9, 9, 12, 0, 0)

/** formatDistanceToNow(..., { addSuffix: true }) as LibraryDataSection / UserRow show it. */
export const RELATIVE_BASE = Date.UTC(2026, 9, 10, 12, 0, 0)
export const RELATIVE_CASES: Array<{ secondsAgo: number; expected: string }> = [
    { secondsAgo: 10, expected: "less than a minute ago" },
    { secondsAgo: 50, expected: "1 minute ago" },
    { secondsAgo: 90, expected: "2 minutes ago" },
    { secondsAgo: 2700, expected: "about 1 hour ago" },
    { secondsAgo: 7200, expected: "about 2 hours ago" },
    { secondsAgo: 103680, expected: "1 day ago" },
    { secondsAgo: 259200, expected: "3 days ago" },
    { secondsAgo: 3456000, expected: "about 1 month ago" },
    { secondsAgo: 34560000, expected: "about 1 year ago" },
    { secondsAgo: -259200, expected: "in 3 days" },
]

describe("phase 7 golden: today's date-fns output", () => {
    it.each(DATE_FNS_CASES)("format($pattern)", ({ pattern, expected }) => {
        expect(format(DATE_FNS_INSTANT(), pattern)).toBe(expected)
    })
    it.each(RELATIVE_CASES)("formatDistance $secondsAgo s ago", ({ secondsAgo, expected }) => {
        expect(formatDistance(new Date(RELATIVE_BASE - secondsAgo * 1000), new Date(RELATIVE_BASE), { addSuffix: true })).toBe(expected)
    })
})
