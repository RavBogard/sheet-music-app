// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { tForOrg } from "@/i18n/server"

/**
 * Phase 7: the chart scraper's error text comes from the api-charts catalogue.
 * English is unchanged; with the pseudo-locale cookie the same message comes
 * back pseudo-wrapped, which proves it went through t().
 */

const h = vi.hoisted(() => ({ lang: null as string | null }))
vi.mock("next/headers", () => ({
    cookies: async () => ({ get: (n: string) => (n === "ui-lang" && h.lang ? { value: h.lang } : undefined) }),
    headers: async () => new Headers({ "x-org-id": "crc" }),
}))
vi.mock("@/lib/chart-scrape", () => ({ scrapeChart: vi.fn() }))

import { POST } from "../scrape/route"

const badJson = () => new Request("http://x/api/charts/scrape", { method: "POST", body: "{not json" })

describe("api-charts messages", () => {
    beforeEach(() => {
        h.lang = null
    })

    it("English is unchanged", async () => {
        const res = await POST(badJson())
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: "Invalid JSON body" })
    })

    it("comes from the catalogue (pseudo-locale)", async () => {
        h.lang = "qps"
        const res = await POST(badJson())
        const body = (await res.json()) as { error: string }
        expect(body.error).toBe(tForOrg("crc", "qps")("api-charts.invalidJsonBody"))
        expect(body.error.startsWith("⟦")).toBe(true)
    })
})

describe("scrape errors from src/lib/chart-scrape (lane D)", () => {
    beforeEach(() => {
        h.lang = null
    })
    const post = () => POST(new Request("http://x/api/charts/scrape", { method: "POST", body: JSON.stringify({ url: "https://example.test/x" }) }))

    it("English is unchanged (the lib's English sentence and the route's text match)", async () => {
        const { scrapeChart } = await import("@/lib/chart-scrape")
        vi.mocked(scrapeChart).mockResolvedValueOnce({ ok: false, status: 502, error: "Failed to fetch URL: Not Found", code: "fetch_status", detail: "Not Found" })
        const res = await post()
        expect(res.status).toBe(502)
        expect(await res.json()).toEqual({ error: "Failed to fetch URL: Not Found" })
        vi.mocked(scrapeChart).mockResolvedValueOnce({
            ok: false, status: 404, code: "no_chart",
            error: "No chord chart detected on this page (or the page is gated/empty). Try a different URL or paste raw text via rawText.",
        })
        const res2 = await post()
        expect(((await res2.json()) as { error: string }).error).toBe(
            "No chord chart detected on this page (or the page is gated/empty). Try a different URL or paste raw text via rawText.",
        )
    })

    it("comes from the catalogue (pseudo-locale)", async () => {
        h.lang = "qps"
        const { scrapeChart } = await import("@/lib/chart-scrape")
        vi.mocked(scrapeChart).mockResolvedValueOnce({ ok: false, status: 500, error: "Failed to scrape chart: boom", code: "scrape_failed", detail: "boom" })
        const body = (await (await post()).json()) as { error: string }
        expect(body.error.startsWith("⟦")).toBe(true)
        expect(body.error).toContain("boom")
    })
})
