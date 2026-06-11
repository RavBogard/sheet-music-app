/**
 * v11.3-01-02 (BUG-4) regression — anon chord-cache access on /api/library/chord-cache.
 *
 * Per ACCESS-POLICY v0.3 D-Q2 anon transpose reads/persists the chord cache. Pre-fix GET
 * and POST used createApiHandler's DEFAULT auth gate (anon → 401 missing_bearer). Now GET
 * (read) and POST (persist scan results) are requireAuth:false; PATCH (native key /
 * verification) stays role:musician and DELETE stays role:band_leader.
 *
 * Coverage cell — STRESS-TEST-REPORT-2026-06-10-browser.md §BUG-4 (anon chord-cache GET 401s).
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

const mockVerifyIdToken = vi.fn()
const mockGet = vi.fn()
const mockSet = vi.fn()

// chord-cache route reads getFirestore from "firebase-admin/firestore".
vi.mock("firebase-admin/firestore", () => {
    const chain: Record<string, unknown> = {}
    Object.assign(chain, {
        collection: () => chain,
        doc: () => chain,
        get: (...a: unknown[]) => mockGet(...a),
        set: (...a: unknown[]) => mockSet(...a),
    })
    return { getFirestore: () => chain }
})

// withAuth (createApiHandler) resolves Firebase auth via @/lib/firebase-admin.
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    verifyIdToken: (...a: unknown[]) => mockVerifyIdToken(...a),
}))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

describe("v11.3-01-02 · /api/library/chord-cache · anon read/persist (BUG-4)", () => {
    let GET: (req: import("next/server").NextRequest) => Promise<Response>
    let POST: (req: import("next/server").NextRequest) => Promise<Response>
    let PATCH: (req: import("next/server").NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import("@/app/api/library/chord-cache/route")
        GET = mod.GET
        POST = mod.POST
        PATCH = mod.PATCH
    })

    beforeEach(() => {
        vi.clearAllMocks()
        mockVerifyIdToken.mockResolvedValue(null) // anon by default
        mockGet.mockResolvedValue({ exists: false, data: () => undefined })
        mockSet.mockResolvedValue(undefined)
    })

    // AC-1: anon page read → 200 (not 401)
    it("allows an anon page GET (cache miss → 200)", async () => {
        const res = await GET(makeReq("/api/library/chord-cache?fileId=upload-x&page=0"))
        expect(res.status).toBe(200)
    })

    // AC-1: anon meta read → 200
    it("allows an anon meta GET → 200", async () => {
        const res = await GET(makeReq("/api/library/chord-cache?fileId=upload-x&meta=true"))
        expect(res.status).toBe(200)
    })

    // AC-3: anon POST persists scan results → 200
    it("allows an anon POST to persist scan results → 200", async () => {
        const res = await POST(
            makeReq("/api/library/chord-cache", {
                method: "POST",
                body: { fileId: "upload-x", page: 0, chords: [{ text: "C", x: 10, y: 20 }] },
            }),
        )
        expect(res.status).toBe(200)
        expect(mockSet).toHaveBeenCalledTimes(1)
    })

    // AC-4: PATCH (metadata/verification) stays gated — anon → 401, not opened
    it("still gates PATCH for anon (role:musician preserved)", async () => {
        const res = await PATCH(
            makeReq("/api/library/chord-cache", {
                method: "PATCH",
                body: { fileId: "upload-x", nativeKey: "D" },
            }),
        )
        expect(res.status).toBe(401)
        expect(mockSet).not.toHaveBeenCalled()
    })
})
