import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderToString } from "react-dom/server"

import { tenantState } from "../mt-p1-lane2/tenant-mocks"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { isPseudoWrapped } from "@/i18n/pseudo"

/**
 * Multi-tenant phase 7 (lane C): the changelog. Its version list is CRC's
 * release history (content, kept in English); only the heading is UI. On a
 * non-English page the content sits in a lang="en" dir="ltr" box; on CRC/BL
 * the markup is unchanged (golden: mt-p1-lane2/legal-pages.golden.test.tsx).
 */
vi.mock("next/headers", async () => (await import("../mt-p1-lane2/tenant-mocks")).headersMock())
vi.mock("@/lib/org/registry", async (orig) => (await import("../mt-p1-lane2/tenant-mocks")).registryMock(orig))
vi.mock("@/lib/org/get-org-config", async (orig) => (await import("../mt-p1-lane2/tenant-mocks")).getOrgConfigMock(orig))
vi.mock("@/lib/firebase-admin", async () => (await import("../mt-p1-lane2/tenant-mocks")).firebaseAdminMock())

async function renderChangelog(org: string, uiLang?: string): Promise<HTMLElement> {
    tenantState.org = org
    tenantState.cookies = uiLang ? { "ui-lang": uiLang } : undefined
    const mod = await import("@/app/(main)/changelog/page")
    const el = document.createElement("div")
    el.innerHTML = renderToString(await mod.default())
    return el
}

describe("phase 7 lane C: changelog", () => {
    beforeEach(() => clearPrimedOrgConfigs())
    afterEach(() => {
        tenantState.cookies = undefined
    })

    it("qps-rtl: the heading comes through t(); the English content box is lang=en dir=ltr", async () => {
        const root = await renderChangelog("testshul", "qps-rtl")
        const h1 = root.querySelector("h1")!
        expect(isPseudoWrapped(h1.textContent ?? "")).toBe(true)
        const box = h1.nextElementSibling as HTMLElement
        expect(box.getAttribute("lang")).toBe("en")
        expect(box.getAttribute("dir")).toBe("ltr")
        expect(box.textContent).toContain("v1.7")
        expect(box.textContent).toContain("Critical bug fixes")
    })

    it("Hebrew tenant: the content box still declares English left-to-right", async () => {
        const root = await renderChangelog("testshul")
        const box = root.querySelector("h1")!.nextElementSibling as HTMLElement
        expect(box.getAttribute("lang")).toBe("en")
        expect(box.getAttribute("dir")).toBe("ltr")
    })

    it("CRC: no lang/dir attributes are added (markup unchanged)", async () => {
        const root = await renderChangelog("crc")
        const h1 = root.querySelector("h1")!
        expect(h1.textContent).toBe("Changelog")
        const box = h1.nextElementSibling as HTMLElement
        expect(box.hasAttribute("lang")).toBe(false)
        expect(box.hasAttribute("dir")).toBe(false)
    })
})
