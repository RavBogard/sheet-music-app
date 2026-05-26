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

// === F4B-DIAG temp instrumentation (Phase 6a — remove before final ship) ===
// Logs Node version + DOMMatrix / Path2D / ImageData global state at the
// moment this module is first imported in the Vercel runtime. Captures
// whether the env is missing the polyfills pdfjs-dist v5 needs at module-
// load time, BEFORE any getDocument({disableWorker:true}) flag is consulted.
let _f4bModuleLoadLogged = false
function _f4bLogModuleLoad() {
    if (_f4bModuleLoadLogged) return
    _f4bModuleLoadLogged = true
    console.error('[F4B-DIAG] extract-document module-load', {
        node: process.version,
        hasDOMMatrix: typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix !== 'undefined',
        hasPath2D: typeof (globalThis as { Path2D?: unknown }).Path2D !== 'undefined',
        hasImageData: typeof (globalThis as { ImageData?: unknown }).ImageData !== 'undefined',
        hasOffscreenCanvas: typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas !== 'undefined',
        runtime: process.env.NEXT_RUNTIME ?? 'unknown',
        vercelRegion: process.env.VERCEL_REGION ?? 'unknown',
    })
}
_f4bLogModuleLoad()
// === /F4B-DIAG ===

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
    // === F4B-DIAG temp instrumentation (Phase 6a — remove before final ship) ===
    // Tags WHICH pdfjs lifecycle stage throws on Vercel: getPdfjs (load),
    // getDocument (parse), getPage / getTextContent (per-page). Stack from
    // each stage is captured and attached to the error message so the
    // extractDocumentText catch block surfaces it through to the MCP envelope.
    let _f4bStage = 'getPdfjs'
    try {
        const pdfjs = await getPdfjs()
        // Read pdfjs.version defensively — vitest's strict mock in
        // extract-document.test.ts doesn't define `version` and any access
        // (incl. `in` operator) on the mock surface throws an error. Wrap
        // in try/catch so the diagnostic stays log-only and never breaks
        // production OR mocked-engine tests.
        let pdfjsVersion = 'unknown'
        try {
            const v = (pdfjs as unknown as { version?: unknown }).version
            if (typeof v === 'string') pdfjsVersion = v
        } catch {
            // mocked-engine strict surface — ignore
        }
        console.error('[F4B-DIAG] extractPdfText pre-getDocument', {
            pdfjsVersion,
            node: process.version,
            hasDOMMatrix: typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix !== 'undefined',
            optionsKeys: Object.keys(PDFJS_NODE_SAFE_OPTIONS),
            bufLen: buffer.length,
        })

        _f4bStage = 'getDocument'
        const pdfDoc = await pdfjs.getDocument({
            ...PDFJS_NODE_SAFE_OPTIONS,
            data: new Uint8Array(buffer),
        }).promise

        if (pdfDoc.numPages > MAX_PDF_PAGES) {
            throw new Error(`PDF exceeds the ${MAX_PDF_PAGES}-page limit.`)
        }

        const pages: string[] = []
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            _f4bStage = `getPage(${pageNum})`
            const page = await pdfDoc.getPage(pageNum)
            _f4bStage = `getTextContent(${pageNum})`
            const textContent = await page.getTextContent()
            const pageText = textContent.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' ')
            pages.push(pageText)
        }
        return pages.join('\n')
    } catch (err) {
        console.error('[F4B-DIAG] extractPdfText FAIL', {
            stage: _f4bStage,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            errName: err instanceof Error ? err.name : typeof err,
        })
        // Re-throw with stage prefix so the extractDocumentText catch surfaces it
        // to the MCP backfill envelope (visible in supervisor's dry-run output).
        const msg = err instanceof Error ? err.message : String(err)
        const wrapped = new Error(`[F4B-DIAG stage=${_f4bStage}] ${msg}`)
        if (err instanceof Error && err.stack) wrapped.stack = err.stack
        throw wrapped
    }
    // === /F4B-DIAG ===
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
