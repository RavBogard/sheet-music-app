// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { createHash } from "node:crypto"
import { renderServiceSheetPdf, type ServiceSheetInput } from "../service-sheet-pdf"

/**
 * Byte-level golden for the English/transliteration service sheet.
 *
 * The Hebrew path (embedded Alef TTF, bidi reordering) must never leak into a
 * sheet with no Hebrew in it: CRC's printed sheet stays byte-identical. pdf-lib
 * stamps CreationDate/ModDate from `new Date()`, so only Date is faked —
 * pdf-lib's save() yields via setTimeout, which must stay real.
 *
 * If this fails after an intentional layout change, re-derive the hash and say
 * why in the commit; never "update the snapshot" to get a Hebrew change green.
 */

const GOLDEN_SHA256 = "58da52d8be1d19c64493e77a1d6703f1b6e1d5f8246308694e7a8158cbe29a87"

const INPUT: ServiceSheetInput = {
    setlistName:
        "Erev Shabbat Family Service with the Junior Choir and the Brothers Lazaroff Band — Special Edition",
    eventDate: "2026-09-04",
    rabbi: "Rabbi Daniel",
    book: "crc-friday",
    bookTitle: "CRC Friday Siddur",
    sectionLabel: "Order of service",
    tracks: [
        { id: "h1", title: "Opening", type: "header" },
        {
            id: "t1",
            title: "Welcome Song",
            type: "song",
            performer: "Band",
            leadMusician: "Randy",
            liturgyRef: { book: "crc-friday", folio: 12 },
        },
        {
            id: "t2",
            title: "Candle lighting with the families of the third grade class and their “friends”",
            type: "reading",
            description: "Families come up from the front rows; ushers hand out the matches beforehand.",
            liturgyRef: { book: "crc-friday", unitId: "u2", folio: 134 },
            honors: [
                { name: "Sarah Cohen", note: "candles" },
                { name: "David Levi" },
            ],
        },
        {
            id: "t3",
            title: "Band Feature",
            type: "song",
            honors: [{ name: "Noa Katz", note: "reader" }],
        },
        { id: "t4", type: "song" },
    ],
}

describe("renderServiceSheetPdf — English golden bytes", () => {
    beforeAll(() => {
        vi.useFakeTimers({ toFake: ["Date"] })
        vi.setSystemTime(new Date("2026-09-01T12:00:00Z"))
    })
    afterAll(() => {
        vi.useRealTimers()
    })

    it("is byte-identical to the pinned render", async () => {
        const bytes = await renderServiceSheetPdf(INPUT)
        const sha = createHash("sha256").update(bytes).digest("hex")
        expect(sha).toBe(GOLDEN_SHA256)
    })

    it("is deterministic across two renders", async () => {
        const a = await renderServiceSheetPdf(INPUT)
        const b = await renderServiceSheetPdf(INPUT)
        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    })
})
