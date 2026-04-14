/**
 * D01 — POST /api/setlist/delete cascade.
 * Covers: 403, 400, 404, happy path, partial-failure tolerance, zero-dependents.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

// ── Mocks ──
let setlistExists = true

type DocsFactory = () => Array<{ ref: { delete: () => void } }>
const queryResults: Record<string, DocsFactory> = {}
// Key: `${collection}|${field}|${value}` or `cg|${cg}|${field}|${value}`

const batchDeleteSpy = vi.fn()
const recursiveDeleteSpy = vi.fn(async () => undefined)

function makeQuery(factory: DocsFactory) {
    const whereMock = () => ({
        limit: (_n: number) => ({
            get: async () => {
                const docs = factory()
                return {
                    size: docs.length,
                    empty: docs.length === 0,
                    docs,
                }
            },
        }),
    })
    return { where: whereMock }
}

const mockFirestore = {
    collection: vi.fn((name: string) => {
        if (name === "setlists") {
            return {
                doc: (_id: string) => ({
                    id: _id,
                    get: async () => ({ exists: setlistExists }),
                }),
            }
        }
        // Flat collection query
        return {
            ...makeQuery(() => {
                const key = `${name}`
                return queryResults[key]?.() ?? []
            }),
        }
    }),
    collectionGroup: vi.fn((name: string) => ({
        ...makeQuery(() => queryResults[`cg|${name}`]?.() ?? []),
    })),
    batch: vi.fn(() => ({
        delete: batchDeleteSpy,
        commit: async () => undefined,
    })),
    recursiveDelete: recursiveDeleteSpy,
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestore),
    verifyIdToken: vi.fn(),
}))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { verifyIdToken } from "@/lib/firebase-admin"

function mockAuth(role: string) {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid: "user-1",
        email: "user@example.com",
        role,
        isAdmin: role === "admin",
        isBandLeader: role === "band_leader" || role === "admin",
        isMusician: ["musician", "band_leader", "admin"].includes(role),
        isMember: role !== "pending",
    } as never)
}

let POST: typeof import("@/app/api/setlist/delete/route").POST

beforeAll(async () => {
    const mod = await import("@/app/api/setlist/delete/route")
    POST = mod.POST
})

function mkDocs(n: number) {
    return Array.from({ length: n }, (_, i) => ({
        ref: { delete: () => undefined, id: `d-${i}` } as unknown as { delete: () => void },
    }))
}

describe("POST /api/setlist/delete — D01 cascade", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setlistExists = true
        for (const k of Object.keys(queryResults)) delete queryResults[k]
    })

    it("403 for non-band-leader — no deletes", async () => {
        mockAuth("musician")
        const req = makeReq("/api/setlist/delete", {
            method: "POST",
            token: "valid",
            body: { setlistId: "s-1" },
        })
        const res = await POST(req)
        expect(res.status).toBe(403)
        expect(recursiveDeleteSpy).not.toHaveBeenCalled()
        expect(batchDeleteSpy).not.toHaveBeenCalled()
    })

    it("400 on invalid body (missing setlistId)", async () => {
        mockAuth("band_leader")
        const req = makeReq("/api/setlist/delete", {
            method: "POST",
            token: "valid",
            body: {},
        })
        const res = await POST(req)
        expect(res.status).toBe(400)
    })

    it("404 when setlist does not exist — no deletes", async () => {
        mockAuth("band_leader")
        setlistExists = false
        const req = makeReq("/api/setlist/delete", {
            method: "POST",
            token: "valid",
            body: { setlistId: "gone" },
        })
        const res = await POST(req)
        expect(res.status).toBe(404)
        expect(recursiveDeleteSpy).not.toHaveBeenCalled()
        expect(batchDeleteSpy).not.toHaveBeenCalled()
    })

    it("happy path: 3 assignments + 2 tasks + 1 notification → all deleted", async () => {
        mockAuth("band_leader")
        queryResults["scheduling_assignments"] = () => mkDocs(3)
        queryResults["tasks"] = () => mkDocs(2)
        queryResults["cg|notifications"] = () => mkDocs(1)

        const req = makeReq("/api/setlist/delete", {
            method: "POST",
            token: "valid",
            body: { setlistId: "s-1" },
        })
        const res = await POST(req)
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.deleted).toEqual({
            setlist: 1,
            assignments: 3,
            tasks: 2,
            notifications: 1,
        })
        expect(json.errors).toEqual([])
        expect(recursiveDeleteSpy).toHaveBeenCalledTimes(1)
    })

    it("partial failure: recursiveDelete throws → setlist deleted, assignments count preserved, error recorded", async () => {
        mockAuth("band_leader")
        queryResults["scheduling_assignments"] = () => mkDocs(2)
        queryResults["tasks"] = () => mkDocs(0)
        queryResults["cg|notifications"] = () => mkDocs(0)
        recursiveDeleteSpy.mockImplementationOnce(async () => {
            throw new Error("quota")
        })

        const req = makeReq("/api/setlist/delete", {
            method: "POST",
            token: "valid",
            body: { setlistId: "s-1" },
        })
        const res = await POST(req)
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.deleted.assignments).toBe(2)
        expect(json.errors.some((e: string) => e.startsWith("setlist:"))).toBe(true)
    })

    it("zero dependents → 200 with zero counts", async () => {
        mockAuth("band_leader")
        queryResults["scheduling_assignments"] = () => mkDocs(0)
        queryResults["tasks"] = () => mkDocs(0)
        queryResults["cg|notifications"] = () => mkDocs(0)

        const req = makeReq("/api/setlist/delete", {
            method: "POST",
            token: "valid",
            body: { setlistId: "s-1" },
        })
        const res = await POST(req)
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.deleted).toEqual({
            setlist: 1,
            assignments: 0,
            tasks: 0,
            notifications: 0,
        })
        expect(json.errors).toEqual([])
        expect(recursiveDeleteSpy).toHaveBeenCalledTimes(1)
    })
})
