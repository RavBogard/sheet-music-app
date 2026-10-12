import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * Multi-tenant phase 4: the /platform console's routes. Every one is platform
 * owner only (403 PLATFORM_OWNER_ONLY before any library call); writes are dry
 * runs unless `?dryRun=false`; lib refusals map to plain HTTP errors.
 */

const auth = vi.hoisted(() => ({ po: false, orgId: "crc" }))
vi.mock("@/lib/api-auth", () => ({
    withAuth: vi.fn(async () => ({ uid: "u1", email: "d@example.test", po: auth.po, orgId: auth.orgId, isAdmin: true })),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: vi.fn(() => true), getFirestore: vi.fn(), getAuth: vi.fn() }))

const lib = vi.hoisted(() => ({
    listTenants: vi.fn(async () => []),
    createTenant: vi.fn(async () => ({ dryRun: true })),
    getTenant: vi.fn(async () => ({ summary: {} })),
    updateTenant: vi.fn(async () => ({ dryRun: true })),
    setTenantFeatures: vi.fn(async () => ({ dryRun: true })),
    setTenantStatus: vi.fn(async () => ({ dryRun: true })),
    listTenantMembersForPlatform: vi.fn(async () => []),
    setTenantMemberRole: vi.fn(async () => ({ dryRun: true })),
    removeTenantMember: vi.fn(async () => ({ dryRun: true })),
    inviteTenantAdmin: vi.fn(async () => ({ dryRun: true })),
    listInvites: vi.fn(async () => []),
    listCollections: vi.fn(async () => [{ id: "crc__nava" }]),
    setCollectionSharing: vi.fn(async () => ({ dryRun: true })),
    assignCollection: vi.fn(async () => ({ dryRun: true })),
    mintTenantViewBearer: vi.fn(async () => ({ token: "crl_view_x" })),
    listPlatformActivity: vi.fn(async () => []),
    recordPlatformAudit: vi.fn(async () => "a1"),
    peekInvite: vi.fn(),
    acceptInvite: vi.fn(),
}))
vi.mock("@/lib/platform/tenants", async (orig) => ({ ...(await orig<typeof import("@/lib/platform/tenants")>()), ...lib }))
const tokens = vi.hoisted(() => ({
    createPlatformToken: vi.fn(async () => ({ id: "p1", rawToken: "crl_plat_x" })),
    listPlatformTokens: vi.fn(async () => []),
    revokeMcpToken: vi.fn(async () => true),
}))
vi.mock("@/lib/mcp/tokens", async (orig) => ({ ...(await orig<typeof import("@/lib/mcp/tokens")>()), ...tokens }))

import * as tenantsRoute from "@/app/api/platform/tenants/route"
import * as tenantRoute from "@/app/api/platform/tenants/[orgId]/route"
import * as featuresRoute from "@/app/api/platform/tenants/[orgId]/features/route"
import * as statusRoute from "@/app/api/platform/tenants/[orgId]/status/route"
import * as membersRoute from "@/app/api/platform/tenants/[orgId]/members/route"
import * as invitesRoute from "@/app/api/platform/tenants/[orgId]/invites/route"
import * as collectionsRoute from "@/app/api/platform/collections/route"
import * as collectionRoute from "@/app/api/platform/collections/[id]/route"
import * as activityRoute from "@/app/api/platform/activity/route"
import * as viewBearerRoute from "@/app/api/platform/view-bearer/route"
import * as tokensRoute from "@/app/api/platform/tokens/route"
import * as acceptRoute from "@/app/api/invite/accept/route"
import { PlatformError } from "@/lib/platform/tenants"

