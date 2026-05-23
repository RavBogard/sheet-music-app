import { beforeEach, describe, expect, it, vi } from "vitest"
import { Readable } from "node:stream"

/**
 * storage-phase2 — DriveClient binary methods (uploadBinaryFile / updateFileMedia
 * / ensureFolder). Mocks @googleapis/drive so we assert the exact API call shape
 * without a real Drive call: the binary upload MUST stream the buffer (a string
 * body corrupts PDFs), stamp appProperties, and target a Shared Drive
 * (supportsAllDrives).
 */

const filesCreate = vi.fn()
const filesUpdate = vi.fn()
const filesList = vi.fn()

vi.mock("@googleapis/drive", () => ({
    drive: () => ({
        files: { create: filesCreate, update: filesUpdate, list: filesList },
    }),
}))
vi.mock("google-auth-library", () => ({
    GoogleAuth: class {},
}))

import { DriveClient } from "@/lib/google-drive"

describe("DriveClient binary methods (storage-phase2)", () => {
    beforeEach(() => {
        filesCreate.mockReset()
        filesUpdate.mockReset()
        filesList.mockReset()
    })

    it("uploadBinaryFile streams the buffer, stamps appProperties, targets a Shared Drive", async () => {
        filesCreate.mockResolvedValue({
            data: { id: "drive-abc", name: "Adon Olam__upload-1.pdf", md5Checksum: "deadbeef", size: "11" },
        })
        const drive = new DriveClient()
        const buffer = Buffer.from("%PDF-1.4 hi")

        const res = await drive.uploadBinaryFile({
            name: "Adon Olam__upload-1.pdf",
            mimeType: "application/pdf",
            buffer,
            parents: ["folder-uploads"],
            appProperties: { crcBackup: "1" },
        })

        expect(res).toMatchObject({ id: "drive-abc", md5Checksum: "deadbeef" })
        expect(filesCreate).toHaveBeenCalledTimes(1)
        const arg = filesCreate.mock.calls[0][0]
        expect(arg.requestBody).toMatchObject({
            name: "Adon Olam__upload-1.pdf",
            mimeType: "application/pdf",
            parents: ["folder-uploads"],
            appProperties: { crcBackup: "1" },
        })
        // The crucial bit: media body is a stream, not a string.
        expect(arg.media.mimeType).toBe("application/pdf")
        expect(arg.media.body).toBeInstanceOf(Readable)
        expect(arg.fields).toContain("md5Checksum")
        expect(arg.supportsAllDrives).toBe(true)
    })

    it("uploadBinaryFile omits appProperties/parents when not given", async () => {
        filesCreate.mockResolvedValue({ data: { id: "x" } })
        const drive = new DriveClient()
        await drive.uploadBinaryFile({
            name: "n.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("a"),
        })
        const arg = filesCreate.mock.calls[0][0]
        expect(arg.requestBody.parents).toBeUndefined()
        expect(arg.requestBody.appProperties).toBeUndefined()
    })

    it("updateFileMedia replaces media via files.update (keeps the prior revision)", async () => {
        filesUpdate.mockResolvedValue({ data: { id: "drive-abc", md5Checksum: "newmd5", size: "20" } })
        const drive = new DriveClient()

        const res = await drive.updateFileMedia("drive-abc", Buffer.from("newer bytes"), "application/pdf")

        expect(res).toMatchObject({ id: "drive-abc", md5Checksum: "newmd5" })
        const arg = filesUpdate.mock.calls[0][0]
        expect(arg.fileId).toBe("drive-abc")
        expect(arg.media.body).toBeInstanceOf(Readable)
        expect(arg.media.mimeType).toBe("application/pdf")
        expect(arg.fields).toContain("md5Checksum")
        expect(arg.supportsAllDrives).toBe(true)
        // media-only update: must NOT pass requestBody (would risk clobbering metadata)
        expect(arg.requestBody).toBeUndefined()
    })

    it("ensureFolder returns the existing folder id without creating", async () => {
        filesList.mockResolvedValue({ data: { files: [{ id: "existing-folder" }] } })
        const drive = new DriveClient()

        const id = await drive.ensureFolder({ name: "core", parentId: "root" })

        expect(id).toBe("existing-folder")
        expect(filesCreate).not.toHaveBeenCalled()
        const q = filesList.mock.calls[0][0].q as string
        expect(q).toContain("'root' in parents")
        expect(q).toContain("name = 'core'")
        expect(q).toContain("application/vnd.google-apps.folder")
    })

    it("ensureFolder creates the folder when absent", async () => {
        filesList.mockResolvedValue({ data: { files: [] } })
        filesCreate.mockResolvedValue({ data: { id: "new-folder" } })
        const drive = new DriveClient()

        const id = await drive.ensureFolder({ name: "uploads", parentId: "charts-root" })

        expect(id).toBe("new-folder")
        const arg = filesCreate.mock.calls[0][0]
        expect(arg.requestBody).toMatchObject({
            name: "uploads",
            mimeType: "application/vnd.google-apps.folder",
            parents: ["charts-root"],
        })
        expect(arg.supportsAllDrives).toBe(true)
    })

    it("ensureFolder escapes single quotes in the folder name query", async () => {
        filesList.mockResolvedValue({ data: { files: [{ id: "f" }] } })
        const drive = new DriveClient()
        await drive.ensureFolder({ name: "David's charts", parentId: "root" })
        const q = filesList.mock.calls[0][0].q as string
        expect(q).toContain("David\\'s charts")
    })
})
