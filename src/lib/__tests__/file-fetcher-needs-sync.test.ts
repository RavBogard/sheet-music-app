import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * Cycle-3 NEW-5 (storage-canonical direction): `getChartHealth` must
 * return `{status: 'needs_storage_sync', reason: 'drive_only'}` for
 * charts that exist in Drive but not Firebase Storage. Read fallback
 * via `fetchFileById` still serves bytes; the metadata-only probe
 * surfaces the transient state for `verify_setlist_charts` callers.
 */

const mockFileExistsInStorage = vi.fn()
const mockDownloadFromStorage = vi.fn()
const mockGetFileMetadata = vi.fn()

vi.mock("@/lib/firebase-storage", () => ({
    fileExistsInStorage: (...args: unknown[]) =>
        mockFileExistsInStorage(...args),
    downloadFromStorage: (...args: unknown[]) =>
        mockDownloadFromStorage(...args),
}))

vi.mock("@/lib/google-drive", () => ({
    DriveClient: class {
        getFileMetadata = (...args: unknown[]) => mockGetFileMetadata(...args)
    },
}))

import { getChartHealth } from "@/lib/file-fetcher"

describe("getChartHealth — NEW-5 needs_storage_sync", () => {
    beforeEach(() => {
        mockFileExistsInStorage.mockReset()
        mockDownloadFromStorage.mockReset()
        mockGetFileMetadata.mockReset()
    })

    it("returns ok when Storage has the file", async () => {
        mockFileExistsInStorage.mockResolvedValueOnce({
            success: true,
            data: true,
        })
        const r = await getChartHealth("drive-id-1", "application/pdf")
        expect(r).toEqual({
            status: "ok",
            source: "firebase-storage",
            mimeType: "application/pdf",
        })
    })

    it("returns needs_storage_sync when Storage misses but Drive has metadata", async () => {
        mockFileExistsInStorage.mockResolvedValueOnce({
            success: true,
            data: false,
        })
        mockGetFileMetadata.mockResolvedValueOnce({
            mimeType: "application/pdf",
        })
        const r = await getChartHealth("drive-id-2", undefined)
        expect(r).toEqual({
            status: "needs_storage_sync",
            reason: "drive_only",
            mimeType: "application/pdf",
        })
    })

    it("returns missing when both Storage and Drive 404", async () => {
        mockFileExistsInStorage.mockResolvedValueOnce({
            success: true,
            data: false,
        })
        mockGetFileMetadata.mockRejectedValueOnce(
            new Error("File not found"),
        )
        const r = await getChartHealth("drive-id-3", undefined)
        expect(r.status).toBe("missing")
        if (r.status === "missing") {
            expect(r.reason).toContain("Not in Storage")
            expect(r.reason).toContain("Drive 404")
        }
    })

    it("upload- prefix never escalates to needs_storage_sync (no Drive backing)", async () => {
        mockFileExistsInStorage.mockResolvedValueOnce({
            success: true,
            data: false,
        })
        const r = await getChartHealth("upload-abc-123", undefined)
        expect(r.status).toBe("missing")
        // Drive metadata never consulted for upload-prefixed ids.
        expect(mockGetFileMetadata).not.toHaveBeenCalled()
    })

    it("Storage network blip surfaces as unreachable, not needs_storage_sync", async () => {
        mockFileExistsInStorage.mockResolvedValueOnce({
            success: false,
            reason: "network",
            message: "Bucket connect timeout",
        })
        const r = await getChartHealth("drive-id-4", undefined)
        expect(r.status).toBe("unreachable")
    })
})

describe("getChartHealth — BUG-002 shortcut_unresolved", () => {
    const SHORTCUT_MIME = "application/vnd.google-apps.shortcut"

    beforeEach(() => {
        mockFileExistsInStorage.mockReset()
        mockDownloadFromStorage.mockReset()
        mockGetFileMetadata.mockReset()
    })

    it("shortcut mimeType hint returns shortcut_unresolved WITHOUT probing Storage/Drive", async () => {
        const r = await getChartHealth("drive-id-shortcut", SHORTCUT_MIME)
        expect(r.status).toBe("shortcut_unresolved")
        if (r.status === "shortcut_unresolved") {
            expect(r.mimeType).toBe(SHORTCUT_MIME)
            expect(r.reason).toContain("library_index mimeType")
            // BUG-002 forward-compat: error mirrors reason for legacy
            // narrowing callers (reconcile-library.ts probeRow).
            expect(r.error).toBe(r.reason)
        }
        // The hint-based short-circuit MUST avoid the Storage/Drive probes.
        // Otherwise a Storage row that happens to hold stale shortcut bytes
        // would return ok and re-create the BUG-002 surprise.
        expect(mockFileExistsInStorage).not.toHaveBeenCalled()
        expect(mockGetFileMetadata).not.toHaveBeenCalled()
    })

    it("Drive metadata shortcut mime returns shortcut_unresolved (hint absent)", async () => {
        mockFileExistsInStorage.mockResolvedValueOnce({
            success: true,
            data: false,
        })
        mockGetFileMetadata.mockResolvedValueOnce({
            mimeType: SHORTCUT_MIME,
        })
        const r = await getChartHealth("drive-id-shortcut-2", undefined)
        expect(r.status).toBe("shortcut_unresolved")
        if (r.status === "shortcut_unresolved") {
            expect(r.mimeType).toBe(SHORTCUT_MIME)
            expect(r.reason).toContain("Drive metadata mimeType")
        }
    })

    it("Drive metadata with normal PDF mime still returns needs_storage_sync", async () => {
        mockFileExistsInStorage.mockResolvedValueOnce({
            success: true,
            data: false,
        })
        mockGetFileMetadata.mockResolvedValueOnce({
            mimeType: "application/pdf",
        })
        const r = await getChartHealth("drive-id-pdf", undefined)
        expect(r.status).toBe("needs_storage_sync")
    })
})
