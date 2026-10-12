/**
 * Multi-tenant phase 2 — W9: /api/library/detect-key caches a detected key
 * only onto an EXISTING library_index row (update()); a missing row is never
 * minted as an orgId-less stub. Response shape unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
    row: undefined as Record<string, unknown> | undefined,
    set: vi.fn(),
    update: vi.fn(async () => undefined),
    detect: vi.fn(async () => "G" as string | null),
}))

vi.mock("@/lib/api-wrapper", () => ({
    createApiHandler: (fn: (ctx: unknown) => unknown) => (ctx: unknown) => fn(ctx),
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/key-detection", () => ({ detectKeyFromPdf: h.detect }))
vi.mock("firebase-admin/firestore", () => ({
    getFirestore: () => ({
        collection: () => ({
            doc: () => ({
                get: async () => ({ exists: h.row !== undefined, data: () => h.row }),
                set: h.set,
                update: h.update,
            }),
        }),
    }),
}))

import { POST } from "@/app/api/library/detect-key/route"

const call = (fileId: string) =>
    (POST as unknown as (c: unknown) => Promise<Response>)({ req: {}, body: { fileId } })

beforeEach(() => {
    vi.clearAllMocks()
    h.row = undefined
    h.detect.mockResolvedValue("G")
})

describe("W9 · detect-key never creates a stub library_index row", () => {
    it("missing row → detected key returned, nothing written", async () => {
        const res = await call("no-row")
        expect(await res.json()).toEqual({ key: "G", source: "detected" })
        expect(h.set).not.toHaveBeenCalled()
        expect(h.update).not.toHaveBeenCalled()
    })

    it("existing row without a key → update() with the detected key", async () => {
        h.row = { name: "Chart", orgId: "brotherslazaroff" }
        const res = await call("row-1")
        expect(await res.json()).toEqual({ key: "G", source: "detected" })
        expect(h.set).not.toHaveBeenCalled()
        expect(h.update).toHaveBeenCalledWith({ nativeKey: "G", nativeKeySource: "auto" })
    })

    it("cached key short-circuits (unchanged)", async () => {
        h.row = { nativeKey: "D" }
        const res = await call("row-2")
        expect(await res.json()).toEqual({ key: "D", source: "cached" })
        expect(h.update).not.toHaveBeenCalled()
    })
})
