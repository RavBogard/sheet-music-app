import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks (available inside vi.mock factories) ──

const { mockGenerateContent, mockSet, mockDoc, mockCollection, mockGetFirestore } = vi.hoisted(() => {
    const mockGenerateContent = vi.fn()
    const mockSet = vi.fn().mockResolvedValue(undefined)
    const mockDoc = vi.fn().mockReturnValue({ set: mockSet })
    const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc })
    const mockGetFirestore = vi.fn().mockReturnValue({ collection: mockCollection })
    return { mockGenerateContent, mockSet, mockDoc, mockCollection, mockGetFirestore }
})

vi.mock('@/lib/gemini', () => ({
    geminiFlash: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
    }),
}))

vi.mock('@/lib/file-fetcher', () => ({
    fetchFileById: vi.fn(),
}))

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: mockGetFirestore,
}))

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: mockGetFirestore,
}))

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { fetchFileById } from '@/lib/file-fetcher'
import { enrichFile } from './enrichment-engine'

const mockFetchFileById = vi.mocked(fetchFileById)

describe('enrichFile', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockCollection.mockReturnValue({ doc: mockDoc })
        mockDoc.mockReturnValue({ set: mockSet })
        mockSet.mockResolvedValue(undefined)
    })

    it('enriches file with valid Gemini JSON response', async () => {
        const metadata = {
            title: 'Ma Tovu',
            artist: 'Traditional',
            key: 'G Major',
            bpm: 120,
            timeSignature: '4/4',
            topics: ['Worship', 'Joy'],
            summary: 'Traditional Jewish worship song',
        }

        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf-content'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })
        mockGenerateContent.mockResolvedValue({
            response: { text: () => JSON.stringify(metadata) },
        })

        const result = await enrichFile('file-abc')

        expect(result).toEqual(metadata)
        expect(mockFetchFileById).toHaveBeenCalledWith('file-abc')
        expect(mockCollection).toHaveBeenCalledWith('library_index')
        expect(mockDoc).toHaveBeenCalledWith('file-abc')
        expect(mockSet).toHaveBeenCalledWith(
            {
                metadata: expect.objectContaining({
                    ...metadata,
                    enrichedAt: expect.any(String),
                    enrichmentVersion: '1.0',
                }),
            },
            { merge: true }
        )
    })

    it('strips markdown fences from Gemini response', async () => {
        const metadata = { title: 'Shalom', key: 'D Minor' }
        const wrappedResponse = '```json\n' + JSON.stringify(metadata) + '\n```'

        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })
        mockGenerateContent.mockResolvedValue({
            response: { text: () => wrappedResponse },
        })

        const result = await enrichFile('file-md')

        expect(result).toEqual(metadata)
    })

    it('throws on invalid JSON from Gemini', async () => {
        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'This is not JSON at all, sorry!' },
        })

        await expect(enrichFile('file-bad')).rejects.toThrow('AI returned invalid JSON')
    })

    it('throws when file not found', async () => {
        mockFetchFileById.mockResolvedValue(null)

        await expect(enrichFile('nonexistent')).rejects.toThrow('File not found: nonexistent')
    })

    it('sends PDF as base64 inline data to Gemini', async () => {
        const pdfBuffer = Buffer.from('test-pdf-bytes')
        mockFetchFileById.mockResolvedValue({
            buffer: pdfBuffer,
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })
        mockGenerateContent.mockResolvedValue({
            response: { text: () => '{"title": "Test"}' },
        })

        await enrichFile('file-b64')

        expect(mockGenerateContent).toHaveBeenCalledWith([
            expect.stringContaining('expert music librarian'),
            {
                inlineData: {
                    data: pdfBuffer.toString('base64'),
                    mimeType: 'application/pdf',
                },
            },
        ])
    })

    it('saves enrichedAt timestamp and version to Firestore', async () => {
        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })
        mockGenerateContent.mockResolvedValue({
            response: { text: () => '{"title": "Test Song"}' },
        })

        await enrichFile('file-ts')

        expect(mockSet).toHaveBeenCalledWith(
            {
                metadata: expect.objectContaining({
                    enrichedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
                    enrichmentVersion: '1.0',
                }),
            },
            { merge: true }
        )
    })

    it('handles partial metadata from Gemini', async () => {
        const partial = { title: 'Unknown Song', bpm: null }
        mockFetchFileById.mockResolvedValue({
            buffer: Buffer.from('fake-pdf'),
            contentType: 'application/pdf',
            source: 'firebase-storage' as const,
        })
        mockGenerateContent.mockResolvedValue({
            response: { text: () => JSON.stringify(partial) },
        })

        const result = await enrichFile('file-partial')

        expect(result.title).toBe('Unknown Song')
        expect(result.bpm).toBeNull()
    })
})
