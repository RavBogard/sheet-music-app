/**
 * Unit tests for the batch-intake Drive helpers.
 *
 * Deliberately network-free and Firebase-free: every test drives a plain
 * object that structurally satisfies `DriveLike` (a `Pick` of `DriveClient`),
 * so this file runs under the ordinary `vitest run` config with no emulator.
 */
import { describe, it, expect, vi } from "vitest"
import {
    escapeDriveQueryValue,
    listDriveFolderCharts,
    fetchDriveFileForUpload,
    deriveDriveUploadTyping,
    classifyDriveFailure,
    DRIVE_FOLDER_MIME,
    MAX_DRIVE_FILE_BYTES,
    type DriveLike,
} from "../drive-folder"

const GOOGLE_DOC = "application/vnd.google-apps.document"
const DOCX =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

type ListedFile = {
    id?: string
    name?: string
    mimeType?: string
    modifiedTime?: string
    parents?: string[]
    md5Checksum?: string
    size?: string | number
}

/** Build a fake DriveLike whose `listFilesByQuery` answers per folder id. */
function fakeDrive(opts: {
    folders?: Record<string, ListedFile[]>
    getFile?: (id: string) => Promise<unknown>
    fetchAsPdf?: (id: string, mime: string) => Promise<ArrayBuffer>
    getFileMetadata?: (id: string) => Promise<unknown>
}): DriveLike & { listCalls: string[] } {
    const listCalls: string[] = []
    const drive = {
        listCalls,
        async listFilesByQuery(params: { q: string }) {
            listCalls.push(params.q)
            const folderId = params.q.match(/^'([^']+)' in parents/)?.[1] ?? ""
            return {
                files: opts.folders?.[folderId] ?? [],
                nextPageToken: null,
            }
        },
        async getFileMetadata(id: string) {
            if (opts.getFileMetadata) return opts.getFileMetadata(id)
            throw new Error("getFileMetadata not stubbed")
        },
        async getFile(id: string) {
            if (opts.getFile) return opts.getFile(id)
            throw new Error("getFile not stubbed")
        },
        async fetchAsPdf(id: string, mime: string) {
            if (opts.fetchAsPdf) return opts.fetchAsPdf(id, mime)
            throw new Error("fetchAsPdf not stubbed")
        },
    }
    return drive as unknown as DriveLike & { listCalls: string[] }
}

