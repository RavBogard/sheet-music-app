import { describe, it, expect } from "vitest"
import {
    isMusicRow,
    isPrintRowMode,
    rowsForSection,
    sectionsFor,
} from "../row-mode"

/**
 * `rows` — which rows a printed document carries (BIND-NOT-ADD addendum 2).
 *
 * The property worth protecting is that this is a printing choice and nothing
 * else. It filters a PDF; it never filters a setlist, a screen, or what anyone
 * is allowed to see.
 */

describe("isMusicRow", () => {
    it("counts a row with a chart, whatever its type", () => {
        expect(isMusicRow({ type: "prayer", fileId: "file-1" })).toBe(true)
        expect(isMusicRow({ type: "reading", fileId: "file-1" })).toBe(true)
    })

    it("counts a song with no chart — the band knows some by heart", () => {
        expect(isMusicRow({ type: "song", fileId: null })).toBe(true)
        expect(isMusicRow({ type: "song" })).toBe(true)
    })

    it("does not count spoken liturgy, headers or notes", () => {
        for (const type of ["prayer", "reading", "transition", "header", "note"]) {
            expect(isMusicRow({ type, fileId: null }), type).toBe(false)
        }
    })

    it("treats an empty fileId as no chart", () => {
        expect(isMusicRow({ type: "prayer", fileId: "" })).toBe(false)
    })
})

describe("sections", () => {
    it("gives one section for a single mode and two for both, order first", () => {
        expect(sectionsFor("music")).toEqual(["music"])
        expect(sectionsFor("full")).toEqual(["full"])
        expect(sectionsFor("both")).toEqual(["full", "music"])
    })

    it("keeps every row in the full section", () => {
        const rows = [
            { type: "header" },
            { type: "song", fileId: "f" },
            { type: "prayer" },
        ]
        expect(rowsForSection(rows, "full")).toEqual(rows)
    })

    it("keeps row ORDER when it narrows to music", () => {
        const rows = [
            { type: "header" },
            { type: "song", fileId: "a" },
            { type: "prayer" },
            { type: "song", fileId: "b" },
        ]
        expect(rowsForSection(rows, "music")).toEqual([
            { type: "song", fileId: "a" },
            { type: "song", fileId: "b" },
        ])
    })

    it("narrows to nothing rather than falling back to everything", () => {
        // A service with no sung rows prints an empty music section. Quietly
        // printing the whole order instead would be a surprise on a stand.
        const rows = [{ type: "prayer" }, { type: "reading" }]
        expect(rowsForSection(rows, "music")).toEqual([])
    })
})

describe("isPrintRowMode", () => {
    it("accepts the three modes and nothing else", () => {
        for (const v of ["music", "full", "both"]) expect(isPrintRowMode(v)).toBe(true)
        for (const v of ["", "MUSIC", "all", null, undefined, 1, {}]) {
            expect(isPrintRowMode(v)).toBe(false)
        }
    })
})
