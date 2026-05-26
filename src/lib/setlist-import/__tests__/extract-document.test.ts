import { describe, it, expect, beforeAll, vi } from 'vitest'

// ── Mock unpdf ─────────────────────────────────────────────────────
// After the f4-b-pdf-extractor-serverless-fix-v2 engine swap, extract-document.ts
// extracts PDF text via `unpdf.extractText({mergePages:true})`. Mocking that
// shape lets us drive the page-cap + error branches without invoking the real
// engine. The real engine is exercised against a pdf-lib-synthesized fixture
// in `pdf-extract-real-engine.test.ts` (sibling file, no engine mock).
const { KNOWN_PDF_TEXT } = vi.hoisted(() => ({
    KNOWN_PDF_TEXT: 'Lecha Dodi Shabbat Morning',
}))

vi.mock('unpdf', () => ({
    extractText: async (
        data: Uint8Array,
        _opts?: { mergePages?: boolean },
    ): Promise<{ text: string; totalPages: number }> => {
        // Treat buffers without the %PDF- magic header as corrupt — the mock
        // rejects so extractDocumentText's try/catch yields 'extraction_failed'.
        const content = Buffer.from(data).toString('latin1')
        if (content.slice(0, 5) !== '%PDF-') {
            throw new Error('Invalid PDF structure')
        }
        // A `PAGES=N` marker in the buffer lets a test simulate a multi-page PDF
        // (exercises the MAX_PDF_PAGES cap); absent the marker, a 1-page doc.
        const pageMatch = content.match(/PAGES=(\d+)/)
        const totalPages = pageMatch ? parseInt(pageMatch[1], 10) : 1
        return { text: KNOWN_PDF_TEXT, totalPages }
    },
}))

import {
    detectDocumentFormat,
    extractDocumentText,
} from '../extract-document'

// ── Real .docx fixture ─────────────────────────────────────────────
// mammoth DOES run under jsdom, so the .docx path is proven against a real
// minimal docx built in-test with jszip (present transitively via mammoth).

const KNOWN_DOCX_LINE = 'Adon Olam Erev Shabbat'

async function buildDocx(bodyText: string): Promise<Buffer> {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    )
    zip.file(
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    )
    zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p></w:body>
</w:document>`,
    )
    return zip.generateAsync({ type: 'nodebuffer' })
}

let docxBuffer: Buffer

beforeAll(async () => {
    docxBuffer = await buildDocx(KNOWN_DOCX_LINE)
})

describe('detectDocumentFormat', () => {
    it('resolves by mimeType', () => {
        expect(
            detectDocumentFormat(
                'x',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ),
        ).toBe('docx')
        expect(detectDocumentFormat('x', 'application/pdf')).toBe('pdf')
        expect(detectDocumentFormat('x', 'text/plain')).toBe('txt')
    })

    it('falls back to the filename extension', () => {
        expect(detectDocumentFormat('service.docx')).toBe('docx')
        expect(detectDocumentFormat('service.PDF')).toBe('pdf')
        expect(detectDocumentFormat('notes.txt')).toBe('txt')
    })

    it('returns null for unsupported formats', () => {
        expect(detectDocumentFormat('chart.png', 'image/png')).toBeNull()
        expect(detectDocumentFormat('data.xlsx')).toBeNull()
        expect(detectDocumentFormat('noextension')).toBeNull()
    })
})

describe('extractDocumentText', () => {
    it('extracts UTF-8 text from a .txt buffer', async () => {
        const buf = Buffer.from('Adon Olam\nLecha Dodi', 'utf-8')
        const result = await extractDocumentText(buf, {
            fileName: 'setlist.txt',
        })
        expect(result).toEqual({
            ok: true,
            format: 'txt',
            text: 'Adon Olam\nLecha Dodi',
            charCount: 20,
        })
    })

    it('extracts text from a real .docx via mammoth', async () => {
        const result = await extractDocumentText(docxBuffer, {
            fileName: 'service.docx',
        })
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.format).toBe('docx')
            expect(result.text).toContain(KNOWN_DOCX_LINE)
        }
    })

    it('extracts text from a .pdf via the server-side pdfjs loader', async () => {
        // Buffer carries the %PDF- magic header so the mocked loader resolves.
        const pdfBuffer = Buffer.from(`%PDF-1.4\n${KNOWN_PDF_TEXT}`, 'latin1')
        const result = await extractDocumentText(pdfBuffer, {
            fileName: 'service.pdf',
        })
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.format).toBe('pdf')
            expect(result.text.replace(/\s+/g, ' ')).toContain(KNOWN_PDF_TEXT)
        }
    })

    it('returns unsupported_format for a non-doc file (no throw)', async () => {
        const result = await extractDocumentText(Buffer.from([1, 2, 3]), {
            fileName: 'cover.png',
            mimeType: 'image/png',
        })
        expect(result).toEqual({
            ok: false,
            reason: 'unsupported_format',
            message: expect.any(String),
        })
    })

    it('returns empty for a supported file with no text content', async () => {
        const result = await extractDocumentText(
            Buffer.from('   \n  ', 'utf-8'),
            { fileName: 'blank.txt' },
        )
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.reason).toBe('empty')
    })

    it('caps PDF page count — a PDF over the limit fails without parsing unbounded pages', async () => {
        // 999 pages — well over the 50-page cap. The `PAGES=` marker drives the
        // mocked loader's numPages; extractPdfText throws before the page loop.
        const hugePdf = Buffer.from(
            `%PDF-1.4\nPAGES=999\n${KNOWN_PDF_TEXT}`,
            'latin1',
        )
        const result = await extractDocumentText(hugePdf, {
            fileName: 'huge.pdf',
        })
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.reason).toBe('extraction_failed')
            expect(result.message).toContain('page limit')
        }
    })

    it('extracts text from a PDF at the page-count boundary', async () => {
        // 50 pages — exactly the cap, must still succeed.
        const okPdf = Buffer.from(
            `%PDF-1.4\nPAGES=50\n${KNOWN_PDF_TEXT}`,
            'latin1',
        )
        const result = await extractDocumentText(okPdf, {
            fileName: 'service.pdf',
        })
        expect(result.ok).toBe(true)
    })

    it('returns extraction_failed for corrupt input of a supported format (no throw)', async () => {
        const garbage = Buffer.from('this is not a real pdf', 'utf-8')
        const result = await extractDocumentText(garbage, {
            fileName: 'broken.pdf',
        })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.reason).toBe('extraction_failed')
    })
})
