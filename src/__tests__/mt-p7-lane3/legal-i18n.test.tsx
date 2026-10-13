import { beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import type { ReactElement } from "react"
import type { Metadata } from "next"

import { tenantState } from "../mt-p1-lane2/tenant-mocks"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { expectNoUntranslatedText, I18nTestProviders } from "@/test-utils/i18n"
import { makeTestOrgConfig } from "@/lib/org/__tests__/test-org-config"

/**
 * Multi-tenant phase 7 (lane C): the legal pages come entirely through t().
 *
 * testshul is the Hebrew fixture tenant (legal.useCrcText false → the
 * platform-run text). With the `ui-lang=qps` cookie every catalogue string
 * renders pseudo-wrapped; anything else on screen bypassed t(). The CRC text
 * (privacy/terms/sms-consent/accessibility page.tsx) is checked the same way by
 * flipping testshul's `legal.useCrcText` on, since CRC itself is an English
 * tenant and ignores the cookie.
 */
vi.mock("next/headers", async () => (await import("../mt-p1-lane2/tenant-mocks")).headersMock())
vi.mock("@/lib/org/registry", async (orig) => (await import("../mt-p1-lane2/tenant-mocks")).registryMock(orig))
vi.mock("@/lib/org/get-org-config", async (orig) => (await import("../mt-p1-lane2/tenant-mocks")).getOrgConfigMock(orig))
vi.mock("@/lib/firebase-admin", async () => (await import("../mt-p1-lane2/tenant-mocks")).firebaseAdminMock())

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
}

/** Data on the page that is not UI text: config values and verbatim tokens. */
const DATA = [
    "Test Shul Tehila",
    "music@testshul.example",
    "testshul.vercel.app",
    // CRC text: its contact address and site, shown as links.
    "music@centralreform.live",
    "www.centralreform.live",
    // SMS keywords the carrier recognises; they stay in English on purpose.
    "STOP",
    "HELP",
]

async function renderPage(page: string, opts: { lang: "qps" | "qps-rtl"; crcText?: boolean }) {
    tenantState.org = "testshul"
    tenantState.cookies = { "ui-lang": opts.lang }
    if (opts.crcText) tenantState.configOverride = (cfg) => ({ ...cfg, legal: { ...cfg.legal, useCrcText: true } })
    const mod = await PAGES[page]()
    const metadata = mod.generateMetadata ? await mod.generateMetadata() : mod.metadata!
    const ui = await mod.default()
    const r = render(
        <I18nTestProviders lang={opts.lang} config={makeTestOrgConfig()}>
            {ui}
        </I18nTestProviders>,
    )
    return { r, metadata }
}

describe("phase 7 lane C: legal pages come through t() (pseudo-locale)", () => {
    beforeEach(() => {
        clearPrimedOrgConfigs()
        tenantState.configOverride = undefined
        tenantState.cookies = undefined
    })

    for (const page of Object.keys(PAGES)) {
        it(`/${page}, platform text: no untranslated string`, async () => {
            const { r, metadata } = await renderPage(page, { lang: "qps" })
            expect(r.container.textContent).toContain("⟦")
            expectNoUntranslatedText(r.container, { allow: DATA })
            expect(String(metadata.title)).toMatch(/^⟦.*⟧$/)
        })

        it(`/${page}, CRC text: no untranslated string`, async () => {
            const { r, metadata } = await renderPage(page, { lang: "qps", crcText: true })
            expect(r.container.textContent).toContain("⟦")
            expect(r.container.textContent).toContain("music@centralreform.live") // CRC's page, not the platform's
            expectNoUntranslatedText(r.container, { allow: DATA })
            expect(String(metadata.title)).toMatch(/^⟦.*⟧$/)
        })
    }

    it("qps-rtl: the page renders right to left, chrome and body translated", async () => {
        const { r } = await renderPage("terms", { lang: "qps-rtl" })
        expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
        expect(r.container.querySelector("h1")?.textContent).toMatch(/^⟦.*⟧$/)
        expectNoUntranslatedText(r.container, { allow: DATA })
    })

    it("platform text keeps config values out of the catalogue (operator, platform, address)", async () => {
        const { r } = await renderPage("privacy", { lang: "qps" })
        const text = r.container.textContent ?? ""
        // Interpolated untranslated, inside translated sentences.
        expect(text).toContain("Test Shul Tehila")
        expect(text).toContain("Rabbi Daniel Bogard")
        expect(text).toContain("centralreform.live")
        expect(r.container.querySelector('a[href="mailto:music@testshul.example"]')).not.toBeNull()
    })
})
