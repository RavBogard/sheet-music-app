import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { toWinAnsi } from "./text-chart-pdf"

/**
 * The rabbi's service sheet: the printed order of a service, with the printed
 * page number in that day's siddur/machzor, who leads each moment, and who is
 * being honored. This is the paper that sits on the shtender — legibility at
 * lectern distance beats density.
 *
 * Charts, keys and BPM deliberately do NOT appear; that is the musicians' lens
 * (Perform mode / gig packet).
 *
 * All text passes through toWinAnsi: pdf-lib StandardFonts are WinAnsi-only, so
 * Hebrew degrades to '?' rather than corrupting the document. v1 is an
 * English/transliteration sheet by design.
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

/**
 * Greedy word wrap against a real font metric.
 *
 * A word that is itself wider than the column is broken at the character level
 * rather than drawn past the right margin — nothing is ever dropped or clipped.
 * Names and page numbers running off the edge of the paper is the failure this
 * document cannot afford: the sheet still looks fine, and the rabbi reading it
 * aloud has no way to know a name was cut.
 */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
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
        // Unbreakable token wider than the column: split on character boundaries.
        let chunk = ""
        for (const ch of w) {
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
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const body = await pdf.embedFont(StandardFonts.Helvetica)

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
        page.drawText(line, { x: MARGIN, y: y - 18, size: 18, font: bold, color: INK })
        y -= 22
    }
    y -= 4

    const meta = [clean(input.eventDate), clean(input.rabbi), clean(input.bookTitle) || clean(input.book)]
        .filter(Boolean)
        .join("   ·   ")
    if (meta) {
        for (const line of wrap(meta, body, 10, CONTENT_W)) {
            page.drawText(line, { x: MARGIN, y: y - 10, size: 10, font: body, color: MUTED })
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
            page.drawText(first ? "HONORS" : "HONORS (CONT.)", {
                x: MARGIN + 8,
                y: y - 14,
                size: 8,
                font: bold,
                color: MUTED,
            })
            let hy = y - 26
            for (const line of chunk) {
                page.drawText(line, { x: MARGIN + 8, y: hy, size: 9, font: body, color: INK })
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
                page.drawText(label, {
                    x: MARGIN + Math.max(0, (CONTENT_W - w) / 2),
                    y: ly,
                    size: 9,
                    font: bold,
                    color: MUTED,
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
        for (const line of titleLines) {
            page.drawText(line, { x: MARGIN, y: y - 12, size: 11, font: bold, color: INK })
            y -= 16
        }

        if (folio) {
            page.drawText(folio, {
                x: PAGE_W - MARGIN - folioW,
                y: rowTop - 13,
                size: 14,
                font: bold,
                color: INK,
            })
        }

        for (const line of cueLines) {
            page.drawText(line, { x: MARGIN, y: y - 8, size: 9, font: body, color: MUTED })
            y -= 11
        }
        for (const line of descLines) {
            page.drawText(line, { x: MARGIN + 10, y: y - 7, size: 8, font: body, color: MUTED })
            y -= 10
        }
        y -= 6
    }

    return await pdf.save()
}
