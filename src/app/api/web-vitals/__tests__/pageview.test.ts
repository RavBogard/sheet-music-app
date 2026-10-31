// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

const set = vi.fn(async () => undefined)
const doc = vi.fn(() => ({ set }))
const collection = vi.fn(() => ({ doc, add: vi.fn() }))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    getFirestore: () => ({ collection }),
}))
vi.mock("firebase-admin/firestore", () => ({
    FieldValue: { increment: (n: number) => ({ inc: n }), serverTimestamp: () => "ts" },
    Timestamp: { fromMillis: (n: number) => n },
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/error-reporting", () => ({ captureException: vi.fn() }))

const post = async (body: Record<string, unknown>, headers: Record<string, string> = {}) => {
    const { POST } = await import("@/app/api/web-vitals/route")
    return POST(makeReq("/api/web-vitals", { method: "POST", body, headers }))
}

describe("POST /api/web-vitals page views (TEL-02)", () => {
    beforeEach(() => vi.clearAllMocks())

    it("increments a daily counter keyed by day, tenant and route", async () => {
        const res = await post(
            { kind: "pageview", surface: "/perform/setlist/[id]", deviceType: "tablet" },
            { "x-org-id": "brotherslazaroff" },
        )
        expect(res.status).toBe(204)
        expect(collection).toHaveBeenCalledWith("usageCounters")
        const id = (doc.mock.calls[0] as unknown as [string])[0]
        expect(id).toContain("__brotherslazaroff__~perform~setlist~[id]")
        const written = (set.mock.calls[0] as unknown as [Record<string, unknown>])[0]
        expect(written.surface).toBe("/perform/setlist/[id]")
        expect(written.orgId).toBe("brotherslazaroff")
    })

    it("files an invented path under 'other' and rejects a bad device", async () => {
        await post({ kind: "pageview", surface: "/zzz/abc", deviceType: "desktop" })
        expect((set.mock.calls[0] as unknown as [Record<string, unknown>])[0].surface).toBe("other")
        const bad = await post({ kind: "pageview", surface: "/setlists", deviceType: "toaster" })
        expect(bad.status).toBe(400)
    })
})
