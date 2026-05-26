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

// f4-b-pdf-extractor-serverless-fix-v2 (Tier-2, 2026-05-26): swap pdfjs-dist
// → unpdf for the text-extraction path. Phase 6a runtime evidence (Daniel
// bearer @ 13:09Z) showed stage=`getPdfjs` — pdfjs-dist v5's
// `legacy/build/pdf.mjs` constructs `new DOMMatrix()` during class /
// prototype init at MODULE LOAD on Vercel serverless. That happens BEFORE
// any `getDocument({disableWorker:true})` flag is consulted, so the v1
// runtime-option fix (`e2271c02d` `PDFJS_NODE_SAFE_OPTIONS`) couldn't
// reach it. unpdf bundles a pdfjs build with internal DOM polyfills
// applied BEFORE module-load class init — designed for serverless Node.
// Its `extractText` helper is a drop-in for our text-extraction path
// (we only consume the joined plain-text body, never per-item positions).
//
// The chord-extractor path (`src/lib/pdf-chord-extractor.ts`'s
// `extractChordsFromPdf` / `extractChordsFromPage`) still uses pdfjs-dist
// for positional `transform`/`width`/`height` data; that path likely has
// the same module-load DOMMatrix bug and is flagged as a separate
// follow-up lane (probe `/api/library/detect-key` to confirm).
import { extractText } from 'unpdf'

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

/**
 * Extract all text from a PDF buffer via unpdf (serverless-safe pdfjs).
 *
 * unpdf's `extractText({mergePages:true})` returns `{ text, totalPages }`.
 * totalPages lets us preserve the MAX_PDF_PAGES cap. The text is joined
 * across pages with form-feeds, which we re-normalize to newlines so
 * downstream consumers (the F4-B `searchable-text.ts` walker and the
 * v70-05 Gemini structured extractor) see the same shape they got from
 * the pdfjs path.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
    const data = new Uint8Array(buffer)
    const { text, totalPages } = await extractText(data, { mergePages: true })

    // extractDocumentText's try/catch converts this throw into a typed
    // { ok: false, reason: 'extraction_failed' } result.
    if (totalPages > MAX_PDF_PAGES) {
        throw new Error(`PDF exceeds the ${MAX_PDF_PAGES}-page limit.`)
    }

    // `extractText({mergePages:true})` types `text` as `string` per unpdf's
    // README, but be defensive: if it ever returns string[] (mergePages:false
    // contract) we join with newlines.
    const joined = Array.isArray(text) ? text.join('\n') : text
    return joined
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
