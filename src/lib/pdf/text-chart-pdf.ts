import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { transposeChord } from "@/lib/music-math"

/**
 * Shared, framework-agnostic renderer that turns a scraped `text/plain` chord
 * chart into monospace PDF pages for the gig packet. Used by BOTH:
 *   - the website print pipeline (`src/lib/print-pipeline.ts`, transpose-aware)
 *   - the MCP `generate_gig_packet` tool (`src/lib/mcp/tools/library-download.ts`)
 *
 * Why this exists: `PDFDocument.load()` only parses PDF bytes — text-chart bytes
 * throw, so before this the website packet silently dropped every text chart (the
 * Camp Sabra camp sets are entirely text/plain → cover page with zero charts).
 *
 * The chord-detection helpers (`isChordToken` / `isChordLine`) intentionally
 * mirror `TextScoreViewer`'s local copies so the printed page matches the Perform
 * iPad view. Unifying the viewer onto this module is a v11.7 follow-up — kept
 * separate here to avoid churning the live Perform surface during this P0 fix.
 */

/**
 * pdf-lib's StandardFonts only encode WinAnsi (CP1252). Pre-substitute the
 * unicode characters that show up in scraped charts (smart quotes / em-dashes /
 * ellipsis / nbsp), then map anything still outside the WinAnsi range to `?` so
 * `drawText` renders the chart instead of throwing mid-page.
 */
export function toWinAnsi(s: string): string {
    return s
        .replace(/[‘’‚′]/g, "'")
        .replace(/[“”„″]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/…/g, "...")
        .replace(/ /g, " ")
        .replace(/[^\x00-\xff]/g, "?")
}

/** True if a whitespace-delimited token reads as a chord (or a chord-chart
 *  punctuation token like `|`, `(`, `x2`, `N.C.`). Mirrors TextScoreViewer. */
export function isChordToken(token: string): boolean {
    const chordRegex = /^([A-G][b#]?)(m|maj|dim|aug|sus|add|\d)*(?:\/[A-G][b#]?)?$/i
    if (/^[|()\[\]\-,]+$/.test(token)) return true
    if (/^x\d$/i.test(token)) return true
    if (token.toUpperCase() === "N.C.") return true
    return chordRegex.test(token)
}

/** True if ≥75% of a line's tokens are chord tokens. Mirrors TextScoreViewer. */
export function isChordLine(line: string): boolean {
    const tokens = line.trim().split(/\s+/)
    if (tokens.length === 0 || tokens[0] === "") return false
    const validChords = tokens.filter((t) => isChordToken(t)).length
    return validChords / tokens.length >= 0.75
}

/**
 * Transpose every chord line in a monospace chord chart, preserving column
 * alignment so chords stay over their syllables. Non-chord (lyric / section)
 * lines are returned verbatim. `semitones === 0` is a byte-identical fast path.
 *
 * Each transposed chord is anchored at its original start column. When a
 * transposed chord is wider than the original (C→Db) and would collide with the
 * next token, it is pushed right by the minimum needed to keep a ≥1-space gap —
 * the same "chords may crowd but lyrics stay put" behavior the Perform viewer
 * gets from its width-neutral chord columns.
 */
export function transposeChartText(
    text: string,
    semitones: number,
    preferFlats?: boolean,
): string {
    if (!semitones) return text
    const eol = text.includes("\r\n") ? "\r\n" : "\n"
    const lines = text.split(/\r\n|\n|\r/)
    const out = lines.map((line) => {
        if (!isChordLine(line)) return line
        let result = ""
        const re = /(\S+)/g
        let m: RegExpExecArray | null
        while ((m = re.exec(line)) !== null) {
            const word = m[1]
            const col = m.index
            const rendered = isChordToken(word)
                ? transposeChord(word, semitones, preferFlats)
                : word
            if (result.length < col) {
                result = result.padEnd(col, " ")
            } else if (result.length > 0 && !result.endsWith(" ")) {
                result += " "
            }
            result += rendered
        }
        return result
    })
    return out.join(eol)
}

export interface RenderTextChartOptions {
    /** Semitone transposition applied to chord lines before rendering. */
    transposition?: number
    /** Flat/sharp spelling preference passed to music-math. */
    preferFlats?: boolean
}

/**
 * Render a text chord chart as monospace Courier PDF page(s) appended to `pdf`.
 * Letter size, char-wrapped to the usable width, paginated, with a bold title
 * header. Optionally transposes chord lines first.
 */
export async function renderTextChartToPdf(
    pdf: PDFDocument,
    rawTitle: string,
    rawText: string,
    opts: RenderTextChartOptions = {},
): Promise<void> {
    const courier = await pdf.embedFont(StandardFonts.Courier)
    const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const PAGE_W = 612
    const PAGE_H = 792
    const MARGIN_L = 50
    const MARGIN_T = 60
    const MARGIN_B = 50
    const TITLE_SIZE = 14
    const BODY_SIZE = 10
    const LINE_H = BODY_SIZE * 1.2
    const usableW = PAGE_W - MARGIN_L * 2
    const charW = courier.widthOfTextAtSize("M", BODY_SIZE)
    const charsPerLine = Math.max(20, Math.floor(usableW / charW))

    const transposed = opts.transposition
        ? transposeChartText(rawText, opts.transposition, opts.preferFlats)
        : rawText

    const title = toWinAnsi(rawTitle)
    const text = toWinAnsi(transposed)

    const wrapped: string[] = []
    for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
        if (rawLine.length <= charsPerLine) {
            wrapped.push(rawLine)
        } else {
            let i = 0
            while (i < rawLine.length) {
                wrapped.push(rawLine.slice(i, i + charsPerLine))
                i += charsPerLine
            }
        }
    }

    let page = pdf.addPage([PAGE_W, PAGE_H])
    let y = PAGE_H - MARGIN_T
    page.drawText(title, {
        x: MARGIN_L,
        y,
        size: TITLE_SIZE,
        font: helveticaBold,
        color: rgb(0, 0, 0),
    })
    y -= TITLE_SIZE + 12

    for (const line of wrapped) {
        if (y < MARGIN_B) {
            page = pdf.addPage([PAGE_W, PAGE_H])
            y = PAGE_H - MARGIN_T
        }
        if (line.length > 0) {
            page.drawText(line, {
                x: MARGIN_L,
                y,
                size: BODY_SIZE,
                font: courier,
                color: rgb(0.1, 0.1, 0.1),
            })
        }
        y -= LINE_H
    }
}
