import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const auth = { po: false }
vi.mock("@/lib/api-auth", () => ({
    withAuth: vi.fn(async () => ({ uid: "u1", po: auth.po, orgId: "crc", isAdmin: true })),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const lib = vi.hoisted(() => ({
    provisionDefaultAddress: vi.fn(),
    addCustomDomain: vi.fn(),
    removeCustomDomain: vi.fn(),
    checkCustomDomain: vi.fn(),
}))
vi.mock("@/lib/platform/tenant-address", async (orig) => ({
    ...(await orig<typeof import("@/lib/platform/tenant-address")>()),
    ...lib,
}))

import { POST as addressPOST } from "@/app/api/platform/tenants/[orgId]/address/route"
import { POST as domainsPOST, DELETE as domainsDELETE } from "@/app/api/platform/tenants/[orgId]/domains/route"
import { GET as domainGET } from "@/app/api/platform/tenants/[orgId]/domains/[domain]/route"
import { TenantAddressError } from "@/lib/platform/tenant-address"
import { VercelApiError } from "@/lib/platform/vercel"

const req = (method: string, url: string, body?: unknown) =>
    new NextRequest(url, {
        method,
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
const params = <T,>(p: T) => ({ params: Promise.resolve(p) })
const BASE = "https://centralreform.live/api/platform/tenants/probe"

describe("platform address routes", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        auth.po = false
    })

    it("non-platform-owner gets 403 on every route and the lib is never called", async () => {
        const rs = await Promise.all([
            addressPOST(req("POST", `${BASE}/address`, { slug: "probe" }), params({ orgId: "probe" })),
            domainsPOST(req("POST", `${BASE}/domains`, { domain: "example.org" }), params({ orgId: "probe" })),
            domainsDELETE(req("DELETE", `${BASE}/domains?domain=example.org`), params({ orgId: "probe" })),
            domainGET(req("GET", `${BASE}/domains/example.org`), params({ orgId: "probe", domain: "example.org" })),
        ])
        for (const r of rs) {
            expect(r.status).toBe(403)
            expect((await r.json()).code).toBe("PLATFORM_OWNER_ONLY")
        }
        for (const f of Object.values(lib)) expect(f).not.toHaveBeenCalled()
    })

    it("po: POST address → 200 with the provision result", async () => {
        auth.po = true
        lib.provisionDefaultAddress.mockResolvedValue({ orgId: "probe", host: "probe.vercel.app", reused: false, tried: [] })
        const r = await addressPOST(req("POST", `${BASE}/address`, { slug: "probe" }), params({ orgId: "probe" }))
        expect(r.status).toBe(200)
        expect((await r.json()).host).toBe("probe.vercel.app")
        expect(lib.provisionDefaultAddress).toHaveBeenCalledWith("probe", "probe")
    })

    it("po: POST/DELETE domains and GET status → 200", async () => {
        auth.po = true
        lib.addCustomDomain.mockResolvedValue({ status: "waiting_for_dns" })
        lib.removeCustomDomain.mockResolvedValue({ primary: "probe.vercel.app" })
        lib.checkCustomDomain.mockResolvedValue({ status: "live" })
        expect((await domainsPOST(req("POST", `${BASE}/domains`, { domain: "example.org" }), params({ orgId: "probe" }))).status).toBe(200)
        expect(lib.addCustomDomain).toHaveBeenCalledWith("probe", "example.org")
        expect((await domainsDELETE(req("DELETE", `${BASE}/domains?domain=example.org`), params({ orgId: "probe" }))).status).toBe(200)
        expect(lib.removeCustomDomain).toHaveBeenCalledWith("probe", "example.org")
        expect((await domainsDELETE(req("DELETE", `${BASE}/domains`, { domain: "b.org" }), params({ orgId: "probe" }))).status).toBe(200)
        expect(lib.removeCustomDomain).toHaveBeenLastCalledWith("probe", "b.org")
        const g = await domainGET(req("GET", `${BASE}/domains/example.org`), params({ orgId: "probe", domain: "example.org" }))
        expect(g.status).toBe(200)
        expect((await g.json()).status).toBe("live")
    })

    it("po: typed errors map to HTTP statuses", async () => {
        auth.po = true
        lib.provisionDefaultAddress.mockRejectedValueOnce(new TenantAddressError("exhausted", "none free"))
        let r = await addressPOST(req("POST", `${BASE}/address`, { slug: "probe" }), params({ orgId: "probe" }))
        expect(r.status).toBe(409)
        lib.addCustomDomain.mockRejectedValueOnce(new VercelApiError("rate_limited", "slow down", { status: 429, retryAfter: 5 }))
        r = await domainsPOST(req("POST", `${BASE}/domains`, { domain: "example.org" }), params({ orgId: "probe" }))
        expect(r.status).toBe(429)
        lib.checkCustomDomain.mockRejectedValueOnce(new TenantAddressError("not_found", "no tenant"))
        r = await domainGET(req("GET", `${BASE}/domains/example.org`), params({ orgId: "probe", domain: "example.org" }))
        expect(r.status).toBe(404)
    })

    it("po: bad tenant id and missing body are 400", async () => {
        auth.po = true
        expect((await addressPOST(req("POST", `${BASE}/address`, { slug: "probe" }), params({ orgId: "Bad Id" }))).status).toBe(400)
        expect((await addressPOST(req("POST", `${BASE}/address`, {}), params({ orgId: "probe" }))).status).toBe(400)
        expect((await domainsDELETE(req("DELETE", `${BASE}/domains`), params({ orgId: "probe" }))).status).toBe(400)
    })
})
