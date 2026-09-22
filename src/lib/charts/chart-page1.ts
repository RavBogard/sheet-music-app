/**
 * Page 1 of a chart, rendered small, for the chart pickers (David's ask 1,
 * 2026-09-22). The pickers list hundreds of candidates, so this module is
 * built around three limits:
 *
 *   - At most MAX_CONCURRENT renders run at once; the rest wait in a queue.
 *   - A caller that aborts (its row scrolled away, the picker closed) leaves
 *     the queue, and an in-flight job is cancelled once no caller wants it.
 *   - Rendered pages are kept as small JPEG object URLs in an in-memory LRU
 *     of CACHE_MAX entries; evicted URLs are revoked.
 *
 * Bytes come from the same place Perform reads them: the device's own
 * offline cache (offline-idb) first, then `/api/drive/file/<id>` with the
 * browser's normal credentials. Nothing is written back — a preview must not
 * fill the device cache, and bytes never go into any shared cache.
 */

export type ChartPage1Result =
    | { kind: 'image'; url: string }
    | { kind: 'none'; reason: 'not-previewable' | 'error' }

export interface ChartPage1Request {
    fileId: string
    /** CSS pixel width of the rendered page. */
    width: number
    /** library_index mimeType when known; avoids fetching audio/text rows. */
    mimeType?: string
    signal?: AbortSignal
    /** Jump the queue (the enlarged view someone just asked for). */
    priority?: boolean
}

/** Loads bytes and turns them into a displayable URL. Swapped out in tests. */
export interface ChartPage1Renderer {
    render(req: { fileId: string; width: number; mimeType?: string; signal: AbortSignal }): Promise<ChartPage1Result>
}

export const MAX_CONCURRENT = 2
export const CACHE_MAX = 40
/** A render that hangs (pdf.js can) gives up and frees its slot. */
export const JOB_TIMEOUT_MS = 15_000

/** Mime types that can have a page 1. Anything else gets "no preview". */
export function isPreviewableMime(mimeType: string | undefined): boolean {
    if (!mimeType) return true // unknown: let the bytes decide
    if (mimeType === 'application/pdf') return true
    if (mimeType === 'application/octet-stream') return true
    return mimeType.startsWith('image/')
}

interface Job {
    key: string
    req: { fileId: string; width: number; mimeType?: string }
    controller: AbortController
    waiters: number
    started: boolean
    promise: Promise<ChartPage1Result>
    resolve: (r: ChartPage1Result) => void
}

export function createChartPage1Loader(renderer: ChartPage1Renderer) {
    const cache = new Map<string, ChartPage1Result>()
    const jobs = new Map<string, Job>()
    const queue: Job[] = []
    let running = 0

    function remember(key: string, result: ChartPage1Result) {
        cache.set(key, result)
        while (cache.size > CACHE_MAX) {
            const oldestKey = cache.keys().next().value as string
            const oldest = cache.get(oldestKey)
            cache.delete(oldestKey)
            if (oldest?.kind === 'image' && typeof URL !== 'undefined' && URL.revokeObjectURL) {
                URL.revokeObjectURL(oldest.url)
            }
        }
    }

    function pump() {
        while (running < MAX_CONCURRENT && queue.length > 0) {
            const job = queue.shift()!
            job.started = true
            running += 1
            let timer: ReturnType<typeof setTimeout> | null = null
            const timeout = new Promise<ChartPage1Result>((resolve) => {
                timer = setTimeout(() => {
                    job.controller.abort()
                    resolve({ kind: 'none', reason: 'error' })
                }, JOB_TIMEOUT_MS)
            })
            const timedOut = () => job.controller.signal.aborted && job.waiters > 0
            Promise.race([
                renderer.render({ ...job.req, signal: job.controller.signal }),
                timeout,
            ])
                .catch((): ChartPage1Result => ({ kind: 'none', reason: 'error' }))
                .then((raw) => {
                    if (timer) clearTimeout(timer)
                    const result: ChartPage1Result = timedOut() ? { kind: 'none', reason: 'error' } : raw
                    running -= 1
                    jobs.delete(job.key)
                    if (job.controller.signal.aborted && job.waiters <= 0) {
                        if (result.kind === 'image' && URL.revokeObjectURL) URL.revokeObjectURL(result.url)
                    } else {
                        // Errors are not cached: the next open may be online.
                        if (!(result.kind === 'none' && result.reason === 'error')) remember(job.key, result)
                        job.resolve(result)
                    }
                    pump()
                })
        }
    }

    function load(request: ChartPage1Request): Promise<ChartPage1Result> {
        const { fileId, mimeType, signal, priority } = request
        const width = Math.max(16, Math.round(request.width))
        if (!isPreviewableMime(mimeType)) {
            return Promise.resolve({ kind: 'none', reason: 'not-previewable' })
        }
        const key = `${fileId}@${width}`
        const hit = cache.get(key)
        if (hit) {
            cache.delete(key)
            cache.set(key, hit)
            return Promise.resolve(hit)
        }
        if (signal?.aborted) return new Promise(() => {})

        let job = jobs.get(key)
        if (!job) {
            let resolve!: (r: ChartPage1Result) => void
            const promise = new Promise<ChartPage1Result>((r) => (resolve = r))
            job = {
                key,
                req: { fileId, width, mimeType },
                controller: new AbortController(),
                waiters: 0,
                started: false,
                promise,
                resolve,
            }
            jobs.set(key, job)
            if (priority) queue.unshift(job)
            else queue.push(job)
        } else if (priority && !job.started) {
            const i = queue.indexOf(job)
            if (i > 0) {
                queue.splice(i, 1)
                queue.unshift(job)
            }
        }
        const current = job
        current.waiters += 1
        signal?.addEventListener(
            'abort',
            () => {
                current.waiters -= 1
                if (current.waiters > 0) return
                // Nobody wants it any more: drop it from the queue, or cancel it.
                const i = queue.indexOf(current)
                if (i >= 0) queue.splice(i, 1)
                jobs.delete(current.key)
                current.controller.abort()
            },
            { once: true },
        )
        pump()
        // An aborted caller never hears back (its component is gone).
        return current.promise
    }

    return {
        load,
        /** Test/diagnostic view of the limiter. */
        stats: () => ({ running, queued: queue.length, cached: cache.size }),
    }
}

