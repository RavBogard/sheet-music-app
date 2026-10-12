// @vitest-environment node
/**
 * Multi-tenant phase 4: MCP OAuth and self-service tokens are for the tenant of
 * the address the person connected through, only. No approved membership there
 * → a plain refusal, never a token for another tenant of theirs. Platform owner
 * exempt.
 *
 * The membership rules run for real (resolveMintOrg / getUserOrgIds) over a
 * small in-memory Firestore; the OAuth stores and token minting are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// ── People ──────────────────────────────────────────────────────────────────
// crc-only: approved in crc. dual: crc + brotherslazaroff. pending-bl: pending
// in BL only. po: platform owner, no memberships. All migrated.
const db = vi.hoisted(() => {
    const memberships: Array<{ uid: string; tenantId: string; role: string }> = [
        { uid: "crc-only", tenantId: "crc", role: "musician" },
        { uid: "dual", tenantId: "crc", role: "band_leader" },
        { uid: "dual", tenantId: "brotherslazaroff", role: "admin" },
        { uid: "pending-bl", tenantId: "brotherslazaroff", role: "pending" },
        { uid: "denied-bl", tenantId: "brotherslazaroff", role: "denied" },
    ]
    const users = ["crc-only", "dual", "pending-bl", "denied-bl", "po"]
    const firestore = {
        collection(name: string) {
            return {
                where(_f: string, _op: string, uid: string) {
                    return {
                        async get() {
                            const docs = name === "memberships" ? memberships.filter((m) => m.uid === uid) : []
                            return { empty: docs.length === 0, docs: docs.map((d) => ({ data: () => d })) }
                        },
                    }
                },
                doc(id: string) {
                    return {
                        async get() {
                            const exists = name === "users" && users.includes(id)
                            return { exists, data: () => (exists ? { membershipsMigratedAt: new Date(0) } : undefined) }
                        },
                    }
                },
            }
        },
    }
    return { firestore }
})
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => db.firestore),
    getAuth: vi.fn(() => ({ getUser: async () => ({ customClaims: {} }) })),
    getStorage: vi.fn(),
}))
vi.mock("@/lib/org/access", () => ({
    isPlatformOwner: vi.fn(async (uid: string) => uid === "po"),
}))

// ── OAuth stores, session, minting ──────────────────────────────────────────
const oauth = vi.hoisted(() => ({
    created: [] as Array<Record<string, unknown>>,
    consumed: null as Record<string, unknown> | null,
}))
vi.mock("@/lib/mcp/oauth", () => ({
    getClient: vi.fn(async () => ({ clientId: "c1", clientName: "Claude", redirectUris: ["https://claude.ai/cb"] })),
    createAuthCode: vi.fn(async (data: Record<string, unknown>) => {
        oauth.created.push(data)
        return "code-123"
    }),
    consumeAuthCode: vi.fn(async () => oauth.consumed),
    verifyPkceS256: vi.fn(() => true),
}))
const session = vi.hoisted(() => ({ uid: "crc-only" }))
vi.mock("@/lib/server-auth", () => ({
    getServerUser: vi.fn(async () => ({ uid: session.uid })),
}))
const minted = vi.hoisted(() => ({ calls: [] as Array<{ uid: string; orgId: string }> }))
vi.mock("@/lib/mcp/tokens", () => ({
    createMcpToken: vi.fn(async (uid: string, _label: string, orgId: string) => {
        minted.calls.push({ uid, orgId })
        return { id: "tok-1", rawToken: "crl_live_x" }
    }),
    listMcpTokens: vi.fn(async () => []),
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/api-wrapper", () => ({
    createApiHandler:
        (fn: (ctx: unknown) => Promise<Response>) =>
        async (req: NextRequest) =>
            fn({ req, auth: { uid: session.uid }, body: await req.json(), params: {} }),
}))

import { resolveMintOrg } from "@/lib/org/membership-server"
import { GET as authorize } from "@/app/api/mcp/oauth/authorize/route"
import { POST as token } from "@/app/api/mcp/oauth/token/route"
import { POST as createToken } from "@/app/api/mcp/tokens/route"

const BL_REFUSAL = "This account isn't a member of Brothers Lazaroff. Ask its admin for access."

function authorizeReq(orgId: string): NextRequest {
    const q = new URLSearchParams({
        response_type: "code",
        client_id: "c1",
        redirect_uri: "https://claude.ai/cb",
        code_challenge: "abc",
        code_challenge_method: "S256",
        state: "st",
    })
    return new NextRequest(`https://www.example.live/api/mcp/oauth/authorize?${q}`, { headers: { "x-org-id": orgId } })
}

function tokenReq(orgId: string): NextRequest {
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: "code-123",
        redirect_uri: "https://claude.ai/cb",
        client_id: "c1",
        code_verifier: "v",
    })
    return new NextRequest("https://www.example.live/api/mcp/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "x-org-id": orgId },
        body: body.toString(),
    })
}

function tokensReq(orgId: string): NextRequest {
    return new NextRequest("https://www.example.live/api/mcp/tokens", {
        method: "POST",
        headers: { "content-type": "application/json", "x-org-id": orgId },
        body: JSON.stringify({ label: "Claude Desktop" }),
    })
}

function code(uid: string, orgId?: string) {
    return { clientId: "c1", uid, codeChallenge: "abc", redirectUri: "https://claude.ai/cb", scope: null, orgId: orgId ?? null }
}

beforeEach(() => {
    oauth.created = []
    oauth.consumed = null
    minted.calls = []
})

describe("resolveMintOrg (address tenant only)", () => {
    it("member of the address's tenant → that tenant", async () => {
        expect(await resolveMintOrg("crc-only", "crc")).toEqual({ ok: true, orgId: "crc" })
        expect(await resolveMintOrg("dual", "brotherslazaroff")).toEqual({ ok: true, orgId: "brotherslazaroff" })
        expect(await resolveMintOrg("dual", "crc")).toEqual({ ok: true, orgId: "crc" })
    })

    it("CRC-only user at BL's address → refused, not a crc token", async () => {
        expect(await resolveMintOrg("crc-only", "brotherslazaroff")).toEqual({
            ok: false,
            orgId: "brotherslazaroff",
            message: BL_REFUSAL,
        })
    })

    it("pending or denied is not membership", async () => {
        expect((await resolveMintOrg("pending-bl", "brotherslazaroff")).ok).toBe(false)
        expect((await resolveMintOrg("denied-bl", "brotherslazaroff")).ok).toBe(false)
    })

    it("platform owner: allowed at any address, for that address's tenant", async () => {
        expect(await resolveMintOrg("po", "brotherslazaroff")).toEqual({ ok: true, orgId: "brotherslazaroff" })
        expect(await resolveMintOrg("po", "testshul")).toEqual({ ok: true, orgId: "testshul" })
    })

    it("an unknown tenant's refusal names the tenant id", async () => {
        const d = await resolveMintOrg("crc-only", "testshul")
        expect(d).toEqual({ ok: false, orgId: "testshul", message: "This account isn't a member of testshul. Ask its admin for access." })
    })
})

describe("/api/mcp/oauth/authorize", () => {
    it("CRC-only user via BL's address → access_denied redirect with the plain message; no code", async () => {
        session.uid = "crc-only"
        const res = await authorize(authorizeReq("brotherslazaroff"))
        expect(res.status).toBe(302)
        const loc = new URL(res.headers.get("location")!)
        expect(loc.origin + loc.pathname).toBe("https://claude.ai/cb")
        expect(loc.searchParams.get("error")).toBe("access_denied")
        expect(loc.searchParams.get("error_description")).toBe(BL_REFUSAL)
        expect(loc.searchParams.get("state")).toBe("st")
        expect(oauth.created).toHaveLength(0)
    })

    it("the code records the address's tenant (dual member at BL → brotherslazaroff)", async () => {
        session.uid = "dual"
        const res = await authorize(authorizeReq("brotherslazaroff"))
        const loc = new URL(res.headers.get("location")!)
        expect(loc.searchParams.get("code")).toBe("code-123")
        expect(oauth.created[0]).toMatchObject({ uid: "dual", orgId: "brotherslazaroff" })
    })

    it("existing CRC flow unchanged: CRC member at CRC's address gets a crc code", async () => {
        session.uid = "crc-only"
        const res = await authorize(authorizeReq("crc"))
        expect(new URL(res.headers.get("location")!).searchParams.get("code")).toBe("code-123")
        expect(oauth.created[0]).toMatchObject({ uid: "crc-only", orgId: "crc" })
    })

    it("platform owner allowed at any address", async () => {
        session.uid = "po"
        await authorize(authorizeReq("brotherslazaroff"))
        expect(oauth.created[0]).toMatchObject({ uid: "po", orgId: "brotherslazaroff" })
    })
})

describe("/api/mcp/oauth/token", () => {
    it("mints for the tenant recorded in the code, not the token request's host", async () => {
        oauth.consumed = code("dual", "brotherslazaroff")
        const res = await token(tokenReq("crc"))
        expect(res.status).toBe(200)
        expect(minted.calls).toEqual([{ uid: "dual", orgId: "brotherslazaroff" }])
    })

    it("existing BL flow unchanged: BL member, BL code → BL token", async () => {
        oauth.consumed = code("dual", "brotherslazaroff")
        const res = await token(tokenReq("brotherslazaroff"))
        expect((await res.json()).access_token).toBe("crl_live_x")
        expect(minted.calls[0].orgId).toBe("brotherslazaroff")
    })

    it("a pre-phase-4 code (no tenant) uses the host; a non-member is refused with access_denied", async () => {
        oauth.consumed = code("crc-only")
        const res = await token(tokenReq("brotherslazaroff"))
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: "access_denied", error_description: BL_REFUSAL })
        expect(minted.calls).toHaveLength(0)
    })

    it("refuses when membership was lost between authorize and token", async () => {
        oauth.consumed = code("crc-only", "brotherslazaroff")
        const res = await token(tokenReq("brotherslazaroff"))
        expect(res.status).toBe(403)
        expect(minted.calls).toHaveLength(0)
    })
})

describe("/api/mcp/tokens (self-service)", () => {
    it("CRC-only user at BL's address → 403 with the plain message", async () => {
        session.uid = "crc-only"
        const res = await createToken(tokensReq("brotherslazaroff"), { params: Promise.resolve({}) })
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: BL_REFUSAL })
        expect(minted.calls).toHaveLength(0)
    })

    it("dual member gets the address's tenant", async () => {
        session.uid = "dual"
        const res = await createToken(tokensReq("brotherslazaroff"), { params: Promise.resolve({}) })
        expect(res.status).toBe(200)
        expect(minted.calls).toEqual([{ uid: "dual", orgId: "brotherslazaroff" }])
    })

    it("existing CRC flow unchanged", async () => {
        session.uid = "crc-only"
        const res = await createToken(tokensReq("crc"), { params: Promise.resolve({}) })
        expect(await res.json()).toEqual({ id: "tok-1", token: "crl_live_x" })
        expect(minted.calls).toEqual([{ uid: "crc-only", orgId: "crc" }])
    })

    it("platform owner allowed anywhere", async () => {
        session.uid = "po"
        await createToken(tokensReq("testshul"), { params: Promise.resolve({}) })
        expect(minted.calls).toEqual([{ uid: "po", orgId: "testshul" }])
    })
})