describe("listDriveFolderCharts", () => {
    const root: ListedFile[] = [
        { id: "d1", name: "Adon Olam.docx", mimeType: DOCX, size: "1024" },
        {
            id: "d2",
            name: "Hashkivenu.mxl",
            mimeType: "application/octet-stream",
            size: "2048",
            md5Checksum: "abc",
            modifiedTime: "2026-09-01T00:00:00Z",
        },
        { id: "d3", name: "scans.zip", mimeType: "application/zip", size: "4096" },
        { id: "sub", name: "More Charts", mimeType: DRIVE_FOLDER_MIME },
    ]
    const sub: ListedFile[] = [
        {
            id: "d4",
            name: "Mi Chamocha.pdf",
            mimeType: "application/pdf",
            size: "512",
        },
    ]

    it("accepts a convertible .docx and an octet-stream .mxl; skips a .zip and a subfolder when not recursive", async () => {
        const drive = fakeDrive({ folders: { root, sub } })
        const res = await listDriveFolderCharts(drive, "root", {
            recursive: false,
            max: 100,
        })

        expect(res.candidates.map((c) => c.driveFileId)).toEqual(["d1", "d2"])
        expect(res.candidates[1]).toMatchObject({
            driveFileId: "d2",
            name: "Hashkivenu.mxl",
            sizeBytes: 2048,
            md5Checksum: "abc",
            modifiedTime: "2026-09-01T00:00:00Z",
        })
        expect(res.skipped).toEqual([
            { name: "scans.zip", reason: "unsupported_type" },
            { name: "More Charts", reason: "folder" },
        ])
        expect(drive.listCalls).toEqual(["'root' in parents and trashed = false"])
    })

    it("descends into subfolders when recursive", async () => {
        const drive = fakeDrive({ folders: { root, sub } })
        const res = await listDriveFolderCharts(drive, "root", {
            recursive: true,
            max: 100,
        })

        expect(res.candidates.map((c) => c.driveFileId)).toEqual([
            "d1",
            "d2",
            "d4",
        ])
        expect(res.skipped).toEqual([
            { name: "scans.zip", reason: "unsupported_type" },
        ])
        expect(drive.listCalls).toEqual([
            "'root' in parents and trashed = false",
            "'sub' in parents and trashed = false",
        ])
    })

    it("stops descending past depth 3 and reports the too-deep folder as skipped", async () => {
        const drive = fakeDrive({
            folders: {
                L1: [{ id: "L2", name: "L2", mimeType: DRIVE_FOLDER_MIME }],
                L2: [{ id: "L3", name: "L3", mimeType: DRIVE_FOLDER_MIME }],
                L3: [
                    { id: "L4", name: "L4", mimeType: DRIVE_FOLDER_MIME },
                    {
                        id: "deep",
                        name: "Deep.pdf",
                        mimeType: "application/pdf",
                        size: "10",
                    },
                ],
                L4: [
                    {
                        id: "deeper",
                        name: "Deeper.pdf",
                        mimeType: "application/pdf",
                        size: "10",
                    },
                ],
            },
        })
        const res = await listDriveFolderCharts(drive, "L1", {
            recursive: true,
            max: 100,
        })

        expect(res.candidates.map((c) => c.driveFileId)).toEqual(["deep"])
        expect(res.skipped).toEqual([{ name: "L4", reason: "folder" }])
        expect(drive.listCalls).toHaveLength(3)
    })

    it("skips files over the 25 MB cap", async () => {
        const drive = fakeDrive({
            folders: {
                root: [
                    {
                        id: "big",
                        name: "Huge.pdf",
                        mimeType: "application/pdf",
                        size: String(MAX_DRIVE_FILE_BYTES + 1),
                    },
                    {
                        id: "edge",
                        name: "Exactly.pdf",
                        mimeType: "application/pdf",
                        size: String(MAX_DRIVE_FILE_BYTES),
                    },
                ],
            },
        })
        const res = await listDriveFolderCharts(drive, "root", {
            recursive: false,
            max: 100,
        })

        expect(res.candidates.map((c) => c.driveFileId)).toEqual(["edge"])
        expect(res.skipped).toEqual([{ name: "Huge.pdf", reason: "too_large" }])
    })

    it("honours the max cap and stops listing once it is reached", async () => {
        const drive = fakeDrive({
            folders: {
                root: [
                    { id: "a", name: "A.pdf", mimeType: "application/pdf", size: "1" },
                    { id: "b", name: "B.pdf", mimeType: "application/pdf", size: "1" },
                    { id: "sub", name: "Sub", mimeType: DRIVE_FOLDER_MIME },
                ],
                sub: [
                    { id: "c", name: "C.pdf", mimeType: "application/pdf", size: "1" },
                ],
            },
        })
        const res = await listDriveFolderCharts(drive, "root", {
            recursive: true,
            max: 2,
        })

        expect(res.candidates.map((c) => c.driveFileId)).toEqual(["a", "b"])
        expect(drive.listCalls).toEqual(["'root' in parents and trashed = false"])
    })

    it("escapes an apostrophe (and a backslash) in the folder id", () => {
        // Drive query strings escape with a backslash. An unescaped
        // apostrophe would terminate the quoted term mid-id.
        expect(escapeDriveQueryValue("fol'der\\x")).toBe(
            "fol\\'der\\\\x",
        )
        expect(escapeDriveQueryValue("plain-id")).toBe("plain-id")
    })

    it("interpolates the escaped folder id into the q string", async () => {
        const listFilesByQuery = vi
            .fn()
            .mockResolvedValue({ files: [], nextPageToken: null })
        const drive = { listFilesByQuery } as unknown as DriveLike

        await listDriveFolderCharts(drive, "fol'der\\x", {
            recursive: false,
            max: 10,
        })

        expect(listFilesByQuery.mock.calls[0][0].q).toBe(
            "'fol\\'der\\\\x' in parents and trashed = false",
        )
    })

    it("follows nextPageToken", async () => {
        const listFilesByQuery = vi
            .fn()
            .mockResolvedValueOnce({
                files: [
                    {
                        id: "p1",
                        name: "One.pdf",
                        mimeType: "application/pdf",
                        size: "1",
                    },
                ],
                nextPageToken: "tok",
            })
            .mockResolvedValueOnce({
                files: [
                    {
                        id: "p2",
                        name: "Two.pdf",
                        mimeType: "application/pdf",
                        size: "1",
                    },
                ],
                nextPageToken: null,
            })
        const drive = { listFilesByQuery } as unknown as DriveLike
        const res = await listDriveFolderCharts(drive, "root", {
            recursive: false,
            max: 100,
        })

        expect(res.candidates.map((c) => c.driveFileId)).toEqual(["p1", "p2"])
        expect(listFilesByQuery).toHaveBeenCalledTimes(2)
        expect(listFilesByQuery.mock.calls[1][0].pageToken).toBe("tok")
    })
})

