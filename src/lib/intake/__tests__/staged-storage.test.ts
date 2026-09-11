import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Firebase Storage is faked with the path-keyed in-memory store pattern from
 * `src/lib/mcp/__tests__/mcp-upload-session.emulator.test.ts`, so save →
 * exists → download → delete really round-trip. Assertions are about the
 * store's contents, not about call counts.
 */
const store = new Map<string, Buffer>()
const signedUrlCalls: Array<Record<string, unknown>> = []
const mockFile = vi.fn((p: string) => ({
    getSignedUrl: async (opts: Record<string, unknown>) => {
        signedUrlCalls.push(opts)
        return [`https://signed.example/${encodeURIComponent(p)}`]
    },
    save: async (data: Buffer) => {
        store.set(p, Buffer.from(data))
    },
    exists: async () => [store.has(p)],
    getMetadata: async () => {
        if (!store.has(p)) throw notFound()
        return [{ size: String(store.get(p)!.byteLength) }]
    },
    download: async () => {
        if (!store.has(p)) throw notFound()
        return [store.get(p)!]
    },
    delete: async () => {
        if (!store.has(p)) throw notFound()
        store.delete(p)
    },
}))
function notFound(): Error & { code?: number } {
    const err = new Error("No such object") as Error & { code?: number }
    err.code = 404
    return err
}
const mockGetFiles = vi.fn(async (opts: { prefix: string }) => [
    [...store.keys()]
        .filter((k) => k.startsWith(opts.prefix))
        .map((name) => ({ name })),
])
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({
        bucket: () => ({ file: mockFile, getFiles: mockGetFiles }),
    }),
}))

import {
    assembleChunks,
    chunkObjectPath,
    decodeBase64Strict,
    deleteStaged,
    saveChunk,
    signPut,
    stagedObjectPath,
    statStaged,
} from "../staged-storage"

const BATCH = "ub-abc123"
const ITEM = "it-0001"

describe("staged-storage", () => {
    beforeEach(() => {
        store.clear()
        signedUrlCalls.length = 0
        mockFile.mockClear()
    })

    describe("signPut", () => {
        it("mints a v4 write URL carrying the content type and expiry", async () => {
            const expires = Date.now() + 15 * 60 * 1000
            const url = await signPut(
                stagedObjectPath(BATCH, ITEM),
                "application/pdf",
                expires,
            )

            expect(url).toContain("https://signed.example/")
            expect(signedUrlCalls).toHaveLength(1)
            expect(signedUrlCalls[0]).toMatchObject({
                action: "write",
                version: "v4",
                contentType: "application/pdf",
                expires,
            })
        })
    })

    describe("statStaged", () => {
        it("reports existence and byte size for a staged object", async () => {
            const path = stagedObjectPath(BATCH, ITEM)
            store.set(path, Buffer.from("twelve bytes"))

            expect(await statStaged(path)).toEqual({
                exists: true,
                sizeBytes: 12,
            })
        })

        it("reports exists:false with size 0 when the object is missing", async () => {
            expect(await statStaged(stagedObjectPath(BATCH, "it-gone"))).toEqual({
                exists: false,
                sizeBytes: 0,
            })
        })
    })

    describe("assembleChunks", () => {
        it("concatenates a contiguous run and deletes the chunk objects", async () => {
            await saveChunk(BATCH, ITEM, 0, Buffer.from("AAA"))
            await saveChunk(BATCH, ITEM, 1, Buffer.from("BBB"))
            await saveChunk(BATCH, ITEM, 2, Buffer.from("CC"))

            const result = await assembleChunks(BATCH, ITEM, 3)

            expect(result).toEqual({ ok: true, sizeBytes: 8 })
            expect(store.get(stagedObjectPath(BATCH, ITEM))?.toString()).toBe(
                "AAABBBCC",
            )
            for (let i = 0; i < 3; i++) {
                expect(store.has(chunkObjectPath(BATCH, ITEM, i))).toBe(false)
            }
        })

        it("reports the first missing index when the run has a gap", async () => {
            await saveChunk(BATCH, ITEM, 0, Buffer.from("AAA"))
            await saveChunk(BATCH, ITEM, 2, Buffer.from("CCC"))

            expect(await assembleChunks(BATCH, ITEM, 3)).toEqual({
                ok: false,
                missingIndex: 1,
            })
            // Nothing assembled, chunks retained for a re-send.
            expect(store.has(stagedObjectPath(BATCH, ITEM))).toBe(false)
            expect(store.has(chunkObjectPath(BATCH, ITEM, 0))).toBe(true)
        })

        it("refuses when more chunks are present than the declared total", async () => {
            await saveChunk(BATCH, ITEM, 0, Buffer.from("AAA"))
            await saveChunk(BATCH, ITEM, 1, Buffer.from("BBB"))

            expect(await assembleChunks(BATCH, ITEM, 1)).toEqual({
                ok: false,
                missingIndex: 1,
            })
            expect(store.has(stagedObjectPath(BATCH, ITEM))).toBe(false)
        })
    })

    describe("deleteStaged", () => {
        it("removes the object", async () => {
            const path = stagedObjectPath(BATCH, ITEM)
            store.set(path, Buffer.from("x"))
            await deleteStaged(path)
            expect(store.has(path)).toBe(false)
        })

        it("swallows a 404 for an object that is already gone", async () => {
            await expect(
                deleteStaged(stagedObjectPath(BATCH, "it-gone")),
            ).resolves.toBeUndefined()
        })
    })

    describe("decodeBase64Strict", () => {
        it("decodes well-formed base64", () => {
            const r = decodeBase64Strict(Buffer.from("hello").toString("base64"))
            expect(r.ok).toBe(true)
            if (r.ok) expect(r.buffer.toString()).toBe("hello")
        })

        it("rejects empty input", () => {
            expect(decodeBase64Strict("   ")).toMatchObject({ ok: false })
        })

        it("rejects non-base64 characters rather than silently truncating", () => {
            expect(decodeBase64Strict("not base64!!")).toMatchObject({ ok: false })
        })

        it("rejects a length that is not a multiple of four", () => {
            expect(decodeBase64Strict("abcde")).toMatchObject({ ok: false })
        })
    })
})
