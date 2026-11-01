import { describe, it, expect } from "vitest"
import { alertDecision, servicesInAlertWindow } from "@/app/api/cron/bridge-watch/service-window"
import { resolveServiceStartMs } from "@/lib/monitor/service-start"

/**
 * The studio PC is off most of the week. The bridge check may only speak in the
 * 20-40 minutes before a service starts; everywhere else, "down" is normal.
 */

const MIN = 60_000
const TZ = "America/Chicago"

// Friday 2026-10-30 is still CDT (UTC-5); Friday 2026-11-06 is CST (UTC-6), after DST ended on 2026-11-01.
const FRI_CDT_1815 = Date.parse("2026-10-30T23:15:00Z")
const FRI_CST_1815 = Date.parse("2026-11-07T00:15:00Z")

const svc = (over: Record<string, unknown> = {}) => ({
    setlistId: "sl1",
    name: "Friday evening",
    eventDate: "2026-10-30",
    startsAt: new Date(FRI_CDT_1815).toISOString(),
    ...over,
})

describe("servicesInAlertWindow", () => {
    it("opens 40 minutes before the start and closes 20 minutes before", () => {
        const s = [svc()]
        expect(servicesInAlertWindow(s, FRI_CDT_1815 - 41 * MIN, TZ)).toHaveLength(0)
        expect(servicesInAlertWindow(s, FRI_CDT_1815 - 40 * MIN, TZ)).toHaveLength(1)
        expect(servicesInAlertWindow(s, FRI_CDT_1815 - 30 * MIN, TZ)).toHaveLength(1)
        expect(servicesInAlertWindow(s, FRI_CDT_1815 - 20 * MIN, TZ)).toHaveLength(1)
        expect(servicesInAlertWindow(s, FRI_CDT_1815 - 19 * MIN, TZ)).toHaveLength(0)
    })

    it("is silent the rest of the time: a quiet week, mid-service and after it", () => {
        const s = [svc()]
        for (const offset of [-7 * 24 * 60, -5 * 60, -45, -10, 0, 60, 3 * 60]) {
            expect(servicesInAlertWindow(s, FRI_CDT_1815 + offset * MIN, TZ)).toEqual([])
        }
    })

    it("gives a 15-minute cron at least one hit per service even when a run is late", () => {
        const s = [svc()]
        for (let phase = 0; phase < 15; phase++) {
            let hits = 0
            for (let t = FRI_CDT_1815 - 3 * 60 * MIN + phase * MIN; t < FRI_CDT_1815; t += 15 * MIN) {
                hits += servicesInAlertWindow(s, t, TZ).length
            }
            expect(hits).toBeGreaterThanOrEqual(1)
        }
    })

    it("has no service, so no check, on a day with no setlist", () => {
        expect(servicesInAlertWindow([], FRI_CDT_1815 - 30 * MIN, TZ)).toEqual([])
    })

    it("follows the wall clock across the DST change (18:15 is 18:15 before and after)", () => {
        const cdt = [svc()]
        const cst = [svc({ setlistId: "sl2", eventDate: "2026-11-06", startsAt: new Date(FRI_CST_1815).toISOString() })]
        // Same local time, an hour apart in UTC.
        expect(FRI_CST_1815 - FRI_CDT_1815).toBe(7 * 24 * 60 * MIN + 60 * MIN)
        expect(servicesInAlertWindow(cdt, FRI_CDT_1815 - 30 * MIN, TZ)).toHaveLength(1)
        expect(servicesInAlertWindow(cst, FRI_CST_1815 - 30 * MIN, TZ)).toHaveLength(1)
        // The CDT instant is not 30 minutes before the CST service.
        expect(servicesInAlertWindow(cst, FRI_CDT_1815 + 7 * 24 * 60 * MIN - 30 * MIN, TZ)).toHaveLength(0)
    })

    it("falls back to Friday 18:15 for a service with no time, in CDT and in CST", () => {
        const noTimeCdt = [svc({ startsAt: undefined })]
        const noTimeCst = [svc({ setlistId: "sl2", eventDate: "2026-11-06", startsAt: undefined })]
        expect(servicesInAlertWindow(noTimeCdt, FRI_CDT_1815 - 30 * MIN, TZ)).toHaveLength(1)
        expect(servicesInAlertWindow(noTimeCst, FRI_CST_1815 - 30 * MIN, TZ)).toHaveLength(1)
    })

    it("falls back to Saturday 10:00 for a Saturday service with no time", () => {
        // 2026-11-07 is a Saturday in CST: 10:00 local = 16:00Z.
        const sat = Date.parse("2026-11-07T16:00:00Z")
        expect(resolveServiceStartMs({ eventDate: "2026-11-07" }, TZ)).toBe(sat)
        expect(servicesInAlertWindow([svc({ eventDate: "2026-11-07", startsAt: undefined })], sat - 30 * MIN, TZ)).toHaveLength(1)
    })

    it("does not guess a time for a service with none on any other weekday", () => {
        expect(resolveServiceStartMs({ eventDate: "2026-11-04" }, TZ)).toBeNull() // a Wednesday
        expect(servicesInAlertWindow([svc({ eventDate: "2026-11-04", startsAt: undefined })], FRI_CDT_1815, TZ)).toEqual([])
    })

    it("checks a service on any day, and gives each service its own key", () => {
        const wed = Date.parse("2026-11-04T01:00:00Z") // a holiday-night service
        const out = servicesInAlertWindow(
            [svc({ setlistId: "hol", eventDate: "2026-11-03", startsAt: new Date(wed).toISOString() }), svc()],
            wed - 30 * MIN,
            TZ,
        )
        expect(out.map((s) => s.setlistId)).toEqual(["hol"])
        expect(out[0].key).toBe(`hol@${wed}`)
    })
})

describe("alertDecision — one alert per service per problem", () => {
    const keyA = `sl1@${FRI_CDT_1815}`
    const keyB = `sl2@${FRI_CST_1815}`
    const notifiedA = { serviceKey: keyA, signature: "down", lastNotifiedAt: new Date() }

    it("notifies the first time a service is found down", () => {
        expect(alertDecision(undefined, keyA, "down")).toBe("notify")
    })

    it("stays quiet on the later runs in the same window for the same problem", () => {
        expect(alertDecision(notifiedA, keyA, "down")).toBe("suppress")
    })

    it("speaks again when the same service's problem changes shape", () => {
        expect(alertDecision(notifiedA, keyA, "mixer-unreachable")).toBe("notify")
    })

    it("resets for the next service: the same problem alerts again", () => {
        expect(alertDecision(notifiedA, keyB, "down")).toBe("notify")
    })

    it("notifies when the stored record predates per-service keys", () => {
        expect(alertDecision({ signature: "down", lastNotifiedAt: new Date() }, keyA, "down")).toBe("notify")
    })
})
