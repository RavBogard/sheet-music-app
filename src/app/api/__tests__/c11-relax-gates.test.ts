/**
 * cycle-11 — c11-fix-relax-setlist-and-chart-gates regression tests.
 *
 * Covers three err-public-not-gated invariants Daniel ratified
 * 2026-05-28T~16:00Z:
 *
 *   Part A — /api/drive/file/[fileId] accepts MCP `crl_live_` bearer
 *            (previously only Firebase ID token + same-origin metadata).
 *   Part B — /api/setlist/print/personal accepts MCP bearer
 *            (previously only Firebase ID token; bearer → 403 invalid_bearer).
 *   Part C — /api/setlist/print/public no longer 403s on publishedAt:null
 *            (publishedAt-as-gate concept killed; field stays as vestigial
 *            metadata).
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

// ── Shared mock plumbing ──

const mockVerifyBearer = vi.fn()
const mockVerifyIdToken = vi.fn()
const mockGetDoc = vi.fn()
const mockFetchFileById = vi.fn()
const mockGetTracksForSetlist = vi.fn()
const mockGeneratePrintPdf = vi.fn()

vi.mock("@/lib/mcp/auth", () => ({
    verifyBearer: (...args: unknown[]) => mockVerifyBearer(...args),
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args),
    getFirestore: () => ({
        collection: () => ({
            doc: () => ({
                get: async () => mockGetDoc(),
            }),
        }),
    }),
}))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/file-fetcher", () => ({
    fetchFileById: (...args: unknown[]) => mockFetchFileById(...args),
}))

vi.mock("@/lib/server-tracks", () => ({
    getTracksForSetlist: (...args: unknown[]) => mockGetTracksForSetlist(...args),
}))

vi.mock("@/lib/print-pipeline", () => ({
    generatePrintPdf: (...args: unknown[]) => mockGeneratePrintPdf(...args),
}))

const validBearer = { uid: "u-bearer", tokenId: "tok-1", parentTokenId: null }
const unauthorizedResponse = () => new Response("Unauthorized", { status: 401 })

// ── Part A: /api/drive/file/[fileId] ──

describe("c11-relax-gates · Part A · GET /api/drive/file/[fileId]", () => {
    let GET: (
        req: import("next/server").NextRequest,
        ctx: { params: Promise<{ fileId: string }> },
    ) => Promise<Response>

    beforeAll(async () => {
        const mod = await import("@/app/api/drive/file/[fileId]/route")
        GET = mod.GET
    })

    beforeEach(() => {
        vi.clearAllMocks()
        // Default: file exists so we reach the auth gate (else 404 short-circuits).
        mockFetchFileById.mockResolvedValue({
            buffer: new Uint8Array([1, 2, 3]),
            contentType: "application/pdf",
            source: "test",
        })
    })

    it("accepts a valid MCP `crl_live_` bearer (no Firebase, no fetch metadata)", async () => {
        // Firebase verify fails (no Firebase token).
        mockVerifyIdToken.mockResolvedValue(null)
        mockVerifyBearer.mockResolvedValue(validBearer)

        const res = await GET(
            makeReq("/api/drive/file/real-file", { token: "crl_live_xyz" }),
            { params: Promise.resolve({ fileId: "real-file" }) },
        )

        expect(res.status).toBe(200)
        expect(mockVerifyBearer).toHaveBeenCalledTimes(1)
    })

    it("rejects with 401 when neither Firebase, MCP bearer, nor fetch metadata is present", async () => {
        mockVerifyIdToken.mockResolvedValue(null)
        mockVerifyBearer.mockResolvedValue(unauthorizedResponse())

        const res = await GET(
            makeReq("/api/drive/file/real-file", { token: "garbage" }),
            { params: Promise.resolve({ fileId: "real-file" }) },
        )

        expect(res.status).toBe(401)
    })

    it("REGRESSION — same-origin fetch metadata still bypasses bearer requirement", async () => {
        mockVerifyIdToken.mockResolvedValue(null)
        // verifyBearer must NOT be reached when fetch metadata already trusts the request.
        mockVerifyBearer.mockImplementation(() => {
            throw new Error("verifyBearer should not be called when metadata is trusted")
        })

        const res = await GET(
            makeReq("/api/drive/file/real-file", {
                headers: { "sec-fetch-site": "same-origin" },
            }),
            { params: Promise.resolve({ fileId: "real-file" }) },
        )

        expect(res.status).toBe(200)
        expect(mockVerifyBearer).not.toHaveBeenCalled()
    })
})

// ── Part B: /api/setlist/print/personal ──

describe("c11-relax-gates · Part B · GET /api/setlist/print/personal", () => {
    let GET: (req: import("next/server").NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import("@/app/api/setlist/print/personal/route")
        GET = mod.GET
    })

    beforeEach(() => {
        vi.clearAllMocks()
        // Setlist + user docs both come from the same mocked .doc().get(); the route
        // calls setlists first, then users. Default both to "exists with empty data"
        // — enough to reach the print pipeline.
        mockGetDoc.mockResolvedValue({
            exists: true,
            data: () => ({ name: "Test Setlist", ownerId: "u-owner" }),
        })
        mockGetTracksForSetlist.mockResolvedValue([])
        mockGeneratePrintPdf.mockResolvedValue({
            pdf: new Uint8Array([1, 2, 3]),
            stats: { appendedTracks: 0, transposedTracks: 0 },
        })
    })

    it("accepts a valid MCP `crl_live_` bearer (was 403 invalid_bearer pre-fix)", async () => {
        mockVerifyIdToken.mockResolvedValue(null)
        mockVerifyBearer.mockResolvedValue(validBearer)

        const res = await GET(
            makeReq("/api/setlist/print/personal?setlistId=s1", {
                token: "crl_live_xyz",
            }),
        )

        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toBe("application/pdf")
        expect(mockVerifyBearer).toHaveBeenCalledTimes(1)
    })

    it("REGRESSION — valid Firebase ID token still works (browser/in-app path)", async () => {
        mockVerifyIdToken.mockResolvedValue({
            uid: "u-firebase",
            email: "f@example.com",
            role: "musician",
        })
        // verifyBearer must NOT be reached when Firebase auth succeeds.
        mockVerifyBearer.mockImplementation(() => {
            throw new Error("verifyBearer should not be called on Firebase-auth path")
        })

        const res = await GET(
            makeReq("/api/setlist/print/personal?setlistId=s1", {
                token: "firebase-id-token",
            }),
        )

        expect(res.status).toBe(200)
        expect(mockVerifyBearer).not.toHaveBeenCalled()
    })

    it("returns 401 when both Firebase and MCP bearer fail", async () => {
        mockVerifyIdToken.mockResolvedValue(null)
        mockVerifyBearer.mockResolvedValue(unauthorizedResponse())

        const res = await GET(
            makeReq("/api/setlist/print/personal?setlistId=s1", {
                token: "garbage",
            }),
        )

        expect(res.status).toBe(401)
    })

    it("returns 400 when setlistId is missing (regression)", async () => {
        mockVerifyIdToken.mockResolvedValue({ uid: "u" })

        const res = await GET(
            makeReq("/api/setlist/print/personal", { token: "firebase-id-token" }),
        )

        expect(res.status).toBe(400)
    })
})

// ── Part C: /api/setlist/print/public no longer gates on publishedAt ──

describe("c11-relax-gates · Part C · GET /api/setlist/print/public", () => {
    let GET: (req: import("next/server").NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import("@/app/api/setlist/print/public/route")
        GET = mod.GET
    })

    beforeEach(() => {
        vi.clearAllMocks()
        mockGetTracksForSetlist.mockResolvedValue([])
        mockGeneratePrintPdf.mockResolvedValue({
            pdf: new Uint8Array([1, 2, 3]),
            stats: { appendedTracks: 0, transposedTracks: 0 },
        })
    })

    it("returns 200 PDF for an UNPUBLISHED (publishedAt:null) setlist (publishedAt-as-gate killed)", async () => {
        // Pre-fix: this exact shape returned 403 'Setlist is not published'.
        mockGetDoc.mockResolvedValue({
            exists: true,
            data: () => ({ name: "Draft Setlist", publishedAt: null }),
        })

        const res = await GET(makeReq("/api/setlist/print/public?setlistId=s1"))

        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toBe("application/pdf")
    })

    it("returns 404 when setlist does not exist (regression)", async () => {
        mockGetDoc.mockResolvedValue({ exists: false, data: () => ({}) })

        const res = await GET(makeReq("/api/setlist/print/public?setlistId=missing"))

        expect(res.status).toBe(404)
    })
})
