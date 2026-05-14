// v70-04: server-side document text extraction for v7.0 doc-driven setlist
// creation. Turns an uploaded .docx / .pdf / .txt file into raw text. This is
// the foundation slice — v70-05 feeds the text to Gemini for structured
// extraction. No OCR / image handling (deferred to v7.1).

import mammoth from 'mammoth'

import { getPdfjs } from '@/lib/pdf-chord-extractor'

export type DocumentFormat = 'docx' | 'pdf' | 'txt'

export type ExtractResult =
    | { ok: true; text: string; format: DocumentFormat; charCount: number }
    | {
          ok: false
          reason: 'unsupported_format' | 'extraction_failed' | 'empty'
          message: string
      }

const DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Resolve a document format from mimeType (preferred) then filename extension.
 * Returns null for anything that is not .docx / .pdf / .txt.
 */
export function detectDocumentFormat(
    fileName: string,
    mimeType?: string,
): DocumentFormat | null {
    const mime = (mimeType ?? '').toLowerCase()
    if (mime === DOCX_MIME) return 'docx'
    if (mime === 'application/pdf') return 'pdf'
    if (mime === 'text/plain') return 'txt'

    const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
    if (ext === 'docx') return 'docx'
    if (ext === 'pdf') return 'pdf'
    if (ext === 'txt') return 'txt'

    return null
}

/** Extract all text from a PDF buffer using the shared server-side pdfjs loader. */
async function extractPdfText(buffer: Buffer): Promise<string> {
    const pdfjs = await getPdfjs()
    const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(buffer) })
        .promise

    const pages: string[] = []
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
        pages.push(pageText)
    }
    return pages.join('\n')
}

/**
 * Extract raw text from a document buffer. Never throws — all failure modes
 * return a discriminated `{ ok: false }` result.
 */
export async function extractDocumentText(
    buffer: Buffer,
    opts: { fileName: string; mimeType?: string },
): Promise<ExtractResult> {
    const format = detectDocumentFormat(opts.fileName, opts.mimeType)
    if (!format) {
        return {
            ok: false,
            reason: 'unsupported_format',
            message:
                'Only .docx, .pdf, and .txt documents are supported.',
        }
    }

    let text: string
    try {
        if (format === 'txt') {
            text = buffer.toString('utf-8')
        } else if (format === 'docx') {
            const result = await mammoth.extractRawText({ buffer })
            text = result.value
        } else {
            text = await extractPdfText(buffer)
        }
    } catch (err) {
        return {
            ok: false,
            reason: 'extraction_failed',
            message:
                err instanceof Error
                    ? err.message
                    : `Failed to extract text from ${format} document.`,
        }
    }

    if (text.trim().length === 0) {
        return {
            ok: false,
            reason: 'empty',
            message: 'No text found in document.',
        }
    }

    return { ok: true, text, format, charCount: text.length }
}
