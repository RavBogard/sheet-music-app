import { beforeEach, describe, expect, it, vi } from "vitest"

import { tenantState } from "./tenant-mocks"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"

/**
 * Multi-tenant phase 1 golden — robots.txt and sitemap.xml. Both hosts serve
 * https://centralreform.live today (golden/http-before/{crc,brotherslazaroff}/
 * text_robots.txt.txt, text_sitemap.xml.txt); BL is frozen to that.
 */
vi.mock("next/headers", async () => (await import("./tenant-mocks")).headersMock())
vi.mock("@/lib/org/registry", async (orig) => (await import("./tenant-mocks")).registryMock(orig))
vi.mock("@/lib/org/get-org-config", async (orig) => (await import("./tenant-mocks")).getOrgConfigMock(orig))
vi.mock("@/lib/firebase-admin", async () => (await import("./tenant-mocks")).firebaseAdminMock())

const ROBOTS = (base: string) => ({
    rules: {
        userAgent: "*",
        allow: ["/", "/perform", "/privacy", "/terms", "/sms-consent", "/changelog"],
        disallow: "/",
    },
    sitemap: `${base}/sitemap.xml`,
})

const SITEMAP = (base: string) => [
    { url: `${base}/`, changeFrequency: "monthly", priority: 1.0 },
    { url: `${base}/perform`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/sms-consent`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/changelog`, changeFrequency: "weekly", priority: 0.6 },
]

async function run(org: string) {
    tenantState.org = org
    const { default: robots } = await import("@/app/robots")
    const { default: sitemap } = await import("@/app/sitemap")
    const r = await robots()
    const s = await sitemap()
    for (const e of s) expect(e.lastModified).toBeInstanceOf(Date)
    return { robots: r, sitemap: s.map(({ lastModified: _lm, ...rest }) => rest) }
}

describe("multi-tenant P1 golden: robots + sitemap", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    it("crc → https://centralreform.live", async () => {
        const out = await run("crc")
        expect(out.robots).toEqual(ROBOTS("https://centralreform.live"))
        expect(out.sitemap).toEqual(SITEMAP("https://centralreform.live"))
    })

    it("brotherslazaroff → https://centralreform.live (frozen)", async () => {
        const out = await run("brotherslazaroff")
        expect(out.robots).toEqual(ROBOTS("https://centralreform.live"))
        expect(out.sitemap).toEqual(SITEMAP("https://centralreform.live"))
    })
})

describe("multi-tenant P1: robots + sitemap use the request tenant's host", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    it("testshul → https://testshul.vercel.app", async () => {
        const out = await run("testshul")
        expect(out.robots).toEqual(ROBOTS("https://testshul.vercel.app"))
        expect(out.sitemap).toEqual(SITEMAP("https://testshul.vercel.app"))
    })
})
