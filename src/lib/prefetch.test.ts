// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prefetchUpcoming, isFilePrefetched } from './prefetch'
import { QueueItem } from './store'

// Mock offline-store
vi.mock('./offline-store', () => ({
    isFileOffline: vi.fn(),
    saveOfflineFile: vi.fn(),
}))

import { isFileOffline, saveOfflineFile } from './offline-store'

const mockIsFileOffline = isFileOffline as ReturnType<typeof vi.fn>
const mockSaveOfflineFile = saveOfflineFile as ReturnType<typeof vi.fn>

describe('prefetchUpcoming', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn())
        mockIsFileOffline.mockReset()
        mockSaveOfflineFile.mockReset()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    const makeQueue = (ids: string[]): QueueItem[] =>
        ids.map(id => ({ name: `Song ${id}`, fileId: id, type: 'pdf' as const }))

    it('prefetches next 3 files by default', async () => {
        const queue = makeQueue(['a', 'b', 'c', 'd', 'e'])
        mockIsFileOffline.mockResolvedValue(false) // Not cached
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
            Promise.resolve(new Response('pdf-data', {
                status: 200,
                headers: { 'content-type': 'application/pdf' },
            }))
        )

        await prefetchUpcoming(queue, 0)

        // Should fetch b, c, d (indices 1, 2, 3)
        expect(globalThis.fetch).toHaveBeenCalledTimes(3)
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/b')
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/c')
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/d')
        expect(mockSaveOfflineFile).toHaveBeenCalledTimes(3)
    })

    it('skips already cached files', async () => {
        const queue = makeQueue(['a', 'b', 'c'])
        mockIsFileOffline
            .mockResolvedValueOnce(true) // b is cached
            .mockResolvedValueOnce(false) // c is not
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
            Promise.resolve(new Response('pdf-data', {
                status: 200,
                headers: { 'content-type': 'application/pdf' },
            }))
        )

        await prefetchUpcoming(queue, 0)

        expect(globalThis.fetch).toHaveBeenCalledTimes(1) // Only c
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/c')
    })

    it('does nothing for empty queue', async () => {
        await prefetchUpcoming([], 0)
        expect(mockIsFileOffline).not.toHaveBeenCalled()
    })

    it('does nothing when at end of queue', async () => {
        const queue = makeQueue(['a', 'b'])
        await prefetchUpcoming(queue, 1) // At last item
        expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('handles fetch errors silently', async () => {
        const queue = makeQueue(['a', 'b'])
        mockIsFileOffline.mockResolvedValue(false)
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

        // Should not throw
        await expect(prefetchUpcoming(queue, 0)).resolves.toBeUndefined()
    })

    it('respects custom lookahead', async () => {
        const queue = makeQueue(['a', 'b', 'c', 'd', 'e'])
        mockIsFileOffline.mockResolvedValue(false)
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
            Promise.resolve(new Response('data', {
                status: 200,
                headers: { 'content-type': 'application/pdf' },
            }))
        )

        await prefetchUpcoming(queue, 0, 1) // Only 1 ahead

        expect(globalThis.fetch).toHaveBeenCalledTimes(1)
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/b')
    })
})

describe('isFilePrefetched', () => {
    beforeEach(() => {
        mockIsFileOffline.mockReset()
    })

    it('returns true when file is cached', async () => {
        mockIsFileOffline.mockResolvedValue(true)
        expect(await isFilePrefetched('abc')).toBe(true)
    })

    it('returns false when file is not cached', async () => {
        mockIsFileOffline.mockResolvedValue(false)
        expect(await isFilePrefetched('abc')).toBe(false)
    })

    it('returns false on error', async () => {
        mockIsFileOffline.mockRejectedValue(new Error('DB error'))
        expect(await isFilePrefetched('abc')).toBe(false)
    })
})
