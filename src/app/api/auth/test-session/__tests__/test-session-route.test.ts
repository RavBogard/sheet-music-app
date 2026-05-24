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
 *  - META-003: success body returns a `customToken` (JWT shape) +
 *    `customTokenExpiresInSec: 3600` so cowork harnesses can call
 *    `signInWithCustomToken(auth, customToken)` client-side. Refusal
 *    bodies NEVER include the customToken.
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
// JWT-shaped fake so META-003 success-body shape assertions can validate
// the route returns a three-segment dot-separated string verbatim.
const FAKE_CUSTOM_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJ0ZXN0In0.signature"
const mockCreateCustomToken = vi.fn(async () => FAKE_CUSTOM_TOKEN)
const mockCreateSessionCookie = vi.fn(async () => "fake-session-cookie")
const mockSignRoleCookie = vi.fn<(...args: unknown[]) => Promise<string>>(async () => "fake-role-cookie")
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

// Cycle-3 envelope foundation (`2b8762f97`) shifted `richError` from the
// flat `{ok:false, error:<slug>, ...}` shape to the rich object shape
// `{ok:false, error:{code, machine_code, message}, ...extras}`. Tests
// in this file pre-dated that migration and were asserting against the
// flat shape — collateral repair here so the post-migration shape is
// what's asserted.
function machineCode(body: Record<string, unknown>): string | undefined {
    const err = body.error
    if (err && typeof err === "object") {
        const mc = (err as Record<string, unknown>).machine_code
        return typeof mc === "string" ? mc : undefined
    }
    return undefined
}

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
        mockCreateCustomToken.mockReset().mockResolvedValue(FAKE_CUSTOM_TOKEN)
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
        expect(machineCode(body)).toBe("forbidden_role")
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
        expect(machineCode(body)).toBe("invalid_argument")
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
        expect(machineCode(body)).toBe("invalid_argument")
        // Rich-envelope message lives at body.error.message
        const errBody = body.error as Record<string, unknown>
        expect(errBody.message).toMatch(/mcpTestUsers/)
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
        // custom token (not the bearer's admin uid). META-003 mints a
        // SECOND customToken at the end of the success path for the
        // response body — also scoped to the target uid.
        expect(mockCreateCustomToken).toHaveBeenCalledWith(
            "test-band_leader-abc",
        )
        expect(mockCreateCustomToken).toHaveBeenCalledTimes(2)
        // META-003 — customToken in response body has JWT shape
        // (three dot-separated segments) and a 1h expiration window.
        expect(typeof body.customToken).toBe("string")
        expect(body.customToken).toBe(FAKE_CUSTOM_TOKEN)
        expect((body.customToken as string).split(".")).toHaveLength(3)
        expect(body.customTokenExpiresInSec).toBe(3600)
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
        const body = (await res.json()) as Record<string, unknown>
        // META-003 — self-mint path also returns customToken + TTL.
        expect(typeof body.customToken).toBe("string")
        expect((body.customToken as string).split(".")).toHaveLength(3)
        expect(body.customTokenExpiresInSec).toBe(3600)
    })

    it("self-mint (no body) — non-test bearer rejected, SEC-001 scrubs uid", async () => {
        mockVerifyBearer.mockResolvedValueOnce({ uid: "admin-daniel" })

        const res = await POST(jsonRequest() as never)
        expect(res.status).toBe(403)
        const body = (await res.json()) as Record<string, unknown>
        expect(machineCode(body)).toBe("not_a_test_uid")
        // SEC-001 piggyback: refusal does NOT echo bearerUid.
        expect(JSON.stringify(body)).not.toContain("admin-daniel")
        // META-003 — refusal MUST NOT include the customToken.
        expect(body.customToken).toBeUndefined()
        expect(body.customTokenExpiresInSec).toBeUndefined()
    })

    it("META-003 — all refusal paths omit customToken from body", async () => {
        // Drive each refusal branch in turn and assert the customToken
        // field is absent on every one. createCustomToken should never
        // be reached on any refusal.

        // 1) forbidden_role
        mockVerifyBearer.mockResolvedValueOnce({ uid: "test-musician-abc" })
        mockGetUserDoc.mockResolvedValueOnce({
            exists: true,
            data: () => ({ role: "musician" }),
        })
        let res = await POST(
            jsonRequest({ uid: "test-band_leader-xyz" }) as never,
        )
        let body = (await res.json()) as Record<string, unknown>
        expect(res.status).toBe(403)
        expect(machineCode(body)).toBe("forbidden_role")
        expect(body.customToken).toBeUndefined()

        // 2) invalid_argument (non-test target)
        mockVerifyBearer.mockResolvedValueOnce({ uid: "admin-daniel" })
        mockGetUserDoc.mockResolvedValueOnce({
            exists: true,
            data: () => ({ role: "admin" }),
        })
        res = await POST(jsonRequest({ uid: "real-user-uid" }) as never)
        body = (await res.json()) as Record<string, unknown>
        expect(res.status).toBe(400)
        expect(machineCode(body)).toBe("invalid_argument")
        expect(body.customToken).toBeUndefined()

        // 3) invalid_argument (target not in mcpTestUsers)
        mockVerifyBearer.mockResolvedValueOnce({ uid: "admin-daniel" })
        mockGetUserDoc.mockResolvedValueOnce({
            exists: true,
            data: () => ({ role: "admin" }),
        })
        mockGetTestUserDoc.mockResolvedValueOnce({ exists: false })
        res = await POST(
            jsonRequest({ uid: "test-musician-deadbeef" }) as never,
        )
        body = (await res.json()) as Record<string, unknown>
        expect(res.status).toBe(400)
        expect(machineCode(body)).toBe("invalid_argument")
        expect(body.customToken).toBeUndefined()

        // 4) not_a_test_uid (self-mint with non-test bearer)
        mockVerifyBearer.mockResolvedValueOnce({ uid: "real-user" })
        res = await POST(jsonRequest() as never)
        body = (await res.json()) as Record<string, unknown>
        expect(res.status).toBe(403)
        expect(machineCode(body)).toBe("not_a_test_uid")
        expect(body.customToken).toBeUndefined()

        // createCustomToken is never called on any refusal path.
        expect(mockCreateCustomToken).not.toHaveBeenCalled()
    })
})
