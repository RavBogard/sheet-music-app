import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement, ReactNode } from "react"

import { tenantState } from "./tenant-mocks"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"

/**
 * Multi-tenant phase 1 golden — root layout <html lang/dir> and <body> font
 * variables. Expectations are today's output (a1de9bda / e0ad18b4): CRC and BL
 * both `lang="en"` with no `dir`; BL alone adds the Zilla Slab variable.
 */
vi.mock("next/headers", async () => (await import("./tenant-mocks")).headersMock())
vi.mock("@/lib/org/registry", async (orig) => (await import("./tenant-mocks")).registryMock(orig))
vi.mock("@/lib/org/get-org-config", async (orig) => (await import("./tenant-mocks")).getOrgConfigMock(orig))
vi.mock("@/lib/firebase-admin", async () => (await import("./tenant-mocks")).firebaseAdminMock())
vi.mock("next/font/google", () => {
    // Phase 7 adds the Hebrew faces; a Hebrew face declared for --font-display gets a "_display" suffix.
    const font = (name: string) => (o: { variable?: string } = {}) => ({
        variable: `__var_${name}${o.variable === "--font-display" && ["rubik", "heebo", "frankRuhlLibre"].includes(name) ? "_display" : ""}`,
        className: `__cls_${name}`,
        style: {},
    })
    return {
        Poppins: font("poppins"),
        Righteous: font("righteous"),
        Geist_Mono: font("geistMono"),
        Zilla_Slab: font("zillaSlab"),
        Rubik: font("rubik"),
        Heebo: font("heebo"),
        Frank_Ruhl_Libre: font("frankRuhlLibre"),
    }
})
vi.mock("@/app/globals.css", () => ({}))
vi.mock("@/components/theme-provider", () => ({ ThemeProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock("@/components/client-providers", () => ({ ClientProviders: ({ children }: { children: ReactNode }) => children }))
vi.mock("@/components/error-boundary", () => ({ ErrorBoundary: ({ children }: { children: ReactNode }) => children }))
vi.mock("sonner", () => ({ Toaster: () => null }))
vi.mock("@/components/ui/live-region", () => ({ LiveRegion: () => null }))
vi.mock("@/components/web-vitals-reporter", () => ({ WebVitalsReporter: () => null }))

type El = ReactElement<Record<string, unknown>>

function find(el: unknown, type: string): El | null {
    if (!el || typeof el !== "object") return null
    if (Array.isArray(el)) {
        for (const c of el) {
            const hit = find(c, type)
            if (hit) return hit
        }
        return null
    }
    const e = el as El
    if (e.type === type) return e
    return find((e.props as { children?: unknown })?.children, type)
}

async function renderLayout(org: string) {
    tenantState.org = org
    const { default: RootLayout } = await import("@/app/layout")
    const html = (await RootLayout({ children: null })) as El
    const body = find(html, "body")!
    return { html, body }
}

describe("multi-tenant P1 golden: root layout html/body", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    it("crc: lang=en, no dir, Poppins + Geist Mono + Righteous", async () => {
        const { html, body } = await renderLayout("crc")
        expect(html.type).toBe("html")
        expect(html.props.lang).toBe("en")
        expect(html.props.dir).toBeUndefined()
        expect("dir" in html.props).toBe(false)
        expect(html.props["data-org"]).toBe("crc")
        expect(body.props.className).toBe("__var_poppins __var_geistMono __var_righteous antialiased")
    })

    it("brotherslazaroff: lang=en, no dir, adds the Zilla Slab variable", async () => {
        const { html, body } = await renderLayout("brotherslazaroff")
        expect(html.props.lang).toBe("en")
        expect(html.props.dir).toBeUndefined()
        expect("dir" in html.props).toBe(false)
        expect(html.props["data-org"]).toBe("brotherslazaroff")
        expect(body.props.className).toBe("__var_poppins __var_geistMono __var_righteous __var_zillaSlab antialiased")
    })

    it("an unknown host org renders as crc", async () => {
        const { html, body } = await renderLayout("nava-tehila")
        expect(html.props.lang).toBe("en")
        expect("dir" in html.props).toBe(false)
        expect(body.props.className).toBe("__var_poppins __var_geistMono __var_righteous antialiased")
    })
})

describe("multi-tenant P1: root layout reads the tenant's locale and fonts", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    it("testshul (he, rtl): lang=he dir=rtl", async () => {
        const { html, body } = await renderLayout("testshul")
        expect(html.props.lang).toBe("he")
        expect(html.props.dir).toBe("rtl")
        expect(html.props["data-org"]).toBe("testshul")
        // Phase 7: the Hebrew faces arrived; a Latin-only choice (Poppins,
        // Righteous) renders Hebrew in Heebo (body) and Rubik (display).
        expect(body.props.className).toBe("__var_heebo __var_geistMono __var_rubik_display antialiased")
    })
})
