/**
 * v4.3 P9-02 — POST /api/auth/session (Firebase session + companion role cookie)
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

let profileData: Record<string, unknown> | undefined = undefined
let membershipData: Record<string, unknown> | undefined = undefined
let verifyIdTokenImpl: () => Promise<unknown> = async () => ({
    uid: "u-1",
    iat: Math.floor(Date.now() / 1000),
})
let createSessionCookieImpl: () => Promise<string> = async () => "firebase-session-cookie"

let recordClaims: Record<string, unknown> | undefined = { role: "admin" }

const mockAuthAdmin = {
    getUser: vi.fn(async () => ({ customClaims: recordClaims })),
    verifyIdToken: vi.fn((token: string) => verifyIdTokenImpl()),
    createSessionCookie: vi.fn((token: string, opts: unknown) => createSessionCookieImpl()),
}

const mockFirestore = {
    // Multi-tenant P2: no memberships / platform docs here, so the caller is an
    // unmigrated (legacy) account and the P0 doc-role-capped-to-claims rule applies.
    collection: vi.fn((name: string) => ({
        doc: vi.fn(() => ({
            get: async () =>
                name === "users"
                    ? { exists: profileData !== undefined, data: () => profileData }
                    : name === "memberships"
                      ? { exists: membershipData !== undefined, data: () => membershipData }
                      : { exists: false, data: () => undefined },
        })),
    })),
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getAuth: vi.fn(() => mockAuthAdmin),
    getFirestore: vi.fn(() => mockFirestore),
    verifyIdToken: vi.fn(),
}))

// session route imports getAuth directly from firebase-admin/auth — shim it
vi.mock("firebase-admin/auth", () => ({
    getAuth: vi.fn(() => mockAuthAdmin),
}))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

let POST: typeof import("@/app/api/auth/session/route").POST

const originalSecret = process.env.SESSION_ROLE_SECRET

beforeAll(async () => {
    process.env.SESSION_ROLE_SECRET = "test-secret-abcdefghijklmnop"
    const mod = await import("@/app/api/auth/session/route")
    POST = mod.POST
})

afterAll(() => {
    if (originalSecret === undefined) delete process.env.SESSION_ROLE_SECRET
    else process.env.SESSION_ROLE_SECRET = originalSecret
})

function req(body: Record<string, unknown> = { idToken: "valid-id-token" }) {
    return makeReq("/api/auth/session", { method: "POST", body })
}

describe("POST /api/auth/session", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        profileData = undefined
        membershipData = undefined
        recordClaims = { role: "admin" }
        verifyIdTokenImpl = async () => ({
            uid: "u-1",
            iat: Math.floor(Date.now() / 1000),
        })
        createSessionCookieImpl = async () => "firebase-session-cookie"
    })

    it("sets both __session and __session_role when Firestore role exists", async () => {
        profileData = { role: "musician" }
        const res = await POST(req())
        expect(res.status).toBe(200)
        const setCookie = res.headers.get("set-cookie") || ""
        expect(setCookie).toContain("__session=firebase-session-cookie")
        expect(setCookie).toContain("__session_role=")

        const match = setCookie.match(/__session_role=([^;]+)/)
        const raw = decodeURIComponent(match![1])
        const { verifyRoleCookie } = await import("@/lib/session-role")
        const verified = await verifyRoleCookie(raw)
        expect(verified).toEqual({ uid: "u-1", role: "musician", org: "crc" })
    })

    it("sets companion cookie with role=null when profile missing", async () => {
        profileData = undefined
        const res = await POST(req())
        expect(res.status).toBe(200)
        const setCookie = res.headers.get("set-cookie") || ""
        const match = setCookie.match(/__session_role=([^;]+)/)
        expect(match).toBeTruthy()
        const raw = decodeURIComponent(match![1])
        const { verifyRoleCookie } = await import("@/lib/session-role")
        const verified = await verifyRoleCookie(raw)
        expect(verified).toEqual({ uid: "u-1", role: null, org: "crc" })
    })

    it("rejects stale idToken (iat > 5 min old) without setting cookies", async () => {
        verifyIdTokenImpl = async () => ({
            uid: "u-1",
            iat: Math.floor(Date.now() / 1000) - 10 * 60, // 10 min old
        })
        const res = await POST(req())
        expect(res.status).toBe(401)
        const setCookie = res.headers.get("set-cookie") || ""
        expect(setCookie).not.toContain("__session=")
        expect(setCookie).not.toContain("__session_role=")
    })

    it("returns 400 on missing idToken", async () => {
        const res = await POST(req({}))
        expect(res.status).toBe(400)
    })
    it("multi-tenant P0: never signs a role above the account's claims (self-written doc role 'admin', claim 'pending')", async () => {
        profileData = { role: "admin" }
        recordClaims = { role: "pending" }
        const res = await POST(req())
        expect(res.status).toBe(200)
        const setCookie = res.headers.get("set-cookie") ?? ""
        const match = setCookie.match(/__session_role=([^;]+)/)
        const { verifyRoleCookie } = await import("@/lib/session-role")
        const verified = await verifyRoleCookie(decodeURIComponent(match![1]))
        expect(verified).toEqual({ uid: "u-1", role: "pending", org: "crc" })
    })

    it("multi-tenant P0: a lower document role still wins (demotion honoured)", async () => {
        profileData = { role: "musician" }
        recordClaims = { role: "band_leader" }
        const res = await POST(req())
        const setCookie = res.headers.get("set-cookie") ?? ""
        const match = setCookie.match(/__session_role=([^;]+)/)
        const { verifyRoleCookie } = await import("@/lib/session-role")
        expect(await verifyRoleCookie(decodeURIComponent(match![1]))).toEqual({ uid: "u-1", role: "musician", org: "crc" })
    })

    it("multi-tenant P2: signs the host tenant's membership role and carries the org", async () => {
        profileData = { role: "admin", membershipsMigratedAt: "t" }
        membershipData = { role: "musician", tenantId: "brotherslazaroff", uid: "u-1" }
        const res = await POST(makeReq("/api/auth/session", {
            method: "POST",
            body: { idToken: "valid-id-token" },
            headers: { "x-org-id": "brotherslazaroff" },
        }))
        expect(res.status).toBe(200)
        const match = /__session_role=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")
        const { verifyRoleCookie } = await import("@/lib/session-role")
        expect(await verifyRoleCookie(decodeURIComponent(match![1]))).toEqual({ uid: "u-1", role: "musician", org: "brotherslazaroff" })
    })

    it("multi-tenant P2: migrated with no membership in the host tenant → role null", async () => {
        profileData = { role: "admin", membershipsMigratedAt: "t" }
        const res = await POST(makeReq("/api/auth/session", {
            method: "POST",
            body: { idToken: "valid-id-token" },
            headers: { "x-org-id": "brotherslazaroff" },
        }))
        const match = /__session_role=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")
        const { verifyRoleCookie } = await import("@/lib/session-role")
        expect(await verifyRoleCookie(decodeURIComponent(match![1]))).toEqual({ uid: "u-1", role: null, org: "brotherslazaroff" })
    })
})
