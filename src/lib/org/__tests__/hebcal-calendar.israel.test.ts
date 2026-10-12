import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Multi-tenant phase 1 — a tenant on the Israel schedule (primeTestOrg) asks
 * Hebcal with `i=on`, for the civil date in its own zone, and the cache keeps
 * the two schedules apart. Parasha NAMES only; fetch is mocked. Shabbat
 * 30 May 2026 is a week the schedules differ (see the Diaspora golden).
 */

function fakeHebcal() {
    return vi.fn(async (url: string) => ({
        ok: true,
        json: async () => ({
            items: [{ category: "parashat", title: url.includes("i=on") ? "Parashat Beha'alotcha" : "Parashat Nasso" }],
        }),
    }))
}

let fetchMock: ReturnType<typeof fakeHebcal>
beforeEach(async () => {
    vi.resetModules()
    fetchMock = fakeHebcal()
    vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function load() {
    const { primeTestOrg } = await import("@/lib/org/__tests__/test-org-config")
    primeTestOrg()
    return import("@/lib/liturgical-calendar")
}

describe("Israel-schedule tenant", () => {
    it("asks Hebcal for the Israel readings", async () => {
        const { getParasha, getFullServiceContext } = await load()
        expect(await getParasha(new Date("2026-05-30T12:00:00.000Z"), "testshul")).toBe("Beha'alotcha")
        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://www.hebcal.com/shabbat?cfg=json&date=2026-05-30&M=on&geo=none&i=on",
        )
        expect((await getFullServiceContext(new Date("2026-05-30T12:00:00.000Z"), "testshul")).parasha).toBe("Beha'alotcha")
    })

    it("keeps the Diaspora and Israel answers for the same date apart", async () => {
        const { getParasha } = await load()
        const d = new Date("2026-05-30T12:00:00.000Z")
        expect(await getParasha(d, "testshul")).toBe("Beha'alotcha")
        expect(await getParasha(d, "crc")).toBe("Nasso")
        expect(await getParasha(d, "testshul")).toBe("Beha'alotcha")
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("takes the civil date in the tenant's zone", async () => {
        const { getParasha } = await load()
        // 22:30Z Friday 29 May = Saturday 01:30 in Jerusalem, still Friday in Chicago.
        const late = new Date("2026-05-29T22:30:00.000Z")
        await getParasha(late, "testshul")
        await getParasha(late, "crc")
        expect(fetchMock.mock.calls.map((c) => new URL(c[0]).searchParams.get("date"))).toEqual(["2026-05-30", "2026-05-29"])
    })
})
