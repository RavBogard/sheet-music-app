// dommatrix-absent-env-regression-test (Tier 1, 2026-05-26): closes
// auditor F4-B OPEN-FOLLOWUP #2 from the f4-b-pdf-extractor-serverless-fix
// VERIFICATION (`inbox/supervisor.md msg-from-auditor-f4-lyric-search-
// persistence-mod-VERIFICATION` 2026-05-26T01:52Z).
//
// Coder-4's `pdf-extract-real-engine.test.ts` proves the real pdfjs
// engine extracts text via `extractDocumentText`, BUT it runs under
// vitest's default jsdom environment which DEFINES `globalThis.DOMMatrix`.
// That means coder-4's test would have STILL PASSED with the pre-fix
// fake-worker path — jsdom would have masked the prod failure. This
// file closes that test-env-vs-prod-env parity gap by EXPLICITLY
// deleting `globalThis.DOMMatrix` for the duration of the test call,
// simulating the Vercel-serverless Node (<22.13) environment where the
// "DOMMatrix is not defined" failure originally shipped.
//
// Surface tested: `extractSearchableText` (the PCU surface that the
// auditor named in the OPEN-FOLLOWUP), which dispatches to
// `extractDocumentText` -> `getPdfjs() + getDocument(PDFJS_NODE_SAFE_OPTIONS)`.
//
// Reverse-test demo (run by coder-5 pre-ship; verified by auditor):
//  - With coder-4's fix in place (`PDFJS_NODE_SAFE_OPTIONS` threaded into
//    `getDocument()` + no `workerSrc = ""` fake-worker hack) → this test
//    PASSES.
//  - Revert coder-4's e2271c02d (restore the fake-worker hack + drop the
//    Node-safe options) → this test FAILS with `ok:false,
//    reason:"DOMMatrix is not defined"`. Proves the test would have caught
//    the pre-fix prod bug.
//
// IMPORTANT: do NOT vi.mock pdfjs-dist or extract-document in this file.
// The mock in the sibling `searchable-text.test.ts` is scoped to that
// file only.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

import { extractSearchableText } from '@/lib/library/searchable-text'

const KNOWN_LYRIC_TOKEN = 'Hineh ma tov lyrics line'

/**
 * Build a minimal valid 1-page PDF with a known lyric token via pdf-lib
 * (already in deps for the print pipeline). Returns a Buffer suitable
 * for `extractSearchableText({ buffer, contentType, fileName })`.
 *
 * Mirrors coder-4's `pdf-extract-real-engine.test.ts:buildMinimalPdf`
 * fixture shape so the two real-engine tests stay co-readable.
 */
async function buildMinimalPdf(text: string): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const page = pdfDoc.addPage([612, 792])
    page.drawText(text, { x: 72, y: 720, size: 12, font })
    const bytes = await pdfDoc.save()
    return Buffer.from(bytes)
}

describe('extractSearchableText — DOMMatrix-absent env (serverless parity)', () => {
    let pdfBuffer: Buffer
    let savedDOMMatrix: unknown

    beforeAll(async () => {
        pdfBuffer = await buildMinimalPdf(KNOWN_LYRIC_TOKEN)
    })

    beforeEach(() => {
        // Capture jsdom-provided DOMMatrix so we can restore it cleanly even
        // if the test throws. Using `unknown` + a property-descriptor read
        // avoids strict-mode 'delete on a variable' fuss and works regardless
        // of whether jsdom installed DOMMatrix as configurable.
        savedDOMMatrix = (globalThis as Record<string, unknown>).DOMMatrix
        delete (globalThis as Record<string, unknown>).DOMMatrix
    })

    afterEach(() => {
        if (savedDOMMatrix === undefined) {
            // Defensive: if jsdom had not set DOMMatrix to begin with (e.g.
            // future test-env change), leave the global cleared.
            return
        }
        ;(globalThis as Record<string, unknown>).DOMMatrix = savedDOMMatrix
    })

    it('extracts text from a real PDF buffer when globalThis.DOMMatrix is undefined', async () => {
        // Sanity gate: the beforeEach actually removed the global. If a future
        // pdfjs / jsdom change re-introduces it as non-configurable, this
        // assertion catches the silent regression of the regression test.
        expect((globalThis as Record<string, unknown>).DOMMatrix).toBeUndefined()

        const result = await extractSearchableText({
            buffer: pdfBuffer,
            contentType: 'application/pdf',
            fileName: 'fixture.pdf',
        })

        // The regression — pre-coder-4-fix (e2271c02d), this returned
        // `{ ok:false, format:'fail', reason:"DOMMatrix is not defined" }`
        // because pdfjs-dist's default fake-worker path evals
        // `new DOMMatrix()` and there's no global to construct from.
        expect(result.ok).toBe(true)
        if (!result.ok) {
            // ts narrow + helpful diff on failure
            throw new Error(
                `expected ok:true, got ok:false format:${result.format} reason:${result.reason}`,
            )
        }
        expect(result.format).toBe('pdf')
        // normalizeSearchableText lowercases the body — assert against the
        // lowercase token shape.
        expect(result.text).not.toBeNull()
        expect(result.text!).toContain('hineh')
        expect(result.text!).toContain('ma tov')
    })
})
