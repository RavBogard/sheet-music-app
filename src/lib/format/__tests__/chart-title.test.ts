import { describe, it, expect } from "vitest"
import { displayChartTitle } from "@/lib/format/chart-title"

describe("displayChartTitle", () => {
    it("strips a trailing .pdf", () => {
        expect(displayChartTitle("Oseh shalom - Nava tehila.pdf")).toBe(
            "Oseh shalom - Nava tehila",
        )
    })

    it("strips a trailing .docx (the BL home-typeset case)", () => {
        expect(displayChartTitle("Queen Jane Approximately.docx")).toBe(
            "Queen Jane Approximately",
        )
    })

    it("strips musicxml / mxl / xml / txt / doc", () => {
        expect(displayChartTitle("Hava.musicxml")).toBe("Hava")
        expect(displayChartTitle("Hava.mxl")).toBe("Hava")
        expect(displayChartTitle("Hava.xml")).toBe("Hava")
        expect(displayChartTitle("Hava.txt")).toBe("Hava")
        expect(displayChartTitle("Hava.doc")).toBe("Hava")
    })

    it("is case-insensitive", () => {
        expect(displayChartTitle("Song.PDF")).toBe("Song")
        expect(displayChartTitle("Song.DocX")).toBe("Song")
    })

    it("leaves a title with no chart extension unchanged", () => {
        expect(displayChartTitle("Adonai Sifatai")).toBe("Adonai Sifatai")
    })

    it("preserves a mid-title dot — only a trailing known extension is stripped", () => {
        expect(displayChartTitle("Lecha Dodi (v2)")).toBe("Lecha Dodi (v2)")
        expect(displayChartTitle("Russian Sher No. 3")).toBe("Russian Sher No. 3")
    })

    it("is idempotent", () => {
        const once = displayChartTitle("Wagon Wheel.pdf")
        expect(displayChartTitle(once)).toBe(once)
    })

    it("handles empty / non-string input defensively", () => {
        expect(displayChartTitle("")).toBe("")
        expect(displayChartTitle("   ")).toBe("")
        // param is `unknown` — non-string is accepted and handled defensively
        expect(displayChartTitle(undefined)).toBe("")
        expect(displayChartTitle(null)).toBe("")
    })
})
