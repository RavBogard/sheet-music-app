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
const mockSet = vi.fn(async () => undefined)
const mockDoc = vi.fn(() => ({ get: mockGet, set: mockSet }))
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
import { GET, POST } from "../route"
// generateCode lives in the sibling ./code module (route.ts may only export
// HTTP handlers — see code.ts). Import it directly for the distribution tests.
import { generateCode } from "../code"

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

    // BUG-12 (run-3 §BUG-12): create_test_account({loginable:true}) mints a
    // 32-char base64url code (randomBytes(24).toString("base64url")) into the
    // SAME qr-sessions collection. The old `^[A-Z0-9]{6}$` gate 400'd it, killing
    // the /test-login consume. The widened guard must let it reach the lookup.

    // AC-1 — a 32-char base64url test-login code reaches the lookup (the actual
    // shape from the run-3 report; mixed-case, exactly 32 chars).
    it("reaches the lookup (404, not 400) for a 32-char base64url test-login code", async () => {
        const code = "HTeAcKgffxbPycjgFgIQXkSgfuFT7GvP" // 32 chars, mixed-case
        expect(code).toHaveLength(32)
        const res = await GET(makeReq(`?code=${code}`))
        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body.error).toBe("Session not found")
        expect(mockCollection).toHaveBeenCalledWith("qr-sessions")
        expect(mockDoc).toHaveBeenCalledWith(code)
    })

    // AC-1 — base64url charset breadth: a 32-char code containing '-' and '_'
    // (the two non-alnum base64url chars) is admitted.
    it("reaches the lookup for a 32-char code containing '-' and '_'", async () => {
        const code = "abcDEF-_12345678901234567890XYza" // 32 chars, has - and _
        expect(code).toHaveLength(32)
        const res = await GET(makeReq(`?code=${code}`))
        expect(res.status).toBe(404)
        expect(mockDoc).toHaveBeenCalledWith(code)
    })

    // AC-3 — boundary 400s: lengths/charsets that match NEITHER legitimate shape
    // must 400 before Firestore. Asserts the validator stays exactly-two-shapes
    // (not loosened to "anything without '/'").
    it.each([
        ["ABC12", "5-char (below 6-char shape)"],
        ["ABC1234", "7-char (above 6-char shape)"],
        ["abc123", "6-char but lowercase (device codes are uppercase)"],
        ["a".repeat(31), "31-char base64url (below 32)"],
        ["a".repeat(33), "33-char base64url (above 32)"],
    ])("returns 400 before Firestore for %s — %s", async (code) => {
        const res = await GET(makeReq(`?code=${code}`))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toBe("Invalid code format")
        expect(mockCollection).not.toHaveBeenCalled()
    })

    // AC-3 — a 32-LENGTH code with a '/' inside (path char at the right length)
    // still 400s before Firestore: the BUG-7 guarantee is length-independent.
    it("returns 400 before Firestore for a 32-length code containing '/'", async () => {
        // 30 alnum + '%2F' (decodes to '/') keeps it path-char-bearing.
        const res = await GET(makeReq(`?code=${"a".repeat(30)}%2Fb`))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toBe("Invalid code format")
        expect(mockCollection).not.toHaveBeenCalled()
    })
})

describe("generateCode — fixed 6-char [A-Z0-9] (BUG-13)", () => {
    // BUG-13 (run-3 §BUG-13): the old base64url + .replace(/[^A-Za-z0-9]/g,"") could
    // strip '-'/'_' and emit a <6-char code (live repro "HEBFW") that the
    // ^[A-Z0-9]{6}$ validators then 400. The fixed loop must always emit 6 [A-Z0-9].

    // AC-1 — distribution: 1000 draws, every one a valid 6-char code.
    it("emits exactly 6 [A-Z0-9] chars across 1000 draws (no <6, no '-'/'_')", () => {
        for (let i = 0; i < 1000; i++) {
            const code = generateCode()
            expect(code).toHaveLength(6)
            expect(code).toMatch(/^[A-Z0-9]{6}$/)
            expect(code).not.toMatch(/[-_]/)
        }
    })

    // AC-2 — every generated code passes the device-code guard the route uses
    // (the same /^[A-Z0-9]{6}$/ in POST line 50, GET DEVICE_CODE_RE, PUT line 177).
    it("every generated code satisfies the route's device-code validator", () => {
        for (let i = 0; i < 250; i++) {
            expect(/^[A-Z0-9]{6}$/.test(generateCode())).toBe(true)
        }
    })
})

describe("POST /api/auth/qr — server-generated code round-trips (BUG-13 AC-2)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockCheckRateLimit.mockResolvedValue(null)
        mockInitAdmin.mockReturnValue(true)
        mockGet.mockResolvedValue({ exists: false })
        mockSet.mockResolvedValue(undefined)
    })

    it("POST with no body generates a valid code that GET does NOT 400", async () => {
        const postReq = new NextRequest(new URL("http://localhost/api/auth/qr"), { method: "POST" })
        const postRes = await POST(postReq)
        expect(postRes.status).toBe(200)
        const { code } = await postRes.json()
        // The server-generated fallback code is a valid 6-char code...
        expect(code).toMatch(/^[A-Z0-9]{6}$/)
        // ...written to qr-sessions/<code>...
        expect(mockDoc).toHaveBeenCalledWith(code)
        // ...and NOT self-rejected by the GET format guard (reaches lookup → 404).
        const getRes = await GET(makeReq(`?code=${code}`))
        expect(getRes.status).toBe(404)
    })
})