// ---------------------------------------------------------------------------
// Browser renderer: offline-idb → /api/drive/file → pdf.js page 1 → JPEG.

let sharedWorker: unknown = null

async function loadBytes(fileId: string, signal: AbortSignal): Promise<Blob | null> {
    const { getFile } = await import('@/lib/offline-idb')
    const cached = await getFile(fileId)
    if (cached && cached.size > 0) return cached
    if (signal.aborted) return null
    const res = await fetch(`/api/drive/file/${encodeURIComponent(fileId)}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const type = res.headers.get('content-type') || ''
    if (type.startsWith('text/') || type.includes('json') || type.startsWith('audio/')) {
        // Not a page. Drop the body without reading it.
        void res.body?.cancel()
        return new Blob([], { type })
    }
    const blob = await res.blob()
    return blob
}

function looksLikePdf(bytes: Uint8Array): boolean {
    // "%PDF" may follow a little junk; pdf.js tolerates up to 1 KB.
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
    return head.includes('%PDF')
}

export const browserChartPage1Renderer: ChartPage1Renderer = {
    async render({ fileId, width, signal }) {
        const blob = await loadBytes(fileId, signal)
        if (!blob || blob.size === 0 || signal.aborted) return { kind: 'none', reason: 'not-previewable' }
        if (blob.type.startsWith('image/')) {
            return { kind: 'image', url: URL.createObjectURL(blob) }
        }
        const bytes = new Uint8Array(await blob.arrayBuffer())
        if (!looksLikePdf(bytes)) return { kind: 'none', reason: 'not-previewable' }
        if (signal.aborted) return { kind: 'none', reason: 'not-previewable' }

        const { pdfjs } = await import('react-pdf')
        const { desiredWorkerSrc, ensureOfflineWorkerReady } = await import('@/lib/pdf-worker-offline')
        await ensureOfflineWorkerReady(pdfjs.version)
        pdfjs.GlobalWorkerOptions.workerSrc = desiredWorkerSrc(pdfjs.version)
        if (!sharedWorker) sharedWorker = new pdfjs.PDFWorker()

        const task = pdfjs.getDocument({
            data: bytes,
            worker: sharedWorker as InstanceType<typeof pdfjs.PDFWorker>,
        })
        const onAbort = () => void task.destroy()
        signal.addEventListener('abort', onAbort, { once: true })
        try {
            const doc = await task.promise
            const page = await doc.getPage(1)
            const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
            const base = page.getViewport({ scale: 1 })
            const viewport = page.getViewport({ scale: (width * dpr) / base.width })
            const canvas = document.createElement('canvas')
            canvas.width = Math.ceil(viewport.width)
            canvas.height = Math.ceil(viewport.height)
            const ctx = canvas.getContext('2d')
            if (!ctx) return { kind: 'none', reason: 'error' }
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            const renderTask = page.render({ canvas, canvasContext: ctx, viewport })
            signal.addEventListener('abort', () => renderTask.cancel(), { once: true })
            await renderTask.promise
            const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
            canvas.width = 0
            canvas.height = 0
            page.cleanup()
            if (!out || signal.aborted) return { kind: 'none', reason: 'not-previewable' }
            return { kind: 'image', url: URL.createObjectURL(out) }
        } finally {
            signal.removeEventListener('abort', onAbort)
            void task.destroy()
        }
    },
}

let browserLoader: ReturnType<typeof createChartPage1Loader> | null = null

/** The app-wide loader (one queue and one cache for every picker). */
export function chartPage1Loader() {
    if (!browserLoader) browserLoader = createChartPage1Loader(browserChartPage1Renderer)
    return browserLoader
}
