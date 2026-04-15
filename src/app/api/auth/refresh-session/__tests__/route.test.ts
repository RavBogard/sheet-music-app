/**
 * v4.3 P9-02 — POST /api/auth/refresh-session
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

let profileData: Record<string, unknown> | undefined = undefined

const mockFirestore = {
    collection: vi.fn(() => ({
        doc: vi.fn(() => ({
            get: async () => ({ data: () => profileData }),
        })),
    })),
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getAuth: vi.fn(() => ({})),
    getFirestore: vi.fn(() => mockFirestore),
    verifyIdToken: vi.fn(),
}))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { verifyIdToken } from "@/lib/firebase-admin"

function mockAuth(uid: string | null) {
    if (uid === null) {
        vi.mocked(verifyIdToken).mockResolvedValue(null as never)
    } else {
        vi.mocked(verifyIdToken).mockResolvedValue({
            uid,
            email: "u@example.com",
            role: "musician",
            isAdmin: false,
            isBandLeader: false,
            isMusician: true,
            isMember: true,
        } as never)
    }
}

let POST: typeof import("@/app/api/auth/refresh-session/route").POST

const originalSecret = process.env.SESSION_ROLE_SECRET

beforeAll(async () => {
    process.env.SESSION_ROLE_SECRET = "test-secret-abcdefghijklmnop"
    const mod = await import("@/app/api/auth/refresh-session/route")
    POST = mod.POST
})

afterAll(() => {
    if (originalSecret === undefined) delete process.env.SESSION_ROLE_SECRET
    else process.env.SESSION_ROLE_SECRET = originalSecret
})

function req(token: string | undefined = "valid") {
    return makeReq("/api/auth/refresh-session", {
        method: "POST",
        token,
        body: {},
    })
}

describe("POST /api/auth/refresh-session", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        profileData = undefined
    })

    it("rejects unauthenticated", async () => {
        mockAuth(null)
        const res = await POST(req(undefined))
        expect([401, 403]).toContain(res.status)
    })

    it("mints companion cookie matching Firestore role (band_leader)", async () => {
        mockAuth("u-1")
        profileData = { role: "band_leader" }
        const res = await POST(req())
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json).toEqual({ ok: true, role: "band_leader" })

        const setCookie = res.headers.get("set-cookie") || ""
        expect(setCookie).toContain("__session_role=")
        expect(setCookie).toContain("HttpOnly")
    })

    it("mints cookie with role=null when profile missing", async () => {
        mockAuth("u-1")
        profileData = undefined
        const res = await POST(req())
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json).toEqual({ ok: true, role: null })
    })

    it("signs cookie that verifies with matching uid + role", async () => {
        mockAuth("u-42")
        profileData = { role: "musician" }
        const res = await POST(req())
        const setCookie = res.headers.get("set-cookie") || ""
        const match = setCookie.match(/__session_role=([^;]+)/)
        expect(match).toBeTruthy()
        const raw = decodeURIComponent(match![1])

        const { verifyRoleCookie } = await import("@/lib/session-role")
        const verified = await verifyRoleCookie(raw)
        expect(verified).toEqual({ uid: "u-42", role: "musician" })
    })
})
