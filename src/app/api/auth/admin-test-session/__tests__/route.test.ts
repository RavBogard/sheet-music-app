import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * admin-test-session route unit tests. Mocks the downstream collaborators
 * (provisionAdminTestSession core, Firebase Auth, Identity Toolkit fetch,
 * session/role cookie writers) so we exercise the SECRET-GATE branches +
 * the success-body shape without the firebase emulator or an Identity
 * Toolkit API key.
 *
 * What's covered:
 *  - 503 when MCP_ADMIN_TEST_SESSION_SECRET is unset (dormant default).
 *  - 403 when the x-admin-test-secret header is missing.
 *  - 403 when the secret is wrong (constant-time compare still refuses).
 *  - happy path: correct secret → mints session, body carries
 *    role:'admin' + admin_test:true + token + customToken + 1h TTLs.
 *  - the provision core is NEVER called on a refusal (no user/bearer/audit
 *    side effects leak from a wrong-secret probe).
 *
 * What's NOT covered here (gap acknowledged, by design):
 *  - Real Identity Toolkit exchange (out-of-process; mocked).
 *  - The actual Firestore audit-row write + claim propagation — that's the
 *    emulator test (admin-test-session.emulator.test.ts).
 */

const mockCheckRateLimit = vi.fn()
const mockInitAdmin = vi.fn(() => true)
const mockUpdateUser = vi.fn(async () => ({}))
const FAKE_CUSTOM_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiJ0ZXN0LWFkbWluIn0.signature"
const mockCreateCustomToken = vi.fn(async () => FAKE_CUSTOM_TOKEN)
const mockCreateSessionCookie = vi.fn(async () => "fake-session-cookie")
const mockSignRoleCookie = vi.fn<(...args: unknown[]) => Promise<string>>(async () => "fake-role-cookie")
const mockProvision = vi.fn()
const mockFetch = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => mockInitAdmin(),
    getAuth: () => ({
        updateUser: mockUpdateUser,
        createCustomToken: mockCreateCustomToken,
        createSessionCookie: mockCreateSessionCookie,
    }),
}))

vi.mock("@/lib/mcp/tools/admin-test-session", async () => {
    const real = await vi.importActual<
        typeof import("@/lib/mcp/tools/admin-test-session")
    >("@/lib/mcp/tools/admin-test-session")
    return {
        ...real,
        provisionAdminTestSession: (...args: unknown[]) => mockProvision(...args),
    }
})

vi.mock("@/lib/session-role", () => ({
    SESSION_ROLE_COOKIE: "__session_role",
    SESSION_ROLE_MAX_AGE: 60 * 60 * 24 * 14,
    signRoleCookie: (...args: unknown[]) => mockSignRoleCookie(...args),
}))

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

globalThis.fetch = mockFetch as unknown as typeof fetch
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "fake-api-key"

import { POST } from "../route"

const SECRET = "super-secret-admin-test-value-123"

// richError (origin/master `errors.ts`) is the rich nested shape:
// `{ok:false, error:{code, machine_code, message}, ...}`. Pull the slug.
function machineCode(body: Record<string, unknown>): string | undefined {
    const err = body.error
    if (err && typeof err === "object") {
        const mc = (err as Record<string, unknown>).machine_code
        return typeof mc === "string" ? mc : undefined
    }
    return undefined
}

