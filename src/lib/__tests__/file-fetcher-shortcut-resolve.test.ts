import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * Cycle-5 C5C-006 — `fetchFileById` Drive-fallback path must report the
 * resolved target's mime, not the caller-supplied (potentially shortcut)
 * hint. Closes the "Lechu Goldman.pdf silently missing from every Friday
 * gig packet" bug: shortcut-bonded `library_index` rows store
 * `mimeType: application/vnd.google-apps.shortcut`, so the prior Drive-
 * fallback `contentType: mimeType || 'application/pdf'` line echoed the
 * shortcut mime even though `getFile` had transparently resolved the
 * target's PDF bytes — `generate_gig_packet` then routed real PDFs to
 * the "Unsupported content type" appendix branch.
 */

const mockDownloadFromStorage = vi.fn()
const mockFileExistsInStorage = vi.fn()
const mockGetFileWithMime = vi.fn()
const mockGetFile = vi.fn()
const mockGetFileMetadata = vi.fn()

vi.mock("@/lib/firebase-storage", () => ({
    downloadFromStorage: (...args: unknown[]) => mockDownloadFromStorage(...args),
    fileExistsInStorage: (...args: unknown[]) => mockFileExistsInStorage(...args),
}))

vi.mock("@/lib/google-drive", () => ({
    DriveClient: class {
        getFileWithMime = (...args: unknown[]) => mockGetFileWithMime(...args)
        getFile = (...args: unknown[]) => mockGetFile(...args)
        getFileMetadata = (...args: unknown[]) => mockGetFileMetadata(...args)
    },
}))

import { fetchFileById } from "@/lib/file-fetcher"

const SHORTCUT_MIME = "application/vnd.google-apps.shortcut"

describe("fetchFileById — C5C-006 Drive shortcut transparent-resolve", () => {
    beforeEach(() => {
        mockDownloadFromStorage.mockReset()
        mockFileExistsInStorage.mockReset()
        mockGetFileWithMime.mockReset()
        mockGetFile.mockReset()
        mockGetFileMetadata.mockReset()
    })

    it("Storage miss + shortcut-bonded row → Drive-fallback reports target PDF mime, not shortcut mime", async () => {
        // Storage 404 — typical for shortcut-bonded rows where Storage never
        // received a mirror copy of the target.
        mockDownloadFromStorage.mockResolvedValueOnce({
            success: false,
            reason: "not_found",
            message: "Not in Storage",
        })
        // Drive fallback: `getFileWithMime` resolves the shortcut and returns
        // the TARGET's PDF bytes + the TARGET's mime.
        const pdfBytes = new ArrayBuffer(8)
        new Uint8Array(pdfBytes).set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]) // %PDF-1.7
        mockGetFileWithMime.mockResolvedValueOnce({
            data: pdfBytes,
            mimeType: "application/pdf",
            resolvedFileId: "target-pdf-fileid",
        })

        // Caller passes the shortcut mime as the index hint — the bug
        // condition. The Drive fallback MUST NOT echo this hint back; the
        // resolved mime takes priority.
        const r = await fetchFileById("shortcut-source-fileid", SHORTCUT_MIME)

        expect(r).not.toBeNull()
        expect(r?.source).toBe("google-drive-fallback")
        expect(r?.contentType).toBe("application/pdf")
        expect(r?.contentType).not.toBe(SHORTCUT_MIME)
        expect(r?.buffer.byteLength).toBe(8)
        // Confirm we used the new method, not the legacy getFile path.
        expect(mockGetFileWithMime).toHaveBeenCalledWith("shortcut-source-fileid")
    })

    it("Storage miss + Drive resolved mime returns null → falls back to caller hint (if non-shortcut)", async () => {
        // Drive sometimes returns no mimeType (very rare; defensive path).
        mockDownloadFromStorage.mockResolvedValueOnce({
            success: false,
            reason: "not_found",
            message: "Not in Storage",
        })
        mockGetFileWithMime.mockResolvedValueOnce({
            data: new ArrayBuffer(4),
            mimeType: null,
            resolvedFileId: "x",
        })

        const r = await fetchFileById("some-fileid", "image/png")

        expect(r?.contentType).toBe("image/png")
        expect(r?.source).toBe("google-drive-fallback")
    })

    it("Storage miss + Drive resolved mime is shortcut (defensive) → falls back to non-shortcut hint or pdf", async () => {
        // Defensive: even if Drive somehow reported shortcut mime as the
        // resolved mime, we must NOT echo it. (Should not happen in practice
        // because `getFileWithMime` reads targetMimeType, but guard anyway.)
        mockDownloadFromStorage.mockResolvedValueOnce({
            success: false,
            reason: "not_found",
            message: "Not in Storage",
        })
        mockGetFileWithMime.mockResolvedValueOnce({
            data: new ArrayBuffer(4),
            mimeType: SHORTCUT_MIME,
            resolvedFileId: "x",
        })

        const r = await fetchFileById("some-fileid", undefined)
        expect(r?.contentType).toBe("application/pdf")
    })

    it("Storage hit → no Drive fallback called; contentType is Storage's", async () => {
        const buf = Buffer.from("storage-bytes")
        mockDownloadFromStorage.mockResolvedValueOnce({
            success: true,
            data: { buffer: buf, contentType: "application/pdf" },
        })

        const r = await fetchFileById("some-fileid", SHORTCUT_MIME)

        expect(r?.source).toBe("firebase-storage")
        expect(r?.contentType).toBe("application/pdf")
        expect(mockGetFileWithMime).not.toHaveBeenCalled()
        expect(mockGetFile).not.toHaveBeenCalled()
    })

    it("upload- prefix never escalates to Drive fallback (no Drive backing)", async () => {
        mockDownloadFromStorage.mockResolvedValueOnce({
            success: false,
            reason: "not_found",
            message: "Not in Storage",
        })

        const r = await fetchFileById("upload-abc-123", undefined)
        expect(r).toBeNull()
        expect(mockGetFileWithMime).not.toHaveBeenCalled()
    })

    it("Drive fallback throws → returns null (graceful failure)", async () => {
        mockDownloadFromStorage.mockResolvedValueOnce({
            success: false,
            reason: "not_found",
            message: "Not in Storage",
        })
        mockGetFileWithMime.mockRejectedValueOnce(new Error("Drive 404"))

        const r = await fetchFileById("missing-fileid", undefined)
        expect(r).toBeNull()
    })
})
