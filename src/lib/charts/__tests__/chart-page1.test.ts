import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import {
    CACHE_MAX,
    JOB_TIMEOUT_MS,
    MAX_CONCURRENT,
    createChartPage1Loader,
    isPreviewableMime,
    type ChartPage1Renderer,
    type ChartPage1Result,
} from '../chart-page1'

/** A renderer whose renders finish only when the test says so. */
function controllableRenderer() {
    const pending = new Map<string, { resolve: (r: ChartPage1Result) => void; signal: AbortSignal }>()
    const calls: string[] = []
    const renderer: ChartPage1Renderer = {
        render: ({ fileId, width, signal }) =>
            new Promise((resolve) => {
                calls.push(`${fileId}@${width}`)
                pending.set(`${fileId}@${width}`, { resolve, signal })
            }),
    }
    const finish = (key: string, url = `blob:${key}`) => {
        pending.get(key)!.resolve({ kind: 'image', url })
        pending.delete(key)
    }
    return { renderer, calls, pending, finish }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('chart page-1 loader', () => {
    beforeEach(() => {
        URL.revokeObjectURL = vi.fn()
    })
    afterEach(() => vi.useRealTimers())

    it('runs at most MAX_CONCURRENT renders and queues the rest', async () => {
        const r = controllableRenderer()
        const loader = createChartPage1Loader(r.renderer)
        for (let i = 0; i < 6; i++) void loader.load({ fileId: `f${i}`, width: 28 })
        await flush()
        expect(r.calls).toHaveLength(MAX_CONCURRENT)
        expect(loader.stats()).toMatchObject({ running: 2, queued: 4 })
        r.finish('f0@28')
        await flush()
        expect(r.calls).toHaveLength(3)
    })

    it('drops a queued job when its caller aborts, and cancels a running one', async () => {
        const r = controllableRenderer()
        const loader = createChartPage1Loader(r.renderer)
        const a = new AbortController()
        const b = new AbortController()
        const c = new AbortController()
        void loader.load({ fileId: 'a', width: 28, signal: a.signal })
        void loader.load({ fileId: 'b', width: 28, signal: b.signal })
        void loader.load({ fileId: 'c', width: 28, signal: c.signal })
        await flush()
        c.abort() // queued → removed
        a.abort() // running → its render signal aborts
        expect(r.pending.get('a@28')!.signal.aborted).toBe(true)
        expect(loader.stats().queued).toBe(0)
        r.finish('a@28')
        r.finish('b@28')
        await flush()
        expect(r.calls).toEqual(['a@28', 'b@28']) // c never rendered
        // the aborted result was thrown away, not cached
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a@28')
        expect(loader.stats().cached).toBe(1)
    })

    it('shares one render between two rows showing the same chart', async () => {
        const r = controllableRenderer()
        const loader = createChartPage1Loader(r.renderer)
        const first = new AbortController()
        const p1 = loader.load({ fileId: 'x', width: 28, signal: first.signal })
        const p2 = loader.load({ fileId: 'x', width: 28 })
        await flush()
        first.abort() // the other row still wants it
        expect(r.pending.get('x@28')!.signal.aborted).toBe(false)
        r.finish('x@28')
        expect(await p2).toEqual({ kind: 'image', url: 'blob:x@28' })
        void p1
        expect(r.calls).toEqual(['x@28'])
    })

    it('serves repeats from the cache and revokes what it evicts', async () => {
        const r = controllableRenderer()
        const loader = createChartPage1Loader(r.renderer)
        for (let i = 0; i <= CACHE_MAX; i++) {
            const p = loader.load({ fileId: `f${i}`, width: 28 })
            await flush()
            r.finish(`f${i}@28`)
            await p
        }
        expect(loader.stats().cached).toBe(CACHE_MAX)
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:f0@28')
        await loader.load({ fileId: `f${CACHE_MAX}`, width: 28 })
        expect(r.calls).toHaveLength(CACHE_MAX + 1)
    })

    it('never fetches rows that cannot have a page 1', async () => {
        const r = controllableRenderer()
        const loader = createChartPage1Loader(r.renderer)
        expect(await loader.load({ fileId: 'mp3', width: 28, mimeType: 'audio/mpeg' })).toEqual({
            kind: 'none',
            reason: 'not-previewable',
        })
        expect(await loader.load({ fileId: 'txt', width: 28, mimeType: 'text/plain' })).toMatchObject({ kind: 'none' })
        expect(r.calls).toEqual([])
        expect(isPreviewableMime('application/pdf')).toBe(true)
        expect(isPreviewableMime('image/png')).toBe(true)
        expect(isPreviewableMime(undefined)).toBe(true)
    })

    it('gives up on a render that hangs, so the spinner always ends', async () => {
        vi.useFakeTimers()
        const r = controllableRenderer()
        const loader = createChartPage1Loader(r.renderer)
        const p = loader.load({ fileId: 'hang', width: 28 })
        await vi.advanceTimersByTimeAsync(JOB_TIMEOUT_MS + 1)
        expect(await p).toEqual({ kind: 'none', reason: 'error' })
        expect(loader.stats()).toMatchObject({ running: 0, cached: 0 })
    })

    it('lets the enlarged view jump the queue', async () => {
        const r = controllableRenderer()
        const loader = createChartPage1Loader(r.renderer)
        for (let i = 0; i < 5; i++) void loader.load({ fileId: `f${i}`, width: 28 })
        void loader.load({ fileId: 'big', width: 600, priority: true })
        await flush()
        r.finish('f0@28')
        await flush()
        expect(r.calls[2]).toBe('big@600')
    })
})
