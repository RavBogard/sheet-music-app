import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToString } from "react-dom/server"
import type { ReactElement } from "react"
import type { Metadata } from "next"

import { tenantState } from "./tenant-mocks"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"

/**
 * Multi-tenant phase 1 golden — the legal pages and the changelog. CRC and BL
 * (`legal.useCrcText`) render today's CRC text; the snapshots were written
 * against the unchanged pages (e0ad18b4) and are never regenerated.
 */
vi.mock("next/headers", async () => (await import("./tenant-mocks")).headersMock())
vi.mock("@/lib/org/registry", async (orig) => (await import("./tenant-mocks")).registryMock(orig))
vi.mock("@/lib/org/get-org-config", async (orig) => (await import("./tenant-mocks")).getOrgConfigMock(orig))
vi.mock("@/lib/firebase-admin", async () => (await import("./tenant-mocks")).firebaseAdminMock())

type PageModule = {
    default: () => ReactElement | Promise<ReactElement>
    metadata?: Metadata
    generateMetadata?: () => Promise<Metadata>
}

const PAGES: Record<string, () => Promise<PageModule>> = {
    privacy: () => import("@/app/(main)/privacy/page"),
    terms: () => import("@/app/(main)/terms/page"),
    "sms-consent": () => import("@/app/(main)/sms-consent/page"),
    accessibility: () => import("@/app/(main)/accessibility/page"),
    changelog: () => import("@/app/(main)/changelog/page"),
}

const TITLES: Record<string, string> = {
    privacy: "Privacy Policy",
    terms: "Terms & Conditions",
    "sms-consent": "SMS Messaging Consent & Opt-In",
    accessibility: "Accessibility Statement | CRC Music",
    changelog: "Changelog | CentralReform.live",
}

async function load(page: string, org: string) {
    tenantState.org = org
    const mod = await PAGES[page]()
    const metadata = mod.generateMetadata ? await mod.generateMetadata() : mod.metadata!
    const html = renderToString(await mod.default())
    return { metadata, html }
}

describe("multi-tenant P1 golden: legal pages + changelog (CRC text on both hosts)", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    for (const page of Object.keys(PAGES)) {
        it(`/${page}: crc text, and brotherslazaroff renders the same bytes`, async () => {
            const crc = await load(page, "crc")
            expect(crc.metadata.title).toBe(TITLES[page])
            expect(crc.metadata.robots).toEqual({ index: true, follow: true })
            if (page !== "changelog") expect(crc.html).toContain("music@centralreform.live")
            expect(crc.html).toMatchSnapshot()

            const bl = await load(page, "brotherslazaroff")
            expect(bl.metadata).toEqual(crc.metadata)
            expect(bl.html).toBe(crc.html)
        })
    }
})

describe("multi-tenant P1: a tenant without CRC text gets the platform-run version", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    const LEGAL = ["privacy", "terms", "sms-consent", "accessibility"]

    for (const page of LEGAL) {
        it(`testshul /${page} names the tenant and the platform operator`, async () => {
            const { html } = await load(page, "testshul")
            expect(html).toContain("Test Shul Tehila")
            expect(html).toContain("Rabbi Daniel Bogard")
            expect(html).toContain("centralreform.live")
            expect(html).toContain("mailto:music@testshul.example")
            expect(html).not.toContain("Central Reform Congregation")
            expect(html).not.toContain("CRC")
            expect(html).not.toContain("music@centralreform.live")
            // No double-escaped entities from JS-string props.
            expect(html).not.toMatch(/&amp;(apos|ldquo|rdquo|rarr|mdash);/)
        })
    }

    // testshul is a Hebrew tenant (phase 7): its titles are the Hebrew catalogue text.
    it("testshul titles drop the CRC brand", async () => {
        expect((await load("accessibility", "testshul")).metadata.title).toBe("הצהרת נגישות")
        expect((await load("changelog", "testshul")).metadata.title).toBe("יומן שינויים")
        expect((await load("privacy", "testshul")).metadata.title).toBe("מדיניות פרטיות")
    })

    it("testshul /changelog keeps the shared version list", async () => {
        const crc = await load("changelog", "crc")
        // Phase 7: testshul is a Hebrew tenant, so its page chrome is translated and
        // the (English) version list sits in a lang="en" dir="ltr" box
        // (src/__tests__/mt-p7-lane3/changelog-i18n.test.tsx). In English it is
        // still exactly CRC's page.
        tenantState.configOverride = (cfg) => ({ ...cfg, locale: { ...cfg.locale, language: "en", direction: "ltr" } })
        try {
            const ts = await load("changelog", "testshul")
            expect(ts.html).toBe(crc.html)
        } finally {
            tenantState.configOverride = undefined
        }
    })

    it("a tenant with no contact email falls back to the platform contact", async () => {
        tenantState.configOverride = (cfg) => ({ ...cfg, legal: { ...cfg.legal, contactEmail: "" } })
        try {
            for (const page of LEGAL) {
                const { html } = await load(page, "testshul")
                expect(html).toContain("mailto:music@centralreform.live")
                expect(html).not.toContain("mailto:music@testshul.example")
            }
        } finally {
            tenantState.configOverride = undefined
        }
    })
})
