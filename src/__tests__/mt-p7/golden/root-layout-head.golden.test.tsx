import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement, ReactNode } from "react"

import { tenantState } from "../../mt-p1-lane2/tenant-mocks"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"

/**
 * Multi-tenant phase 7 golden — the parts of the root layout phase 7 touches,
 * pinned to today's output for CRC and BL: the <html> attributes, the <head>
 * children (no font link may appear), the <body> font classes and the skip link.
 * Captured on master 745c1c16; matches golden/http-before/{crc,brotherslazaroff}
 * (`html lang=en dir=null`, no font <link>, "Skip to main content").
 */
vi.mock("next/headers", async () => (await import("../../mt-p1-lane2/tenant-mocks")).headersMock())
vi.mock("@/lib/org/registry", async (orig) => (await import("../../mt-p1-lane2/tenant-mocks")).registryMock(orig))
vi.mock("@/lib/org/get-org-config", async (orig) => (await import("../../mt-p1-lane2/tenant-mocks")).getOrgConfigMock(orig))
vi.mock("@/lib/firebase-admin", async () => (await import("../../mt-p1-lane2/tenant-mocks")).firebaseAdminMock())
vi.mock("next/font/google", () => {
    const font = (name: string) => (o: { variable?: string } = {}) => ({ variable: `__var_${name}${o.variable === "--font-display" && ["rubik", "heebo", "frankRuhlLibre"].includes(name) ? "_display" : ""}`, className: `__cls_${name}`, style: {} })
    return {
        Assistant: font("assistant"),
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

function children(el: El): unknown[] {
    const c = (el.props as { children?: unknown }).children
    return (Array.isArray(c) ? c : [c]).flat(Infinity as 1).filter((x) => x !== null && x !== undefined && x !== false)
}

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

export async function renderRootLayout(org: string, cookies?: Record<string, string>) {
    tenantState.org = org
    tenantState.cookies = cookies
    const { default: RootLayout } = await import("@/app/layout")
    const html = (await RootLayout({ children: null })) as El
    return { html, head: find(html, "head")!, body: find(html, "body")!, skip: find(html, "a")! }
}

const AUTH_DOMAIN = `https://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}`
const TODAY_HEAD = [
    { rel: "preconnect", href: "https://accounts.google.com" },
    { rel: "preconnect", href: "https://apis.google.com" },
    { rel: "preconnect", href: "https://www.googleapis.com" },
    { rel: "preconnect", href: AUTH_DOMAIN },
]

describe("phase 7 golden: root layout head, html and body for CRC and BL", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    for (const [org, bodyClass] of [
        ["crc", "__var_assistant __var_geistMono __var_righteous antialiased"],
        ["brotherslazaroff", "__var_assistant __var_geistMono __var_righteous __var_zillaSlab antialiased"],
    ] as const) {
        it(`${org}: <html lang="en">, no dir, four preconnects and nothing else in <head>`, async () => {
            const { html, head, body, skip } = await renderRootLayout(org)
            expect(html.props.lang).toBe("en")
            expect("dir" in html.props).toBe(false)
            expect(html.props["data-org"]).toBe(org)
            const links = children(head) as El[]
            expect(links.map((l) => ({ type: l.type, rel: l.props.rel, href: l.props.href }))).toEqual(
                TODAY_HEAD.map((l) => ({ type: "link", ...l })),
            )
            expect(body.props.className).toBe(bodyClass)
            expect(skip.props.href).toBe("#main-content")
            expect(skip.props.children).toBe("Skip to main content")
        })
    }
})

describe("phase 7: root layout language, direction, fonts and provider for other tenants", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    const provider = (body: El): El => findProvider(body)!
    function findProvider(el: unknown): El | null {
        if (!el || typeof el !== "object") return null
        if (Array.isArray(el)) {
            for (const c of el) {
                const hit = findProvider(c)
                if (hit) return hit
            }
            return null
        }
        const e = el as El
        if (typeof e.type === "function" && (e.type as { name?: string }).name === "I18nProvider") return e
        return findProvider((e.props as { children?: unknown })?.children)
    }

    it("crc ignores a ui-lang=he cookie", async () => {
        const { html, body } = await renderRootLayout("crc", { "ui-lang": "he" })
        expect(html.props.lang).toBe("en")
        expect("dir" in html.props).toBe(false)
        expect(body.props.className).toBe("__var_assistant __var_geistMono __var_righteous antialiased")
        const p = provider(body)
        expect(p.props.lang).toBe("en")
        expect(p.props.timeZone).toBeNull()
    })

    it("a Hebrew tenant: lang=he dir=rtl, Assistant + Rubik, Hebrew messages, Jerusalem zone", async () => {
        const { html, head, body, skip } = await renderRootLayout("testshul")
        expect(html.props.lang).toBe("he")
        expect(html.props.dir).toBe("rtl")
        expect(children(head)).toHaveLength(4)
        expect(body.props.className).toBe("__var_assistant __var_geistMono __var_rubik_display antialiased")
        expect(skip.props.children).toBe("דילוג לתוכן הראשי")
        const p = provider(body)
        expect(p.props.lang).toBe("he")
        expect(p.props.dir).toBe("rtl")
        expect(p.props.timeZone).toBe("Asia/Jerusalem")
        expect((p.props.messages as Record<string, string>)["common.skipToMain"]).toBe("דילוג לתוכן הראשי")
    })

    it("a Hebrew tenant's user who picked English: lang=en, no dir, English messages", async () => {
        const { html, skip, body } = await renderRootLayout("testshul", { "ui-lang": "en" })
        expect(html.props.lang).toBe("en")
        expect("dir" in html.props).toBe(false)
        expect(skip.props.children).toBe("Skip to main content")
        expect(provider(body).props.lang).toBe("en")
    })

    it("pseudo-locale by cookie outside production (rtl variant sets dir)", async () => {
        const { html, skip } = await renderRootLayout("crc", { "ui-lang": "qps-rtl" })
        expect(html.props.lang).toBe("ar-XB")
        expect(html.props.dir).toBe("rtl")
        expect(String(skip.props.children)).toMatch(/^⟦.*⟧$/)
    })
})