const BASE = "https://www.centralreform.live/api"
const req = (method: string, url: string, body?: unknown) =>
    new NextRequest(url, {
        method,
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
const p = <T,>(x: T) => ({ params: Promise.resolve(x) })
const T = { orgId: "nava" }

type H = (r: NextRequest, c?: unknown) => Promise<Response>
const every: Array<[string, () => Promise<Response>]> = [
    ["GET tenants", () => (tenantsRoute.GET as H)(req("GET", `${BASE}/platform/tenants`))],
    ["POST tenants", () => (tenantsRoute.POST as H)(req("POST", `${BASE}/platform/tenants`, { orgId: "nava" }))],
    ["GET tenant", () => (tenantRoute.GET as H)(req("GET", `${BASE}/platform/tenants/nava`), p(T))],
    ["PATCH tenant", () => (tenantRoute.PATCH as H)(req("PATCH", `${BASE}/platform/tenants/nava`, { name: "N" }), p(T))],
    ["PATCH features", () => (featuresRoute.PATCH as H)(req("PATCH", `${BASE}/platform/tenants/nava/features`, { mixer: true }), p(T))],
    ["PATCH status", () => (statusRoute.PATCH as H)(req("PATCH", `${BASE}/platform/tenants/nava/status`, { status: "active" }), p(T))],
    ["GET members", () => (membersRoute.GET as H)(req("GET", `${BASE}/platform/tenants/nava/members`), p(T))],
    ["POST members", () => (membersRoute.POST as H)(req("POST", `${BASE}/platform/tenants/nava/members`, { uid: "x", role: "admin" }), p(T))],
    ["DELETE members", () => (membersRoute.DELETE as H)(req("DELETE", `${BASE}/platform/tenants/nava/members?uid=x`), p(T))],
    ["GET invites", () => (invitesRoute.GET as H)(req("GET", `${BASE}/platform/tenants/nava/invites`), p(T))],
    ["POST invites", () => (invitesRoute.POST as H)(req("POST", `${BASE}/platform/tenants/nava/invites`, { email: "a@b.org" }), p(T))],
    ["GET collections", () => (collectionsRoute.GET as H)(req("GET", `${BASE}/platform/collections`))],
    ["GET collection", () => (collectionRoute.GET as H)(req("GET", `${BASE}/platform/collections/crc__nava`), p({ id: "crc__nava" }))],
    ["PATCH collection", () => (collectionRoute.PATCH as H)(req("PATCH", `${BASE}/platform/collections/crc__nava`, { visibility: "private", sharedWith: [] }), p({ id: "crc__nava" }))],
    ["POST collection", () => (collectionRoute.POST as H)(req("POST", `${BASE}/platform/collections/crc__nava`, { orgId: "nava", assigned: true }), p({ id: "crc__nava" }))],
    ["GET activity", () => (activityRoute.GET as H)(req("GET", `${BASE}/platform/activity`))],
    ["POST view-bearer", () => (viewBearerRoute.POST as H)(req("POST", `${BASE}/platform/view-bearer`, { orgId: "nava" }))],
    ["GET tokens", () => (tokensRoute.GET as H)(req("GET", `${BASE}/platform/tokens`))],
    ["POST tokens", () => (tokensRoute.POST as H)(req("POST", `${BASE}/platform/tokens`, {}))],
    ["DELETE tokens", () => (tokensRoute.DELETE as H)(req("DELETE", `${BASE}/platform/tokens?id=p1`))],
]

describe("platform console routes", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        auth.po = false
        auth.orgId = "crc"
    })

    it("every route: a non-platform-owner gets 403 and nothing is called", async () => {
        for (const [name, call] of every) {
            const r = await call()
            expect(r.status, name).toBe(403)
            expect((await r.json()).code, name).toBe("PLATFORM_OWNER_ONLY")
        }
        for (const f of [...Object.values(lib), ...Object.values(tokens)]) expect(f).not.toHaveBeenCalled()
    })

    it("every route answers the platform owner", async () => {
        auth.po = true
        for (const [name, call] of every) expect((await call()).status, name).toBe(200)
    })

    it("writes are dry runs unless ?dryRun=false", async () => {
        auth.po = true
        await (tenantRoute.PATCH as H)(req("PATCH", `${BASE}/platform/tenants/nava`, { name: "N" }), p(T))
        expect(lib.updateTenant).toHaveBeenLastCalledWith("nava", { name: "N" }, { actor: { uid: "u1", email: "d@example.test", via: "console" }, dryRun: true })
        await (tenantRoute.PATCH as H)(req("PATCH", `${BASE}/platform/tenants/nava?dryRun=false`, { name: "N" }), p(T))
        expect(lib.updateTenant).toHaveBeenLastCalledWith("nava", { name: "N" }, expect.objectContaining({ dryRun: false }))
        await (membersRoute.DELETE as H)(req("DELETE", `${BASE}/platform/tenants/nava/members?uid=x&dryRun=false`), p(T))
        expect(lib.removeTenantMember).toHaveBeenLastCalledWith("nava", "x", expect.objectContaining({ dryRun: false }))
    })

    it("lib refusals become plain HTTP errors", async () => {
        auth.po = true
        lib.updateTenant.mockRejectedValueOnce(new PlatformError("invalid", "That change would make the config invalid: x"))
        const r = await (tenantRoute.PATCH as H)(req("PATCH", `${BASE}/platform/tenants/nava`, { name: "" }), p(T))
        expect(r.status).toBe(400)
        expect(await r.json()).toMatchObject({ code: "PLATFORM_INVALID" })
        lib.getTenant.mockResolvedValueOnce(null as never)
        expect((await (tenantRoute.GET as H)(req("GET", `${BASE}/platform/tenants/nope`), p({ orgId: "nope" }))).status).toBe(404)
    })

    it("member role: a bad role is a 400 before the lib", async () => {
        auth.po = true
        const r = await (membersRoute.POST as H)(req("POST", `${BASE}/platform/tenants/nava/members`, { uid: "x", role: "denied" }), p(T))
        expect(r.status).toBe(400)
        expect(lib.setTenantMemberRole).not.toHaveBeenCalled()
    })
})

