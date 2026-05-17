import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * UX-001 admin-bearer branch unit tests. Mocks the route's downstream
 * collaborators (verifyBearer, Firestore, Auth, Identity Toolkit fetch,
 * session cookie + role cookie writers) so we can exercise the new
 * routing branches without firebase emulator + an Identity Toolkit API
 * key in scope.
 *
 * What's covered:
 *  - forbidden_role when non-admin bearer passes `uid` body param.
 *  - invalid_argument when admin bearer passes a non-test-* target uid.
 *  - invalid_argument when admin bearer's target uid isn't registered
 *    in mcpTestUsers.
 *  - happy path: admin bearer + valid mcpTestUsers target → mint succeeds.
 *  - legacy self-mint preserved: no body → bearer's own uid path still works
 *    (and SEC-001 piggyback: bearerUid no longer echoes in not_a_test_uid).
 *
 * What's NOT covered here (gap acknowledged):
 *  - Real Identity Toolkit exchange (out-of-process; mocked).
 *  - Rate-limit / Sentry / structured logging side effects (out of scope).
 */

const mockVerifyBearer = vi.fn()
const mockCheckRateLimit = vi.fn()
const mockInitAdmin = vi.fn(() => true)
const mockGetUserDoc = vi.fn()
const mockGetTestUserDoc = vi.fn()
const mockUpdateUser = vi.fn(async () => ({}))
const mockCreateCustomToken = vi.fn(async () => "fake-custom-token")
const mockCreateSessionCookie = vi.fn(async () => "fake-session-cookie")
const mockSignRoleCookie = vi.fn(async () => "fake-role-cookie")
const mockFetch = vi.fn()

vi.mock("@/lib/mcp/auth", () => ({
    verifyBearer: (...args: unknown[]) => mockVerifyBearer(...args),
}))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => mockInitAdmin(),
    getFirestore: () => ({
        collection: (name: string) => ({
            doc: (id: string) => ({
                get: async () =>
                    name === "users"
                        ? mockGetUserDoc(id)
                        : mockGetTestUserDoc(id),
            }),
        }),
    }),
    getAuth: () => ({
        updateUser: mockUpdateUser,
        createCustomToken: mockCreateCustomToken,
        createSessionCookie: mockCreateSessionCookie,
    }),
}))

vi.mock("@/lib/session-role", () => ({
    SESSION_ROLE_COOKIE: "__session_role",
    SESSION_ROLE_MAX_AGE: 60 * 60 * 24 * 14,
    signRoleCookie: (...args: unknown[]) => mockSignRoleCookie(...args),
}))

