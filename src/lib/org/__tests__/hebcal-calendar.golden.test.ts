import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Multi-tenant phase 1 GOLDEN — today's Hebcal parasha lookup for crc and
 * brotherslazaroff (both Diaspora, America/Chicago). Written against the code
 * BEFORE the per-tenant calendar change and never edited afterwards.
 *
 * Fetch is mocked: the fake Hebcal answers by schedule (`i=on` = Israel), with
 * parasha NAMES only. Shabbat 30 May 2026 is a week the two schedules differ
 * (the second day of Shavuot fell on Shabbat 23 May in the Diaspora only).
 */

const SHABBAT = new Date("2026-05-30T12:00:00.000Z")
const DIASPORA_URL = "https://www.hebcal.com/shabbat?cfg=json&date=2026-05-30&M=on&geo=none"

function fakeHebcal() {
    return vi.fn(async (url: string) => ({
        ok: true,
        json: async () => ({
            items: [
                { category: "candles" },
                { category: "parashat", title: url.includes("i=on") ? "Parashat Beha'alotcha" : "Parashat Nasso" },
            ],
        }),
    }))
}

let fetchMock: ReturnType<typeof fakeHebcal>
beforeEach(() => {
    vi.resetModules()
    fetchMock = fakeHebcal()
    vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

/* eslint-disable @typescript-eslint/no-explicit-any */
describe.each(["crc", "brotherslazaroff"])("golden hebcal — %s", (org) => {
    it("asks the Diaspora schedule for the civil date and returns its parasha", async () => {
        const { getParasha } = await import("@/lib/liturgical-calendar")
        expect(await (getParasha as any)(SHABBAT, org)).toBe("Nasso")
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0][0]).toBe(DIASPORA_URL)
    })

    it("getFullServiceContext carries the same parasha", async () => {
        const { getFullServiceContext } = await import("@/lib/liturgical-calendar")
        const ctx = await (getFullServiceContext as any)(SHABBAT, org)
        expect(ctx.parasha).toBe("Nasso")
        expect(ctx.isShabbat).toBe(true)
    })
})
