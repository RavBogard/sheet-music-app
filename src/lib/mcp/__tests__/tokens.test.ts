import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("firebase-admin/firestore", () => ({
    FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
    Timestamp: class FakeTimestamp {
        constructor(public ms: number) {}
        toMillis() {
            return this.ms
        }
    },
}))

const mockAdd = vi.fn()
const mockWhereGet = vi.fn()
const mockDocGet = vi.fn()
const mockDocUpdate = vi.fn()
const mockDoc = vi.fn(() => ({ get: mockDocGet, update: mockDocUpdate }))
const mockWhere = vi.fn(() => ({ get: mockWhereGet }))
const mockCollection = vi.fn(() => ({
    add: mockAdd,
    where: mockWhere,
    doc: mockDoc,
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({ collection: mockCollection })),
}))

import {
    generateRawToken,
    hashToken,
    createMcpToken,
    listMcpTokens,
    revokeMcpToken,
} from "../tokens"
import { Timestamp } from "firebase-admin/firestore"

describe("generateRawToken / hashToken", () => {
    it("mints a crl_live_ token with 32 hex-encoded random bytes", () => {
        const t = generateRawToken()
        expect(t).toMatch(/^crl_live_[0-9a-f]{64}$/)
        expect(generateRawToken()).not.toBe(t) // unique each call
    })

    it("hashToken is a deterministic sha256 hex digest, not the raw token", () => {
        const raw = "crl_live_abc"
        expect(hashToken(raw)).toBe(hashToken(raw))
        expect(hashToken(raw)).toMatch(/^[0-9a-f]{64}$/)
        expect(hashToken(raw)).not.toContain("abc")
    })
})

describe("createMcpToken", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockAdd.mockResolvedValue({ id: "tok-1" })
    })

    it("persists only the hash — never the raw token — and returns the raw token once", async () => {
        const { id, rawToken } = await createMcpToken("user-1", "Claude Desktop")
        expect(id).toBe("tok-1")
        expect(rawToken).toMatch(/^crl_live_[0-9a-f]{64}$/)

        const written = mockAdd.mock.calls[0][0]
        expect(written.uid).toBe("user-1")
        expect(written.label).toBe("Claude Desktop")
        expect(written.tokenHash).toBe(hashToken(rawToken))
        expect(written.revokedAt).toBeNull()
        expect(written.lastUsedAt).toBeNull()
        // the raw token must never appear in the persisted document
        expect(JSON.stringify(written)).not.toContain(rawToken)
    })
})

describe("listMcpTokens", () => {
    beforeEach(() => vi.clearAllMocks())

    it("returns active tokens newest-first, excludes revoked, never leaks the hash", async () => {
        mockWhereGet.mockResolvedValue({
            docs: [
                {
                    id: "a",
                    data: () => ({
                        uid: "u",
                        label: "A",
                        createdAt: new Timestamp(1000),
                        lastUsedAt: null,
                        revokedAt: null,
                        tokenHash: "HASH_A",
                    }),
                },
                {
                    id: "b",
                    data: () => ({
                        uid: "u",
                        label: "B",
                        createdAt: new Timestamp(2000),
                        lastUsedAt: new Timestamp(2500),
                        revokedAt: null,
                        tokenHash: "HASH_B",
                    }),
                },
                {
                    id: "c",
                    data: () => ({
                        uid: "u",
                        label: "C revoked",
                        createdAt: new Timestamp(1500),
                        revokedAt: new Timestamp(3000),
                        tokenHash: "HASH_C",
                    }),
                },
            ],
        })

        const r = await listMcpTokens("u")
        expect(r.map((t) => t.id)).toEqual(["b", "a"]) // revoked 'c' dropped, desc by createdAt
        expect(r[0]).toEqual({
            id: "b",
            label: "B",
            createdAt: 2000,
            lastUsedAt: 2500,
        })
        expect(JSON.stringify(r)).not.toContain("HASH_")
        expect(mockWhere).toHaveBeenCalledWith("uid", "==", "u")
    })
})

describe("revokeMcpToken", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockDocUpdate.mockResolvedValue(undefined)
    })

    it("revokes a token the caller owns", async () => {
        mockDocGet.mockResolvedValue({ exists: true, data: () => ({ uid: "u" }) })
        expect(await revokeMcpToken("u", "tok-1")).toBe(true)
        expect(mockDocUpdate).toHaveBeenCalledWith({ revokedAt: "SERVER_TS" })
    })

    it("refuses to revoke another user's token", async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({ uid: "someone-else" }),
        })
        expect(await revokeMcpToken("u", "tok-1")).toBe(false)
        expect(mockDocUpdate).not.toHaveBeenCalled()
    })

    it("returns false for a missing token", async () => {
        mockDocGet.mockResolvedValue({ exists: false })
        expect(await revokeMcpToken("u", "missing")).toBe(false)
        expect(mockDocUpdate).not.toHaveBeenCalled()
    })
})
