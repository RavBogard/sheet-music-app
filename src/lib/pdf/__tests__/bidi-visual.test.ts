// @vitest-environment node
import { describe, it, expect } from "vitest"
import { firstStrongDirection, hasHebrew, toVisual } from "../bidi-visual"

// Reverse code points (no marks involved) — the expected visual form of a pure
// RTL run.
const rev = (s: string) => Array.from(s).reverse().join("")

describe("hasHebrew / firstStrongDirection", () => {
    it("detects Hebrew letters and points", () => {
        expect(hasHebrew("שיר חדש")).toBe(true)
        expect(hasHebrew("Band ָ")).toBe(true)
        expect(hasHebrew("שׁ")).toBe(true)
        expect(hasHebrew("Welcome Song 12")).toBe(false)
        expect(hasHebrew(undefined)).toBe(false)
    })

    it("takes the first strong character", () => {
        expect(firstStrongDirection("12 שיר")).toBe("rtl")
        expect(firstStrongDirection("(Band) שיר")).toBe("ltr")
        expect(firstStrongDirection("12 - 34")).toBeNull()
        expect(firstStrongDirection("‏abc")).toBe("rtl")
    })
})

describe("toVisual", () => {
    it("leaves a line with no RTL text untouched", () => {
        const s = "Welcome Song (live) - p. 34, 10% [x2]"
        expect(toVisual(s)).toBe(s)
        expect(toVisual(s, { base: "ltr" })).toBe(s)
    })

    it("reverses a pure Hebrew line", () => {
        expect(toVisual("שיר חדש")).toBe(rev("שיר חדש"))
        expect(toVisual("להקה")).toBe("הקהל")
    })

    it("keeps numbers left-to-right inside RTL text", () => {
        expect(toVisual("שיר 12")).toBe("12 ריש")
        expect(toVisual("חזרה 3:30")).toBe("3:30 הרזח")
        expect(toVisual("להקה 10%")).toBe("10% הקהל")
        expect(toVisual("שיר 1,250 חדש")).toBe(`${rev("חדש")} 1,250 ${rev("שיר")}`)
    })

    it("keeps Latin words and 'p. 34' in order in an RTL line", () => {
        expect(toVisual("שיר p. 34")).toBe(`p. 34 ${rev("שיר")}`)
        expect(toVisual("להקה Band One חזרה")).toBe(`${rev("חזרה")} Band One ${rev("להקה")}`)
    })

    it("places a Hebrew run correctly in an LTR line", () => {
        expect(toVisual("Band - שיר חדש")).toBe(`Band - ${rev("שיר חדש")}`)
        expect(toVisual("Band - שיר חדש (live)")).toBe(`Band - ${rev("שיר חדש")} (live)`)
        expect(toVisual("דוד, שרה and Noa", { base: "ltr" })).toBe(
            `${rev("שרה")} ,${rev("דוד")} and Noa`,
        )
    })

    it("mirrors brackets inside RTL runs", () => {
        expect(toVisual("(שרה)")).toBe(`(${rev("שרה")})`)
        expect(toVisual("דוד (שרה)")).toBe(`(${rev("שרה")}) ${rev("דוד")}`)
        expect(toVisual("[להקה]")).toBe(`[${rev("להקה")}]`)
    })

    it("respects an explicit base direction", () => {
        // RTL paragraph that starts with Latin: the Latin run sits at the right.
        expect(toVisual("Band שיר", { base: "rtl" })).toBe(`${rev("שיר")} Band`)
        // Leading number in an RTL paragraph stays at the right end.
        expect(toVisual("12 שיר", { base: "rtl" })).toBe(`${rev("שיר")} 12`)
    })

    it("resolves neutrals between mixed runs to the paragraph direction", () => {
        // RTL base: the " - " between Hebrew and Latin belongs to the RTL flow.
        expect(toVisual("דוד - Band")).toBe(`Band - ${rev("דוד")}`)
    })

    it("keeps combining marks attached to their base letter", () => {
        // ד + dagesh + qamats, ו + hiriq, ד
        const logical = "דָּוִד"
        // Default: marks precede their letter in visual order (Alef's marks are
        // zero-advance and drawn in the box of the glyph that follows).
        expect(toVisual(logical)).toBe("ד" + "ִו" + "ָּד")
        // L3 variant: marks follow their letter.
        expect(toVisual(logical, { marksBeforeBase: false })).toBe(
            "ד" + "וִ" + "דָּ",
        )
        // Same code points, just reordered — nothing dropped.
        expect(Array.from(toVisual(logical)).sort()).toEqual(Array.from(logical).sort())
    })

    it("drops directional marks and explicit embedding controls", () => {
        expect(toVisual("‏שיר")).toBe(rev("שיר"))
        expect(toVisual("Band ‫שיר‬")).toBe(`Band ${rev("שיר")}`)
    })

    it("handles empty input", () => {
        expect(toVisual("")).toBe("")
    })
})
