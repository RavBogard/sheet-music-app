import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * Storage-canonical cutover (Lane A — storage-canonical-migration-PLAN.md §2.3).
 *
 * The Drive fallback (byte fetch + metadata probe) must only run for ids that
 * are actually Google Drive file ids. `upload-{uuid}` and bare-UUID rows have no
 * Drive backing, so a Drive round-trip on them can only ever 404 — pure dead
 * weight (and a slow hop on every click of one of the ~295 orphaned bare-UUID
 * charts). After the cutover those ids resolve to a fast Storage-miss with no
 * Drive hop; real Drive ids keep the fallback unchanged.
 */

const mockDownloadFromStorage = vi.fn()
const mockFileExistsInStorage = vi.fn()
const mockGetFileWithMime = vi.fn()
const mockGetFileMetadata = vi.fn()

vi.mock("@/lib/firebase-storage", () => ({
    downloadFromStorage: (...args: unknown[]) => mockDownloadFromStorage(...args),
    fileExistsInStorage: (...args: unknown[]) => mockFileExistsInStorage(...args),
}))

vi.mock("@/lib/google-drive", () => ({
    DriveClient: class {
        getFileWithMime = (...args: unknown[]) => mockGetFileWithMime(...args)
        getFileMetadata = (...args: unknown[]) => mockGetFileMetadata(...args)
    },
}))

import { fetchFileById, getChartHealth } from "@/lib/file-fetcher"

// The exact repro from the PLAN: a pre-atomic-guard local_upload orphan.
const BARE_UUID = "72a7aa6a-7b08-4c78-862c-197bbffb9515"
// A real Google Drive file id (no UUID hyphen pattern).
const DRIVE_ID = "17TDzffOQT4ohO2p7yQCudUTYbj1tRg28"

const STORAGE_MISS = { success: false, reason: "not_found", message: "Not in Storage" }

describe("fetchFileById — Drive fallback id-shape gate (Lane A cutover)", () => {
    beforeEach(() => {
        mockDownloadFromStorage.mockReset()
        mockGetFileWithMime.mockReset()
        mockGetFileMetadata.mockReset()
    })

    it("bare-UUID Storage miss → null fast, NO Drive hop", async () => {
        mockDownloadFromStorage.mockResolvedValueOnce(STORAGE_MISS)
        const r = await fetchFileById(BARE_UUID, "application/pdf")
        expect(r).toBeNull()
        expect(mockGetFileWithMime).not.toHaveBeenCalled()
    })

    it("bare-UUID with extension suffix Storage miss → null fast, NO Drive hop", async () => {
        mockDownloadFromStorage.mockResolvedValueOnce(STORAGE_MISS)
        const r = await fetchFileById(`${BARE_UUID}.pdf`, "application/pdf")
        expect(r).toBeNull()
        expect(mockGetFileWithMime).not.toHaveBeenCalled()
    })

    it("upload- Storage miss → null fast, NO Drive hop", async () => {
        mockDownloadFromStorage.mockResolvedValueOnce(STORAGE_MISS)
        const r = await fetchFileById("upload-001c4dd1-aaaa-bbbb-cccc-ddddeeeeffff", undefined)
        expect(r).toBeNull()
        expect(mockGetFileWithMime).not.toHaveBeenCalled()
    })

    it("real Drive id Storage miss → Drive fallback STILL runs (regression guard)", async () => {
        mockDownloadFromStorage.mockResolvedValueOnce(STORAGE_MISS)
        mockGetFileWithMime.mockResolvedValueOnce({
            data: new ArrayBuffer(8),
            mimeType: "application/pdf",
            resolvedFileId: DRIVE_ID,
        })
        const r = await fetchFileById(DRIVE_ID, undefined)
        expect(r?.source).toBe("google-drive-fallback")
        expect(mockGetFileWithMime).toHaveBeenCalledWith(DRIVE_ID)
    })
})

describe("getChartHealth — Drive probe id-shape gate (Lane A cutover)", () => {
    beforeEach(() => {
        mockFileExistsInStorage.mockReset()
        mockGetFileMetadata.mockReset()
    })

    it("bare-UUID Storage miss → missing, NO Drive metadata probe", async () => {
        mockFileExistsInStorage.mockResolvedValueOnce({ success: true, data: false })
        const r = await getChartHealth(BARE_UUID, "application/pdf")
        expect(r.status).toBe("missing")
        if (r.status === "missing") {
            expect(r.reason).toContain("Not in Storage")
            expect(r.reason).not.toContain("Drive 404")
        }
        expect(mockGetFileMetadata).not.toHaveBeenCalled()
    })

    it("real Drive id Storage miss → still probes Drive (needs_storage_sync, regression guard)", async () => {
        mockFileExistsInStorage.mockResolvedValueOnce({ success: true, data: false })
        mockGetFileMetadata.mockResolvedValueOnce({ mimeType: "application/pdf" })
        const r = await getChartHealth(DRIVE_ID, undefined)
        expect(r.status).toBe("needs_storage_sync")
        expect(mockGetFileMetadata).toHaveBeenCalledWith(DRIVE_ID)
    })
})
