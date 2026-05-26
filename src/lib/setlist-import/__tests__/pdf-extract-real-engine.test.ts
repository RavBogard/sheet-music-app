// f4-b-pdf-extractor-serverless-fix (Tier 1, 2026-05-26): regression
// guard against the "DOMMatrix is not defined" Vercel-serverless bug
// that shipped on 2026-05-26 with coder-2's F4-B persistence ship.
//
// Unlike the sibling `extract-document.test.ts`, this file does NOT
// mock pdfjs-dist. It builds a minimal valid PDF buffer in-test via
// pdf-lib and runs it through the REAL `extractDocumentText` codepath
// — exercising `getPdfjs() + getDocument(PDFJS_NODE_SAFE_OPTIONS) +
// getPage + getTextContent` end-to-end. If a future change re-introduces
// the fake-worker path (`workerSrc:""`) OR drops the Node-safe
// options OR a pdfjs-dist major bump breaks the contract, this test
// fails locally — closing the test-gap that let the bug ship.
//
// Sibling node-environment proof: ../node-safe pdfjs config (see
// pdf-chord-extractor.ts:PDFJS_NODE_SAFE_OPTIONS).

// IMPORTANT: do NOT vi.mock('pdfjs-dist/...') in this file. The mock
// in extract-document.test.ts is scoped to that file only.

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

describe('extractDocumentText (real pdfjs-dist engine, serverless-safe options)', () => {
    let pdfBuffer: Buffer

    beforeAll(async () => {
        pdfBuffer = await buildMinimalPdf(KNOWN_PDF_TEXT)
    })

    it('extracts text from a real PDF buffer via the live pdfjs engine without throwing DOMMatrix', async () => {
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
