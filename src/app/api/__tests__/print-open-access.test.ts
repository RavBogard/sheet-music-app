/**
 * Printing is open to anyone (Daniel, 2026-09-10).
 *
 * `POST /api/setlist/print` used to be a `createApiHandler` default, i.e.
 * authenticated: a guest musician reading a public setlist got a 401 instead
 * of paper. It now accepts anonymous callers. Nothing new is exposed — the
 * chart bytes it assembles are already served unauthenticated by
 * `/api/drive/file/[fileId]`, and setlist contents are public by design.
 *
 * The cost side is the part worth pinning down: an anonymous caller is
 * IP-keyed, and a print is a 120s serverless job over every chart's bytes. So
 * the open path MUST land on the tight `printAnon` bucket, never the shared
 * 60/min `api` tier, while signed-in callers keep `api` exactly as before.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"
import type { NextRequest } from "next/server"

const mockCheckRateLimit = vi.fn(async (_req: unknown, _tier?: string): Promise<Response | null> => null)
const mockGeneratePrintPdf = vi.fn(async () => ({
    pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // "%PDF"
    stats: { appendedTracks: 1, transposedTracks: 0, omittedTracks: [] },
}))
const mockVerifyIdToken = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: (req: unknown, tier?: string) => mockCheckRateLimit(req, tier),
}))
vi.mock("@/lib/print-pipeline", () => ({
    generatePrintPdf: (...args: unknown[]) => mockGeneratePrintPdf(...(args as [])),
}))
vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...(args as [])),
}))

const body = { title: "Shabbat Morning", tracks: [{ title: "Hashkivenu", fileId: "f-1" }] }

describe("POST /api/setlist/print — open access", () => {
    let POST: (req: NextRequest) => Promise<Response>

    beforeAll(async () => {
        POST = (await import("@/app/api/setlist/print/route")).POST as typeof POST
    })

    beforeEach(() => {
        vi.clearAllMocks()
        mockCheckRateLimit.mockResolvedValue(null)
        mockGeneratePrintPdf.mockResolvedValue({
            pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
            stats: { appendedTracks: 1, transposedTracks: 0, omittedTracks: [] },
        })
    })

    it("AC-1: a caller with no session gets a PDF, not a 401", async () => {
        const res = await POST(makeReq("/api/setlist/print", { method: "POST", body }))
        expect(res.status).toBe(200)
        expect(res.headers.get("Content-Type")).toBe("application/pdf")
        expect(mockGeneratePrintPdf).toHaveBeenCalledTimes(1)
    })

    it("AC-2: the anonymous path is rate-limited on the tight printAnon bucket, not the shared api tier", async () => {
        await POST(makeReq("/api/setlist/print", { method: "POST", body }))
        expect(mockCheckRateLimit.mock.calls[0][1]).toBe("printAnon")
    })

    it("AC-3: a signed-in caller keeps the api tier — the open path changed nothing for the band", async () => {
        mockVerifyIdToken.mockResolvedValue({ uid: "u-1", role: "musician" })
        await POST(makeReq("/api/setlist/print", { method: "POST", body, token: "id-token" }))
        expect(mockCheckRateLimit.mock.calls[0][1]).toBe("api")
    })

    it("AC-4: an over-limit anonymous caller is still refused — open is not unlimited", async () => {
        mockCheckRateLimit.mockResolvedValue(new Response(null, { status: 429 }))
        const res = await POST(makeReq("/api/setlist/print", { method: "POST", body }))
        expect(res.status).toBe(429)
        expect(mockGeneratePrintPdf).not.toHaveBeenCalled()
    })
})
