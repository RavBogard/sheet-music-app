/**
 * v11.7-06-01 — recordings upload org-stamping.
 *
 * POST /api/recordings/upload now stamps the new recordings/{id} doc with the
 * caller's HOST org, resolved from the Edge-set x-org-id header (crc fallback
 * via coerceOrgId), instead of the previously hardcoded DEFAULT_ORG_ID. Closes
 * the v11.1-03 recordings tenancy gap (cross-tenant hard wall). AC-1.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { NextRequest } from "next/server"

const mockVerifyIdToken = vi.fn()
const mockSet = vi.fn()

// Route reads initAdmin + getFirestore from @/lib/firebase-admin, and auth
// (createApiHandler → requireAuth) resolves via verifyIdToken from the same module.
vi.mock("@/lib/firebase-admin", () => {
    const chain: Record<string, unknown> = {}
    Object.assign(chain, {
        collection: () => chain,
        doc: () => chain,
        set: (...a: unknown[]) => mockSet(...a),
    })
    return {
        initAdmin: () => true,
        getFirestore: () => chain,
        verifyIdToken: (...a: unknown[]) => mockVerifyIdToken(...a),
    }
})

vi.mock("@/lib/firebase-storage", () => ({
    uploadRecordingToStorage: vi.fn(async () => "recordings/rec-test.mp3"),
}))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

/**
 * Build an upload request with an optional x-org-id header. We stub formData()
 * directly rather than encode a real multipart body — passing an explicit
 * Headers object suppresses undici's auto multipart Content-Type, and this test
 * exercises org-stamping, not multipart parsing.
 */
function makeUploadReq(orgHeader?: string): NextRequest {
    const fd = new FormData()
    fd.append(
        "file",
        new File([Buffer.from("audio-bytes")], "demo.mp3", { type: "audio/mpeg" }),
    )
    fd.append("songId", "song-1")

    const headers = new Headers()
    headers.set("Authorization", "Bearer test-token")
    if (orgHeader) headers.set("x-org-id", orgHeader)

    const req = new NextRequest("http://localhost/api/recordings/upload", {
        method: "POST",
        headers,
    } as never)
    Object.defineProperty(req, "formData", { value: async () => fd, configurable: true })
    return req
}

describe("v11.7-06-01 · /api/recordings/upload · org-stamp from host", () => {
    let POST: (req: NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import("@/app/api/recordings/upload/route")
        POST = mod.POST
    })

    beforeEach(() => {
        vi.clearAllMocks()
        // A band-leader caller (isBandLeader is derived from role === 'band_leader').
        mockVerifyIdToken.mockResolvedValue({ uid: "leader-1", role: "band_leader" })
        mockSet.mockResolvedValue(undefined)
    })

    // AC-1: x-org-id "brotherslazaroff" → doc stamped orgId "brotherslazaroff"
    // (NB: "brotherslazaroff" is the real OrgId; "broslaz" is only project shorthand.)
    it("stamps the doc with the host org from x-org-id", async () => {
        const res = await POST(makeUploadReq("brotherslazaroff"))
        expect(res.status).toBe(201)
        expect(mockSet).toHaveBeenCalledTimes(1)
        expect(mockSet.mock.calls[0][0]).toMatchObject({ orgId: "brotherslazaroff", songId: "song-1" })
    })

    // AC-1: missing x-org-id → crc fallback (coerceOrgId)
    it("falls back to crc when x-org-id is absent", async () => {
        const res = await POST(makeUploadReq())
        expect(res.status).toBe(201)
        expect(mockSet.mock.calls[0][0]).toMatchObject({ orgId: "crc" })
    })

    // AC-1: unknown/garbage x-org-id → crc fallback (coerceOrgId guards isKnownOrg)
    it("falls back to crc for an unknown org value", async () => {
        const res = await POST(makeUploadReq("not-a-real-org"))
        expect(res.status).toBe(201)
        expect(mockSet.mock.calls[0][0]).toMatchObject({ orgId: "crc" })
    })
})
