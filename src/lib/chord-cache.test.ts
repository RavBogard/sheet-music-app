import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadChordCache, saveChordCache, clearChordCache } from './chord-cache'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('chord-cache', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    describe('loadChordCache', () => {
        it('returns chords when cache hit', async () => {
            const mockChords = [
                { text: 'Am', originalText: 'Am', x: 10, y: 20 },
                { text: 'G', originalText: 'G', x: 30, y: 20 },
            ]
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    cached: true,
                    data: {
                        chords: mockChords,
                        scannedAt: '2025-01-01',
                        scanMethod: 'textLayer',
                        cacheVersion: 5
                    }
                })
            })

            const result = await loadChordCache('file-123', 1, 'token-abc')
            expect(result).toEqual(mockChords)
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/library/chord-cache?fileId=file-123&page=1',
                expect.objectContaining({
                    headers: { 'Authorization': 'Bearer token-abc' }
                })
            )
        })

        it('returns null on cache miss', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ cached: false })
            })

            const result = await loadChordCache('file-123', 1, 'token')
            expect(result).toBeNull()
        })

        it('returns null on empty chord array', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    cached: true,
                    data: { chords: [], scannedAt: '2025-01-01', scanMethod: 'textLayer' }
                })
            })

            const result = await loadChordCache('file-123', 1, 'token')
            expect(result).toBeNull()
        })

        it('returns null on HTTP error', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false })
            const result = await loadChordCache('file-123', 1, 'token')
            expect(result).toBeNull()
        })

        it('returns null on network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'))
            const result = await loadChordCache('file-123', 1, 'token')
            expect(result).toBeNull()
        })
    })

    describe('saveChordCache', () => {
        it('sends POST with chord data', () => {
            mockFetch.mockResolvedValueOnce({ ok: true })

            const chords = [
                { text: 'C', originalText: 'C', x: 5, y: 10 }
            ]
            saveChordCache('file-456', 2, chords, 'textLayer', 'token-xyz')

            expect(mockFetch).toHaveBeenCalledWith(
                '/api/library/chord-cache',
                expect.objectContaining({
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer token-xyz'
                    },
                })
            )
        })

        it('does not send empty chord arrays', () => {
            saveChordCache('file-456', 2, [], 'textLayer', 'token')
            expect(mockFetch).not.toHaveBeenCalled()
        })

        it('does not throw on network error (fire-and-forget)', () => {
            mockFetch.mockRejectedValueOnce(new Error('Offline'))
            // Should not throw
            expect(() => {
                saveChordCache('file-456', 1, [{ text: 'G', originalText: 'G', x: 0, y: 0 }], 'geminiOCR', 'token')
            }).not.toThrow()
        })
    })

    describe('clearChordCache', () => {
        it('sends DELETE request', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true })

            const result = await clearChordCache('file-789', 'token-abc')
            expect(result).toBe(true)
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/library/chord-cache?fileId=file-789',
                expect.objectContaining({
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer token-abc' }
                })
            )
        })

        it('returns false on HTTP error', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false })
            const result = await clearChordCache('file-789', 'token')
            expect(result).toBe(false)
        })

        it('returns false on network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network'))
            const result = await clearChordCache('file-789', 'token')
            expect(result).toBe(false)
        })
    })
})
