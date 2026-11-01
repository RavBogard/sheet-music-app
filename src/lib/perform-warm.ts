/**
 * Perform warm-up: put the chart viewers' CODE in the cache without running it.
 *
 * F1 offline-precache (unchanged goal): PDFOverlay and the per-format viewers
 * are dynamic imports, so their chunks can't be fetched once WiFi drops. A
 * musician who loses WiFi before tapping a chart would hit a chunk-load error
 * instead of the cached chart, so Perform warms that code while online.
 *
 * Perf audit P1-2: the old warm-up did `import()`, which downloads AND
 * evaluates each module: about 1.5 s of long tasks (4x CPU) from OSMD (1.2 MB)
 * and pdf.js, on a fixed 2 s timer on iPad Safari, exactly when a musician
 * taps. Evaluation isn't needed to cache bytes. This module asks webpack for
 * each viewer's chunk URLs and `fetch()`es them: the bytes land in the
 * perform-shell service worker's CacheFirst store for `/_next/static/`
 * (and the HTTP cache), and nothing is parsed or run until a chart opens.
 *
 * Chunk discovery: a production `() => import("x")` compiles to
 * `() => Promise.all([r.e(12), r.e(34)]).then(r.bind(r, 56))`. The chunk ids
 * are read from that compiled source and turned into URLs with webpack's own
 * `__webpack_require__.u` (which Next wraps to add the `?dpl=` deployment
 * query, so the URLs match what a real chart open requests). When that isn't
 * available (dev, Turbopack, tests) or nothing parses, it falls back to the
 * old `import()`, one module at a time with a yield between, so offline
 * readiness never depends on the fast path.
 */

declare const __webpack_require__: any

export type WarmLoader = () => Promise<unknown>

/**
 * The chart surfaces' code, cheapest and most common first; OSMD (MusicXML,
 * about 1.2 MB) last so a chart open that pauses the warm-up most often finds
 * the PDF path already cached.
 */
export const VIEWER_LOADERS: readonly WarmLoader[] = [
    () => import("@/components/performance/PDFOverlay"),
    () => import("@/components/music/PDFViewer"),
    () => import("@/components/music/TextScoreViewer"),
    () => import("@/components/music/ImageScoreViewer"),
    () => import("@/components/music/SmartScoreViewer"),
]

/** Webpack's runtime, when this module was bundled by webpack. */
function webpackRuntime(): { u: (id: unknown) => string; p?: string; miniCssF?: (id: unknown) => string } | null {
    try {
        if (typeof __webpack_require__ === "undefined") return null
        const r = __webpack_require__
        return r && typeof r.u === "function" ? r : null
    } catch {
        return null
    }
}

/** Chunk ids referenced by a compiled `() => import(...)` thunk. */
export function chunkIdsFromSource(src: string): Array<string | number> {
    const ids: Array<string | number> = []
    for (const m of src.matchAll(/\.e\(\s*(\d+|"[^"]+"|'[^']+')\s*\)/g)) {
        const raw = m[1]
        ids.push(/^\d+$/.test(raw) ? Number(raw) : raw.slice(1, -1))
    }
    return ids
}

/**
 * The URLs (JS, plus the CSS file when the chunk has one) a loader would
 * request, or null when they can't be worked out here.
 */
export function chunkUrlsFor(loader: WarmLoader): string[] | null {
    const r = webpackRuntime()
    if (!r) return null
    const ids = chunkIdsFromSource(Function.prototype.toString.call(loader))
    if (ids.length === 0) return null
    const base = typeof r.p === "string" ? r.p : "/_next/"
    const urls = new Set<string>()
    for (const id of ids) {
        try {
            urls.add(base + r.u(id))
        } catch {
            return null
        }
    }
    // A chunk with CSS (PDFViewer's react-pdf layers) also needs its
    // stylesheet offline, or the import rejects. Webpack's CSS loader only
    // asks for chunks that have CSS, which this side can't see, so ask for
    // every id's CSS name: the set de-duplicates, and a name with no file
    // just fails quietly.
    if (typeof r.miniCssF === "function") {
        for (const id of ids) {
            try {
                const css = r.miniCssF(id)
                if (typeof css === "string" && !css.includes("undefined")) urls.add(base + css)
            } catch {
                // no CSS for this chunk
            }
        }
    }
    return [...urls]
}

export interface WarmOptions {
    /** Aborts the whole warm-up (unmount). */
    signal: AbortSignal
    /** True while a chart is opening or open: the warm-up waits, and an
     *  in-flight fetch is cancelled and retried later. */
    isPaused: () => boolean
    loaders?: readonly WarmLoader[]
    /** Poll interval while paused / watching an in-flight fetch. */
    pollMs?: number
}

const warmed = new Set<string>()

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) return resolve()
        const t = setTimeout(done, ms)
        function done() {
            clearTimeout(t)
            signal.removeEventListener("abort", done)
            resolve()
        }
        signal.addEventListener("abort", done, { once: true })
    })
}

