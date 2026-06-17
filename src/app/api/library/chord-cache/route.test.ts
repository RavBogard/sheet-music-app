/**
 * v11.3-01-02 (BUG-4) regression — anon chord-cache access on /api/library/chord-cache.
 *
 * Per ACCESS-POLICY v0.3 D-Q2 anon transpose reads/persists the chord cache. Pre-fix GET
 * and POST used createApiHandler's DEFAULT auth gate (anon → 401 missing_bearer). Now GET
 * (read) and POST (persist scan results) are requireAuth:false. v11.5-01-02 (H5):
 * PATCH is now requireAuth:false too, but with a field guard — anon may persist
 * benign derived/display data (nativeKey forced 'auto', lastUsedKey/lastUsedTransposition),
 * while chordsVerified/chordsVerifiedBy + a manual native-key provenance require an
 * authed musician+. DELETE stays role:band_leader.
 *
 * Coverage cells — §BUG-4 (anon chord-cache GET 401s) + §B-10 (anon PATCH 401 / H5).
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { NextResponse } from "next/server"
import { makeReq } from "@/__tests__/api-test-helpers"
import { checkRateLimit } from "@/lib/rate-limit"

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

    // ── PATCH field split — v11.5-01-02 (H5 / §B-10) ──────────────────────────

    // AC-1: anon may persist the auto-detected native key (the H5 fix) → 200
    it("allows anon PATCH of an auto nativeKey → 200, written with source 'auto'", async () => {
        const res = await PATCH(
            makeReq("/api/library/chord-cache", {
                method: "PATCH",
                body: { fileId: "upload-x", nativeKey: "G", nativeKeySource: "auto" },
            }),
        )
        expect(res.status).toBe(200)
        expect(mockSet).toHaveBeenCalledTimes(1)
        const written = mockSet.mock.calls[0][0]
        expect(written).toMatchObject({ nativeKey: "G", nativeKeySource: "auto" })
        expect(written).not.toHaveProperty("chordsVerified")
    })

    // AC-2a: the verification trust flag stays authed-only — anon → 401, no write
    it("rejects anon PATCH of chordsVerified → 401, no write", async () => {
        const res = await PATCH(
            makeReq("/api/library/chord-cache", {
                method: "PATCH",
                body: { fileId: "upload-x", chordsVerified: true },
            }),
        )
        expect(res.status).toBe(401)
        expect(mockSet).not.toHaveBeenCalled()
    })

    // AC-2b: anon cannot assert 'manual' provenance — coerced to 'auto'
    it("coerces an anon-supplied nativeKeySource 'manual' to 'auto'", async () => {
        const res = await PATCH(
            makeReq("/api/library/chord-cache", {
                method: "PATCH",
                body: { fileId: "upload-x", nativeKey: "G", nativeKeySource: "manual" },
            }),
        )
        expect(res.status).toBe(200)
        expect(mockSet.mock.calls[0][0]).toMatchObject({ nativeKeySource: "auto" })
    })

    // AC-3: authed musician keeps full PATCH (chordsVerified + manual provenance)
    it("allows an authed musician to set chordsVerified → 200, written", async () => {
        mockVerifyIdToken.mockResolvedValue({ uid: "u1", role: "musician", email: "m@test" })
        const res = await PATCH(
            makeReq("/api/library/chord-cache", {
                method: "PATCH",
                token: "musician-token",
                body: { fileId: "upload-x", chordsVerified: true, chordsVerifiedBy: "u1" },
            }),
        )
        expect(res.status).toBe(200)
        expect(mockSet.mock.calls[0][0]).toMatchObject({ chordsVerified: true, chordsVerifiedBy: "u1" })
    })

    it("honors a manual nativeKeySource for an authed musician", async () => {
        mockVerifyIdToken.mockResolvedValue({ uid: "u1", role: "musician", email: "m@test" })
        const res = await PATCH(
            makeReq("/api/library/chord-cache", {
                method: "PATCH",
                token: "musician-token",
                body: { fileId: "upload-x", nativeKey: "G", nativeKeySource: "manual" },
            }),
        )
        expect(res.status).toBe(200)
        expect(mockSet.mock.calls[0][0]).toMatchObject({ nativeKeySource: "manual" })
    })

    // AC-4: the anon write is rate-limited via the shared `api` bucket
    it("rate-limits anon PATCH via the api bucket (no write)", async () => {
        vi.mocked(checkRateLimit).mockResolvedValueOnce(
            NextResponse.json({ error: "rate_limited" }, { status: 429 }),
        )
        const res = await PATCH(
            makeReq("/api/library/chord-cache", {
                method: "PATCH",
                body: { fileId: "upload-x", nativeKey: "G" },
            }),
        )
        expect(res.status).toBe(429)
        expect(mockSet).not.toHaveBeenCalled()
    })
})
