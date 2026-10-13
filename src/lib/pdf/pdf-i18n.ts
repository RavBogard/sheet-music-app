import type { PDFDocument } from "pdf-lib"
import EN_PDF from "@/i18n/en/pdf.json"
import { createTranslator, directionOf, flattenNamespace, type T, type UiLanguage } from "@/i18n/core"
import { toWinAnsi } from "./text-chart-pdf"
import type { Direction } from "./bidi-visual"
import type { EmbeddedTtf } from "./embed-ttf"

/**
 * Multi-tenant phase 7: the language a generated PDF's own labels are drawn
 * in ("Song", "Key", "HONORS", the omitted-charts page...). Callers resolve it
 * from the tenant (`getI18n(orgId)` in a route or a job) and pass it to the
 * PDF builders. Absent = English, exactly as before: every caller that does not
 * pass one draws the same bytes it always drew.
 *
 * English labels never change the font path: they stay on the WinAnsi
 * StandardFonts. Any other language (Hebrew, the pseudo-locales) draws with the
 * vendored Alef TTFs (Latin + Hebrew), each line in visual order (bidi-visual).
 */
export interface PdfI18n {
    t: T
    lang: UiLanguage
}

let english: T | null = null

/** The `pdf` namespace in English, read straight from its catalogue file (no server catalogue needed). */
export function englishPdfT(): T {
    if (!english) english = createTranslator({ lang: "en", messages: flattenNamespace("pdf", EN_PDF) })
    return english
}

export function pdfT(i18n?: PdfI18n | null): T {
    return i18n?.t ?? englishPdfT()
}

/** True when the labels cannot be encoded in WinAnsi: any language but English. */
export function pdfNeedsUnicode(i18n?: PdfI18n | null): boolean {
    return !!i18n && i18n.lang !== "en"
}

/** Layout direction of the labels' language (English / absent: ltr). */
export function pdfDirection(i18n?: PdfI18n | null): Direction {
    return i18n ? directionOf(i18n.lang) : "ltr"
}

export interface UnicodeFaces {
    bold: EmbeddedTtf
    regular: EmbeddedTtf
}

const embedded = new WeakMap<PDFDocument, Promise<UnicodeFaces>>()

/**
 * Alef regular + bold embedded into `doc`, once per document (the gig packet
 * draws a cover, many text charts and an omissions page into one document; the
 * font is ~240 KB). The font module is loaded only on this path.
 */
export function unicodeFacesFor(doc: PDFDocument): Promise<UnicodeFaces> {
    let hit = embedded.get(doc)
    if (!hit) {
        hit = (async () => {
            const [{ loadAlefFonts }, { embedTtf }] = await Promise.all([
                import("./hebrew-fonts"),
                import("./embed-ttf"),
            ])
            const alef = await loadAlefFonts()
            return { bold: embedTtf(doc, alef.bold), regular: embedTtf(doc, alef.regular) }
        })()
        hit.catch(() => embedded.delete(doc))
        embedded.set(doc, hit)
    }
    return hit
}

/**
 * Sanitise one line for an embedded TTF: control characters and line breaks
 * become spaces (pdf text is one line per draw), whitespace collapses, and a
 * character the font lacks gets toWinAnsi's ASCII stand-in (smart quotes ->
 * ASCII, else '?'). Combining marks pass through (the embedder drops any the
 * font lacks).
 */
export function cleanForTtf(font: EmbeddedTtf, s: unknown): string {
    if (typeof s !== "string") return ""
    let out = ""
    for (const ch of s.replace(/[\x00-\x1f\x7f-\x9f ]+/g, " ")) {
        out += font.hasGlyph(ch.codePointAt(0)!) || /\p{M}/u.test(ch) || ch === " " ? ch : toWinAnsi(ch)
    }
    return out.replace(/\s+/g, " ").trim()
}
