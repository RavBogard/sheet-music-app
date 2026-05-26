// f4-lyric-search-persistence-mod Phase 1 tests — unit-level verification of
// the searchable-text helper. PCU-integration tests live separately; this
// file tests the pure helper surfaces (normalize / decode entities /
// MusicXML walker / extractSearchableText dispatch) in isolation so the
// suite stays fast and deterministic.

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// Mock extract-document.ts so PDF/TXT path tests don't pull pdfjs.
vi.mock('@/lib/setlist-import/extract-document', () => ({
    extractDocumentText: vi.fn(),
}))

import {
    SEARCHABLE_TEXT_MAX_BYTES,
    TRUNCATION_MARKER,
    decodeXmlEntities,
    extractMusicXmlText,
    extractSearchableText,
    normalizeSearchableText,
} from '@/lib/library/searchable-text'
import { extractDocumentText } from '@/lib/setlist-import/extract-document'

const mockExtract = vi.mocked(extractDocumentText)

beforeEach(() => {
    mockExtract.mockReset()
})

describe('normalizeSearchableText', () => {
    it('lowercases the result', () => {
        expect(normalizeSearchableText('Hineh Ma Tov').text).toBe('hineh ma tov')
    })

    it('collapses runs of whitespace into single spaces', () => {
        expect(normalizeSearchableText('a   b\t\tc\n\nd').text).toBe('a b c d')
    })

    it('converts NBSP into space', () => {
        const NBSP = ' '
        expect(normalizeSearchableText(`a${NBSP}b${NBSP}${NBSP}c`).text).toBe(
            'a b c',
        )
    })

    it('trims outer whitespace', () => {
        expect(normalizeSearchableText('   hello world   ').text).toBe(
            'hello world',
        )
    })

    it('returns truncated:false when under cap', () => {
        const result = normalizeSearchableText('short body')
        expect(result.truncated).toBe(false)
        expect(result.text).toBe('short body')
    })

    it('returns truncated:true with marker when over cap', () => {
        const huge = 'a'.repeat(SEARCHABLE_TEXT_MAX_BYTES + 100)
        const result = normalizeSearchableText(huge)
        expect(result.truncated).toBe(true)
        expect(result.text.endsWith(TRUNCATION_MARKER)).toBe(true)
        expect(Buffer.byteLength(result.text, 'utf8')).toBeLessThanOrEqual(
            SEARCHABLE_TEXT_MAX_BYTES,
        )
    })

    it('does NOT truncate at exactly the cap', () => {
        const exact = 'a'.repeat(SEARCHABLE_TEXT_MAX_BYTES)
        const result = normalizeSearchableText(exact)
        expect(result.truncated).toBe(false)
        expect(result.text.endsWith(TRUNCATION_MARKER)).toBe(false)
    })

    it('handles empty input', () => {
        expect(normalizeSearchableText('').text).toBe('')
        expect(normalizeSearchableText('   \n\t  ').text).toBe('')
    })

    it('truncates UTF-8 multi-byte chars cleanly (no orphan replacement char)', () => {
        // Hebrew char is 2 UTF-8 bytes. Cram enough to overflow at an odd boundary.
        const hebrew = 'אא'.repeat(SEARCHABLE_TEXT_MAX_BYTES / 2)
        const result = normalizeSearchableText(hebrew)
        expect(result.truncated).toBe(true)
        // No replacement-char (U+FFFD) immediately before the marker.
        expect(result.text).not.toMatch(/�[…]$/)
    })
})

describe('decodeXmlEntities', () => {
    it('decodes the five predefined XML entities', () => {
        expect(decodeXmlEntities('&lt;a&gt; &quot;b&quot; &apos;c&apos;')).toBe(
            `<a> "b" 'c'`,
        )
    })

    it('decodes &amp; last so &amp;lt; round-trips to &lt;', () => {
        expect(decodeXmlEntities('&amp;lt;')).toBe('&lt;')
    })

    it('decodes decimal numeric references', () => {
        expect(decodeXmlEntities('&#65;&#66;&#67;')).toBe('ABC')
    })

    it('decodes hex numeric references', () => {
        expect(decodeXmlEntities('&#x41;&#x42;')).toBe('AB')
    })

    it('leaves unrecognized markup alone', () => {
        expect(decodeXmlEntities('hello &nbsp; world')).toBe(
            'hello &nbsp; world',
        )
    })
})

