import { describe, it, expect } from "vitest"
import { rabbiNames, rabbiMatches } from "../rabbi-names"

describe("rabbiNames", () => {
    it("decodes entities, drops notes and splits on & and /", () => {
        expect(
            rabbiNames("Rabbi Daniel Bogard &amp; Karen Bogard (Rabbi Randy — Torah service)"),
        ).toEqual(["Rabbi Daniel Bogard", "Karen Bogard"])
        expect(rabbiNames("Rabbi Randy / Rabbi Daniel")).toEqual(["Rabbi Randy", "Rabbi Daniel"])
    })

    it("collapses a doubled title and trims", () => {
        expect(rabbiNames("  Rabbi Rabbi Daniel Bogard ")).toEqual(["Rabbi Daniel Bogard"])
    })

    it("returns nothing for non-strings and blanks", () => {
        expect(rabbiNames(undefined)).toEqual([])
        expect(rabbiNames("  ")).toEqual([])
    })

    it("matches a chip against any named person, case-insensitively", () => {
        expect(rabbiMatches("Rabbi Daniel Bogard &amp; Karen Bogard", "rabbi daniel bogard")).toBe(true)
        expect(rabbiMatches("Rabbi Randy", "Rabbi Daniel Bogard")).toBe(false)
    })
})
