/**
 * v11.1-02-02 — POST /api/admin/set-role org-membership behavior.
 *
 * Proves the admin org-membership control's backend: setting orgIds writes to
 * BOTH the users/{uid} doc (txn) AND the Auth custom claim, role is preserved,
 * unknown orgs are rejected, and the endpoint is admin-only. Mirrors the
 * mocked-route pattern used by sync-claims/__tests__/route.test.ts (the admin
 * routes are unit-tested with firebase-admin mocked, not via the emulator).
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

// ── Mocks ──

let existingClaims: Record<string, unknown> | undefined = undefined

const setCustomUserClaimsSpy = vi.fn(async () => undefined)
const txnUpdateSpy = vi.fn()
const txnCreateSpy = vi.fn()

const mockAuthAdmin = {
    getUser: vi.fn(async () => ({ customClaims: existingClaims })),
    setCustomUserClaims: setCustomUserClaimsSpy,
}

const mockFirestore = {
    runTransaction: vi.fn(async (cb: (txn: unknown) => Promise<void>) =>
        cb({ update: txnUpdateSpy, create: txnCreateSpy })),
    collection: vi.fn(() => ({ doc: vi.fn(() => ({})) })),
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

function mockViewer(role: "admin" | "musician" | null) {
    if (role === null) {
        vi.mocked(verifyIdToken).mockResolvedValue(null as never)
        return
    }
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid: "actor-1",
        email: "actor@example.com",
        role,
        isAdmin: role === "admin",
        isBandLeader: role === "admin",
        isMusician: role === "musician",
        isMember: true,
    } as never)
}

let POST: typeof import("@/app/api/admin/set-role/route").POST

beforeAll(async () => {
    const mod = await import("@/app/api/admin/set-role/route")
    POST = mod.POST
})

function req(body: Record<string, unknown>, token: string | undefined = "valid") {
    return makeReq("/api/admin/set-role", { method: "POST", token, body })
}

describe("POST /api/admin/set-role — v11.1-02-02 org membership", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        existingClaims = undefined
    })

    it("AC-2: non-admin is rejected (no writes)", async () => {
        mockViewer("musician")
        const res = await POST(req({ targetUserId: "u-1", newRole: "band_leader", orgIds: ["brotherslazaroff"] }))
        expect([401, 403]).toContain(res.status)
        expect(txnUpdateSpy).not.toHaveBeenCalled()
        expect(setCustomUserClaimsSpy).not.toHaveBeenCalled()
    })

    it("AC-1: admin setting Both writes orgIds to the doc AND the claim, role preserved", async () => {
        mockViewer("admin")
        existingClaims = { role: "band_leader" }
        const res = await POST(req({ targetUserId: "u-1", newRole: "band_leader", orgIds: ["crc", "brotherslazaroff"] }))
        expect(res.status).toBe(200)
        // doc write includes orgIds + unchanged role
        expect(txnUpdateSpy).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ role: "band_leader", orgIds: ["crc", "brotherslazaroff"], claimsUpdatedAt: "SERVER_TS" }),
        )
        // claim write includes orgIds + role (existing claims spread)
        expect(setCustomUserClaimsSpy).toHaveBeenCalledWith("u-1", expect.objectContaining({
            role: "band_leader",
            orgIds: ["crc", "brotherslazaroff"],
        }))
    })

    it("AC-4: omitting orgIds does NOT write orgIds to the doc and preserves the existing claim orgIds", async () => {
        mockViewer("admin")
        existingClaims = { role: "band_leader", orgIds: ["crc", "brotherslazaroff"] }
        const res = await POST(req({ targetUserId: "u-1", newRole: "band_leader" }))
        expect(res.status).toBe(200)
        // doc update has role + timestamp but NO orgIds key (preserve existing)
        expect(txnUpdateSpy).toHaveBeenCalledWith(
            expect.anything(),
            expect.not.objectContaining({ orgIds: expect.anything() }),
        )
        // claim spread preserves the prior orgIds (set-role spreads existingClaims)
        expect(setCustomUserClaimsSpy).toHaveBeenCalledWith("u-1", expect.objectContaining({
            orgIds: ["crc", "brotherslazaroff"],
        }))
    })

    it("AC-3: an unknown orgId is rejected (400) before any write", async () => {
        mockViewer("admin")
        existingClaims = { role: "band_leader" }
        const res = await POST(req({ targetUserId: "u-1", newRole: "band_leader", orgIds: ["crc", "bogus-org"] }))
        expect(res.status).toBe(400)
        expect(txnUpdateSpy).not.toHaveBeenCalled()
        expect(setCustomUserClaimsSpy).not.toHaveBeenCalled()
    })
})
