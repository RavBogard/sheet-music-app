import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib"
import { toWinAnsi } from "./text-chart-pdf"
import { firstStrongDirection, hasHebrew, toVisual, type Direction } from "./bidi-visual"
import { embedTtf, type EmbeddedTtf } from "./embed-ttf"

/**
 * The rabbi's service sheet: the printed order of a service, with the printed
 * page number in that day's siddur/machzor, who leads each moment, and who is
 * being honored. This is the paper that sits on the shtender — legibility at
 * lectern distance beats density.
 *
 * Charts, keys and BPM deliberately do NOT appear; that is the musicians' lens
 * (Perform mode / gig packet).
 *
 * Two font paths:
 *  - No Hebrew anywhere in the input (CRC's English/transliteration sheet):
 *    pdf-lib StandardFonts (Helvetica), all text through toWinAnsi. This path
 *    is pinned byte-for-byte by service-sheet-pdf.golden.test.ts.
 *  - Any Hebrew character in any field: the vendored Alef TTFs (Latin +
 *    Hebrew) are embedded via embed-ttf.ts (no fontkit) and used for ALL text
 *    in the document; each drawn line is reordered for display by
 *    bidi-visual.ts. Characters Alef lacks fall back to toWinAnsi's ASCII
 *    stand-ins, else '?'.
 *
 * `direction: "rtl"` (or, when absent, a Hebrew-first setlist name) mirrors the
 * layout: text right-aligned, the folio on the left of the title line.
 */

export interface ServiceSheetTrack {
    id: string
    title?: string
    type?: string
    performer?: string
    leadMusician?: string
    description?: string
    // `estimatedMinutes` is deliberately NOT accepted here. The row data model
    // carries it (run-sheet timing), but this renderer draws no timing column —
    // accepting a parameter and silently ignoring it is the same trap that got
    // `serviceNotes` removed from this interface. If the sheet ever grows a
    // timing column, add the field back with the drawing code in the same change.
    liturgyRef?: { book: string; unitId?: string; folio: number }
    honors?: Array<{ name: string; note?: string }>
}

export interface ServiceSheetInput {
    setlistName: string
    eventDate?: string
    rabbi?: string
    book?: string
    bookTitle?: string
    /**
     * Names this section when the document has more than one ("Order of
     * service", "Music only"). Absent for a single-section sheet, which is
     * every sheet that existed before `rows` — a lone section with a label
     * saying so would be noise.
     */
    sectionLabel?: string
    /**
     * Layout direction. Default: "rtl" when the input has Hebrew and the
     * setlist name's first strong character is Hebrew, else "ltr". Only the
     * layout mirrors; each string is still reordered for display by its own
     * content.
     */
    direction?: Direction
    tracks: ServiceSheetTrack[]
}

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54
const CONTENT_W = PAGE_W - MARGIN * 2
const BOTTOM = MARGIN

const INK = rgb(0.1, 0.1, 0.12)
const MUTED = rgb(0.42, 0.42, 0.47)
const RULE = rgb(0.78, 0.78, 0.82)

function clean(s: unknown): string {
    return typeof s === "string" ? toWinAnsi(s).trim() : ""
}

/** Anything that can measure a line: a StandardFont or an embedded TTF. */
type Face = PDFFont | EmbeddedTtf

interface DrawOpts {
    x: number
    y: number
    size: number
    font: Face
    color: Color
    /** Paragraph direction used to reorder the line for display. */
    base: Direction
}

/**
 * How text is cleaned, measured and drawn for one document. The WinAnsi
 * typography with `reorder: false` is exactly the pre-Hebrew renderer (same
 * pdf-lib calls, same bytes).
 */
interface Typography {
    bold: Face
    body: Face
    clean(s: unknown): string
    text(page: PDFPage, line: string, o: DrawOpts): void
}

function winAnsiTypography(bold: PDFFont, body: PDFFont, reorder: boolean): Typography {
    return {
        bold,
        body,
        clean,
        text(page, line, { x, y, size, font, color, base }) {
            const shown = reorder ? toVisual(line, { base }) : line
            page.drawText(shown, { x, y, size, font: font as PDFFont, color })
        },
    }
}

function unicodeTypography(bold: EmbeddedTtf, body: EmbeddedTtf): Typography {
    const cleanUnicode = (s: unknown): string => {
        if (typeof s !== "string") return ""
        let out = ""
        // Controls out; tabs/newlines/NBSP become plain spaces (one line per field).
        for (const ch of s.replace(/[\u0000-\u0008\u000E-\u001F\u007F]/g, "")) {
            if (/[\t\n\v\f\r\u00A0]/.test(ch)) {
                out += " "
                continue
            }
            // Both faces are Alef, so one coverage check serves both. A mark the
            // font lacks is dropped by the embedder; anything else it lacks gets
            // toWinAnsi's stand-in (smart quotes -> ASCII, else '?').
            out += body.hasGlyph(ch.codePointAt(0)!) || /\p{M}/u.test(ch) ? ch : toWinAnsi(ch)
        }
        return out.trim()
    }
    return {
        bold,
        body,
        clean: cleanUnicode,
        text(page, line, { x, y, size, font, color, base }) {
            ;(font as EmbeddedTtf).drawText(page, toVisual(line, { base }), { x, y, size, color })
        },
    }
}

