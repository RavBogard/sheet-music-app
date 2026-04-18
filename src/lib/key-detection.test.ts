import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──

vi.mock('@/lib/file-fetcher', () => ({
    fetchFileById: vi.fn(),
}))

vi.mock('@/lib/pdf-chord-extractor', () => ({
    extractChordsFromPage: vi.fn(),
}))

vi.mock('@/lib/music-math', () => ({
    estimateKey: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { fetchFileById } from '@/lib/file-fetcher'
import { extractChordsFromPage } from '@/lib/pdf-chord-extractor'
import { estimateKey } from '@/lib/music-math'
import { detectKeyFromPdf } from './key-detection'

const mockFetchFileById = vi.mocked(fetchFileById)
const mockExtractChordsFromPage = vi.mocked(extractChordsFromPage)
const mockEstimateKey = vi.mocked(estimateKey)

describe('detectKeyFromPdf', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns estimated key for a valid PDF with chords', async () => {
        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })
        mockExtractChordsFromPage.mockResolvedValue({
            page: 1,
            chords: [
                { text: 'G', x: 50, y: 700, w: 12, h: 12 },
                { text: 'C', x: 150, y: 700, w: 12, h: 12 },
                { text: 'D', x: 250, y: 700, w: 12, h: 12 },
                { text: 'Em', x: 350, y: 700, w: 20, h: 12 },
            ],
            pageWidth: 612,
            pageHeight: 792,
        })
        mockEstimateKey.mockReturnValue('G')

        const result = await detectKeyFromPdf('file-123')

        expect(result).toBe('G')
        expect(mockFetchFileById).toHaveBeenCalledWith('file-123', 'application/pdf')
        expect(mockExtractChordsFromPage).toHaveBeenCalledWith(
            expect.any(Uint8Array),
            1
        )
        expect(mockEstimateKey).toHaveBeenCalledWith(['G', 'C', 'D', 'Em'])
    })

    it('returns null when file is not found', async () => {
        mockFetchFileById.mockResolvedValue(null)

        const result = await detectKeyFromPdf('nonexistent-file')

        expect(result).toBeNull()
        expect(mockExtractChordsFromPage).not.toHaveBeenCalled()
    })

    it('returns null for non-PDF content type', async () => {
        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('not a pdf'),
            contentType: 'image/png',
            source: 'firebase-storage' as const,
        })

        const result = await detectKeyFromPdf('image-file')

        expect(result).toBeNull()
        expect(mockExtractChordsFromPage).not.toHaveBeenCalled()
    })

    it('returns null when no chords are extracted', async () => {
        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })
        mockExtractChordsFromPage.mockResolvedValue({
            page: 1,
            chords: [],
            pageWidth: 612,
            pageHeight: 792,
        })

        const result = await detectKeyFromPdf('no-chords-file')

        expect(result).toBeNull()
        expect(mockEstimateKey).not.toHaveBeenCalled()
    })

    it('returns null when extractChordsFromPage returns null', async () => {
        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })
        mockExtractChordsFromPage.mockResolvedValue(null)

        const result = await detectKeyFromPdf('bad-extraction')

        expect(result).toBeNull()
        expect(mockEstimateKey).not.toHaveBeenCalled()
    })

    it('returns null and logs warning on fetch error', async () => {
        mockFetchFileById.mockRejectedValue(new Error('Network error'))

        const result = await detectKeyFromPdf('error-file')

        expect(result).toBeNull()
    })

    it('returns null and logs warning on extraction error', async () => {
        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })
        mockExtractChordsFromPage.mockRejectedValue(new Error('PDF parse failed'))

        const result = await detectKeyFromPdf('corrupt-file')

        expect(result).toBeNull()
    })
})
