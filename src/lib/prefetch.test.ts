import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prefetchUpcoming, isFilePrefetched } from './prefetch'
import { QueueItem } from './store'

const mockHasFile = vi.fn<(id: string) => Promise<boolean>>()
const mockPutFile = vi.fn<(id: string, blob: Blob) => Promise<void>>().mockResolvedValue()

vi.mock('./offline-idb', () => ({
    hasFile: (id: string) => mockHasFile(id),
    putFile: (id: string, blob: Blob) => mockPutFile(id, blob),
}))

function pdfResponse() {
    return new Response('pdf-data', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
    })
}

describe('prefetchUpcoming', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn())
        mockHasFile.mockReset()
        mockPutFile.mockClear()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    const makeQueue = (ids: string[]): QueueItem[] =>
        ids.map(id => ({ name: `Song ${id}`, fileId: id, type: 'pdf' as const }))

    it('prefetches next 3 files by default and writes blobs to IDB', async () => {
        const queue = makeQueue(['a', 'b', 'c', 'd', 'e'])
        mockHasFile.mockResolvedValue(false)
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
            Promise.resolve(pdfResponse())
        )

        await prefetchUpcoming(queue, 0)

        expect(globalThis.fetch).toHaveBeenCalledTimes(3)
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/b')
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/c')
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/d')
        expect(mockPutFile).toHaveBeenCalledTimes(3)
    })

    it('skips already cached files', async () => {
        const queue = makeQueue(['a', 'b', 'c'])
        mockHasFile
            .mockResolvedValueOnce(true)   // b is cached
            .mockResolvedValueOnce(false)  // c is not
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
            Promise.resolve(pdfResponse())
        )

        await prefetchUpcoming(queue, 0)

        expect(globalThis.fetch).toHaveBeenCalledTimes(1)
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/c')
        expect(mockPutFile).toHaveBeenCalledTimes(1)
    })

    it('does nothing for empty queue', async () => {
        await prefetchUpcoming([], 0)
        expect(mockHasFile).not.toHaveBeenCalled()
    })

    it('does nothing when at end of queue', async () => {
        const queue = makeQueue(['a', 'b'])
        await prefetchUpcoming(queue, 1)
        expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('handles fetch errors silently', async () => {
        const queue = makeQueue(['a', 'b'])
        mockHasFile.mockResolvedValue(false)
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

        await expect(prefetchUpcoming(queue, 0)).resolves.toBeUndefined()
        expect(mockPutFile).not.toHaveBeenCalled()
    })

    it('respects custom lookahead', async () => {
        const queue = makeQueue(['a', 'b', 'c', 'd', 'e'])
        mockHasFile.mockResolvedValue(false)
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
            Promise.resolve(pdfResponse())
        )

        await prefetchUpcoming(queue, 0, 1)

        expect(globalThis.fetch).toHaveBeenCalledTimes(1)
        expect(globalThis.fetch).toHaveBeenCalledWith('/api/drive/file/b')
    })

    it('does NOT write to IDB when fetch returns !ok', async () => {
        const queue = makeQueue(['a', 'b'])
        mockHasFile.mockResolvedValue(false)
        ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(null, { status: 500 }))

        await prefetchUpcoming(queue, 0, 1)
        expect(mockPutFile).not.toHaveBeenCalled()
    })
})

describe('isFilePrefetched', () => {
    beforeEach(() => {
        mockHasFile.mockReset()
    })

    it('returns true when file is cached', async () => {
        mockHasFile.mockResolvedValue(true)
        expect(await isFilePrefetched('abc')).toBe(true)
    })

    it('returns false when file is not cached', async () => {
        mockHasFile.mockResolvedValue(false)
        expect(await isFilePrefetched('abc')).toBe(false)
    })

    it('returns false on error', async () => {
        mockHasFile.mockRejectedValue(new Error('DB error'))
        expect(await isFilePrefetched('abc')).toBe(false)
    })
})
