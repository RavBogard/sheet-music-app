import { describe, it, expect } from "vitest"
import {
    mapUploadResultToItem,
    recomputeCounts,
    TERMINAL_ITEM_STATUSES,
} from "../batch-outcome"
import {
    newBatchId,
    newItemId,
    titleFromFileName,
    type UploadBatchItem,
    type ItemStatus,
} from "../batch-types"

function item(status: ItemStatus, i = 0): UploadBatchItem {
    return {
        itemId: `it-${i}`,
        fileName: `f${i}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 10,
        title: `f${i}`,
        status,
        updatedAt: "2026-09-10T00:00:00.000Z",
    }
}

describe("mapUploadResultToItem", () => {
    it("maps an ok result to imported + resultFileId", () => {
        expect(
            mapUploadResultToItem({
                ok: true,
                fileId: "file-123",
                title: "Shalom Rav",
                mimeType: "application/pdf",
                storageUrl: "gs://x/library/file-123.pdf",
                collection: "uploads",
            }),
        ).toEqual({ status: "imported", resultFileId: "file-123" })
    })

    it("maps a 409 duplicate_exact to parked with the matched row", () => {
        expect(
            mapUploadResultToItem({
                ok: false,
                status: 409,
                error: "Duplicate of Shalom Rav",
                code: "duplicate_exact",
                matchedFileId: "file-abc",
                matchedTitle: "Shalom Rav",
                score: 1,
            }),
        ).toEqual({
            status: "parked",
            parked: {
                reason: "duplicate_exact",
                matchedFileId: "file-abc",
                matchedTitle: "Shalom Rav",
                score: 1,
            },
        })
    })

    it("maps duplicate_similar with missing match fields to empty strings", () => {
        expect(
            mapUploadResultToItem({
                ok: false,
                status: 409,
                error: "Similar to something",
                code: "duplicate_similar",
            }),
        ).toEqual({
            status: "parked",
            parked: {
                reason: "duplicate_similar",
                matchedFileId: "",
                matchedTitle: "",
                score: undefined,
            },
        })
    })

    it("maps any other error to failed with code + message", () => {
        expect(
            mapUploadResultToItem({
                ok: false,
                status: 400,
                error: "Unsupported file type",
                code: "invalid_type",
            }),
        ).toEqual({
            status: "failed",
            error: { code: "invalid_type", message: "Unsupported file type" },
        })
    })
})

describe("mapUploadResultToItem field clearing", () => {
    // An item can be mapped more than once (a human forces a parked item, a
    // failure is retried). `updateItem` merges patches, so each patch has to
    // clear the sibling field explicitly or the stale one survives.
    it("clears parked and error on an import", () => {
        const patch = mapUploadResultToItem({
            ok: true,
            fileId: "file-123",
            title: "Shalom Rav",
            mimeType: "application/pdf",
            storageUrl: "gs://x/library/file-123.pdf",
            collection: "uploads",
        })
        expect("parked" in patch).toBe(true)
        expect(patch.parked).toBeUndefined()
        expect("error" in patch).toBe(true)
        expect(patch.error).toBeUndefined()
    })

    it("clears error when parking", () => {
        const patch = mapUploadResultToItem({
            ok: false,
            status: 409,
            error: "Similar to Shalom Rav",
            code: "duplicate_similar",
            matchedFileId: "file-abc",
            matchedTitle: "Shalom Rav",
            score: 0.9,
        })
        expect(patch.parked?.matchedFileId).toBe("file-abc")
        expect("error" in patch).toBe(true)
        expect(patch.error).toBeUndefined()
    })

    it("clears parked when failing", () => {
        const patch = mapUploadResultToItem({
            ok: false,
            status: 422,
            error: "MuseScore conversion failed",
            code: "convert_failed",
        })
        expect(patch.error).toEqual({
            code: "convert_failed",
            message: "MuseScore conversion failed",
        })
        expect("parked" in patch).toBe(true)
        expect(patch.parked).toBeUndefined()
    })
})

describe("recomputeCounts", () => {
    it("counts every bucket and folds the three in-flight statuses into pending", () => {
        const items: Record<string, UploadBatchItem> = {
            a: item("awaiting-bytes", 1),
            b: item("staged", 2),
            c: item("pending", 3),
            d: item("imported", 4),
            e: item("imported", 5),
            f: item("parked", 6),
            g: item("failed", 7),
            h: item("skipped", 8),
        }
        expect(recomputeCounts(items)).toEqual({
            total: 8,
            pending: 3,
            imported: 2,
            parked: 1,
            failed: 1,
            skipped: 1,
        })
    })

    it("returns all-zero counts for an empty map", () => {
        expect(recomputeCounts({})).toEqual({
            total: 0,
            pending: 0,
            imported: 0,
            parked: 0,
            failed: 0,
            skipped: 0,
        })
    })
})

describe("TERMINAL_ITEM_STATUSES", () => {
    it("is exactly the four settled statuses", () => {
        expect([...TERMINAL_ITEM_STATUSES].sort()).toEqual([
            "failed",
            "imported",
            "parked",
            "skipped",
        ])
    })
})

describe("titleFromFileName", () => {
    it("strips the extension and normalizes separators", () => {
        expect(titleFromFileName("Mi_Chamocha-Friedman (2).pdf")).toBe(
            "Mi Chamocha Friedman (2)",
        )
    })

    it("collapses separator runs and trims", () => {
        expect(titleFromFileName("  __Hashkivenu---Klepper__.musicxml  ")).toBe(
            "Hashkivenu Klepper",
        )
    })

    it("leaves an extensionless name alone apart from separators", () => {
        expect(titleFromFileName("Adon_Olam")).toBe("Adon Olam")
    })
})

describe("id helpers", () => {
    it("newBatchId is 'ub-' + 12 hex", () => {
        const id = newBatchId()
        expect(id).toMatch(/^ub-[0-9a-f]{12}$/)
        expect(id).toHaveLength(15)
        expect(newBatchId()).not.toBe(id)
    })

    it("newItemId is 'it-' + 8 hex", () => {
        const id = newItemId()
        expect(id).toMatch(/^it-[0-9a-f]{8}$/)
        expect(id).toHaveLength(11)
    })
})
