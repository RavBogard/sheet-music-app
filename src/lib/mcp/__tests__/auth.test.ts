import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "crypto"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("firebase-admin/firestore", () => ({
    FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
    Timestamp: class {},
}))

const mockGet = vi.fn()
const mockUpdate = vi.fn().mockResolvedValue(undefined)
const mockLimit = vi.fn(() => ({ get: mockGet }))
const mockWhere = vi.fn(() => ({ limit: mockLimit }))
const mockCollection = vi.fn(() => ({ where: mockWhere }))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({ collection: mockCollection })),
}))

import { verifyBearer } from "../auth"
import { initAdmin } from "@/lib/firebase-admin"

function makeReq(token?: string): Request {
    const headers = new Headers()
    if (token) headers.set("authorization", `Bearer ${token}`)
    return new Request("http://localhost/api/mcp", { headers })
}

function snapshotOf(docs: Array<Record<string, unknown>>) {
    return {
        empty: docs.length === 0,
        docs: docs.map((data) => ({
            id: "tok1",
            data: () => data,
            ref: { update: mockUpdate },
        })),
    }
}

describe("verifyBearer", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(initAdmin).mockReturnValue(true)
    })

    it("401 when no Authorization header", async () => {
        const res = await verifyBearer(makeReq())
        expect(res).toBeInstanceOf(Response)
        expect((res as Response).status).toBe(401)
    })

    it("401 when header is not a Bearer token", async () => {
        const headers = new Headers({ authorization: "Basic abc" })
        const res = await verifyBearer(new Request("http://localhost", { headers }))
        expect((res as Response).status).toBe(401)
    })

    it("401 when Bearer value is empty", async () => {
        const headers = new Headers({ authorization: "Bearer    " })
        const res = await verifyBearer(new Request("http://localhost", { headers }))
        expect((res as Response).status).toBe(401)
    })

    it("401 when no token matches the hash", async () => {
        mockGet.mockResolvedValue(snapshotOf([]))
        const res = await verifyBearer(makeReq("crl_live_deadbeef"))
        expect((res as Response).status).toBe(401)
    })

    it("401 when the token is revoked", async () => {
        mockGet.mockResolvedValue(snapshotOf([{ uid: "u1", revokedAt: "SOME_TS" }]))
        const res = await verifyBearer(makeReq("crl_live_abc"))
        expect((res as Response).status).toBe(401)
        expect(mockUpdate).not.toHaveBeenCalled()
    })

    it("returns the uid and stamps lastUsedAt for a valid token", async () => {
        mockGet.mockResolvedValue(snapshotOf([{ uid: "user-42", revokedAt: null }]))
        const res = await verifyBearer(makeReq("crl_live_validtoken"))
        expect(res).toEqual({ uid: "user-42", tokenId: "tok1", parentTokenId: null })
        expect(mockUpdate).toHaveBeenCalledWith({ lastUsedAt: "SERVER_TS" })
    })

    it("500 when the Admin SDK is unavailable", async () => {
        vi.mocked(initAdmin).mockReturnValue(false)
        const res = await verifyBearer(makeReq("crl_live_abc"))
        expect((res as Response).status).toBe(500)
    })

    it("queries by sha256 hash — never the raw token", async () => {
        mockGet.mockResolvedValue(snapshotOf([{ uid: "u1", revokedAt: null }]))
        await verifyBearer(makeReq("crl_live_secret"))
        const hashArg = mockWhere.mock.calls[0][2] as string
        expect(hashArg).toBe(
            createHash("sha256").update("crl_live_secret").digest("hex"),
        )
        expect(hashArg).not.toContain("secret")
    })
})
