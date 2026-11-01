// @vitest-environment node
//
// Pinned to the node environment (not the suite-default jsdom): NextRequest
// extends the global Request, and the DOM Request's header guard silently
// DROPS `Range` (a forbidden request-header), so under jsdom the route would
// never see the Range header. Node/undici keeps it — which also matches the
// real Vercel serverless runtime this route runs on.

/**
 * v11.5-02-01 (H3) regression — HTTP Range serving on /api/recordings/file/[id].
 *
 * Proves the seekable-audio fix on a live route:
 *   AC-1  Range bytes=0-3        → 206, Content-Range bytes 0-3/<len>, 4-byte body
 *   AC-2  no Range               → 200, Accept-Ranges: bytes, full Content-Length
 *   AC-3  beyond-EOF range       → 416
 *
 * Recordings 2026-11: recordings are PUBLIC (Daniel 2026-11-01: "anyone can
 * listen. we don't care."). No session is needed; the rate limit stays.
 *
 * The helper's branch matrix is unit-tested in src/lib/http/__tests__/byte-range.test.ts;
 * the drive/file 206 path shares the same helper + is covered there.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

const mockGetDoc = vi.fn()
const mockDownload = vi.fn()
const mockRateLimit = vi.fn((): Response | null => null)

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    verifyIdToken: vi.fn(async () => null),
    getFirestore: () => ({
        collection: () => ({
            doc: () => ({
                get: async () => mockGetDoc(),
            }),
        }),
    }),
}))

vi.mock("@/lib/firebase-storage", () => ({
    downloadFromStoragePath: (...args: unknown[]) => mockDownload(...args),
}))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: () => mockRateLimit(),
}))

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const TEN_BYTES = () => Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

describe("v11.5-02-01 · GET /api/recordings/file/[id] · seekable audio (H3)", () => {
    let GET: (
        req: import("next/server").NextRequest,
        ctx: { params: Promise<{ id: string }> },
    ) => Promise<Response>

    beforeAll(async () => {
        const mod = await import("@/app/api/recordings/file/[id]/route")
        GET = mod.GET
    })

    beforeEach(() => {
        vi.clearAllMocks()
        // Default: a real recording with a stored file.
        mockGetDoc.mockResolvedValue({
            exists: true,
            data: () => ({ storagePath: "recordings/rec1.mp3", mimeType: "audio/mpeg" }),
        })
        mockDownload.mockResolvedValue({
            success: true,
            data: { buffer: TEN_BYTES(), contentType: "audio/mpeg" },
        })
        mockRateLimit.mockReturnValue(null)
    })

    // AC-1: a Range request returns 206 with the correct slice.
    it("Range bytes=0-3 → 206 partial content", async () => {
        const res = await GET(
            makeReq("/api/recordings/file/rec1", { headers: { range: "bytes=0-3" } }),
            { params: Promise.resolve({ id: "rec1" }) },
        )
        expect(res.status).toBe(206)
        expect(res.headers.get("content-range")).toBe("bytes 0-3/10")
        expect(res.headers.get("content-length")).toBe("4")
        expect(res.headers.get("accept-ranges")).toBe("bytes")
        expect(res.headers.get("content-type")).toBe("audio/mpeg")
        const body = new Uint8Array(await res.arrayBuffer())
        expect(body.length).toBe(4)
        expect(Array.from(body)).toEqual([0, 1, 2, 3])
    })

    // AC-2: a normal GET still returns the whole file, now advertising Range.
    it("no Range → 200 full file with Accept-Ranges + Content-Length", async () => {
        const res = await GET(
            makeReq("/api/recordings/file/rec1"),
            { params: Promise.resolve({ id: "rec1" }) },
        )
        expect(res.status).toBe(200)
        expect(res.headers.get("accept-ranges")).toBe("bytes")
        expect(res.headers.get("content-length")).toBe("10")
        expect(res.headers.get("content-disposition")).toBe("inline")
        const body = new Uint8Array(await res.arrayBuffer())
        expect(body.length).toBe(10)
    })

    // AC-3: an unsatisfiable Range is rejected with 416.
    it("beyond-EOF Range → 416", async () => {
        const res = await GET(
            makeReq("/api/recordings/file/rec1", { headers: { range: "bytes=999999-" } }),
            { params: Promise.resolve({ id: "rec1" }) },
        )
        expect(res.status).toBe(416)
        expect(res.headers.get("content-range")).toBe("bytes */10")
    })

    // Public: no bearer and no session cookie (makeReq sends neither).
    it("serves a recording with no session (200, Accept-Ranges)", async () => {
        const res = await GET(makeReq("/api/recordings/file/rec1"), { params: Promise.resolve({ id: "rec1" }) })
        expect(res.status).toBe(200)
        expect(res.headers.get("accept-ranges")).toBe("bytes")
        expect(mockDownload).toHaveBeenCalled()
    })

    it("404 for unknown id", async () => {
        mockGetDoc.mockResolvedValue({ exists: false, data: () => undefined })
        const res = await GET(makeReq("/api/recordings/file/nope"), { params: Promise.resolve({ id: "nope" }) })
        expect(res.status).toBe(404)
        expect(mockDownload).not.toHaveBeenCalled()
    })

    it("404 for a storagePath outside recordings/, download never reached", async () => {
        for (const storagePath of ["charts/crc/other.pdf", "recordings/../charts/x.pdf", "recordings/sub/x.mp3"]) {
            mockGetDoc.mockResolvedValue({ exists: true, data: () => ({ storagePath, mimeType: "audio/mpeg" }) })
            const res = await GET(makeReq("/api/recordings/file/rec1"), { params: Promise.resolve({ id: "rec1" }) })
            expect(res.status).toBe(404)
        }
        expect(mockDownload).not.toHaveBeenCalled()
    })

    it("a non-audio mimeType is served as application/octet-stream with nosniff", async () => {
        mockGetDoc.mockResolvedValue({ exists: true, data: () => ({ storagePath: "recordings/rec1.mp3", mimeType: "text/html" }) })
        const res = await GET(makeReq("/api/recordings/file/rec1"), { params: Promise.resolve({ id: "rec1" }) })
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toBe("application/octet-stream")
        expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    })

    it("keeps the rate limit", async () => {
        mockRateLimit.mockReturnValue(new Response(null, { status: 429 }))
        const res = await GET(makeReq("/api/recordings/file/rec1"), { params: Promise.resolve({ id: "rec1" }) })
        expect(res.status).toBe(429)
        expect(mockDownload).not.toHaveBeenCalled()
    })
})
