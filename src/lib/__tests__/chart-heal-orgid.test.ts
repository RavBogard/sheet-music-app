/**
 * Multi-tenant phase 2 — W11 on the heal path: healChartBytes rewrites the
 * Storage bytes of an EXISTING row with that row's tenant (rowOrg(orgId);
 * unstamped legacy rows → 'crc').
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
    upload: vi.fn(async (..._args: unknown[]) => "gs://b/p"),
    size: vi.fn(async (..._args: unknown[]) => 0 as number | null),
    rows: {} as Record<string, Record<string, unknown>>,
}))

vi.mock("@/lib/firebase-storage", () => ({
    uploadToStorage: h.upload,
    getStorageObjectSize: h.size,
}))
vi.mock("@/lib/library/safely-delete-library-object", () => ({ safelyDeleteLibraryObject: vi.fn() }))
vi.mock("@/lib/library/library-events", () => ({ emitLibraryRowCreated: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { healChartBytes } from "@/lib/chart-heal"

function fakeDb() {
    const q: Record<string, unknown> = {}
    Object.assign(q, {
        where: () => q,
        select: () => q,
        limit: () => q,
        get: async () => ({ empty: true, size: 0, docs: [] }),
    })
    return {
        collection: (name: string) => ({
            ...q,
            doc: (id: string) => ({
                get: async () => {
                    const d = name === "library_index" ? h.rows[id] : undefined
                    return { id, exists: d !== undefined, data: () => d }
                },
                set: async () => undefined,
                update: async () => undefined,
            }),
        }),
    } as unknown as FirebaseFirestore.Firestore
}

const BYTES = Buffer.from("%PDF-1.7 healed")

beforeEach(() => {
    vi.clearAllMocks()
    h.size.mockResolvedValue(BYTES.byteLength)
    h.rows = {}
})

describe("W11 · healChartBytes passes the row tenant to uploadToStorage", () => {
    it("BL row → 'brotherslazaroff'", async () => {
        h.rows["file-bl"] = { name: "BL Chart", orgId: "brotherslazaroff", collection: "uploads" }
        const res = await healChartBytes(fakeDb(), "admin", "file-bl", BYTES, "application/pdf", "drive")
        expect(res).toMatchObject({ ok: true })
        expect(h.upload).toHaveBeenCalledWith("file-bl", BYTES, "application/pdf", "brotherslazaroff")
    })

    it("unstamped row → 'crc'", async () => {
        h.rows["file-old"] = { name: "Old Chart" }
        await healChartBytes(fakeDb(), "admin", "file-old", BYTES, "application/pdf", "drive")
        expect(h.upload.mock.calls[0][3]).toBe("crc")
    })
})
