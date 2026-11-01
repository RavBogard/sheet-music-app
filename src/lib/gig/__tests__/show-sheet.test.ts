// @vitest-environment node
//
// BET-5 (B5b): the show sheet is ONE page from the print route, whatever the
// length of the set list, with the gig, the sets and their totals on it; and a
// print with no band fields (every CRC packet today) draws no set lengths.
import { beforeAll, describe, expect, it, vi } from "vitest"
import { getDocumentProxy } from "unpdf"

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(),
    getFirestore: () => ({
        collection: () => ({ doc: () => ({ get: async () => ({ exists: false }), collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) }) }),
    }),
    getStorage: () => ({
        bucket: () => ({ file: () => ({ exists: async () => [false], save: async () => undefined }) }),
    }),
}))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

let generatePrintPdf: typeof import("@/lib/print-pipeline").generatePrintPdf
type Req = import("@/lib/print-pipeline").PrintRequest

beforeAll(async () => {
    generatePrintPdf = (await import("@/lib/print-pipeline")).generatePrintPdf
})

async function textOf(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
    const doc = await getDocumentProxy(new Uint8Array(bytes))
    const out: string[] = []
    for (let p = 1; p <= doc.numPages; p++) {
        const content = await (await doc.getPage(p)).getTextContent()
        for (const it of content.items as Array<{ str?: string }>) if (it.str?.trim()) out.push(it.str)
    }
    return { pages: doc.numPages, text: out.join("\n") }
}

const song = (title: string, extra: Partial<Req["tracks"][number]> = {}) => ({ title, key: "G", notes: "", type: "song", ...extra })

describe("BET-5 show sheet", () => {
    it("is one page with the gig, the sets, their totals and the lead singer's key", async () => {
        const req: Req = {
            title: "Winter Show",
            date: "Saturday, December 5, 2026",
            org: "brotherslazaroff",
            showSheet: true,
            coverOnly: true,
            gig: { venue: "The Hall", address: "1 Main St", loadIn: "17:00", start: "20:00", end: "23:00", setTargets: [{ headerRowId: "h1", minutes: 5 }] },
            tracks: [
                { id: "h1", title: "Set 1", key: "", notes: "", type: "header" },
                song("Opener", { durationSec: 240, segue: true, leadMusician: "Sam", singerKeys: [{ musician: "Sam", key: "Bb" }] }),
                song("Second", { durationSec: 125 }),
                song("Third"),
            ],
        }
        const { pdf } = await generatePrintPdf(req)
        const { pages, text } = await textOf(pdf)
        expect(pages).toBe(1)
        expect(text).toContain("Brothers Lazaroff")
        expect(text).toContain("The Hall · 1 Main St")
        expect(text).toContain("Load-in 17:00")
        expect(text).toMatch(/Show 20:00.23:00/)
        expect(text).toContain("SET 1")
        expect(text).toMatch(/6:05 · target 5:00 · 1 untimed/)
        expect(text).toContain("1:05 over")
        expect(text).toContain("Bb")
        expect(text).toContain("4:00")
        expect(text).toContain("Total 6:05")
    })

    it("stays one page for a very long list, counting what does not fit", async () => {
        const tracks = Array.from({ length: 120 }, (_, i) => song(`Song ${i + 1}`, { durationSec: 180 }))
        const { pdf } = await generatePrintPdf({ title: "Long", date: "d", org: "brotherslazaroff", showSheet: true, tracks })
        const { pages, text } = await textOf(pdf)
        expect(pages).toBe(1)
        expect(text).toMatch(/\+\d+ more songs/)
    })

    it("a cover with no band fields draws no set lengths or gig total", async () => {
        const { pdf } = await generatePrintPdf({
            title: "Friday",
            date: "d",
            coverOnly: true,
            tracks: [{ title: "Opening", key: "", notes: "", type: "header" }, song("Lecha Dodi")],
        })
        const { text } = await textOf(pdf)
        expect(text).not.toContain("Total")
        expect(text).not.toContain("untimed")
    })

    it("a cover with lengths shows each set's length and the gig total", async () => {
        const { pdf } = await generatePrintPdf({
            title: "Gig",
            date: "d",
            coverOnly: true,
            tracks: [{ title: "Set 1", key: "", notes: "", type: "header" }, song("A", { durationSec: 200 }), song("B", { durationSec: 100 })],
        })
        const { text } = await textOf(pdf)
        expect(text).toContain("5:00")
        expect(text).toContain("Total 5:00")
    })
})
