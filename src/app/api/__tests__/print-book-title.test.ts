/**
 * Phase 4 fix wave, Finding 2 — the gig packet printed `p. 12` and named no
 * book anywhere.
 *
 * `PrintRequest` had no book field and neither print route read `setlist.book`,
 * while both sibling renderers name it (the iPad's SetlistPerformClient and the
 * rabbi's pdf/service-sheet-pdf). A musician holding a Friday packet and a
 * Saturday packet got two unqualified page numbers for prayers the two books
 * carry at different pages.
 *
 * These assertions read the PrintRequest each route hands to the print
 * pipeline. The cover-page rendering of that field is proven separately in
 * src/lib/__tests__/print-pipeline-folio.test.ts.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"
import type { PrintRequest } from "@/lib/print-pipeline"

const mockVerifyIdToken = vi.fn()
const mockVerifyBearer = vi.fn()
const mockGetDoc = vi.fn()
const mockGetTracksForSetlist = vi.fn()
const mockGeneratePrintPdf = vi.fn()

vi.mock("@/lib/mcp/auth", () => ({
    verifyBearer: (...args: unknown[]) => mockVerifyBearer(...args),
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args),
    getFirestore: () => ({
        collection: () => ({
            doc: () => ({ get: async () => mockGetDoc() }),
        }),
    }),
}))

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock("@/lib/server-tracks", () => ({
    getTracksForSetlist: (...args: unknown[]) => mockGetTracksForSetlist(...args),
}))
vi.mock("@/lib/print-pipeline", () => ({
    generatePrintPdf: (...args: unknown[]) => mockGeneratePrintPdf(...args),
}))

/** The PrintRequest the route handed to the pipeline. */
const sentRequest = (): PrintRequest => mockGeneratePrintPdf.mock.calls[0][0] as PrintRequest

const setlistDoc = (data: Record<string, unknown>) => ({ exists: true, data: () => data })

// `crc-saturday` is a real slug in src/data/books/registry.json. The route must
// resolve it through @/lib/books/titles — NOT @/lib/books/registry, which
// statically imports every book's page JSON.
const SLUG = "crc-saturday"
const TITLE = "CRC Saturday Siddur"

describe("print routes forward the setlist's prayer book", () => {
    describe("GET /api/setlist/print/public", () => {
        let GET: (req: import("next/server").NextRequest) => Promise<Response>

        beforeAll(async () => {
            GET = (await import("@/app/api/setlist/print/public/route")).GET
        })

        beforeEach(() => {
            vi.clearAllMocks()
            mockGetTracksForSetlist.mockResolvedValue([])
            mockGeneratePrintPdf.mockResolvedValue({
                pdf: new Uint8Array([1, 2, 3]),
                stats: { appendedTracks: 0, transposedTracks: 0 },
            })
        })

        it("resolves setlist.book to its display title", async () => {
            mockGetDoc.mockResolvedValue(setlistDoc({ name: "Shabbat Morning", book: SLUG }))

            const res = await GET(makeReq("/api/setlist/print/public?setlistId=s1"))

            expect(res.status).toBe(200)
            expect(sentRequest().bookTitle).toBe(TITLE)
        })

        it("sends undefined — never a placeholder — when the setlist names no book", async () => {
            mockGetDoc.mockResolvedValue(setlistDoc({ name: "Shabbat Morning" }))

            await GET(makeReq("/api/setlist/print/public?setlistId=s1"))

            expect(sentRequest().bookTitle).toBeUndefined()
        })

        it("sends undefined for a slug that is not in the registry", async () => {
            mockGetDoc.mockResolvedValue(setlistDoc({ name: "Shabbat Morning", book: "no-such-book" }))

            await GET(makeReq("/api/setlist/print/public?setlistId=s1"))

            expect(sentRequest().bookTitle).toBeUndefined()
        })
    })

    describe("GET /api/setlist/print/personal", () => {
        let GET: (req: import("next/server").NextRequest) => Promise<Response>

        beforeAll(async () => {
            GET = (await import("@/app/api/setlist/print/personal/route")).GET
        })

        beforeEach(() => {
            vi.clearAllMocks()
            mockVerifyIdToken.mockResolvedValue({ uid: "u-1", email: "m@example.com" })
            mockGetTracksForSetlist.mockResolvedValue([])
            mockGeneratePrintPdf.mockResolvedValue({
                pdf: new Uint8Array([1, 2, 3]),
                stats: { appendedTracks: 0, transposedTracks: 0 },
            })
        })

        it("resolves setlist.book to its display title", async () => {
            // The route reads the setlist doc first, then the user doc.
            mockGetDoc
                .mockResolvedValueOnce(setlistDoc({ name: "Shabbat Morning", book: SLUG }))
                .mockResolvedValueOnce(setlistDoc({ displayName: "David Lazaroff" }))

            const res = await GET(
                makeReq("/api/setlist/print/personal?setlistId=s1", { token: "firebase-id-token" }),
            )

            expect(res.status).toBe(200)
            expect(sentRequest().bookTitle).toBe(TITLE)
            // Regression guard: the personal packet still names its musician.
            expect(sentRequest().musicianName).toBe("David Lazaroff")
        })

        it("sends undefined — never a placeholder — when the setlist names no book", async () => {
            mockGetDoc
                .mockResolvedValueOnce(setlistDoc({ name: "Shabbat Morning" }))
                .mockResolvedValueOnce(setlistDoc({ displayName: "David Lazaroff" }))

            await GET(
                makeReq("/api/setlist/print/personal?setlistId=s1", { token: "firebase-id-token" }),
            )

            expect(sentRequest().bookTitle).toBeUndefined()
        })
    })
})
