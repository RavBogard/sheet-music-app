// @vitest-environment node
//
// Pinned to node (not jsdom): NextRequest extends the global Request, whose
// jsdom header guard drops the forbidden `Range` header. Node/undici keeps it,
// matching the real Vercel runtime.

/**
 * 2026-06-14 chart-load outage regression — /api/drive/file/[fileId].
 *
 * H3 (v11.5-02-01, c687db99ee) advertised Accept-Ranges on EVERY response from
 * this route, including CHART bytes (PDF/image/text). pdf.js then range-fetched;
 * this route is public + CDN-cached, so Vercel cached the 206 partials and
 * replayed them as truncated `200`s -> charts failed to load. Fix (ba38ad67b2):
 * Range only for audio/*; charts return a plain 200 with NO Accept-Ranges.
 *
 * These tests lock that contract: charts never advertise Range / never partial;
 * audio still seeks (206 + Accept-Ranges), and audio partials are no-store.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

const mockFetchFileById = vi.fn()
const mockHasBrowserFetchMetadata = vi.fn()

vi.mock("@/lib/file-fetcher", () => ({
    fetchFileById: (...a: unknown[]) => mockFetchFileById(...a),
}))
vi.mock("@/lib/drive-file-auth", () => ({
    hasBrowserFetchMetadata: (...a: unknown[]) => mockHasBrowserFetchMetadata(...a),
}))
vi.mock("@/lib/mcp/auth", () => ({ verifyBearer: vi.fn(async () => ({ error: "no" })) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const PDF_BYTES = () => Buffer.from(Array.from({ length: 20 }, (_, i) => i))

describe("2026-06-14 outage regression · GET /api/drive/file/[fileId]", () => {
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
        mockHasBrowserFetchMetadata.mockReturnValue(true) // trusted (in-app fetch)
    })

    const call = (fileId: string, headers?: Record<string, string>) =>
        GET(makeReq(`/api/drive/file/${fileId}`, headers ? { headers } : {}), {
            params: Promise.resolve({ fileId }),
        })

    // THE outage: a chart must NOT advertise Accept-Ranges, and a Range request
    // must return the FULL body (200), never a truncated partial.
    it("CHART (application/pdf): no Range header → 200 full body, NO Accept-Ranges", async () => {
        mockFetchFileById.mockResolvedValue({ buffer: PDF_BYTES(), contentType: "application/pdf", source: "firebase-storage" })
        const res = await call("61f0c403-pdf")
        expect(res.status).toBe(200)
        expect(res.headers.get("accept-ranges")).toBeNull()
        expect(res.headers.get("content-type")).toBe("application/pdf")
        expect(new Uint8Array(await res.arrayBuffer()).length).toBe(20)
    })

    it("CHART (application/pdf): WITH Range → still 200 FULL body (route ignores Range for charts)", async () => {
        mockFetchFileById.mockResolvedValue({ buffer: PDF_BYTES(), contentType: "application/pdf", source: "firebase-storage" })
        const res = await call("61f0c403-pdf", { range: "bytes=0-3" })
        expect(res.status).toBe(200) // NOT 206, NOT a 100-byte partial
        expect(res.headers.get("accept-ranges")).toBeNull()
        expect(new Uint8Array(await res.arrayBuffer()).length).toBe(20) // full, not 4
    })

    it("CHART (text/plain band format): no Accept-Ranges either", async () => {
        mockFetchFileById.mockResolvedValue({ buffer: PDF_BYTES(), contentType: "text/plain", source: "firebase-storage" })
        const res = await call("upload-text-chart", { range: "bytes=0-3" })
        expect(res.status).toBe(200)
        expect(res.headers.get("accept-ranges")).toBeNull()
        expect(new Uint8Array(await res.arrayBuffer()).length).toBe(20)
    })

    // H3 preserved: audio still seeks.
    it("AUDIO (audio/mpeg): Range → 206 partial with Accept-Ranges (H3 seeking preserved)", async () => {
        mockFetchFileById.mockResolvedValue({ buffer: PDF_BYTES(), contentType: "audio/mpeg", source: "firebase-storage" })
        const res = await call("upload-audio", { range: "bytes=0-3" })
        expect(res.status).toBe(206)
        expect(res.headers.get("accept-ranges")).toBe("bytes")
        expect(res.headers.get("content-range")).toBe("bytes 0-3/20")
        expect(new Uint8Array(await res.arrayBuffer()).length).toBe(4)
    })

    it("AUDIO (audio/mpeg): a 206 partial is Cache-Control: no-store (un-CDN-cacheable)", async () => {
        mockFetchFileById.mockResolvedValue({ buffer: PDF_BYTES(), contentType: "audio/mpeg", source: "firebase-storage" })
        const res = await call("upload-audio", { range: "bytes=0-3" })
        expect(res.status).toBe(206)
        expect(res.headers.get("cache-control")).toBe("no-store")
    })

    it("AUDIO (audio/mpeg): no Range → 200 full, advertises Accept-Ranges, keeps public cache", async () => {
        mockFetchFileById.mockResolvedValue({ buffer: PDF_BYTES(), contentType: "audio/mpeg", source: "firebase-storage" })
        const res = await call("upload-audio")
        expect(res.status).toBe(200)
        expect(res.headers.get("accept-ranges")).toBe("bytes")
        expect(res.headers.get("cache-control")).toBe("public, max-age=86400, s-maxage=604800")
    })
})