describe('extractMusicXmlText', () => {
    it('pulls <text> contents from inside <lyric> blocks', () => {
        const xml = `
            <lyric number="1">
                <syllabic>single</syllabic>
                <text>Hineh</text>
            </lyric>
            <lyric number="1">
                <syllabic>single</syllabic>
                <text>ma</text>
            </lyric>
            <lyric number="1">
                <syllabic>single</syllabic>
                <text>tov</text>
            </lyric>
        `
        expect(extractMusicXmlText(xml)).toBe('Hineh ma tov')
    })

    it('decodes XML entities inside lyrics', () => {
        const xml = `<lyric><text>Rock &amp; Roll</text></lyric>`
        expect(extractMusicXmlText(xml)).toBe('Rock & Roll')
    })

    it('pulls credit-words elements', () => {
        const xml = `
            <credit-words>Lyrics by Debbie Friedman</credit-words>
            <credit-words>Arr. Klepper</credit-words>
        `
        expect(extractMusicXmlText(xml)).toBe(
            'Lyrics by Debbie Friedman Arr. Klepper',
        )
    })

    it('pulls work-title element', () => {
        const xml = `<work><work-title>Hashkivenu</work-title></work>`
        expect(extractMusicXmlText(xml)).toBe('Hashkivenu')
    })

    it('combines lyrics + credit-words + work-title', () => {
        const xml = `
            <work-title>Adon Olam</work-title>
            <credit-words>Trad.</credit-words>
            <lyric><text>Adon</text></lyric>
            <lyric><text>olam</text></lyric>
        `
        // Order: lyrics first, then credit-words, then work-title (per impl).
        expect(extractMusicXmlText(xml)).toBe('Adon olam Trad. Adon Olam')
    })

    it('ignores <text> elements OUTSIDE <lyric> blocks', () => {
        const xml = `
            <some-other-element><text>not a lyric</text></some-other-element>
            <lyric><text>this one is</text></lyric>
        `
        expect(extractMusicXmlText(xml)).toBe('this one is')
    })

    it('returns empty string when no lyric/credit/title elements present', () => {
        const xml = `<score-partwise><part-list/></score-partwise>`
        expect(extractMusicXmlText(xml)).toBe('')
    })

    it('tolerates attributes and whitespace on tags', () => {
        const xml = `<lyric  number = "1"  ><text xml:lang="en">word</text></lyric>`
        expect(extractMusicXmlText(xml)).toBe('word')
    })

    it('handles non-greedy across multiple lyric blocks (no over-match)', () => {
        const xml = `<lyric><text>a</text></lyric>some other content<lyric><text>b</text></lyric>`
        expect(extractMusicXmlText(xml)).toBe('a b')
    })

    it('skips empty <text> elements gracefully', () => {
        const xml = `<lyric><text></text><text>real</text><text>   </text></lyric>`
        expect(extractMusicXmlText(xml)).toBe('real')
    })
})

