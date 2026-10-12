import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Multi-tenant phase 4: /platform is checked on the server. Anyone but the
 * platform owner (signed out, a tenant admin, a CRC super-admin role without
 * `po`) gets notFound() before any console component is returned.
 */

const h = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }))

vi.mock("@/lib/server-auth", () => ({ getServerUser: vi.fn(async () => h.user) }))
vi.mock("next/navigation", () => ({
    notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND") }),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/platform",
}))

import { requirePlatformOwner } from "../gate"
import PlatformLayout from "../layout"
import PlatformPage from "../page"
import NewTenantPage from "../new/page"
import PlatformActivityPage from "../activity/page"
import PlatformTenantPage from "../tenants/[orgId]/page"

const tenantAdmin = { uid: "a", isAdmin: true, isBandLeader: true, po: false, orgId: "crc" }
const owner = { uid: "po", isAdmin: true, isBandLeader: true, po: true, orgId: "crc" }

const pages: Array<[string, () => Promise<unknown>]> = [
    ["layout", () => PlatformLayout({ children: null })],
    ["tenants", () => PlatformPage()],
    ["new", () => NewTenantPage()],
    ["activity", () => PlatformActivityPage()],
    ["tenant", () => PlatformTenantPage({ params: Promise.resolve({ orgId: "mtprobe" }) })],
]

beforeEach(() => { h.user = null })

describe("/platform server gate", () => {
    it("signed out → not found", async () => {
        await expect(requirePlatformOwner()).rejects.toThrow("NEXT_NOT_FOUND")
    })

    it.each(pages)("%s: a tenant admin without po gets not found", async (_n, render) => {
        h.user = tenantAdmin
        await expect(render()).rejects.toThrow("NEXT_NOT_FOUND")
    })

    it.each(pages)("%s: signed out gets not found", async (_n, render) => {
        await expect(render()).rejects.toThrow("NEXT_NOT_FOUND")
    })

    it.each(pages)("%s: the platform owner gets the console", async (_n, render) => {
        h.user = owner
        await expect(render()).resolves.toBeTruthy()
    })

    it("a malformed tenant id is not found even for the owner", async () => {
        h.user = owner
        await expect(PlatformTenantPage({ params: Promise.resolve({ orgId: "../Bad Id" }) })).rejects.toThrow("NEXT_NOT_FOUND")
    })
})
