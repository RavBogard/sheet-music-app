/**
 * v11.3-01-01 (BUG-5) regression — anon chart-byte serving on /api/library/file/[id].
 *
 * Covers the ACCESS-POLICY v0.3 anon chart-deep-link cell (row 31, ✅ Anon) and the
 * err-public prime directive. Pre-fix this route used createApiHandler's DEFAULT auth
 * gate, so anon callers got 401 `missing_bearer` for ANY id (even legacy db-*), and it
 * only served db-* ids. Now it mirrors /api/drive/file: requireAuth:false + an isTrusted
 * (Sec-Fetch / Firebase / crl_live_ bearer) gate + the `chart` tier, serving upload-* /
 * UUID / Drive ids via fetchFileById and db-* via digitized_charts xmlContent.
 *
 * Coverage cells — STRESS-TEST-REPORT-2026-06-10-browser.md:
 *   §BUG-5 (line 197) "Chart deep link /api/library/file/[id] | 🐛 BUG-5 401 | Storage anon-DENIED"
 *   INCOMPLETE #1 (lines 293-294) cold-device anon escalation.
 * Verify-first finding: the app's Perform-render path uses /api/drive/file (anon-OK); the
 * /api/library/file 401 the run hit was a synthetic endpoint probe + the real user-facing
 * path is MobileRowCard "Open chart in new tab" on db-* charts (parseFileId → here).
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

const mockVerifyBearer = vi.fn()
const mockVerifyIdToken = vi.fn()
const mockGetDoc = vi.fn()
const mockFetchFileById = vi.fn()

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

const validBearer = { uid: "u-bearer", tokenId: "tok-1", parentTokenId: null }
const unauthorizedResponse = () => new Response("Unauthorized", { status: 401 })

describe("v11.3-01-01 · GET /api/library/file/[id] · anon chart serving (BUG-5)", () => {
    let GET: (
        req: import("next/server").NextRequest,
        ctx: { params: Promise<{ id: string }> },
    ) => Promise<Response>

    beforeAll(async () => {
        const mod = await import("@/app/api/library/file/[id]/route")
        GET = mod.GET
    })

    beforeEach(() => {
        vi.clearAllMocks()
        mockVerifyIdToken.mockResolvedValue(null)
        // Default: Storage-backed file exists so we reach the auth gate.
        mockFetchFileById.mockResolvedValue({
            buffer: new Uint8Array([1, 2, 3]),
            contentType: "application/pdf",
            source: "firebase-storage",
        })
    })

    // AC-1: anon + browser metadata → Storage-backed upload-* serves 200 (not 401 missing_bearer)
    it("serves a Storage-backed upload-* chart to anon with same-origin fetch metadata", async () => {
        const res = await GET(
            makeReq("/api/library/file/upload-abc123", {
                headers: { "sec-fetch-site": "same-origin" },
            }),
            { params: Promise.resolve({ id: "upload-abc123" }) },
        )
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toBe("application/pdf")
        expect(mockFetchFileById).toHaveBeenCalledWith("upload-abc123")
        expect(mockVerifyBearer).not.toHaveBeenCalled()
    })

    // AC-2: anon + browser metadata → legacy db-* MusicXML serves 200 (err-public regression closed)
    it("serves a legacy db-* MusicXML chart to anon with fetch metadata", async () => {
        mockGetDoc.mockResolvedValue({
            exists: true,
            data: () => ({ xmlContent: "<score-partwise/>", title: "Hashkivenu" }),
        })
        const res = await GET(
            makeReq("/api/library/file/db-xyz", {
                headers: { "sec-fetch-site": "same-origin" },
            }),
            { params: Promise.resolve({ id: "db-xyz" }) },
        )
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toBe("application/vnd.recordare.musicxml+xml")
        // db-* must NOT go through the Storage resolver
        expect(mockFetchFileById).not.toHaveBeenCalled()
    })

    // AC-1 (bearer branch): anon with a crl_live_ MCP bearer (no metadata) serves 200
    it("serves to a valid crl_live_ MCP bearer when no fetch metadata is present", async () => {
        mockVerifyBearer.mockResolvedValue(validBearer)
        const res = await GET(
            makeReq("/api/library/file/upload-abc123", { token: "crl_live_xyz" }),
            { params: Promise.resolve({ id: "upload-abc123" }) },
        )
        expect(res.status).toBe(200)
        expect(mockVerifyBearer).toHaveBeenCalledTimes(1)
    })

    // AC-3: bare unauth (no metadata, no bearer) for an EXISTING id → 401 (parity with sibling)
    it("returns 401 for a bare unauthenticated request to an existing id", async () => {
        const res = await GET(
            makeReq("/api/library/file/upload-abc123"),
            { params: Promise.resolve({ id: "upload-abc123" }) },
        )
        expect(res.status).toBe(401)
    })

    // AC-3: non-existent id → 404 file_not_found BEFORE the auth gate (no misleading 401)
    it("returns 404 (not 401) for a non-existent id even when unauthenticated", async () => {
        mockFetchFileById.mockResolvedValue(null)
        const res = await GET(
            makeReq("/api/library/file/upload-missing"),
            { params: Promise.resolve({ id: "upload-missing" }) },
        )
        expect(res.status).toBe(404)
    })

    it("returns 404 for a non-existent db-* id (digitized_charts miss)", async () => {
        mockGetDoc.mockResolvedValue({ exists: false, data: () => ({}) })
        const res = await GET(
            makeReq("/api/library/file/db-missing", {
                headers: { "sec-fetch-site": "same-origin" },
            }),
            { params: Promise.resolve({ id: "db-missing" }) },
        )
        expect(res.status).toBe(404)
    })
})
