/**
 * Multi-tenant phase 5 — the per-tenant openable-by-link setting on BOTH chart
 * byte routes (/api/library/file/[id] and /api/drive/file/[fileId]).
 *
 * library.openByLink true (the default, CRC and BL): exactly today's
 * behaviour — trusted callers get the bytes, CDN-cacheable.
 * false: a signed-in member (not pending) of the host tenant, and a chart the
 * host tenant can see (owned or shared to it); the response is private.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

const state = {
    openByLink: true as boolean,
    row: null as Record<string, unknown> | null,
    sessionUid: null as string | null,
    access: null as { role: string | null; po?: boolean } | null,
}
const mockVerifyBearer = vi.fn()

vi.mock("@/lib/mcp/auth", () => ({ verifyBearer: (...a: unknown[]) => mockVerifyBearer(...a) }))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    verifyIdToken: vi.fn().mockResolvedValue(null),
    getFirestore: () => ({
        collection: () => ({
            doc: () => ({ get: async () => ({ exists: !!state.row, data: () => state.row }) }),
        }),
    }),
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/file-fetcher", () => ({
    fetchFileById: vi.fn(async () => ({ buffer: new Uint8Array([37, 80, 68, 70]), contentType: "application/pdf", source: "firebase-storage" })),
}))
vi.mock("@/lib/org/get-org-config", () => ({
    getOrgConfig: vi.fn(async () => ({ library: { openByLink: state.openByLink } })),
}))
vi.mock("@/lib/org/access", () => ({
    getTenantAccess: vi.fn(async (uid: string, orgId: string) => ({
        uid,
        orgId,
        role: state.access?.role ?? null,
        effectiveRole: state.access?.role ?? null,
        soundEngineer: false,
        canUpload: false,
        po: state.access?.po ?? false,
        source: "membership",
    })),
    hasTenantRole: (a: { po?: boolean; role: string | null }, min: string) => {
        const rank: Record<string, number> = { pending: 0, member: 1, musician: 2, band_leader: 3, admin: 4 }
        if (a.po) return true
        if (!a.role || a.role === "denied") return false
        return rank[a.role] >= rank[min]
    },
}))
vi.mock("@/lib/drive-file-auth", async (orig) => ({
    ...(await orig<typeof import("@/lib/drive-file-auth")>()),
    verifySessionCookieRequest: vi.fn(async () => state.sessionUid),
}))

type Handler = (req: import("next/server").NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
const routes: Array<{ name: string; load: () => Promise<Handler>; path: (id: string) => string; params: (id: string) => Record<string, string> }> = [
    {
        name: "/api/library/file/[id]",
        load: async () => (await import("@/app/api/library/file/[id]/route")).GET as unknown as Handler,
        path: (id) => `/api/library/file/${id}`,
        params: (id) => ({ id }),
    },
    {
        name: "/api/drive/file/[fileId]",
        load: async () => (await import("@/app/api/drive/file/[fileId]/route")).GET as unknown as Handler,
        path: (id) => `/api/drive/file/${id}`,
        params: (id) => ({ fileId: id }),
    },
]

for (const r of routes) {
    describe(`P5 openByLink on ${r.name}`, () => {
        let GET: Handler
        beforeAll(async () => {
            GET = await r.load()
        })
        beforeEach(() => {
            vi.clearAllMocks()
            state.openByLink = true
            state.row = { orgId: "crc" }
            state.sessionUid = null
            state.access = null
            mockVerifyBearer.mockResolvedValue(new Response("no", { status: 401 }))
        })
        const call = (headers: Record<string, string>, id = "upload-1") =>
            GET(makeReq(r.path(id), { headers }), { params: Promise.resolve(r.params(id)) })

        describe("openByLink true (default): unchanged", () => {
            it("anon in-app fetch gets the bytes, CDN-cacheable", async () => {
                const res = await call({ "x-org-id": "crc", "sec-fetch-site": "same-origin" })
                expect(res.status).toBe(200)
                expect(res.headers.get("cache-control")).toBe("public, max-age=86400, s-maxage=604800")
            })
            it("another tenant's chart still opens by link (charts are held by fileId)", async () => {
                state.row = { orgId: "brotherslazaroff" }
                const res = await call({ "x-org-id": "crc", "sec-fetch-site": "same-origin" })
                expect(res.status).toBe(200)
            })
            it("a bare request without trust is still refused", async () => {
                const res = await call({ "x-org-id": "crc" })
                expect(res.status).toBe(401)
            })
        })

        describe("openByLink false", () => {
            beforeEach(() => {
                state.openByLink = false
            })
            it("anon, even with in-app fetch metadata, is refused 401", async () => {
                const res = await call({ "x-org-id": "nava-tehila", "sec-fetch-site": "same-origin" })
                expect(res.status).toBe(401)
                expect(res.headers.get("cache-control")).toBe("no-store")
            })
            it("a host-tenant MCP bearer opens an owned chart, privately cached", async () => {
                state.row = { orgId: "nava-tehila" }
                mockVerifyBearer.mockResolvedValue({ uid: "u1", orgId: "nava-tehila", tokenId: "t", parentTokenId: null })
                const res = await call({ "x-org-id": "nava-tehila", authorization: "Bearer crl_live_x" })
                expect(res.status).toBe(200)
                expect(res.headers.get("cache-control")).toBe("private, max-age=86400")
            })
            it("a chart shared to the host tenant opens", async () => {
                state.row = { orgId: "crc", visibleToOrgs: ["crc", "nava-tehila"] }
                mockVerifyBearer.mockResolvedValue({ uid: "u1", orgId: "nava-tehila", tokenId: "t", parentTokenId: null })
                const res = await call({ "x-org-id": "nava-tehila", authorization: "Bearer crl_live_x" })
                expect(res.status).toBe(200)
            })
            it("a chart the host tenant cannot see is 404", async () => {
                state.row = { orgId: "brotherslazaroff", visibleToOrgs: ["brotherslazaroff"] }
                mockVerifyBearer.mockResolvedValue({ uid: "u1", orgId: "nava-tehila", tokenId: "t", parentTokenId: null })
                const res = await call({ "x-org-id": "nava-tehila", authorization: "Bearer crl_live_x" })
                expect(res.status).toBe(404)
            })
            it("a bearer minted for another tenant is refused 401", async () => {
                state.row = { orgId: "nava-tehila" }
                mockVerifyBearer.mockResolvedValue({ uid: "u1", orgId: "crc", tokenId: "t", parentTokenId: null })
                const res = await call({ "x-org-id": "nava-tehila", authorization: "Bearer crl_live_x" })
                expect(res.status).toBe(401)
            })
            it("a signed-in member (session cookie) opens it; a pending account does not", async () => {
                state.row = { orgId: "nava-tehila" }
                state.sessionUid = "u2"
                state.access = { role: "member" }
                expect((await call({ "x-org-id": "nava-tehila" })).status).toBe(200)
                state.access = { role: "pending" }
                expect((await call({ "x-org-id": "nava-tehila" })).status).toBe(401)
            })
        })
    })
}
