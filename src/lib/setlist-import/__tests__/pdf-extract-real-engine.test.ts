// f4-b-pdf-extractor-serverless-fix-v2 (Tier 2, 2026-05-26): regression
// guard against the "DOMMatrix is not defined" Vercel-serverless bug
// that shipped on 2026-05-26 with coder-2's F4-B persistence ship and
// that the v1 disable-worker option fix (`e2271c02d`) could not reach.
//
// Phase 6a runtime probe (via prod MCP with Daniel's bearer 2026-05-26
// 13:09Z) confirmed stage=`getPdfjs` — pdfjs-dist v5's
// `legacy/build/pdf.mjs` constructs `new DOMMatrix()` during class /
// prototype init at MODULE LOAD on Vercel serverless. Engine swap to
// `unpdf` (bundled pdfjs with DOM polyfills applied before module-load
// init) closed the bug.
//
// Unlike the sibling `extract-document.test.ts`, this file does NOT
// mock the engine. It builds a minimal valid PDF buffer in-test via
// pdf-lib and runs it through the REAL `extractDocumentText` codepath
// — exercising `unpdf.extractText({mergePages:true})` end-to-end. If a
// future change reverts the engine swap OR an unpdf major bump breaks
// the contract, this test fails locally — closing the test-gap that
// let coder-2's F4-B ship silently fail in prod.

// IMPORTANT: do NOT mock 'unpdf' or 'pdfjs-dist/...' in this file. The
// engine mock in extract-document.test.ts is scoped to that file only.

import { describe, it, expect, beforeAll } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

import { extractDocumentText } from '../extract-document'

const KNOWN_PDF_TEXT = 'Hineh ma tov lyrics line'

/**
 * Build a minimal valid 1-page PDF with a known text token using
 * pdf-lib (already in package.json deps for the print pipeline).
 * Returns a Buffer suitable for `extractDocumentText({ buffer, ... })`.
 */
async function buildMinimalPdf(text: string): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const page = pdfDoc.addPage([612, 792])
    page.drawText(text, { x: 72, y: 720, size: 12, font })
    const bytes = await pdfDoc.save()
    return Buffer.from(bytes)
}

describe('extractDocumentText (real unpdf engine, serverless-safe)', () => {
    let pdfBuffer: Buffer

    beforeAll(async () => {
        pdfBuffer = await buildMinimalPdf(KNOWN_PDF_TEXT)
    })

    it('extracts text from a real PDF buffer via the live unpdf engine without throwing DOMMatrix', async () => {
        const result = await extractDocumentText(pdfBuffer, {
            fileName: 'fixture.pdf',
            mimeType: 'application/pdf',
        })

        // The regression — pre-fix this returned {ok:false, reason:'extraction_failed',
        // message:'DOMMatrix is not defined'} on Vercel serverless Node <22.13
        // (and on local Node 24 since DOMMatrix is also not a Node global).
        expect(result.ok).toBe(true)
        if (!result.ok) {
            // ts narrow + helpful diff on failure
            throw new Error(
                `expected ok:true, got ok:false reason:${result.reason} message:${result.message}`,
            )
        }
        expect(result.format).toBe('pdf')
        expect(result.text).toContain('Hineh')
        expect(result.text).toContain('ma tov')
        expect(result.charCount).toBeGreaterThan(0)
    })

    it('returns extraction_failed (not a throw) on an invalid PDF buffer', async () => {
        // Buffer that is not a PDF — engine should reject, our wrapper
        // converts to the typed { ok:false, reason:'extraction_failed' }.
        const garbage = Buffer.from('this is not a pdf at all', 'utf-8')
        const result = await extractDocumentText(garbage, {
            fileName: 'fake.pdf',
            mimeType: 'application/pdf',
        })
        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('expected ok:false on garbage')
        expect(result.reason).toBe('extraction_failed')
    })
})
