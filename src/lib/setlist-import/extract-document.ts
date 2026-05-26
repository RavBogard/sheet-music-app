// v70-04: server-side document text extraction for v7.0 doc-driven setlist
// creation. Turns an uploaded .docx / .pdf / .txt file into raw text. This is
// the foundation slice — v70-05 feeds the text to Gemini for structured
// extraction. No OCR / image handling (deferred to v7.1).

// Guard: this module statically imports `mammoth` (a heavy server-only dep) and
// is a plausible client-import target (it also exports the pure
// `detectDocumentFormat`). `server-only` makes an accidental client import a
// build error. (v70-08-04)
import 'server-only'

import mammoth from 'mammoth'

import { getPdfjs, PDFJS_NODE_SAFE_OPTIONS } from '@/lib/pdf-chord-extractor'

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

// Worship-service outlines are a handful of pages; 50 is generous headroom and
// caps the per-page parse loop so a pathological PDF cannot run unbounded.
const MAX_PDF_PAGES = 50

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
    // PDFJS_NODE_SAFE_OPTIONS bypasses the fake-worker path that requires
    // globalThis.DOMMatrix (absent on Vercel serverless Node <22.13). Caught
    // 2026-05-26 by supervisor dry-run of backfill_searchable_text (10/10
    // errors, all "DOMMatrix is not defined"). See pdf-chord-extractor.ts.
    const pdfDoc = await pdfjs.getDocument({
        ...PDFJS_NODE_SAFE_OPTIONS,
        data: new Uint8Array(buffer),
    }).promise

    // Cap the page-iteration loop. extractDocumentText's try/catch converts this
    // throw into a typed { ok: false, reason: 'extraction_failed' } result.
    if (pdfDoc.numPages > MAX_PDF_PAGES) {
        throw new Error(`PDF exceeds the ${MAX_PDF_PAGES}-page limit.`)
    }

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
