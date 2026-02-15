// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prefetchUpcoming, isFilePrefetched } from './prefetch'
import { QueueItem } from './store'

// Mock Cache API
const mockCache = {
    match: vi.fn(),
    put: vi.fn(),
}

const mockCaches = {
    open: vi.fn().mockResolvedValue(mockCache),
}

describe('prefetchUpcoming', () => {
    beforeEach(() => {
        vi.stubGlobal('caches', mockCaches)
        vi.stubGlobal('fetch', vi.fn())
        mockCache.match.mockReset()
        mockCache.put.mockReset()
        mockCaches.open.mockReset().mockResolvedValue(mockCache)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    const makeQueue = (ids: string[]): QueueItem[] =>
        ids.map(id => ({ name: `Song ${id}`, fileId: id, type: 'pdf' as const }))

    it('prefetches next 3 files by default', async () => {
        const queue = makeQueue(['a', 'b', 'c', 'd', 'e'])
        mockCache.match.mockResolvedValue(null) // Not cached
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
            new Response('pdf-data', { status: 200 })
        )

        await prefetchUpcoming(queue, 0)

        expect(mockCaches.open).toHaveBeenCalledWith('sheet-music-pdfs')
        // Should fetch b, c, d (indices 1, 2, 3)
        expect(globalThis.fetch).toHaveBeenCalledTimes(3)
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/b')
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/c')
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/d')
    })

    it('skips already cached files', async () => {
        const queue = makeQueue(['a', 'b', 'c'])
        mockCache.match
            .mockResolvedValueOnce(new Response('cached')) // b is cached
            .mockResolvedValueOnce(null) // c is not
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
            new Response('pdf-data', { status: 200 })
        )

        await prefetchUpcoming(queue, 0)

        expect(globalThis.fetch).toHaveBeenCalledTimes(1) // Only c
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/c')
    })

    it('does nothing for empty queue', async () => {
        await prefetchUpcoming([], 0)
        expect(mockCaches.open).not.toHaveBeenCalled()
    })

    it('does nothing when at end of queue', async () => {
        const queue = makeQueue(['a', 'b'])
        await prefetchUpcoming(queue, 1) // At last item

        // Cache opened but no fetches (nothing after index 1)
        expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('handles fetch errors silently', async () => {
        const queue = makeQueue(['a', 'b'])
        mockCache.match.mockResolvedValue(null)
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

        // Should not throw
        await expect(prefetchUpcoming(queue, 0)).resolves.toBeUndefined()
    })

    it('respects custom lookahead', async () => {
        const queue = makeQueue(['a', 'b', 'c', 'd', 'e'])
        mockCache.match.mockResolvedValue(null)
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
            new Response('data', { status: 200 })
        )

        await prefetchUpcoming(queue, 0, 1) // Only 1 ahead

        expect(globalThis.fetch).toHaveBeenCalledTimes(1)
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/b')
    })
})

describe('isFilePrefetched', () => {
    beforeEach(() => {
        vi.stubGlobal('caches', mockCaches)
        mockCache.match.mockReset()
        mockCaches.open.mockReset().mockResolvedValue(mockCache)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('returns true when file is cached', async () => {
        mockCache.match.mockResolvedValue(new Response('cached'))
        expect(await isFilePrefetched('abc')).toBe(true)
    })

    it('returns false when file is not cached', async () => {
        mockCache.match.mockResolvedValue(undefined)
        expect(await isFilePrefetched('abc')).toBe(false)
    })

    it('returns false when Cache API unavailable', async () => {
        vi.stubGlobal('caches', undefined)
        expect(await isFilePrefetched('abc')).toBe(false)
    })
})
