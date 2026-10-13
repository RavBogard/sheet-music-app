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
