/**
 * v4.3 P9 — POST /api/auth/sync-claims
 * Drift repair: Firestore users/{uid}.role vs. auth custom claim token.role.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

// ── Mocks ──

let profileData: Record<string, unknown> | undefined = undefined
let existingClaims: Record<string, unknown> | undefined = undefined

const setCustomUserClaimsSpy = vi.fn(async () => undefined)
const updateSpy = vi.fn(async () => undefined)

const mockAuthAdmin = {
    getUser: vi.fn(async () => ({ customClaims: existingClaims })),
    setCustomUserClaims: setCustomUserClaimsSpy,
}

const mockFirestore = {
    collection: vi.fn(() => ({
        doc: vi.fn(() => ({
            get: async () => ({ data: () => profileData }),
            update: updateSpy,
        })),
    })),
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getAuth: vi.fn(() => mockAuthAdmin),
    getFirestore: vi.fn(() => mockFirestore),
    verifyIdToken: vi.fn(),
}))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock("firebase-admin/firestore", () => ({
    FieldValue: { serverTimestamp: () => "SERVER_TS" },
}))

import { verifyIdToken } from "@/lib/firebase-admin"

function mockAuth(uid: string | null) {
    if (uid === null) {
        vi.mocked(verifyIdToken).mockResolvedValue(null as never)
    } else {
        vi.mocked(verifyIdToken).mockResolvedValue({
            uid,
            email: "u@example.com",
            role: "musician",
            isAdmin: false,
            isBandLeader: false,
            isMusician: true,
            isMember: true,
        } as never)
    }
}

let POST: typeof import("@/app/api/auth/sync-claims/route").POST

beforeAll(async () => {
    const mod = await import("@/app/api/auth/sync-claims/route")
    POST = mod.POST
})

function req(token: string | undefined = "valid") {
    return makeReq("/api/auth/sync-claims", {
        method: "POST",
        token,
        body: {},
    })
}

describe("POST /api/auth/sync-claims — Phase 9 drift repair", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        profileData = undefined
        existingClaims = undefined
    })

    it("rejects unauthenticated (401/403 per api-wrapper)", async () => {
        mockAuth(null)
        const res = await POST(req(undefined))
        // createApiHandler returns 403 for missing/invalid auth.
        expect([401, 403]).toContain(res.status)
        expect(setCustomUserClaimsSpy).not.toHaveBeenCalled()
        expect(updateSpy).not.toHaveBeenCalled()
    })

    it("multi-tenant P0: NEVER raises — profile='musician', claim missing → claim untouched, orgIds still mirrored", async () => {
        mockAuth("u-1")
        profileData = { role: "musician" } // no orgIds on doc yet
        existingClaims = undefined
        const res = await POST(req())
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.synced).toBe(false)
        expect(setCustomUserClaimsSpy).not.toHaveBeenCalled()
        // v11-05-02: a claimless doc still gets orgIds=['crc'] mirrored (claim → doc, never doc → claim).
        expect(updateSpy).toHaveBeenCalledWith({ claimsUpdatedAt: "SERVER_TS", orgIds: ["crc"] })
    })

    it("multi-tenant P0 precondition attack: pending user self-writes role 'admin' → claim is NOT raised", async () => {
        mockAuth("u-attacker")
        profileData = { role: "admin", orgIds: ["crc"] }
        existingClaims = { role: "pending" }
        const res = await POST(req())
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json).toEqual({ synced: false, role: "pending", reason: "raise_refused" })
        expect(setCustomUserClaimsSpy).not.toHaveBeenCalled()
        expect(updateSpy).not.toHaveBeenCalled()
    })

    for (const [docRole, claimRole] of [
        ["admin", "band_leader"],
        ["admin", "musician"],
        ["band_leader", "musician"],
        ["musician", "member"],
        ["member", undefined],
    ] as const) {
        it(`multi-tenant P0: doc '${docRole}' over claim '${claimRole ?? "none"}' is never raised`, async () => {
            mockAuth("u-1")
            profileData = { role: docRole, orgIds: ["crc"] }
            existingClaims = claimRole ? { role: claimRole } : undefined
            await POST(req())
            expect(setCustomUserClaimsSpy).not.toHaveBeenCalled()
        })
    }

    it("multi-tenant P0: lowering still syncs (doc 'musician', claim 'band_leader')", async () => {
        mockAuth("u-1")
        profileData = { role: "musician", orgIds: ["crc"] }
        existingClaims = { role: "band_leader" }
        const res = await POST(req())
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ synced: true, role: "musician" })
        expect(setCustomUserClaimsSpy).toHaveBeenCalledWith("u-1", { role: "musician" })
    })

    it("no-op when role AND orgIds already match", async () => {
        mockAuth("u-1")
        profileData = { role: "musician", orgIds: ["crc"] }
        existingClaims = { role: "musician" } // claimless orgIds → ['crc'], doc already ['crc']
        const res = await POST(req())
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.synced).toBe(false)
        expect(json.role).toBe("musician")
        expect(setCustomUserClaimsSpy).not.toHaveBeenCalled()
        expect(updateSpy).not.toHaveBeenCalled()
    })

    it("v11-05-02: mirrors a multi-org orgIds claim onto the doc without touching role", async () => {
        mockAuth("u-1")
        profileData = { role: "band_leader", orgIds: ["crc"] } // role in sync, orgIds stale
        existingClaims = { role: "band_leader", orgIds: ["crc", "brotherslazaroff"] }
        const res = await POST(req())
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.synced).toBe(false)
        // role claim untouched (already in sync); only orgIds mirrored.
        expect(setCustomUserClaimsSpy).not.toHaveBeenCalled()
        expect(updateSpy).toHaveBeenCalledWith({
            claimsUpdatedAt: "SERVER_TS",
            orgIds: ["crc", "brotherslazaroff"],
        })
    })

    it("does not touch claim when profile role is 'pending'", async () => {
        mockAuth("u-1")
        profileData = { role: "pending" }
        existingClaims = { role: "band_leader" } // even with higher existing claim
        const res = await POST(req())
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.synced).toBe(false)
        expect(json.role).toBe("pending")
        expect(setCustomUserClaimsSpy).not.toHaveBeenCalled()
    })

    it("does not touch claim when profile has no role field", async () => {
        mockAuth("u-1")
        profileData = {}
        existingClaims = undefined
        const res = await POST(req())
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.synced).toBe(false)
        expect(json.role).toBe(null)
        expect(setCustomUserClaimsSpy).not.toHaveBeenCalled()
    })

    it("preserves existing unrelated claims (soundEngineer) when syncing role", async () => {
        mockAuth("u-1")
        profileData = { role: "musician" }
        existingClaims = { soundEngineer: true, role: "band_leader" }
        const res = await POST(req())
        expect(res.status).toBe(200)
        expect(setCustomUserClaimsSpy).toHaveBeenCalledWith("u-1", {
            soundEngineer: true,
            role: "musician",
        })
    })
})