describe("fetchDriveFileForUpload", () => {
    it("returns PDF bytes via fetchAsPdf for a Google Doc, renaming to .pdf", async () => {
        const fetchAsPdf = vi.fn(async () => new Uint8Array([1, 2, 3]).buffer)
        const getFile = vi.fn()
        const drive = fakeDrive({
            getFileMetadata: async () => ({
                name: "Yismchu.doc-native",
                mimeType: GOOGLE_DOC,
            }),
            fetchAsPdf,
            getFile,
        })

        const res = await fetchDriveFileForUpload(drive, "gd1")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.mimeType).toBe("application/pdf")
        expect(res.originalFileName).toBe("Yismchu.pdf")
        expect(res.driveMime).toBe(GOOGLE_DOC)
        expect(Array.from(res.buffer)).toEqual([1, 2, 3])
        expect(fetchAsPdf).toHaveBeenCalledWith("gd1", GOOGLE_DOC)
        expect(getFile).not.toHaveBeenCalled()
    })

    it("returns raw bytes via getFile for a binary PDF", async () => {
        const fetchAsPdf = vi.fn()
        const getFile = vi.fn(async () => new Uint8Array([9, 9]).buffer)
        const drive = fakeDrive({
            getFileMetadata: async () => ({
                name: "Lechu.pdf",
                mimeType: "application/pdf",
            }),
            fetchAsPdf,
            getFile,
        })

        const res = await fetchDriveFileForUpload(drive, "pdf1")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.mimeType).toBe("application/pdf")
        expect(res.originalFileName).toBe("Lechu.pdf")
        expect(Array.from(res.buffer)).toEqual([9, 9])
        expect(fetchAsPdf).not.toHaveBeenCalled()
    })

    it("reports empty_file for zero-length bytes", async () => {
        const drive = fakeDrive({
            getFileMetadata: async () => ({
                name: "Empty.pdf",
                mimeType: "application/pdf",
            }),
            getFile: async () => new ArrayBuffer(0),
        })
        const res = await fetchDriveFileForUpload(drive, "e1")
        expect(res).toMatchObject({ ok: false, code: "empty_file" })
    })

    it("maps 404 / 403 / other metadata failures", async () => {
        const notFound = Object.assign(new Error("File not found: x"), {
            code: 404,
        })
        const forbidden = Object.assign(new Error("insufficientPermissions"), {
            code: 403,
        })
        const boom = new Error("socket hang up")

        for (const [err, code] of [
            [notFound, "drive_not_found"],
            [forbidden, "drive_forbidden"],
            [boom, "drive_error"],
        ] as const) {
            const drive = fakeDrive({
                getFileMetadata: async () => {
                    throw err
                },
            })
            const res = await fetchDriveFileForUpload(drive, "x")
            expect(res).toMatchObject({ ok: false, code })
        }
    })

    it("reuses caller-supplied metadata instead of a second round-trip", async () => {
        const getFileMetadata = vi.fn()
        const drive = {
            getFileMetadata,
            getFile: async () => new Uint8Array([7]).buffer,
        } as unknown as DriveLike

        const res = await fetchDriveFileForUpload(drive, "m1", {
            metadata: { name: "Cached.pdf", mimeType: "application/pdf" },
        })
        expect(res.ok).toBe(true)
        expect(getFileMetadata).not.toHaveBeenCalled()
    })

    it("refuses folders and non-convertible Google-native types", async () => {
        const folder = fakeDrive({
            getFileMetadata: async () => ({
                name: "A Folder",
                mimeType: DRIVE_FOLDER_MIME,
            }),
        })
        expect(await fetchDriveFileForUpload(folder, "f1")).toMatchObject({
            ok: false,
            code: "unsupported_type",
        })

        const form = fakeDrive({
            getFileMetadata: async () => ({
                name: "Signup",
                mimeType: "application/vnd.google-apps.form",
            }),
        })
        expect(await fetchDriveFileForUpload(form, "f2")).toMatchObject({
            ok: false,
            code: "unsupported_type",
        })
    })
})

describe("deriveDriveUploadTyping", () => {
    it("derives the music mime for an octet-stream .mxl (MusicXML routing)", () => {
        const t = deriveDriveUploadTyping("x", {
            name: "Hashkivenu.mxl",
            mimeType: "application/octet-stream",
        })
        expect(t.mimeType).toBe("application/vnd.recordare.musicxml+xml")
        expect(t.originalFileName).toBe("Hashkivenu.mxl")
        expect(t.conversion).toBeNull()
    })

    it("keeps octet-stream for unknown non-music bytes", () => {
        const t = deriveDriveUploadTyping("x", {
            name: "Mystery.bin",
            mimeType: "application/octet-stream",
        })
        expect(t.mimeType).toBe("application/octet-stream")
    })

    it("names an id-only file drive-<id> and defaults its mime to pdf", () => {
        const t = deriveDriveUploadTyping("abc123", { name: null, mimeType: null })
        expect(t.driveName).toBe("drive-abc123")
        expect(t.mimeType).toBe("application/pdf")
    })

    it("types an Office .docx as pdf with a .pdf filename", () => {
        const t = deriveDriveUploadTyping("x", {
            name: "Adon Olam.docx",
            mimeType: DOCX,
        })
        expect(t.conversion).toBe("copy")
        expect(t.mimeType).toBe("application/pdf")
        expect(t.originalFileName).toBe("Adon Olam.pdf")
    })
})

describe("classifyDriveFailure", () => {
    it("classifies by status code and by message text", () => {
        expect(classifyDriveFailure({ status: 404, message: "nope" }).code).toBe(
            "drive_not_found",
        )
        expect(classifyDriveFailure(new Error("permission denied")).code).toBe(
            "drive_forbidden",
        )
        expect(classifyDriveFailure(new Error("kaboom")).code).toBe("drive_error")
        expect(classifyDriveFailure(new Error("kaboom")).message).toBe("kaboom")
    })
})
