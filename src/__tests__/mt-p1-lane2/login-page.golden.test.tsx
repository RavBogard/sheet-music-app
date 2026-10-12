import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToString } from "react-dom/server"
import type { ReactElement } from "react"

import { tenantState } from "./tenant-mocks"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"

/**
 * Multi-tenant phase 1 golden — /login. The snapshots were written against the
 * unchanged page (e0ad18b4) and are never regenerated: CRC with and without a
 * `config/congregation` doc, and BL's band hero with "St. Louis, MO".
 */
const congregationDoc = vi.hoisted(() => ({ fn: vi.fn(async (_org?: string): Promise<Record<string, unknown> | null> => null) }))

vi.mock("next/headers", async () => (await import("./tenant-mocks")).headersMock())
vi.mock("@/lib/org/registry", async (orig) => (await import("./tenant-mocks")).registryMock(orig))
vi.mock("@/lib/org/get-org-config", async (orig) => (await import("./tenant-mocks")).getOrgConfigMock(orig))
vi.mock("@/lib/firebase-admin", async () => (await import("./tenant-mocks")).firebaseAdminMock())
vi.mock("@/lib/server-auth", () => ({ getServerCongregationConfig: (org?: string) => congregationDoc.fn(org) }))
vi.mock("@/app/login/LoginClient", () => ({ default: () => <button data-testid="login-client">Sign in</button> }))

async function render(org: string): Promise<string> {
    tenantState.org = org
    const { default: LoginPage } = await import("@/app/login/page")
    return renderToString((await LoginPage()) as ReactElement)
}

describe("multi-tenant P1 golden: /login", () => {
    beforeEach(() => {
        clearPrimedOrgConfigs()
        congregationDoc.fn.mockReset()
        congregationDoc.fn.mockResolvedValue(null)
    })

    it("crc, no congregation doc: CRC Music, Central Reform Congregation · St. Louis, MO, /logo.jpg", async () => {
        const html = await render("crc")
        expect(html).toContain(">CRC Music</h1>")
        expect(html).toContain("Central Reform Congregation<!-- --> · <!-- -->St. Louis, MO")
        expect(html).toContain('alt="CRC Music"')
        expect(html).toContain("logo.jpg")
        expect(html).toMatchSnapshot()
    })

    it("crc, with the congregation doc: its values win", async () => {
        congregationDoc.fn.mockResolvedValue({
            name: "Doc Congregation",
            shortName: "Doc Music",
            location: "Doc City",
            logoUrl: "/doc-logo.png",
        })
        const html = await render("crc")
        expect(html).toContain(">Doc Music</h1>")
        expect(html).toContain("Doc Congregation<!-- --> · <!-- -->Doc City")
        expect(html).toContain("doc-logo.png")
        expect(html).toMatchSnapshot()
    })

    it("crc reads the crc congregation doc", async () => {
        await render("crc")
        const arg = congregationDoc.fn.mock.calls[0]?.[0]
        expect(arg === undefined || arg === "crc").toBe(true)
    })

    it("brotherslazaroff: band hero, wordmark, Brothers Lazaroff · St. Louis, MO", async () => {
        const html = await render("brotherslazaroff")
        expect(html).toContain("bl-hero")
        expect(html).toContain('alt="Brothers Lazaroff"')
        expect(html).toContain("Songs &amp; setlists for the band")
        // Production served "Brothers Lazaroff· St. Louis, MO" (no space; golden http-before), so the BL line keeps it.
        expect(html).toContain("Brothers Lazaroff<!-- -->· St. Louis, MO")
        expect(congregationDoc.fn).not.toHaveBeenCalled()
        expect(html).toMatchSnapshot()
    })
})

describe("multi-tenant P1: /login reads the resolved tenant", () => {
    beforeEach(() => {
        clearPrimedOrgConfigs()
        congregationDoc.fn.mockReset()
        congregationDoc.fn.mockResolvedValue(null)
    })

    it("testshul, no doc: its own congregation defaults, monogram instead of the CRC logo", async () => {
        const html = await render("testshul")
        expect(congregationDoc.fn).toHaveBeenCalledWith("testshul")
        expect(html).toContain(">Test Shul Music</h1>")
        expect(html).toContain("Test Shul Tehila<!-- --> · <!-- -->Jerusalem")
        expect(html).not.toContain("logo.jpg")
        expect(html).not.toContain("Central Reform")
        expect(html).not.toContain("St. Louis")
        expect(html).toContain('aria-label="Test Shul Music logo"')
    })

    it("testshul, with its doc: the doc wins", async () => {
        congregationDoc.fn.mockResolvedValue({ name: "Doc Shul", shortName: "Doc Shul Music", location: "Haifa", logoUrl: "/s.png" })
        const html = await render("testshul")
        expect(html).toContain(">Doc Shul Music</h1>")
        expect(html).toContain("Doc Shul<!-- --> · <!-- -->Haifa")
        expect(html).toContain("s.png")
    })

    it("the band hero's location comes from config.branding.location", async () => {
        tenantState.configOverride = (cfg) => ({ ...cfg, branding: { ...cfg.branding, location: "Kirkwood, MO" } })
        try {
            const html = await render("brotherslazaroff")
            expect(html).toContain("Brothers Lazaroff<!-- -->· Kirkwood, MO")
        } finally {
            tenantState.configOverride = undefined
        }
    })
})