function req(opts: { secret?: string; body?: Record<string, unknown> } = {}): Request {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (opts.secret !== undefined) headers["x-admin-test-secret"] = opts.secret
    return new Request("https://example.com/api/auth/admin-test-session", {
        method: "POST",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
}

describe("/api/auth/admin-test-session — secret gate", () => {
    beforeEach(() => {
        mockCheckRateLimit.mockReset().mockResolvedValue(null)
        mockInitAdmin.mockReset().mockReturnValue(true)
        mockUpdateUser.mockReset().mockResolvedValue({})
        mockCreateCustomToken.mockReset().mockResolvedValue(FAKE_CUSTOM_TOKEN)
        mockCreateSessionCookie.mockReset().mockResolvedValue("fake-session-cookie")
        mockSignRoleCookie.mockReset().mockResolvedValue("fake-role-cookie")
        mockProvision.mockReset().mockResolvedValue({
            uid: "test-admin-deadbeef",
            role: "admin",
            token: "crl_live_fakeadminbearer",
            tokenId: "tok-1",
            auditId: "audit-1",
            expiresAtMs: Date.now() + 3600_000,
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
            displayName: "[TEST] admin",
            adminTest: true,
        })
        mockFetch.mockReset().mockResolvedValue(
            new Response(JSON.stringify({ idToken: "fake-id-token" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        )
        delete process.env.MCP_ADMIN_TEST_SESSION_SECRET
    })

    it("503 when the secret env var is unset (dormant default)", async () => {
        const res = await POST(req({ secret: "anything" }) as never)
        expect(res.status).toBe(503)
        const body = (await res.json()) as Record<string, unknown>
        expect(machineCode(body)).toBe("admin_test_session_disabled")
        expect(mockProvision).not.toHaveBeenCalled()
    })

    it("403 when the x-admin-test-secret header is missing", async () => {
        process.env.MCP_ADMIN_TEST_SESSION_SECRET = SECRET
        const res = await POST(req({}) as never)
        expect(res.status).toBe(403)
        const body = (await res.json()) as Record<string, unknown>
        expect(machineCode(body)).toBe("forbidden")
        expect(mockProvision).not.toHaveBeenCalled()
    })

    it("403 when the secret is wrong", async () => {
        process.env.MCP_ADMIN_TEST_SESSION_SECRET = SECRET
        const res = await POST(req({ secret: "wrong-secret-but-same-length-padxx" }) as never)
        expect(res.status).toBe(403)
        const body = (await res.json()) as Record<string, unknown>
        expect(machineCode(body)).toBe("forbidden")
        // Wrong-secret probe must NOT leak the provided value.
        expect(JSON.stringify(body)).not.toContain("wrong-secret")
        expect(mockProvision).not.toHaveBeenCalled()
    })

    it("403 even when provided secret is a length-mismatched prefix (no timing leak path)", async () => {
        process.env.MCP_ADMIN_TEST_SESSION_SECRET = SECRET
        const res = await POST(req({ secret: SECRET.slice(0, 5) }) as never)
        expect(res.status).toBe(403)
        expect(mockProvision).not.toHaveBeenCalled()
    })

    it("happy path: correct secret → mints admin session with admin_test claim", async () => {
        process.env.MCP_ADMIN_TEST_SESSION_SECRET = SECRET
        const res = await POST(req({ secret: SECRET }) as never)
        expect(res.status).toBe(200)
        const body = (await res.json()) as Record<string, unknown>
        expect(body.ok).toBe(true)
        expect(body.uid).toBe("test-admin-deadbeef")
        expect(body.role).toBe("admin")
        expect(body.admin_test).toBe(true)
        expect(body.token).toBe("crl_live_fakeadminbearer")
        // META-003 parity: customToken (JWT shape) + 1h TTLs.
        expect(typeof body.customToken).toBe("string")
        expect((body.customToken as string).split(".")).toHaveLength(3)
        expect(body.customTokenExpiresInSec).toBe(3600)
        expect(body.expiresInSec).toBe(3600)
        // session cookie set on the response.
        const setCookie = res.headers.get("set-cookie") ?? ""
        expect(setCookie).toContain("__session=")
        // provision core called exactly once on the success path.
        expect(mockProvision).toHaveBeenCalledTimes(1)
    })

    it("passes a ttlSec body override through to the provision core", async () => {
        process.env.MCP_ADMIN_TEST_SESSION_SECRET = SECRET
        await POST(req({ secret: SECRET, body: { ttlSec: 900 } }) as never)
        expect(mockProvision).toHaveBeenCalledWith(
            expect.objectContaining({ ttlSec: 900 }),
        )
    })
})