vi.mock("@/lib/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}))

// next/server pulls fetch from globalThis; stubbing it lets the Identity
// Toolkit exchange path succeed without touching the network.
globalThis.fetch = mockFetch as unknown as typeof fetch

// API key gate inside the route — must be set BEFORE importing the route.
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "fake-api-key"

import { POST } from "../route"

function jsonRequest(body?: Record<string, unknown>): Request {
    return new Request("https://example.com/api/auth/test-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
}

describe("/api/auth/test-session — UX-001 admin-bearer branch", () => {
    beforeEach(() => {
        mockVerifyBearer.mockReset()
        mockCheckRateLimit.mockReset().mockResolvedValue(null)
        mockGetUserDoc.mockReset()
        mockGetTestUserDoc.mockReset()
        mockUpdateUser.mockReset().mockResolvedValue({})
        mockCreateCustomToken.mockReset().mockResolvedValue("fake-custom-token")
        mockCreateSessionCookie
            .mockReset()
            .mockResolvedValue("fake-session-cookie")
        mockSignRoleCookie.mockReset().mockResolvedValue("fake-role-cookie")
        mockFetch.mockReset().mockResolvedValue(
            new Response(JSON.stringify({ idToken: "fake-id-token" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        )
    })

    it("non-admin bearer with body.uid → forbidden_role", async () => {
        mockVerifyBearer.mockResolvedValueOnce({ uid: "test-musician-abc" })
        mockGetUserDoc.mockResolvedValueOnce({
            exists: true,
            data: () => ({ role: "musician" }),
        })

        const res = await POST(jsonRequest({ uid: "test-band_leader-xyz" }) as never)
        expect(res.status).toBe(403)
        const body = (await res.json()) as Record<string, unknown>
        expect(body.error).toBe("forbidden_role")
        expect(body.callerRole).toBe("musician")
        // SEC-001 piggyback: refusal does NOT echo target uid or bearer uid.
        expect(JSON.stringify(body)).not.toContain("test-band_leader-xyz")
        expect(JSON.stringify(body)).not.toContain("test-musician-abc")
    })

    it("admin bearer + non-test target uid → invalid_argument", async () => {
        mockVerifyBearer.mockResolvedValueOnce({ uid: "admin-daniel" })
        mockGetUserDoc.mockResolvedValueOnce({
            exists: true,
            data: () => ({ role: "admin" }),
        })

        const res = await POST(jsonRequest({ uid: "real-user-uid" }) as never)
        expect(res.status).toBe(400)
        const body = (await res.json()) as Record<string, unknown>
        expect(body.error).toBe("invalid_argument")
        expect(body.field).toBe("uid")
    })

    it("admin bearer + test-* target uid NOT in mcpTestUsers → invalid_argument", async () => {
        mockVerifyBearer.mockResolvedValueOnce({ uid: "admin-daniel" })
        mockGetUserDoc.mockResolvedValueOnce({
            exists: true,
            data: () => ({ role: "admin" }),
        })
        mockGetTestUserDoc.mockResolvedValueOnce({
            exists: false,
        })

        const res = await POST(
            jsonRequest({ uid: "test-musician-deadbeef" }) as never,
        )
        expect(res.status).toBe(400)
        const body = (await res.json()) as Record<string, unknown>
        expect(body.error).toBe("invalid_argument")
        expect(body.message).toMatch(/mcpTestUsers/)
    })

    it("admin bearer + valid mcpTestUsers target → mints session cookie", async () => {
        mockVerifyBearer.mockResolvedValueOnce({ uid: "admin-daniel" })
        mockGetUserDoc.mockResolvedValueOnce({
            exists: true,
            data: () => ({ role: "admin" }),
        })
        mockGetTestUserDoc.mockResolvedValueOnce({
            exists: true,
            data: () => ({ uid: "test-band_leader-abc", role: "band_leader" }),
        })
        // Second users/{uid} read at line near `users/{uid}` role lookup —
        // the route reads the TARGET uid's role to populate the response +
        // signed role cookie. Return band_leader.
        mockGetUserDoc.mockResolvedValueOnce({
            exists: true,
            data: () => ({ role: "band_leader" }),
        })

        const res = await POST(
            jsonRequest({ uid: "test-band_leader-abc" }) as never,
        )
        expect(res.status).toBe(200)
        const body = (await res.json()) as Record<string, unknown>
        expect(body.ok).toBe(true)
        expect(body.uid).toBe("test-band_leader-abc")
        expect(body.role).toBe("band_leader")
        // Identity Toolkit exchange was called with the TARGET uid's
        // custom token (not the bearer's admin uid).
        expect(mockCreateCustomToken).toHaveBeenCalledWith(
            "test-band_leader-abc",
        )
    })

    it("self-mint (no body) — bearer's own test-* uid still works", async () => {
        mockVerifyBearer.mockResolvedValueOnce({
            uid: "test-musician-self",
        })
        mockGetUserDoc.mockResolvedValueOnce({
            exists: true,
            data: () => ({ role: "musician" }),
        })

        const res = await POST(jsonRequest() as never)
        expect(res.status).toBe(200)
        expect(mockCreateCustomToken).toHaveBeenCalledWith("test-musician-self")
    })

    it("self-mint (no body) — non-test bearer rejected, SEC-001 scrubs uid", async () => {
        mockVerifyBearer.mockResolvedValueOnce({ uid: "admin-daniel" })

        const res = await POST(jsonRequest() as never)
        expect(res.status).toBe(403)
        const body = (await res.json()) as Record<string, unknown>
        expect(body.error).toBe("not_a_test_uid")
        // SEC-001 piggyback: refusal does NOT echo bearerUid.
        expect(JSON.stringify(body)).not.toContain("admin-daniel")
    })
})