describe("invite accept route", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        auth.po = false
        auth.orgId = "nava"
    })
    const TOKEN = "a".repeat(64)
    const peek = { orgId: "nava", tenantName: "Nava Tehila", role: "admin", email: "a@b.org", status: "open", expiresAt: "" }

    it("GET peeks without signing in; unknown token → 404", async () => {
        lib.peekInvite.mockResolvedValueOnce(peek)
        const r = await (acceptRoute.GET as H)(new NextRequest(`${BASE}/invite/accept?token=${TOKEN}`))
        expect(r.status).toBe(200)
        expect((await r.json()).tenantName).toBe("Nava Tehila")
        lib.peekInvite.mockResolvedValueOnce(null)
        expect((await (acceptRoute.GET as H)(new NextRequest(`${BASE}/invite/accept?token=bad`))).status).toBe(404)
    })

    it("POST at the tenant's address accepts", async () => {
        lib.peekInvite.mockResolvedValueOnce(peek)
        lib.acceptInvite.mockResolvedValueOnce({ orgId: "nava", role: "admin" })
        const r = await (acceptRoute.POST as H)(req("POST", `${BASE}/invite/accept`, { token: TOKEN }))
        expect(r.status).toBe(200)
        expect(lib.acceptInvite).toHaveBeenCalledWith(TOKEN, "u1", "d@example.test")
    })

    it("POST at another tenant's address is refused", async () => {
        auth.orgId = "crc"
        lib.peekInvite.mockResolvedValueOnce(peek)
        const r = await (acceptRoute.POST as H)(req("POST", `${BASE}/invite/accept`, { token: TOKEN }))
        expect(r.status).toBe(409)
        expect(lib.acceptInvite).not.toHaveBeenCalled()
    })

    it("an email mismatch from the lib is a 403", async () => {
        lib.peekInvite.mockResolvedValueOnce(peek)
        lib.acceptInvite.mockRejectedValueOnce(new PlatformError("forbidden", "This invitation is for a@b.org."))
        const r = await (acceptRoute.POST as H)(req("POST", `${BASE}/invite/accept`, { token: TOKEN }))
        expect(r.status).toBe(403)
    })
})
