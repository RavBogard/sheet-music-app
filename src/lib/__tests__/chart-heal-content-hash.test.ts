/**
 * A heal rewrites the row's `contentHash` to the bytes it just wrote.
 *
 * Until phase 8 the heal patch set `fileSize` but left `contentHash` alone, so
 * every healed row went on claiming the sha256 of the bytes it no longer held.
 * Phase 8 caught it replacing two Nava charts: the rows read back 104,465 and
 * 204,906 bytes against hashes of the 15,607- and 33,145-byte files they had
 * replaced. Both heal callers (`salvage_chart_bytes` and
 * `finalize_chart_upload` heal-mode) write through here, so the fix is shared.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"

const h = vi.hoisted(() => ({
    upload: vi.fn(async (..._args: unknown[]) => "gs://b/p"),
    size: vi.fn(async (..._args: unknown[]) => 0 as number | null),
    rows: {} as Record<string, Record<string, unknown>>,
    patches: [] as { collection: string; id: string; data: Record<string, unknown> }[],
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
            add: async () => ({ id: "audit" }),
            doc: (id: string) => ({
                get: async () => {
                    const d = name === "library_index" ? h.rows[id] : undefined
                    return { id, exists: d !== undefined, data: () => d }
                },
                set: async (data: Record<string, unknown>) => {
                    h.patches.push({ collection: name, id, data })
                },
                update: async () => undefined,
            }),
        }),
    } as unknown as FirebaseFirestore.Firestore
}

const NEW_BYTES = Buffer.from("%PDF-1.7 the chord chart, rather longer than the notation")
const NEW_SHA = createHash("sha256").update(NEW_BYTES).digest("hex")

const rowPatch = () => h.patches.find((p) => p.collection === "library_index")!.data

beforeEach(() => {
    vi.clearAllMocks()
    h.size.mockResolvedValue(NEW_BYTES.byteLength)
    h.rows = {}
    h.patches = []
})

describe("healChartBytes · contentHash follows the bytes", () => {
    it("replaces a stale hash with the sha256 of the healed bytes", async () => {
        h.rows["file-1"] = {
            name: "Ehyeh Asher Ehyeh (Daphna Rosenberg)",
            orgId: "navatehila",
            collection: "nava",
            fileSize: 15607,
            contentHash: { alg: "sha256", value: "0".repeat(64), sizeBytes: 15607, at: "2026-08-18T00:00:00.000Z", source: "upload" },
        }

        const res = await healChartBytes(fakeDb(), "admin", "file-1", NEW_BYTES, "application/pdf", "drive")
        expect(res).toMatchObject({ ok: true })

        const patch = rowPatch()
        expect(patch.fileSize).toBe(NEW_BYTES.byteLength)
        expect(patch.contentHash).toMatchObject({
            alg: "sha256",
            value: NEW_SHA,
            sizeBytes: NEW_BYTES.byteLength,
        })
    })

    it("records sizeBytes matching fileSize, so the backfill treats the row as current", async () => {
        h.rows["file-2"] = { name: "Yedaber Aleihem (Yoel Sykes)", orgId: "navatehila", collection: "nava", fileSize: 33145 }

        await healChartBytes(fakeDb(), "admin", "file-2", NEW_BYTES, "application/pdf", "drive")

        const patch = rowPatch()
        const hash = patch.contentHash as { sizeBytes: number }
        expect(hash.sizeBytes).toBe(patch.fileSize)
    })

    it("broadcasts a library signal with no tenant data in it", async () => {
        // Phase 9: `library_signals/latest` is a single global document that
        // every signed-in person of every tenant can read, and it used to
        // carry the fileId just touched and the uid that touched it. The
        // listeners only look at `at`, so the payload bought nothing and
        // leaked across tenants.
        h.rows["file-4"] = { name: "Chart", orgId: "navatehila", collection: "nava" }

        await healChartBytes(fakeDb(), "admin", "file-4", NEW_BYTES, "application/pdf", "drive")

        const signal = h.patches.find((p) => p.collection === "library_signals")
        expect(signal).toBeTruthy()
        expect(Object.keys(signal!.data).sort()).toEqual(["at", "op"])
    })

    it("clears hashFailed, because these bytes hashed fine", async () => {
        h.rows["file-3"] = {
            name: "Chart",
            orgId: "crc",
            collection: "uploads",
            hashFailed: { reason: "bytes_unreachable", detail: "404", at: "2026-09-01T00:00:00.000Z" },
        }

        await healChartBytes(fakeDb(), "admin", "file-3", NEW_BYTES, "application/pdf", "drive")

        expect(rowPatch().hashFailed).toBeNull()
    })
})
