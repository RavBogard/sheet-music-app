import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadChordCache, saveChordCache, clearChordCache } from './chord-cache'

// Mock apiFetch (used internally by chord-cache)
vi.mock('@/lib/api-client', () => ({
    apiFetch: vi.fn(),
}))

import { apiFetch } from '@/lib/api-client'
const mockApiFetch = vi.mocked(apiFetch)

describe('chord-cache', () => {
    beforeEach(() => {
        mockApiFetch.mockReset()
    })

    describe('loadChordCache', () => {
        it('returns chords when cache hit', async () => {
            const mockChords = [
                { text: 'Am', originalText: 'Am', x: 10, y: 20 },
                { text: 'G', originalText: 'G', x: 30, y: 20 },
            ]
            mockApiFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    cached: true,
                    data: {
                        chords: mockChords,
                        scannedAt: '2025-01-01',
                        scanMethod: 'textLayer',
                        cacheVersion: 6,
                        aiValidated: true
                    }
                })
            } as Response)

            const result = await loadChordCache('file-123', 1)
            expect(result).toEqual({ chords: mockChords, aiValidated: true })
            expect(mockApiFetch).toHaveBeenCalledWith(
                '/api/library/chord-cache?fileId=file-123&page=1'
            )
        })

        it('returns null on cache miss', async () => {
            mockApiFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ cached: false })
            } as Response)

            const result = await loadChordCache('file-123', 1)
            expect(result).toBeNull()
        })

        it('returns null on empty chord array', async () => {
            mockApiFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    cached: true,
                    data: { chords: [], scannedAt: '2025-01-01', scanMethod: 'textLayer' }
                })
            } as Response)

            const result = await loadChordCache('file-123', 1)
            expect(result).toBeNull()
        })

        it('returns null on HTTP error', async () => {
            mockApiFetch.mockResolvedValueOnce({ ok: false } as Response)
            const result = await loadChordCache('file-123', 1)
            expect(result).toBeNull()
        })

        it('returns null on network error', async () => {
            mockApiFetch.mockRejectedValueOnce(new Error('Network error'))
            const result = await loadChordCache('file-123', 1)
            expect(result).toBeNull()
        })
    })

    describe('saveChordCache', () => {
        it('sends POST with chord data', () => {
            mockApiFetch.mockResolvedValueOnce({ ok: true } as Response)

            const chords = [
                { text: 'C', originalText: 'C', x: 5, y: 10 }
            ]
            saveChordCache('file-456', 2, chords, 'textLayer')

            expect(mockApiFetch).toHaveBeenCalledWith(
                '/api/library/chord-cache',
                expect.objectContaining({
                    method: 'POST',
                })
            )
        })

        it('does not send empty chord arrays', () => {
            saveChordCache('file-456', 2, [], 'textLayer')
            expect(mockApiFetch).not.toHaveBeenCalled()
        })

        it('does not throw on network error (fire-and-forget)', () => {
            mockApiFetch.mockRejectedValueOnce(new Error('Offline'))
            expect(() => {
                saveChordCache('file-456', 1, [{ text: 'G', originalText: 'G', x: 0, y: 0 }], 'ai')
            }).not.toThrow()
        })
    })

    describe('clearChordCache', () => {
        it('sends DELETE request', async () => {
            mockApiFetch.mockResolvedValueOnce({ ok: true } as Response)

            const result = await clearChordCache('file-789')
            expect(result).toBe(true)
            expect(mockApiFetch).toHaveBeenCalledWith(
                '/api/library/chord-cache?fileId=file-789',
                expect.objectContaining({ method: 'DELETE' })
            )
        })

        it('returns false on HTTP error', async () => {
            mockApiFetch.mockResolvedValueOnce({ ok: false } as Response)
            const result = await clearChordCache('file-789')
            expect(result).toBe(false)
        })

        it('returns false on network error', async () => {
            mockApiFetch.mockRejectedValueOnce(new Error('Network'))
            const result = await clearChordCache('file-789')
            expect(result).toBe(false)
        })
    })
})
