import { describe, it, expect } from "vitest"
import { annotateCharts, type DraftRow } from "../draft"
import { buildReadback } from "../readback"

const row = (index: number, fileId: string, key: string | null): DraftRow => ({
    index,
    label: `Row ${index}`,
    type: "song",
    slotKey: null,
    fileId,
    chartName: "Chart",
    key,
    tier: "usual",
    phrase: null,
    filled: true,
    track: {},
})
const libOf = (...r: Array<{ fileId: string; key?: string | null; status?: string; mimeType?: string }>) =>
    new Map(r.map((x) => [x.fileId, { name: x.fileId, key: x.key ?? null, setting: null, partGroup: null, ...x }]))

describe("annotateCharts (MCP-09, MCP-11)", () => {
    it("records writtenKey and warns on a played key that differs on a PDF", () => {
        const rows = [row(0, "pdf", "E")]
        const w = annotateCharts(rows, libOf({ fileId: "pdf", key: "D", mimeType: "application/pdf" }))
        expect(rows[0].writtenKey).toBe("D")
        expect(w.map((x) => [x.kind, x.index])).toEqual([["key_mismatch", 0]])
    })

    it("does not warn for MusicXML, a matching key, or an unknown written key", () => {
        const rows = [row(0, "xml", "E"), row(1, "same", "e"), row(2, "none", "E")]
        const w = annotateCharts(
            rows,
            libOf({ fileId: "xml", key: "D", mimeType: "application/vnd.recordare.musicxml+xml" }, { fileId: "same", key: "E" }, { fileId: "none" }),
        )
        expect(w).toEqual([])
    })

    it("warns dead_chart for an archived chart", () => {
        const rows = [row(0, "dead", null)]
        expect(annotateCharts(rows, libOf({ fileId: "dead", status: "archived" })).map((x) => x.kind)).toEqual(["dead_chart"])
    })
})

describe("readback warnings (MCP-08, MCP-09, MCP-11)", () => {
    const base = { profileLabel: "Daniel Shabbat morning", date: "2026-11-07", book: null, special: false, openItems: [], now: new Date("2026-11-01") }
    const songRow = { index: 0, label: "Mi Chamocha", isSong: true, hasChart: true, tier: "usual" as const, phrase: "the usual", keyOnRecord: true }

    it("says an existing setlist first", () => {
        const rb = buildReadback({ ...base, rows: [songRow], existing: [{ setlistId: "s1", name: "Shabbat Nov 7" }] })
        expect(rb.exceptions[0].kind).toBe("existing")
        expect(rb.text.indexOf("Shabbat Nov 7")).toBeLessThan(rb.text.indexOf("Everything else"))
    })

    it("lists key_mismatch and dead_chart rows as exceptions", () => {
        const rb = buildReadback({ ...base, rows: [{ ...songRow, keyMismatch: "played in E, written in D" }, { ...songRow, index: 1, deadChart: "archived" }] })
        expect(rb.exceptions.map((e) => e.kind)).toEqual(["key_mismatch", "dead_chart"])
    })
})
