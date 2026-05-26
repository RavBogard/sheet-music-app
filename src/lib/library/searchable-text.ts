// f4-lyric-search-persistence-mod (Tier 2, 2026-05-26): extract a
// searchable text body from an uploaded chart buffer at PCU write time.
// Lets `search_chart_text({scope:"lyrics"})` find charts by the words
// inside them — closes the gap the F4-A `search_chart_text` tool
// explicitly carries ("lyric search is NOT supported — lyrics are not
// persisted to Firestore today").
//
// REUSES `extract-document.ts` for PDF + TXT. Adds a small regex-based
// `<lyric><text>` walker for MusicXML because `extract-document.ts`
// doesn't currently support XML and `[[project_musicxml_goal]]` makes
// lyric search on MusicXML strategically important. Image + audio rows
// skip extraction (no text to extract).
//
// Phase-0 design: FINDINGS at `.paul/research/f4-lyric-search-persistence-mod/FINDINGS.md`.

import 'server-only'

import { extractDocumentText } from '@/lib/setlist-import/extract-document'

/**
 * Hard cap on `searchableText` size, applied AFTER lowercase + whitespace
 * collapse. Worship-service PDFs run ~12KB after normalization; 50KB
 * gives 4x headroom while keeping `library_index/{id}` doc size bounded.
 * Truncation appends an ellipsis marker; `truncated:true` is reported
 * on the result so the caller can log occurrence count for observability.
 */
export const SEARCHABLE_TEXT_MAX_BYTES = 50 * 1024

/** Marker appended when the normalized text exceeds the cap. */
export const TRUNCATION_MARKER = '…'

export interface ExtractSearchableTextInput {
    /** Conversion-finalized buffer (post-MSCZ to XML / HEIC to JPEG). */
    buffer: Buffer
    /** Normalized content-type as PCU resolves it (e.g. application/pdf, application/xml, image/jpeg). */
    contentType: string
    /** Original filename — used as extension fallback when contentType is ambiguous. */
    fileName: string
}

export type ExtractSearchableTextResult =
    | {
          ok: true
          /** Normalized + truncated searchable body. `null` when extraction skipped (image/audio/empty). */
          text: string | null
          /** True when the raw extraction exceeded `SEARCHABLE_TEXT_MAX_BYTES`. */
          truncated: boolean
          /** Format the body was extracted via; 'skip' when no text path applies. */
          format: 'pdf' | 'txt' | 'musicxml' | 'skip'
          /** Present when format === 'skip'. */
          skipReason?: 'image' | 'audio' | 'no_text' | 'unsupported_format'
      }
    | {
          ok: false
          /** Always 'fail' — distinct from 'skip' so callers can log differently. */
          format: 'fail'
          reason: string
      }

/**
 * Normalize extracted body text into the persisted `searchableText` shape:
 *  - lowercase
 *  - convert NBSP -> space
 *  - collapse runs of whitespace into a single space
 *  - trim outer whitespace
 *  - truncate at `SEARCHABLE_TEXT_MAX_BYTES` (UTF-8 byte count), appending `TRUNCATION_MARKER`.
 *
 * Reads on the search-side lowercase the query once and use `indexOf` directly
 * against this normalized field — no per-call re-normalization.
 */
export function normalizeSearchableText(
    raw: string,
): { text: string; truncated: boolean } {
    const NBSP = ' '
    const collapsed = raw
        .split(NBSP)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()

    const byteLen = Buffer.byteLength(collapsed, 'utf8')
    if (byteLen <= SEARCHABLE_TEXT_MAX_BYTES) {
        return { text: collapsed, truncated: false }
    }

    // Truncate at the UTF-8 byte boundary, leaving room for the marker.
    const markerBytes = Buffer.byteLength(TRUNCATION_MARKER, 'utf8')
    const cap = SEARCHABLE_TEXT_MAX_BYTES - markerBytes
    const buf = Buffer.from(collapsed, 'utf8').slice(0, cap)
    // Buffer.slice on a non-boundary multi-byte char leaves a replacement
    // char on toString — strip any trailing U+FFFD before appending the
    // marker so the persisted value is clean.
    const sliced = buf.toString('utf8').replace(/�+$/, '')
    return { text: sliced + TRUNCATION_MARKER, truncated: true }
}

/**
 * Extract lyric text from MusicXML bytes via regex walker.
 *
 * Pulls three element shapes that carry user-visible chart text:
 *  - `<lyric>...<text>WORDS</text>...</lyric>` — the actual lyrics
 *  - `<credit-words>HEADER</credit-words>` — composer / lyricist credits
 *  - `<work-title>SONG NAME</work-title>` — title (already searchable
 *    via `library_index.title`, but free here and harmless to include)
 *
 * Regex-based — well-formed MusicXML produced by MuseScore / Finale /
 * Sibelius matches. Pathological CDATA-nested or namespace-prefixed
 * shapes are tolerated (caller graceful-degrades on empty result).
 *
 * Exported for unit testing; PCU calls through `extractSearchableText`.
 */
