import { describe, expect, it } from "vitest"
import {
    houseChartHtml,
    lineHtml,
    lyricOf,
    MODEH_ANI_SAMPLE,
    parseChordProLine,
} from "@/lib/chart-render/house-chart-html"

describe("parseChordProLine", () => {
    it("anchors each chord to the chunk that follows it", () => {
        expect(parseChordProLine("[Cm]Modeh [G]ani")).toEqual([
            { chord: "Cm", text: "Modeh " },
            { chord: "G", text: "ani" },
        ])
    })
    it("keeps leading text as a chord-less unit and reproduces the lyric exactly", () => {
        const units = parseChordProLine("melech [A♭]v'[B♭]ka[Cm]yam,")
        expect(units[0]).toEqual({ chord: null, text: "melech " })
        expect(lyricOf(units)).toBe("melech v'kayam,")
    })
    it("gives a trailing chord a space to hang on", () => {
        expect(parseChordProLine("cha[B♭ E♭]")).toEqual([
            { chord: null, text: "cha" },
            { chord: "B♭ E♭", text: " " },
        ])
    })
    it("a line with no chords is one plain unit", () => {
        expect(parseChordProLine("Ki anu amecha")).toEqual([{ chord: null, text: "Ki anu amecha" }])
    })
})

describe("lineHtml", () => {
    it("emits the chart_lib.py unit markup and escapes HTML", () => {
        expect(lineHtml(parseChordProLine("[C]a <b> [G]c"))).toBe(
            '<span class="u"><span class="c">C</span>a &lt;b&gt; </span><span class="u"><span class="c">G</span>c</span>',
        )
    })
})

describe("houseChartHtml", () => {
    const html = houseChartHtml(MODEH_ANI_SAMPLE)
    it("has the header, key/meter, subtitle, rule and footer", () => {
        expect(html).toContain("<h1>Modeh Ani</h1>")
        expect(html).toContain('<div class="km">Cm · 4/4</div>')
        expect(html).toContain('<p class="sub">Shirei T&#39;shuvah'.replace("&#39;", "'"))
        expect(html).toContain('<hr class="rule">')
        expect(html).toContain("<span>Central Reform Congregation</span><span>centralreform.live</span>")
    })
    it("renders both progression boxes side by side with repeat signs", () => {
        expect(html.match(/<div class="progcell">/g)?.length).toBe(2)
        expect(html).toContain('<div class="plabel">B  ×2</div>')
        expect(html).toContain('<span class="rep">&#8214;:</span><span>E♭</span><span class="bar">|</span>')
    })
    it("numbers stanzas only when a section has more than one", () => {
        expect(html).toContain('<div class="snum"></div>')
        const multi = houseChartHtml({
            title: "T",
            sections: [{ stanzas: [{ lines: ["a"] }, { lines: ["b"] }] }],
        })
        expect(multi).toContain('<div class="snum">1</div>')
        expect(multi).toContain('<div class="snum">2</div>')
    })
    it("omits optional blocks cleanly", () => {
        const bare = houseChartHtml({ title: "Bare", sections: [{ stanzas: [{ lines: ["[C]x"] }] }] })
        expect(bare).not.toContain('<div class="progrow">')
        expect(bare).not.toContain('class="cap"')
        expect(bare).not.toContain('class="note"')
        expect(bare).not.toContain('class="sub"')
    })
})