describe('extractSearchableText', () => {
    it('skips image/* with skipReason:image', async () => {
        const result = await extractSearchableText({
            buffer: Buffer.from([0xff, 0xd8, 0xff]),
            contentType: 'image/jpeg',
            fileName: 'chart.jpg',
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.text).toBeNull()
        expect(result.format).toBe('skip')
        expect(result.skipReason).toBe('image')
        expect(mockExtract).not.toHaveBeenCalled()
    })

    it('skips audio/* with skipReason:audio', async () => {
        const result = await extractSearchableText({
            buffer: Buffer.from([0xff, 0xfb]),
            contentType: 'audio/mpeg',
            fileName: 'chart.mp3',
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.text).toBeNull()
        expect(result.skipReason).toBe('audio')
        expect(mockExtract).not.toHaveBeenCalled()
    })

    it('extracts PDF via extract-document.ts and normalizes', async () => {
        mockExtract.mockResolvedValue({
            ok: true,
            format: 'pdf',
            text: 'Hineh Ma   Tov',
            charCount: 14,
        })
        const result = await extractSearchableText({
            buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
            contentType: 'application/pdf',
            fileName: 'hineh.pdf',
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.text).toBe('hineh ma tov')
        expect(result.format).toBe('pdf')
        expect(result.truncated).toBe(false)
        expect(mockExtract).toHaveBeenCalledOnce()
    })

    it('extracts text/plain via extract-document.ts and normalizes', async () => {
        mockExtract.mockResolvedValue({
            ok: true,
            format: 'txt',
            text: 'Title\nArtist\n\nVerse one of the song',
            charCount: 35,
        })
        const result = await extractSearchableText({
            buffer: Buffer.from('Title\nArtist\n\nVerse one of the song'),
            contentType: 'text/plain',
            fileName: 'verse.txt',
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.text).toBe('title artist verse one of the song')
        expect(result.format).toBe('txt')
    })

    it('routes MusicXML via mime to the regex walker (no extract-document call)', async () => {
        const xml =
            '<score><lyric><text>Adon</text></lyric><lyric><text>Olam</text></lyric></score>'
        const result = await extractSearchableText({
            buffer: Buffer.from(xml, 'utf8'),
            contentType: 'application/vnd.recordare.musicxml+xml',
            fileName: 'adon-olam.musicxml',
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.text).toBe('adon olam')
        expect(result.format).toBe('musicxml')
        expect(mockExtract).not.toHaveBeenCalled()
    })

    it('routes MusicXML via .mxl extension when mime is application/xml', async () => {
        const xml = '<lyric><text>Hashkivenu</text></lyric>'
        const result = await extractSearchableText({
            buffer: Buffer.from(xml, 'utf8'),
            contentType: 'application/xml',
            fileName: 'hashk.mxl',
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.text).toBe('hashkivenu')
        expect(result.format).toBe('musicxml')
    })

    it('graceful-degrades on extract-document FAILED (not skip)', async () => {
        mockExtract.mockResolvedValue({
            ok: false,
            reason: 'extraction_failed',
            message: 'PDF parser error',
        })
        const result = await extractSearchableText({
            buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
            contentType: 'application/pdf',
            fileName: 'broken.pdf',
        })
        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('expected fail')
        expect(result.format).toBe('fail')
        expect(result.reason).toContain('PDF parser error')
    })

    it('returns skip:no_text on empty extraction result', async () => {
        mockExtract.mockResolvedValue({
            ok: false,
            reason: 'empty',
            message: 'No text found in document.',
        })
        const result = await extractSearchableText({
            buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
            contentType: 'application/pdf',
            fileName: 'blank.pdf',
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.text).toBeNull()
        expect(result.skipReason).toBe('no_text')
    })

    it('returns skip:unsupported_format on unsupported format', async () => {
        mockExtract.mockResolvedValue({
            ok: false,
            reason: 'unsupported_format',
            message: 'Only .docx, .pdf, and .txt documents are supported.',
        })
        const result = await extractSearchableText({
            buffer: Buffer.from([0]),
            contentType: 'application/octet-stream',
            fileName: 'mystery.bin',
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.text).toBeNull()
        expect(result.skipReason).toBe('unsupported_format')
    })

    it('returns skip:no_text when MusicXML walker yields empty', async () => {
        const xml = '<score-partwise><part-list/></score-partwise>'
        const result = await extractSearchableText({
            buffer: Buffer.from(xml, 'utf8'),
            contentType: 'application/xml',
            fileName: 'empty.musicxml',
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.text).toBeNull()
        expect(result.skipReason).toBe('no_text')
    })

    it('graceful-degrades on synchronous throw inside extractor', async () => {
        mockExtract.mockRejectedValue(new Error('pdfjs worker crashed'))
        const result = await extractSearchableText({
            buffer: Buffer.from([0]),
            contentType: 'application/pdf',
            fileName: 'crashy.pdf',
        })
        expect(result.ok).toBe(false)
        if (result.ok) throw new Error('expected fail')
        expect(result.reason).toContain('pdfjs worker crashed')
    })

    it('flags truncation when extracted text exceeds the cap', async () => {
        const huge = 'word '.repeat(SEARCHABLE_TEXT_MAX_BYTES / 2)
        mockExtract.mockResolvedValue({
            ok: true,
            format: 'pdf',
            text: huge,
            charCount: huge.length,
        })
        const result = await extractSearchableText({
            buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
            contentType: 'application/pdf',
            fileName: 'huge.pdf',
        })
        expect(result.ok).toBe(true)
        if (!result.ok) throw new Error('expected ok')
        expect(result.truncated).toBe(true)
        expect(result.text?.endsWith(TRUNCATION_MARKER)).toBe(true)
    })
})
