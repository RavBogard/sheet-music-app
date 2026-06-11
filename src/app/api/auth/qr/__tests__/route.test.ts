import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * QR poll endpoint (GET /api/auth/qr) unit tests.
 *
 * Regression for BUG-7 (run-2 §BUG-7): a malformed `?code` (e.g. containing
 * '/') used to reach `db.collection().doc(code)`, an odd-segment document
 * reference that throws → caught as a 500. Caller-supplied bad input must be
 * 4xx per the v11.2 error contract. The fix validates the code against
 * /^[A-Z0-9]{6}$/ BEFORE initAdmin()/Firestore.
 *
 * Firestore is mocked so the valid-code path resolves to a non-existent
 * session (→ 404), proving a well-formed code still reaches the lookup and is
 * NOT swept up by the new format guard.
 */

const mockCheckRateLimit = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => null) // null = not rate-limited
const mockInitAdmin = vi.fn(() => true)
const mockGet = vi.fn(async () => ({ exists: false }))
const mockDoc = vi.fn(() => ({ get: mockGet }))
const mockCollection = vi.fn(() => ({ doc: mockDoc }))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => mockInitAdmin(),
    getFirestore: () => ({ collection: mockCollection }),
    getAuth: () => ({}),
    verifyIdToken: vi.fn(),
}))

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Imported AFTER the mocks are registered.
import { GET } from "../route"

const makeReq = (query: string) =>
    new NextRequest(new URL(`http://localhost/api/auth/qr${query}`))

describe("GET /api/auth/qr — code validation (BUG-7)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockCheckRateLimit.mockResolvedValue(null)
        mockInitAdmin.mockReturnValue(true)
        mockGet.mockResolvedValue({ exists: false })
    })

    // AC-3 — malformed code → 400, not 500, and BEFORE Firestore is touched.
    it("returns 400 (not 500) for a malformed code containing '/'", async () => {
        const res = await GET(makeReq("?code=foo%2Fbar"))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toBe("Invalid code format")
        // Guard runs before any Firestore access.
        expect(mockCollection).not.toHaveBeenCalled()
    })

    // AC-4 — missing code keeps its existing 400 "Missing code".
    it("returns 400 'Missing code' when no code param is present", async () => {
        const res = await GET(makeReq(""))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toBe("Missing code")
        expect(mockCollection).not.toHaveBeenCalled()
    })

    // AC-4 — a valid 6-char code is NOT rejected by the guard; it reaches the
    // lookup and returns 404 when no session doc exists.
    it("reaches the lookup (404, not 400) for a valid 6-char code with no session", async () => {
        const res = await GET(makeReq("?code=ABC123"))
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.error).toBe("Session not found")
        expect(mockCollection).toHaveBeenCalledWith("qr-sessions")
        expect(mockDoc).toHaveBeenCalledWith("ABC123")
    })
})
