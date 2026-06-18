// @vitest-environment node
// Integration regression for the P0 gig-packet text-chart fix: the website
// print pipeline (generatePrintPdf) used to silently DROP text/plain charts
// (PDFDocument.load throws on text bytes → caught → skipped), so a Full Packet
// for an all-text set (Camp Sabra) came out as a cover page with zero charts.
// This proves the text branch now renders them into the packet.
import { describe, it, expect, vi } from "vitest"
import { PDFDocument } from "pdf-lib"

vi.mock("@/lib/file-fetcher", () => ({
    fetchFileById: vi.fn(async () => ({
        buffer: Buffer.from(
            ["Verse 1", "C       G", "Hello   world", "Am      F", "this is the song"].join("\n"),
        ),
        contentType: "text/plain",
        source: "firebase-storage",
    })),
}))

// Firestore: config read misses (default footer); chordData empty; getAll empty.
// Storage: result-cache miss + no-op save.
vi.mock("@/lib/firebase-admin", () => {
    const subColl = { get: async () => ({ empty: true, forEach: () => {} }) }
    const docRef = {
        get: async () => ({ exists: false, data: () => undefined }),
        collection: () => subColl,
    }
    const coll = { doc: () => docRef }
    return {
        initAdmin: () => true,
        getFirestore: () => ({ collection: () => coll, getAll: async () => [] }),
        getStorage: () => ({
            bucket: () => ({
                file: () => ({
                    exists: async () => [false],
                    save: async () => undefined,
                    download: async () => [Buffer.from("")],
                }),
            }),
        }),
    }
})

import { generatePrintPdf, PrintRequest } from "../print-pipeline"

describe("generatePrintPdf — text/plain chart branch (P0 fix)", () => {
    const baseReq = (overrides: Partial<PrintRequest> = {}): PrintRequest => ({
        title: "Camp Sabra — Staff Concert",
        date: "Saturday, June 20, 2026",
        coverOnly: false,
        tracks: [
            {
                title: "Shake It Off",
                key: "Bb",
                notes: "",
                fileId: "upload-text-1",
                mimeType: "text/plain",
                type: "song",
            },
        ],
        ...overrides,
    })

    it("AC-1: renders the text chart into the packet instead of dropping it", async () => {
        const res = await generatePrintPdf(baseReq())
        // Was 0 before the fix (chart silently skipped); now 1.
        expect(res.stats.appendedTracks).toBe(1)
        const doc = await PDFDocument.load(res.pdf)
        // Cover page + at least one rendered chart page.
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    })

    it("AC-2: a transposed text chart still renders (per-musician packet)", async () => {
        const res = await generatePrintPdf(
            baseReq({
                tracks: [
                    {
                        title: "Shake It Off",
                        key: "Bb",
                        notes: "",
                        fileId: "upload-text-1",
                        mimeType: "text/plain",
                        type: "song",
                        transposition: 2,
                    },
                ],
            }),
        )
        expect(res.stats.appendedTracks).toBe(1)
        const doc = await PDFDocument.load(res.pdf)
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    })
})
