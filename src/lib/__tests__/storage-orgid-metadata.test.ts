/**
 * Multi-tenant phase 2 — W11: uploadToStorage(fileId, buffer, mime, orgId)
 * writes the tenant into the object's custom metadata
 * (`metadata.metadata.orgId`) next to the existing contentType / cacheControl
 * / driveFileId / uploadedAt, without disturbing them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
    file: vi.fn(),
    save: vi.fn(async () => undefined),
}))

vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true }))
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({ bucket: () => ({ file: state.file }) }),
}))

import { uploadToStorage } from "@/lib/firebase-storage"

beforeEach(() => {
    vi.clearAllMocks()
    state.file.mockReturnValue({ save: state.save })
})

describe("W11 · uploadToStorage customMetadata.orgId", () => {
    it("writes metadata.metadata.orgId and keeps contentType + existing custom fields", async () => {
        await uploadToStorage("upload-1", Buffer.from("%PDF"), "application/pdf", "brotherslazaroff")
        expect(state.file).toHaveBeenCalledWith("library/upload-1.pdf")
        const opts = (state.save.mock.calls[0] as unknown[])[1] as {
            metadata: { contentType: string; cacheControl: string; metadata: Record<string, string> }
        }
        expect(opts.metadata.contentType).toBe("application/pdf")
        expect(opts.metadata.cacheControl).toMatch(/max-age/)
        expect(opts.metadata.metadata.orgId).toBe("brotherslazaroff")
        expect(opts.metadata.metadata.driveFileId).toBe("upload-1")
        expect(typeof opts.metadata.metadata.uploadedAt).toBe("string")
    })

    it("originals/ paths carry the tenant too", async () => {
        await uploadToStorage("originals/upload-2.mscz", Buffer.from("x"), "application/octet-stream", "crc")
        expect(state.file).toHaveBeenCalledWith("library/originals/upload-2.mscz")
        const opts = (state.save.mock.calls[0] as unknown[])[1] as { metadata: { metadata: Record<string, string> } }
        expect(opts.metadata.metadata.orgId).toBe("crc")
    })
})
