// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Multi-tenant phase 1 golden: the house-style chart HTML create_chart renders.
 * crc and brotherslazaroff charts keep today's exact HTML (footer included); a
 * testshul chart carries its own tenant's footer; an explicit footer on the
 * chart still wins.
 */

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    getFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) }),
}))
vi.mock("@/lib/rate-limit", () => ({ checkUserRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/mcp/tools/uploader-roles", async (orig) => {
    const real = await orig<typeof import("@/lib/mcp/tools/uploader-roles")>()
    return { ...real, loadUploader: async () => ({ role: "band_leader", canUpload: true, email: "d@x" }) }
})

import { createChart, type CreateChartArgs } from "@/lib/mcp/tools/authored-chart"
import { houseChartHtml, type HouseChart } from "@/lib/chart-render/house-chart-html"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { primeTestOrg } from "@/lib/org/__tests__/test-org-config"

const CHART: HouseChart = {
    title: "Practice Tune",
    keyMeter: "G · 4/4",
    subtitle: "rehearsal",
    progressions: [{ label: "A", bars: ["G", "C", "D", "G"] }],
    sections: [{ label: "A", stanzas: [{ lines: ["[G]la la [C]la", "[D]la la [G]la"] }] }],
}

async function renderedHtml(org: string, chart: HouseChart = CHART): Promise<string> {
    const render = vi.fn(async () => ({ bytes: Buffer.from("png"), mimeType: "image/png", pageCount: 1, renderMs: 1 }))
    const args: CreateChartArgs = { mode: "preview", title: chart.title, source: { kind: "chart", chart } }
    const r = await createChart("u1", args, org, { render } as never)
    expect(r).toMatchObject({ ok: true, mode: "preview" })
    return (render.mock.calls[0] as unknown as [string])[0]
}

const GOLDEN_FOOTER =
    '<div class="ft"><span>Central Reform Congregation</span><span>centralreform.live</span></div>'

beforeEach(() => {
    clearPrimedOrgConfigs()
})

describe("golden: house chart HTML via create_chart", () => {
    it("golden crc", async () => {
        const html = await renderedHtml("crc")
        expect(html).toBe(houseChartHtml(CHART))
        expect(html).toContain(GOLDEN_FOOTER)
    })
    it("golden brotherslazaroff (frozen CRC footer)", async () => {
        const html = await renderedHtml("brotherslazaroff")
        expect(html).toBe(houseChartHtml(CHART))
        expect(html).toContain(GOLDEN_FOOTER)
    })
    it("golden explicit chart footer wins", async () => {
        const html = await renderedHtml("brotherslazaroff", { ...CHART, footerLeft: "Left", footerRight: "Right" })
        expect(html).toContain('<div class="ft"><span>Left</span><span>Right</span></div>')
    })
})
