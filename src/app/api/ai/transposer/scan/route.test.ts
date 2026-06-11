/**
 * v11.3-01-02 (BUG-4) regression — anon AI chord-scan on /api/ai/transposer/scan.
 *
 * Per ACCESS-POLICY v0.3 D-Q2 anon transpose/AI-scan is OPEN with abuse protection.
 * Pre-fix this POST used createApiHandler's DEFAULT auth gate (anon → 401 missing_bearer)
 * and had NO rate limit at all. Now: requireAuth:false + an ANON-ONLY `ai` rate-limit
 * (authed callers unchanged → no regression).
 *
 * Coverage cell — STRESS-TEST-REPORT-2026-06-10-browser.md §BUG-4 (line 244 transpose cell).
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

// Module-level const apiKey is captured at import — ensure it's truthy before the route loads.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key"

const mockVerifyIdToken = vi.fn()
const mockCheckRateLimit = vi.fn()
const mockGenerateContent = vi.fn()

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    verifyIdToken: (...a: unknown[]) => mockVerifyIdToken(...a),
}))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
}))

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@google/generative-ai", () => ({
    GoogleGenerativeAI: class {
        getGenerativeModel() {
            return { generateContent: (...a: unknown[]) => mockGenerateContent(...a) }
        }
    },
    SchemaType: { ARRAY: "ARRAY", OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER" },
}))

const body = { base64Image: "data:image/png;base64,AAAA" }

describe("v11.3-01-02 · POST /api/ai/transposer/scan · anon AI-scan (BUG-4)", () => {
    let POST: (req: import("next/server").NextRequest) => Promise<Response>

    beforeAll(async () => {
        POST = (await import("@/app/api/ai/transposer/scan/route")).POST
    })

    beforeEach(() => {
        vi.clearAllMocks()
        mockVerifyIdToken.mockResolvedValue(null)
        mockCheckRateLimit.mockResolvedValue(null) // allow by default
        mockGenerateContent.mockResolvedValue({ response: { text: () => "[]" } })
    })

    // AC-2: anon scan allowed → 200, and the ai-tier limiter WAS consulted
    it("allows an anon scan (200) and rate-limits via the `ai` tier", async () => {
        const res = await POST(makeReq("/api/ai/transposer/scan", { method: "POST", body }))
        expect(res.status).toBe(200)
        expect(mockCheckRateLimit).toHaveBeenCalledTimes(1)
        expect(mockCheckRateLimit.mock.calls[0][1]).toBe("ai")
    })

    // AC-2: anon abuse path → 429 when the limiter returns a 429 response
    it("returns 429 for an anon scan past the ai-tier limit", async () => {
        mockCheckRateLimit.mockResolvedValue(new Response("Too many requests", { status: 429 }))
        const res = await POST(makeReq("/api/ai/transposer/scan", { method: "POST", body }))
        expect(res.status).toBe(429)
        expect(mockGenerateContent).not.toHaveBeenCalled() // never reaches Gemini
    })

    // AC-4: authed scan → limiter NOT consulted (today's unlimited authed behavior preserved)
    it("does NOT rate-limit an authed scan (no regression)", async () => {
        mockVerifyIdToken.mockResolvedValue({ uid: "u-musician", role: "musician" })
        const res = await POST(
            makeReq("/api/ai/transposer/scan", { method: "POST", token: "fb-id-token", body }),
        )
        expect(res.status).toBe(200)
        expect(mockCheckRateLimit).not.toHaveBeenCalled()
    })
})