function inputStrings(input: ServiceSheetInput): unknown[] {
    const out: unknown[] = [
        input.setlistName,
        input.eventDate,
        input.rabbi,
        input.book,
        input.bookTitle,
        input.sectionLabel,
    ]
    for (const t of input.tracks) {
        out.push(t.title, t.performer, t.leadMusician, t.description)
        for (const h of t.honors ?? []) out.push(h.name, h.note)
    }
    return out
}

/**
 * Greedy word wrap against a real font metric.
 *
 * A word that is itself wider than the column is broken at the character level
 * rather than drawn past the right margin — nothing is ever dropped or clipped.
 * Names and page numbers running off the edge of the paper is the failure this
 * document cannot afford: the sheet still looks fine, and the rabbi reading it
 * aloud has no way to know a name was cut.
 */
function wrap(text: string, font: Face, size: number, maxW: number): string[] {
    const words = text.split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let line = ""
    for (const w of words) {
        const next = line ? `${line} ${w}` : w
        if (font.widthOfTextAtSize(next, size) <= maxW) {
            line = next
            continue
        }
        if (line) {
            lines.push(line)
            line = ""
        }
        if (font.widthOfTextAtSize(w, size) <= maxW) {
            line = w
            continue
        }
        // Unbreakable token wider than the column: split on character boundaries
        // (a letter keeps its combining marks).
        let chunk = ""
        for (const ch of w.match(/\P{M}\p{M}*|\p{M}+/gu) ?? []) {
            if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxW) {
                lines.push(chunk)
                chunk = ch
            } else {
                chunk += ch
            }
        }
        line = chunk
    }
    if (line) lines.push(line)
    return lines
}

