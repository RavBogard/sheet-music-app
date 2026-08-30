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
    estimatedMinutes?: number
    liturgyRef?: { book: string; unitId?: string; folio: number }
    honors?: Array<{ name: string; note?: string }>
}

export interface ServiceSheetInput {
    setlistName: string
    eventDate?: string
    rabbi?: string
    book?: string
    bookTitle?: string
    serviceNotes?: string
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

/** Greedy word wrap against a real font metric. */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const words = text.split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let line = ""
    for (const w of words) {
        const next = line ? `${line} ${w}` : w
        if (font.widthOfTextAtSize(next, size) <= maxW) {
            line = next
        } else {
            if (line) lines.push(line)
            line = w
        }
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
    page.drawText(title, { x: MARGIN, y: y - 18, size: 18, font: bold, color: INK })
    y -= 26

    const meta = [clean(input.eventDate), clean(input.rabbi), clean(input.bookTitle) || clean(input.book)]
        .filter(Boolean)
        .join("   ·   ")
    if (meta) {
        page.drawText(meta, { x: MARGIN, y: y - 10, size: 10, font: body, color: MUTED })
        y -= 18
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
        const lines = allHonors.map((h) => {
            const who = clean(h.name)
            const why = clean(h.note)
            const at = h.at ? ` (${h.at})` : ""
            return why ? `${who} - ${why}${at}` : `${who}${at}`
        })
        const boxH = 18 + lines.length * 12
        need(boxH + 10)
        page.drawRectangle({
            x: MARGIN,
            y: y - boxH,
            width: CONTENT_W,
            height: boxH,
            borderColor: RULE,
            borderWidth: 1,
        })
        page.drawText("HONORS", { x: MARGIN + 8, y: y - 14, size: 8, font: bold, color: MUTED })
        let hy = y - 26
        for (const line of lines) {
            page.drawText(line, { x: MARGIN + 8, y: hy, size: 9, font: body, color: INK })
            hy -= 12
        }
        y -= boxH + 14
    }

    // ---- Rows -------------------------------------------------------------
    for (const t of input.tracks) {
        const rowTitle = clean(t.title)
        if (t.type === "header") {
            need(28)
            y -= 6
            page.drawLine({
                start: { x: MARGIN, y },
                end: { x: PAGE_W - MARGIN, y },
                thickness: 0.75,
                color: RULE,
            })
            const label = rowTitle.toUpperCase()
            const w = bold.widthOfTextAtSize(label, 9)
            page.drawText(label, {
                x: MARGIN + (CONTENT_W - w) / 2,
                y: y - 13,
                size: 9,
                font: bold,
                color: MUTED,
            })
            y -= 24
            continue
        }

        const cueParts = [clean(t.performer), clean(t.leadMusician)].filter(Boolean)
        for (const h of t.honors ?? []) {
            const who = clean(h.name)
            const why = clean(h.note)
            cueParts.push(why ? `${who} - ${why}` : who)
        }
        const cue = cueParts.join("   ·   ")
        const descLines = t.description
            ? wrap(clean(t.description), body, 8, CONTENT_W - 70)
            : []

        const rowH = 16 + (cue ? 11 : 0) + descLines.length * 10 + 6
        need(rowH)

        page.drawText(rowTitle || "(untitled)", {
            x: MARGIN,
            y: y - 12,
            size: 11,
            font: bold,
            color: INK,
        })

        if (t.liturgyRef) {
            const folio = String(t.liturgyRef.folio)
            const w = bold.widthOfTextAtSize(folio, 14)
            page.drawText(folio, {
                x: PAGE_W - MARGIN - w,
                y: y - 13,
                size: 14,
                font: bold,
                color: INK,
            })
        }
        y -= 16

        if (cue) {
            page.drawText(cue, { x: MARGIN, y: y - 8, size: 9, font: body, color: MUTED })
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