export function extractMusicXmlText(xml: string): string {
    const tokens: string[] = []

    // <lyric>...<text>WORDS</text>...</lyric> — non-greedy at both layers.
    // We scan inside each <lyric> block (rather than picking up every <text>
    // element in the file) to avoid pulling text from unrelated elements
    // that happen to have a <text> child.
    const lyricRe = /<lyric\b[^>]*>([\s\S]*?)<\/lyric>/gi
    const innerTextRe = /<text\b[^>]*>([\s\S]*?)<\/text>/gi
    let lm: RegExpExecArray | null
    while ((lm = lyricRe.exec(xml)) !== null) {
        const innerBlock = lm[1]
        let tm: RegExpExecArray | null
        const innerScanRe = new RegExp(innerTextRe.source, innerTextRe.flags)
        while ((tm = innerScanRe.exec(innerBlock)) !== null) {
            const decoded = decodeXmlEntities(tm[1])
            if (decoded.trim()) tokens.push(decoded)
        }
    }

    const creditRe = /<credit-words\b[^>]*>([\s\S]*?)<\/credit-words>/gi
    let cm: RegExpExecArray | null
    while ((cm = creditRe.exec(xml)) !== null) {
        const decoded = decodeXmlEntities(cm[1])
        if (decoded.trim()) tokens.push(decoded)
    }

    const workRe = /<work-title\b[^>]*>([\s\S]*?)<\/work-title>/gi
    let wm: RegExpExecArray | null
    while ((wm = workRe.exec(xml)) !== null) {
        const decoded = decodeXmlEntities(wm[1])
        if (decoded.trim()) tokens.push(decoded)
    }

    return tokens.join(' ')
}

/**
 * Decode the five XML predefined entities plus numeric character references.
 * Exported for unit testing.
 */
export function decodeXmlEntities(s: string): string {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
            String.fromCodePoint(parseInt(hex, 16)),
        )
        .replace(/&#(\d+);/g, (_, dec) =>
            String.fromCodePoint(parseInt(dec, 10)),
        )
        .replace(/&amp;/g, '&') // last — so a literal &amp;lt; round-trips correctly
}

/**
 * Extract a searchable text body from an uploaded chart buffer.
 *
 * Never throws — all failure modes return a discriminated result. The PCU
 * caller graceful-degrades on `{ok: false}` by omitting `searchableText`
 * from `library_index/{id}` and warn-logging.
 *
 * Format routing:
 *  - `image/*` / `audio/*` -> skip (no text)
 *  - MusicXML mimes / `.xml`/`.musicxml`/`.mxl` extensions -> regex walker
 *  - `application/pdf` / `text/plain` -> `extractDocumentText` (pdfjs / utf-8)
 *  - anything else -> skip (unsupported)
 */
export async function extractSearchableText(
    input: ExtractSearchableTextInput,
): Promise<ExtractSearchableTextResult> {
    const { buffer, contentType, fileName } = input
    const ctLower = contentType.toLowerCase()

    if (ctLower.startsWith('image/')) {
        return {
            ok: true,
            text: null,
            truncated: false,
            format: 'skip',
            skipReason: 'image',
        }
    }
    if (ctLower.startsWith('audio/')) {
        return {
            ok: true,
            text: null,
            truncated: false,
            format: 'skip',
            skipReason: 'audio',
        }
    }

    const isMusicXml =
        ctLower.includes('musicxml') ||
        ctLower === 'application/xml' ||
        ctLower === 'text/xml' ||
        /\.(musicxml|mxl|xml)$/i.test(fileName)

    try {
        if (isMusicXml) {
            const xml = buffer.toString('utf-8')
            const raw = extractMusicXmlText(xml)
            if (!raw.trim()) {
                return {
                    ok: true,
                    text: null,
                    truncated: false,
                    format: 'skip',
                    skipReason: 'no_text',
                }
            }
            const { text, truncated } = normalizeSearchableText(raw)
            if (!text) {
                return {
                    ok: true,
                    text: null,
                    truncated: false,
                    format: 'skip',
                    skipReason: 'no_text',
                }
            }
            return { ok: true, text, truncated, format: 'musicxml' }
        }

        const extracted = await extractDocumentText(buffer, {
            fileName,
            mimeType: contentType,
        })
        if (!extracted.ok) {
            if (extracted.reason === 'empty') {
                return {
                    ok: true,
                    text: null,
                    truncated: false,
                    format: 'skip',
                    skipReason: 'no_text',
                }
            }
            if (extracted.reason === 'unsupported_format') {
                return {
                    ok: true,
                    text: null,
                    truncated: false,
                    format: 'skip',
                    skipReason: 'unsupported_format',
                }
            }
            return { ok: false, format: 'fail', reason: extracted.message }
        }
        const { text, truncated } = normalizeSearchableText(extracted.text)
        if (!text) {
            return {
                ok: true,
                text: null,
                truncated: false,
                format: 'skip',
                skipReason: 'no_text',
            }
        }
        return {
            ok: true,
            text,
            truncated,
            format: extracted.format === 'pdf' ? 'pdf' : 'txt',
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { ok: false, format: 'fail', reason: message }
    }
}