export async function renderServiceSheetPdf(
    input: ServiceSheetInput,
): Promise<Uint8Array> {
    const pdf = await PDFDocument.create()
    const hebrew = inputStrings(input).some((s) => typeof s === "string" && hasHebrew(s))
    const dir: Direction =
        input.direction ?? (hebrew ? (firstStrongDirection(input.setlistName) ?? "ltr") : "ltr")
    const rtl = dir === "rtl"

    let ty: Typography
    if (hebrew) {
        // Only the Hebrew path loads the font module (keeps ~240 KB of base64
        // out of English renders).
        const { loadAlefFonts } = await import("./hebrew-fonts")
        const alef = await loadAlefFonts()
        ty = unicodeTypography(embedTtf(pdf, alef.bold), embedTtf(pdf, alef.regular))
    } else {
        const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
        const body = await pdf.embedFont(StandardFonts.Helvetica)
        ty = winAnsiTypography(bold, body, rtl)
    }
    const { bold, body } = ty
    const clean = ty.clean
    /** Paragraph direction of a single field: its own first strong char. */
    const own = (s: string): Direction => firstStrongDirection(s) ?? dir
    /** Left edge for a line of width w: `left` in LTR, flush to `right` in RTL. */
    const alignX = (left: number, w: number, right: number) => (rtl ? right - w : left)
    const RIGHT = PAGE_W - MARGIN

    let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H])
    let y = PAGE_H - MARGIN

    const need = (h: number) => {
        if (y - h < BOTTOM) {
            page = pdf.addPage([PAGE_W, PAGE_H])
            y = PAGE_H - MARGIN
        }
    }

    // ---- Header -----------------------------------------------------------
    const title = clean(input.setlistName) || "Service"
    for (const line of wrap(title, bold, 18, CONTENT_W)) {
        const x = alignX(MARGIN, bold.widthOfTextAtSize(line, 18), RIGHT)
        ty.text(page, line, { x, y: y - 18, size: 18, font: bold, color: INK, base: own(title) })
        y -= 22
    }
    y -= 4

    const meta = [
        clean(input.sectionLabel),
        clean(input.eventDate),
        clean(input.rabbi),
        clean(input.bookTitle) || clean(input.book),
    ]
        .filter(Boolean)
        .join("   ·   ")
    if (meta) {
        for (const line of wrap(meta, body, 10, CONTENT_W)) {
            const x = alignX(MARGIN, body.widthOfTextAtSize(line, 10), RIGHT)
            ty.text(page, line, { x, y: y - 10, size: 10, font: body, color: MUTED, base: dir })
            y -= 13
        }
        y -= 5
    }
    page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_W - MARGIN, y },
        thickness: 1,
        color: RULE,
    })
    y -= 16

    // ---- Honors summary ---------------------------------------------------
    const allHonors = input.tracks.flatMap((t) =>
        (t.honors ?? []).map((h) => ({ ...h, at: clean(t.title) })),
    )
    if (allHonors.length > 0) {
        // Wrapped to the box's inner width, then split across as many boxes as it
        // takes. A single need() plus an unchecked draw loop put later honorees
        // below the physical page — these are people's names, so the box has to
        // paginate like any other content.
        const lines = allHonors.flatMap((h) => {
            const who = clean(h.name)
            const why = clean(h.note)
            const at = h.at ? ` (${h.at})` : ""
            const text = why ? `${who} - ${why}${at}` : `${who}${at}`
            return wrap(text, body, 9, CONTENT_W - 16)
        })

        const CHROME = 18 // "HONORS" label + box padding
        let idx = 0
        let first = true
        while (idx < lines.length) {
            let capacity = Math.floor((y - BOTTOM - CHROME) / 12)
            if (capacity < 1) {
                page = pdf.addPage([PAGE_W, PAGE_H])
                y = PAGE_H - MARGIN
                capacity = Math.floor((y - BOTTOM - CHROME) / 12)
            }
            const chunk = lines.slice(idx, idx + capacity)
            const boxH = CHROME + chunk.length * 12
            page.drawRectangle({
                x: MARGIN,
                y: y - boxH,
                width: CONTENT_W,
                height: boxH,
                borderColor: RULE,
                borderWidth: 1,
            })
            const label = first ? "HONORS" : "HONORS (CONT.)"
            ty.text(page, label, {
                x: alignX(MARGIN + 8, bold.widthOfTextAtSize(label, 8), RIGHT - 8),
                y: y - 14,
                size: 8,
                font: bold,
                color: MUTED,
                base: dir,
            })
            let hy = y - 26
            for (const line of chunk) {
                const x = alignX(MARGIN + 8, body.widthOfTextAtSize(line, 9), RIGHT - 8)
                ty.text(page, line, { x, y: hy, size: 9, font: body, color: INK, base: dir })
                hy -= 12
            }
            y -= boxH + 14
            idx += chunk.length
            first = false
        }
    }

    // ---- Rows -------------------------------------------------------------
    for (const t of input.tracks) {
        const rowTitle = clean(t.title)
        if (t.type === "header") {
            const labelLines = wrap(rowTitle.toUpperCase(), bold, 9, CONTENT_W)
            need(16 + labelLines.length * 12)
            y -= 6
            page.drawLine({
                start: { x: MARGIN, y },
                end: { x: PAGE_W - MARGIN, y },
                thickness: 0.75,
                color: RULE,
            })
            let ly = y - 13
            for (const label of labelLines) {
                const w = bold.widthOfTextAtSize(label, 9)
                ty.text(page, label, {
                    x: MARGIN + Math.max(0, (CONTENT_W - w) / 2),
                    y: ly,
                    size: 9,
                    font: bold,
                    color: MUTED,
                    base: own(rowTitle),
                })
                ly -= 12
            }
            y -= 12 + labelLines.length * 12
            continue
        }

        const cueParts = [clean(t.performer), clean(t.leadMusician)].filter(Boolean)
        for (const h of t.honors ?? []) {
            const who = clean(h.name)
            const why = clean(h.note)
            cueParts.push(why ? `${who} - ${why}` : who)
        }
        // The cue line carries honorees' names, so it wraps to the column exactly
        // as the description does. Unwrapped, a Torah service bundling several
        // aliyot onto one row printed names off the edge of the paper.
        const cue = cueParts.join("   ·   ")
        const cueLines = cue ? wrap(cue, body, 9, CONTENT_W) : []
        const descLines = t.description
            ? wrap(clean(t.description), body, 8, CONTENT_W - 70)
            : []

        // The folio owns the right end of the title line; the title gets what is
        // left of the column minus a gutter, so the two can never collide.
        const folio = t.liturgyRef ? String(t.liturgyRef.folio) : ""
        const folioW = folio ? bold.widthOfTextAtSize(folio, 14) : 0
        const titleLines = wrap(
            rowTitle || "(untitled)",
            bold,
            11,
            CONTENT_W - (folioW ? folioW + 12 : 0),
        )

        const rowH =
            titleLines.length * 16 + cueLines.length * 11 + descLines.length * 10 + 6
        need(rowH)

        const rowTop = y
        const titleBase = own(rowTitle || "(untitled)")
        for (const line of titleLines) {
            const x = alignX(MARGIN, bold.widthOfTextAtSize(line, 11), RIGHT)
            ty.text(page, line, { x, y: y - 12, size: 11, font: bold, color: INK, base: titleBase })
            y -= 16
        }

        if (folio) {
            // The folio closes the title line: right edge in LTR, left edge in RTL.
            ty.text(page, folio, {
                x: rtl ? MARGIN : PAGE_W - MARGIN - folioW,
                y: rowTop - 13,
                size: 14,
                font: bold,
                color: INK,
                base: dir,
            })
        }

        for (const line of cueLines) {
            const x = alignX(MARGIN, body.widthOfTextAtSize(line, 9), RIGHT)
            ty.text(page, line, { x, y: y - 8, size: 9, font: body, color: MUTED, base: dir })
            y -= 11
        }
        const descBase = own(clean(t.description))
        for (const line of descLines) {
            const x = alignX(MARGIN + 10, body.widthOfTextAtSize(line, 8), RIGHT - 10)
            ty.text(page, line, { x, y: y - 7, size: 8, font: body, color: MUTED, base: descBase })
            y -= 10
        }
        y -= 6
    }

    return await pdf.save()
}
