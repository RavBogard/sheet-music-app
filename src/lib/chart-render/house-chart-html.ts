/**
 * House-style chord chart → HTML.
 *
 * A line-for-line port of `tools/crc_chart/chart_lib.py` (the "Ki Anu Amecha
 * (Trad)" look Daniel approved), so a chart Claude describes structurally in a
 * chat renders exactly like the charts drawn in Cowork. The CSS below IS the
 * Python CSS; do not "improve" it here — the look is the contract.
 *
 * The one hard-won rule carried over: a chord is anchored to its own lyric
 * chunk (`<span class="u"><span class="c">Cm</span>Modeh </span>`), never
 * positioned by character count, so alignment holds in any font.
 *
 * Input for lyric lines is ChordPro-style inline chords — `[Cm]Modeh [G]ani` —
 * which every LLM writes fluently and which is unambiguous. Chords are ALWAYS
 * the actual sounding chords (never capo shapes) — that is the author's job;
 * this module does not transpose.
 */

export const HOUSE_CSS = `
@page { size: Letter; margin: 0.72in 0.8in 0.6in 0.8in; }
* { box-sizing: border-box; }
body { font-family:"DejaVu Sans",sans-serif; color:#141414; margin:0;
       -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.hd { display:flex; align-items:baseline; gap:14px; }
h1 { font-size:34px; font-weight:700; margin:0; letter-spacing:-.5px; line-height:1.05; }
.km { margin-left:auto; font-size:16px; color:#7a7a7a; white-space:nowrap; letter-spacing:.5px; }
.sub { font-style:italic; color:#8d8d8d; font-size:12.5px; margin:5px 0 0; }
hr.rule { border:0; border-top:2.5px solid #111; margin:11px 0 16px; }
.progrow { display:flex; gap:14px; align-items:stretch; }
.progcell { flex:1 1 0; min-width:0; }
.plabel { font-size:11px; font-weight:700; color:#9C2B1E; letter-spacing:2.2px; margin:0 0 5px; }
.prog { background:#F5F2ED; border:1px solid #E4DFD6; border-radius:3px;
        padding:12px 14px; height:100%; display:flex; align-items:center; }
.bars { display:flex; align-items:center; flex-wrap:wrap; gap:0 7px; font-size:16px;
        font-weight:700; color:#9C2B1E; letter-spacing:.3px; }
.bars .bar { color:#B9B2A6; font-weight:400; padding:0 1px; }
.bars .rep { color:#111; font-weight:400; font-size:18px; }
.cap { font-style:italic; color:#8d8d8d; font-size:11.5px; margin:8px 0 22px; padding-left:2px; }
.slabel { font-size:11px; font-weight:700; color:#9C2B1E; letter-spacing:2.2px; margin:0 0 6px; }
.stanza { display:flex; gap:13px; margin:0 0 16px; page-break-inside:avoid; }
.snum { font-size:12px; color:#B4B4B4; padding-top:15px; min-width:13px; text-align:right; }
.lines { flex:1; }
.lyr { font-size:19px; line-height:1.34; margin:0 0 9px; padding-top:15px; }
.u { position:relative; display:inline-block; white-space:pre; }
.u > .c { position:absolute; top:-15px; left:0; white-space:nowrap;
          font-size:12.5px; font-weight:700; color:#9C2B1E; letter-spacing:.4px;
          font-family:"DejaVu Sans",sans-serif; line-height:1; }
.note { font-style:italic; color:#6f6f6f; font-size:12.5px; margin:18px 0 0;
        border-left:2px solid #E0DAD0; padding-left:11px; }
.ft { position:fixed; bottom:0; left:0; right:0; display:flex; font-size:10px; color:#9a9186; }
.ft span:last-child { margin-left:auto; }
`

export interface Progression {
    /** Box label, e.g. "A" or "B  ×2". */
    label: string
    /** One entry per bar, e.g. ["Cm", "Cm", "B♭", "A♭ B♭ Cm"]. */
    bars: string[]
    /** Wrap in repeat signs (default true). */
    repeat?: boolean
}

export interface Stanza {
    /** ChordPro lines: `[Cm]Modeh ani l'fanecha,` — one string per lyric line. */
    lines: string[]
}

export interface Section {
    /** Section label ("A", "B", "Chorus"); omit for none. */
    label?: string
    stanzas: Stanza[]
}

export interface HouseChart {
    title: string
    /** Right-hand header, e.g. "Cm · 4/4". Rendered as text (no HTML). */
    keyMeter?: string
    /** Italic line under the title, e.g. "Shirei T'shuvah p. 42 · Rosh HaShanah morning · folk". */
    subtitle?: string
    progressions?: Progression[]
    /** Italic caption under the progression boxes (form / roadmap). */
    caption?: string
    sections: Section[]
    /** Closing italic note with the left rule. */
    note?: string
    /** Footer left text (default "Central Reform Congregation"). */
    footerLeft?: string
    /** Footer right text (default "centralreform.live"). */
    footerRight?: string
}

