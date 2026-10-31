import { describe, it, expect } from "vitest"
import { rabbiNames, rabbiMatches } from "../rabbi-names"

describe("rabbiNames", () => {
    it("decodes entities, drops notes, splits on & / , and 'and', and reduces to the person", () => {
        expect(
            rabbiNames("Rabbi Daniel Bogard &amp; Karen Bogard (Rabbi Randy — Torah service)"),
        ).toEqual(["Daniel", "Karen"])
        expect(rabbiNames("Rabbi Randy / Rabbi Daniel")).toEqual(["Randy", "Daniel"])
        expect(rabbiNames("Rabbi Daniel and Karen")).toEqual(["Daniel", "Karen"])
    })

    it("one chip per person whatever the variant (doubled title, surname, none)", () => {
        const all = ["Rabbi Daniel", "Rabbi Daniel Bogard", "  Rabbi Rabbi Daniel Bogard ", "Daniel"].flatMap(rabbiNames)
        expect(new Set(all)).toEqual(new Set(["Daniel"]))
        expect(rabbiNames("Rabbi Rabbi Karen Kriger Bogard")).toEqual(["Karen"])
        expect(rabbiNames("Rabbi Randy Fleisher")).toEqual(["Randy"])
    })

    it("returns nothing for non-strings and blanks", () => {
        expect(rabbiNames(undefined)).toEqual([])
        expect(rabbiNames("  ")).toEqual([])
        expect(rabbiNames("Rabbi")).toEqual([])
    })

    it("a person's chip matches every raw variant of that person", () => {
        for (const raw of ["Rabbi Daniel Bogard &amp; Karen Bogard", "Rabbi Rabbi Daniel Bogard", "Rabbi Karen / Daniel", "Rabbi Daniel and Karen"]) {
            expect(rabbiMatches(raw, "Daniel")).toBe(true)
        }
        expect(rabbiMatches("Rabbi Randy", "Daniel")).toBe(false)
        expect(rabbiMatches("Rabbi Karen Kriger Bogard", "karen")).toBe(true)
    })
})
