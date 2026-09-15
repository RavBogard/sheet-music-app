import { Readable } from "node:stream"

import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
    file: vi.fn(),
    getMetadata: vi.fn(),
    createReadStream: vi.fn(),
}))

vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true }))
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({
        bucket: () => ({ file: state.file }),
    }),
}))

import { downloadExactStorageGeneration } from "@/lib/firebase-storage"

const ARGS = {
    path: "library/file-private.pdf",
    generation: "1725550000000000",
    contentType: "application/pdf",
    expectedSizeBytes: 8,
    maxBytes: 16,
}

describe("downloadExactStorageGeneration", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        state.file.mockReturnValue({
            getMetadata: state.getMetadata,
            createReadStream: state.createReadStream,
        })
        state.getMetadata.mockResolvedValue([{
            generation: ARGS.generation,
            size: String(ARGS.expectedSizeBytes),
            contentType: ARGS.contentType,
        }])
        state.createReadStream.mockReturnValue(Readable.from([Buffer.from("%PDF-1.7")]))
    })

    it("pins generation/precondition and reads only after exact metadata matches", async () => {
        await expect(downloadExactStorageGeneration(ARGS)).resolves.toMatchObject({
            success: true,
            data: {
                generation: ARGS.generation,
                sizeBytes: 8,
                contentType: ARGS.contentType,
            },
        })
        expect(state.file).toHaveBeenCalledWith(ARGS.path, {
            generation: ARGS.generation,
            preconditionOpts: { ifGenerationMatch: ARGS.generation },
        })
        expect(state.getMetadata).toHaveBeenCalledBefore(state.createReadStream)
        expect(state.createReadStream).toHaveBeenCalledWith({ validation: "crc32c" })
    })

    it("rejects generation, MIME, or size metadata before opening a byte stream", async () => {
        for (const metadata of [
            { generation: "1725550000000001", size: "8", contentType: "application/pdf" },
            { generation: ARGS.generation, size: "8", contentType: "text/html" },
            { generation: ARGS.generation, size: "17", contentType: "application/pdf" },
        ]) {
            state.getMetadata.mockResolvedValueOnce([metadata])
            await expect(downloadExactStorageGeneration(ARGS)).resolves.toMatchObject({
                success: false,
                reason: "invalid_input",
            })
        }
        expect(state.createReadStream).not.toHaveBeenCalled()
    })

    it("enforces the declared and absolute byte bound while consuming the stream", async () => {
        state.createReadStream.mockReturnValueOnce(
            Readable.from([Buffer.from("%PDF-1.7overflow")]),
        )
        await expect(downloadExactStorageGeneration(ARGS)).resolves.toMatchObject({
            success: false,
        })
    })
})