export type ChordUnit = { chord: string | null; text: string }

export function esc(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}

/**
 * Parse one ChordPro line into (chord, chunk) units. Text before the first
 * chord becomes a chord-less unit. `[Cm]Modeh [G]ani` →
 * [{Cm,"Modeh "},{G,"ani"}]. Concatenating the chunks reproduces the lyric.
 */
export function parseChordProLine(line: string): ChordUnit[] {
    const units: ChordUnit[] = []
    const re = /\[([^\]]*)\]/g
    let last = 0
    let pendingChord: string | null = null
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
        const text = line.slice(last, m.index)
        if (text || pendingChord !== null) units.push({ chord: pendingChord, text })
        pendingChord = m[1].trim() || null
        last = re.lastIndex
    }
    const tail = line.slice(last)
    if (tail || pendingChord !== null) units.push({ chord: pendingChord, text: tail })
    // A chord with no following text (end of line) still needs a chunk to hang on.
    return units.map((u) => (u.text === "" ? { ...u, text: " " } : u))
}

export function lyricOf(units: ChordUnit[]): string {
    return units.map((u) => u.text).join("")
}

function barsHtml(bars: string[], repeat = true): string {
    const out: string[] = []
    if (repeat) out.push('<span class="rep">&#8214;:</span>')
    bars.forEach((b, i) => {
        if (i) out.push('<span class="bar">|</span>')
        out.push(`<span>${esc(b)}</span>`)
    })
    if (repeat) out.push('<span class="rep">:&#8214;</span>')
    return `<div class="bars">${out.join("")}</div>`
}

export function lineHtml(units: ChordUnit[]): string {
    return units
        .map((u) => {
            const c = u.chord ? `<span class="c">${esc(u.chord)}</span>` : ""
            return `<span class="u">${c}${esc(u.text)}</span>`
        })
        .join("")
}

export function houseChartHtml(chart: HouseChart): string {
    const progs = (chart.progressions ?? [])
        .map(
            (p) =>
                `<div class="progcell"><div class="plabel">${esc(p.label)}</div><div class="prog">${barsHtml(p.bars, p.repeat ?? true)}</div></div>`,
        )
        .join("")

    let body = ""
    for (const sec of chart.sections) {
        if (sec.label) body += `<div class="slabel">${esc(sec.label)}</div>`
        const single = sec.stanzas.length === 1
        sec.stanzas.forEach((stanza, i) => {
            const rows = stanza.lines
                .map((l) => `<div class="lyr">${lineHtml(parseChordProLine(l))}</div>`)
                .join("")
            body += `<div class="stanza"><div class="snum">${single ? "" : String(i + 1)}</div><div class="lines">${rows}</div></div>`
        })
    }

    const note = chart.note ? `<p class="note">${esc(chart.note)}</p>` : ""
    const progRow = progs ? `<div class="progrow">${progs}</div>` : ""
    const cap = chart.caption ? `<p class="cap">${esc(chart.caption)}</p>` : ""
    const sub = chart.subtitle ? `<p class="sub">${esc(chart.subtitle)}</p>` : ""

    return (
        `<html><head><meta charset="utf-8"><title>${esc(chart.title)}</title><style>${HOUSE_CSS}</style></head><body>` +
        `<div class="hd"><h1>${esc(chart.title)}</h1><div class="km">${esc(chart.keyMeter ?? "")}</div></div>` +
        `${sub}<hr class="rule">${progRow}${cap}${body}${note}` +
        `<div class="ft"><span>${esc(chart.footerLeft ?? "Central Reform Congregation")}</span><span>${esc(chart.footerRight ?? "centralreform.live")}</span></div>` +
        `</body></html>`
    )
}

/** The worked example from `tools/crc_chart/mk_modeh.py`, used by tests and the render self-check. */
export const MODEH_ANI_SAMPLE: HouseChart = {
    title: "Modeh Ani",
    keyMeter: "Cm · 4/4",
    subtitle: "Shirei T'shuvah p. 42  ·  Rosh HaShanah morning  ·  folk",
    progressions: [
        { label: "A", bars: ["Cm", "Cm", "B♭", "A♭ B♭ Cm"] },
        { label: "B  ×2", bars: ["E♭", "B♭", "A♭", "B♭  E♭"] },
    ],
    caption: "A ×2, then B ×2, back to A  ·  last bar of A: A♭ (1 beat) · B♭ (1) · Cm (2)",
    sections: [
        { label: "A", stanzas: [{ lines: ["[Cm]Modeh ani l'fanecha,", "[B♭]melech chai [A♭]v'[B♭]ka[Cm]yam,"] }] },
        { label: "B", stanzas: [{ lines: ["[E♭]Modeh [B♭]ani [A♭]l'fane[B♭ E♭]cha,"] }] },
    ],
    note: "Say Modah ani in the feminine.",
}