async function waitWhilePaused(opts: WarmOptions, pollMs: number): Promise<void> {
    while (!opts.signal.aborted && opts.isPaused()) await sleep(pollMs, opts.signal)
}

/**
 * True when the page has already requested this file (a chart opened, or
 * something imported it). Webpack removes its <script> tags once they load,
 * so the resource timeline is checked as well as the DOM.
 */
function alreadyLoaded(url: string): boolean {
    try {
        const path = url.split("?")[0]
        if (
            typeof performance !== "undefined" &&
            typeof performance.getEntriesByType === "function" &&
            performance.getEntriesByType("resource").some((e) => e.name.includes(path))
        ) {
            return true
        }
        return Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[href]")).some(
            (el) => ("src" in el ? el.src : el.href).includes(path),
        )
    } catch {
        return false
    }
}

/** Fetch one URL into the caches. "paused" means cancelled by a chart open. */
async function fetchOnce(url: string, opts: WarmOptions, pollMs: number): Promise<"ok" | "paused" | "failed"> {
    const ac = new AbortController()
    const onAbort = () => ac.abort()
    opts.signal.addEventListener("abort", onAbort, { once: true })
    const watch = setInterval(() => {
        if (opts.isPaused()) ac.abort()
    }, pollMs)
    try {
        const init: RequestInit & { priority?: string } = {
            signal: ac.signal,
            credentials: "same-origin",
            priority: "low",
        }
        const res = await fetch(url, init)
        // Read the body so the response is stored whole.
        if (!res.ok) return "failed"
        await res.arrayBuffer()
        return "ok"
    } catch {
        // Paused (retry later) or a network error (the online tap still
        // lazy-loads on demand; nothing to surface).
        return ac.signal.aborted && !opts.signal.aborted ? "paused" : "failed"
    } finally {
        clearInterval(watch)
        opts.signal.removeEventListener("abort", onAbort)
    }
}

/**
 * Warm every viewer's code. Fetch-only where webpack's chunk URLs are known;
 * otherwise `import()` one module at a time. Resolves when done or aborted.
 */
export async function warmViewerCode(opts: WarmOptions): Promise<"fetched" | "imported" | "mixed" | "aborted"> {
    const pollMs = opts.pollMs ?? 1000
    const loaders = opts.loaders ?? VIEWER_LOADERS
    let fetched = 0
    let imported = 0
    for (const loader of loaders) {
        if (opts.signal.aborted) return "aborted"
        await waitWhilePaused(opts, pollMs)
        if (opts.signal.aborted) return "aborted"
        const urls = chunkUrlsFor(loader)
        if (!urls) {
            await loader().catch(() => {})
            imported++
            // Yield so one evaluation isn't chained to the next in a single task.
            await sleep(0, opts.signal)
            continue
        }
        for (const url of urls) {
            if (warmed.has(url) || alreadyLoaded(url)) continue
            let result: "ok" | "paused" | "failed" = "paused"
            while (result === "paused") {
                await waitWhilePaused(opts, pollMs)
                if (opts.signal.aborted) return "aborted"
                result = await fetchOnce(url, opts, pollMs)
            }
            if (result === "ok") warmed.add(url)
        }
        fetched++
    }
    if (imported && fetched) return "mixed"
    return imported ? "imported" : "fetched"
}

/** True while a chart surface is open: a setlist track URL or /perform/<fileId>. */
export function isChartOpenPath(pathname: string): boolean {
    if (/^\/perform\/setlist\/[^/]+\/track\//.test(pathname)) return true
    const m = pathname.match(/^\/perform\/([^/]+)\/?$/)
    return Boolean(m && m[1] !== "setlist")
}

/** Test-only: forget which URLs were warmed. */
export function __resetWarmForTests(): void {
    warmed.clear()
}
