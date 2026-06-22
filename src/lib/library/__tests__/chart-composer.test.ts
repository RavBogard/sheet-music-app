import { describe, it, expect } from "vitest"
import { splitChartComposer } from "../chart-composer"

describe("splitChartComposer", () => {
    it("splits a trailing composer parenthetical (AC-1)", () => {
        expect(splitChartComposer("Hashkivenu (Klepper-Freelander)")).toEqual({
            title: "Hashkivenu",
            composer: "Klepper-Freelander",
        })
    })

    it("returns no composer when there is no parenthetical (AC-1)", () => {
        expect(splitChartComposer("Adon Olam")).toEqual({ title: "Adon Olam" })
    })

    it("treats an empty/whitespace parenthetical as no composer, keeping the raw name (AC-1)", () => {
        expect(splitChartComposer("Shalom Rav ()")).toEqual({
            title: "Shalom Rav ()",
        })
        expect(splitChartComposer("Shalom Rav (   )")).toEqual({
            title: "Shalom Rav (   )",
        })
    })

    it("only treats the TRAILING parenthetical as composer; inner parens stay in the title (AC-1)", () => {
        expect(splitChartComposer("Adon Olam (fast) (Friedman)")).toEqual({
            title: "Adon Olam (fast)",
            composer: "Friedman",
        })
    })

    it("keeps an inner-only parenthetical in the title (no trailing group)", () => {
        // "(fast)" is trailing here, so per the rule it IS the composer slot.
        expect(splitChartComposer("Adon Olam (fast)")).toEqual({
            title: "Adon Olam",
            composer: "fast",
        })
    })

    it("trims surrounding whitespace in title and composer", () => {
        expect(splitChartComposer("  Mi Chamocha   (  Steinberg )  ")).toEqual({
            title: "Mi Chamocha",
            composer: "Steinberg",
        })
    })

    it("handles a bare parenthetical with no title as raw (sparse-safe)", () => {
        expect(splitChartComposer("(Anon)")).toEqual({ title: "(Anon)" })
    })

    it("handles empty input", () => {
        expect(splitChartComposer("")).toEqual({ title: "" })
    })
})
