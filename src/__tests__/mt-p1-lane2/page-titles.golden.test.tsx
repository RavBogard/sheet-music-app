import { beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import type { Metadata } from "next"

import { tenantState } from "./tenant-mocks"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { OrgProvider } from "@/lib/org/org-context"
import { codeOrgConfig } from "@/lib/org/config-code"
import { makeTestOrgConfig } from "@/lib/org/__tests__/test-org-config"

/**
 * Multi-tenant phase 1 golden — the unauthorized page
 * title and the PublicSetlistSkeleton brand. Today all three show CRC text on
 * both hosts; BL is frozen to it.
 */
vi.mock("next/headers", async () => (await import("./tenant-mocks")).headersMock())
vi.mock("@/lib/org/registry", async (orig) => (await import("./tenant-mocks")).registryMock(orig))
vi.mock("@/lib/org/get-org-config", async (orig) => (await import("./tenant-mocks")).getOrgConfigMock(orig))
vi.mock("@/lib/firebase-admin", async () => (await import("./tenant-mocks")).firebaseAdminMock())
vi.mock("next/font/google", () => ({ Geist: () => ({ variable: "__var_geist", className: "__cls_geist" }) }))
vi.mock("@/components/ui/unauthorized-state", () => ({ UnauthorizedState: () => null }))

type MetaModule = { metadata?: Metadata; generateMetadata?: () => Promise<Metadata> }
async function meta(mod: MetaModule): Promise<Metadata> {
    return mod.generateMetadata ? mod.generateMetadata() : mod.metadata!
}

async function unauthorizedTitle(org: string) {
    tenantState.org = org
    return (await meta(await import("@/app/unauthorized/page"))).title
}
async function skeletonHeading(orgId: string, config = codeOrgConfig(orgId)) {
    const { PublicSetlistSkeleton } = await import("@/components/performance/PublicSetlistSkeleton")
    const { container } = render(
        <OrgProvider orgId={orgId} config={config}>
            <PublicSetlistSkeleton />
        </OrgProvider>,
    )
    return { heading: container.querySelector("h1")?.textContent, html: container.innerHTML }
}

describe("multi-tenant P1 golden: CRC Music page titles and skeleton brand", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    for (const org of ["crc", "brotherslazaroff"]) {
        it(`${org}: unauthorized title`, async () => {
            expect(await unauthorizedTitle(org)).toBe("Unauthorized | Central Reform Congregation")
        })
        it(`${org}: skeleton brand`, async () => {
            const out = await skeletonHeading(org)
            // Consistency pass: the brand moved to the shell's top bar; the
            // skeleton head is the page title, matching the listing.
            expect(out.heading).toBe("Setlists")
            expect(out.html).toMatchSnapshot()
        })
    }
})

describe("multi-tenant P1: titles and skeleton brand follow the tenant", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    // testshul is a Hebrew tenant (phase 7): titles come from he/org.json.
    it("testshul: unauthorized title", async () => {
        expect(await unauthorizedTitle("testshul")).toBe("אין הרשאה | Test Shul Tehila")
    })
    it("testshul: skeleton brand", async () => {
        expect((await skeletonHeading("testshul", makeTestOrgConfig())).heading).toBe("Setlists")
    })
})
