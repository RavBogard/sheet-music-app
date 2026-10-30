import { describe, expect, it } from "vitest"

import {
    canonicalFileIds,
    deriveSetlistCounts,
    sameFileIds,
} from "../setlist-derived-counts"

describe("deriveSetlistCounts", () => {
    it("counts every row, counts untyped and song rows as songs, and lists charts sorted and de-duplicated", () => {
        const derived = deriveSetlistCounts([
            { type: "song", fileId: "z-chart" },
            { type: "header" },
            { fileId: "a-chart" },
            { type: "prayer", fileId: "m-chart" },
            { type: "song", fileId: "z-chart" },
            { type: "reading", fileId: "" },
        ])
        expect(derived).toEqual({
            trackCount: 6,
            songCount: 3,
            fileIds: ["a-chart", "m-chart", "z-chart"],
        })
    })

    it("is the same for any order of the same rows", () => {
        const rows = [{ fileId: "b" }, { fileId: "a" }, { fileId: "c" }]
        expect(canonicalFileIds(rows)).toEqual(canonicalFileIds([...rows].reverse()))
    })

    it("an empty setlist has zero counts and no charts", () => {
        expect(deriveSetlistCounts([])).toEqual({ trackCount: 0, songCount: 0, fileIds: [] })
    })
})

describe("sameFileIds", () => {
    it("treats a missing stored value as empty", () => {
        expect(sameFileIds(undefined, [])).toBe(true)
        expect(sameFileIds(undefined, ["a"])).toBe(false)
    })

    it("is order-sensitive so a track-ordered array is rewritten to the canonical order", () => {
        expect(sameFileIds(["a", "b"], ["a", "b"])).toBe(true)
        expect(sameFileIds(["b", "a"], ["a", "b"])).toBe(false)
    })
})
