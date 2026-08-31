"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { Document, pdfjs } from 'react-pdf'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMusicStore } from '@/lib/store'
import { formatError } from '@/lib/format-error'
import { PDFPageWrapper } from './PDFPageWrapper'
import { ChartSuggestions } from './ChartSuggestions'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { logger } from "@/lib/logger"
import { getFile } from '@/lib/offline-idb'
import { desiredWorkerSrc, ensureOfflineWorkerReady } from '@/lib/pdf-worker-offline'
import { shouldStartRenderWatchdog, isRotateScaleResize, computeFitPageWidth } from './pdf-viewer-state'

// Configure PDF.js worker — use local copy from public/ (copied by
// scripts/copy-pdf-worker.js during postinstall + build). Local worker
// eliminates CDN dependency and guarantees version match with react-pdf's
// bundled pdfjs-dist.
//
// 2026-05-15 prod incident — "Failed to load PDF" on every chart. Real root
// cause: react-pdf v10's barrel module `node_modules/react-pdf/dist/index.js`
// itself contains the line
//     pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs';
// at module-load time. That's a placeholder string the consumer is expected
// to override — but the override has to be UNCONDITIONAL. A defensive
// `if (!workerSrc)` guard never fires because `'pdf.worker.mjs'` is truthy.
// Then when <Document> mounts, pdfjs's fake-worker path does
// `await import('pdf.worker.mjs')` which can't resolve as a bare module
// specifier and the error surfaces as "Failed to load PDF".
//
// Always force-set on module load, regardless of current value. `typeof
// window` guard keeps the static-prerender of /perform safe (the module is
// dynamically imported by PDFOverlay anyway, defense in depth).
if (typeof window !== "undefined") {
    // desiredWorkerSrc returns the static asset online and the cached blob: URL
    // offline (offline-perform-fix). At module load we're online → static.
    pdfjs.GlobalWorkerOptions.workerSrc = desiredWorkerSrc(pdfjs.version)
}

/**
 * Module-scope dedup state for fetch-error logging. See F-07 + the v6
 * retry-remount-dedup fix below. Lives outside the component so a Retry
 * click (which can re-mount PDFViewer) doesn't reset the dedup map and
 * re-log the same (url, msg) failure. Bounded by # of unique broken-bond
 * URLs the user clicks per session; negligible memory at worship-app
 * scale.
 */
const loggedFetchErrorKeys = new Set<string>()

function fetchErrorKey(fetchUrl: string, msg: string): string {
    return `${fetchUrl.substring(0, 120)}::${msg}`
}

/** Drop every dedup entry for this URL so a later failure re-logs once. */
function clearFetchErrorKeysFor(fetchUrl: string): void {
    const prefix = `${fetchUrl.substring(0, 120)}::`
    for (const key of loggedFetchErrorKeys) {
        if (key.startsWith(prefix)) loggedFetchErrorKeys.delete(key)
    }
}

interface PDFViewerProps {
    url: string
    trackName?: string
}

export function PDFViewer({ url, trackName }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number>(0)
    const [width, setWidth] = useState<number>(0)
    // WS-14: container height + first-page aspect ratio feed the fit-page math.
    const [containerHeight, setContainerHeight] = useState<number>(0)
    const [pageAspect, setPageAspect] = useState<number>(0)
    const [source, setSource] = useState<{ data: Uint8Array } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    // WS-05: render-stage watchdog — the fetch timeout below only covers the
    // fetch; once bytes arrive a pdfjs render hang would otherwise spin forever.
    const [renderTimedOut, setRenderTimedOut] = useState(false)
    const renderWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const RENDER_WATCHDOG_MS = 30_000
    // WS-07: which page is in view (for the multi-page indicator).
    const [currentPage, setCurrentPage] = useState(1)

    // Defense-in-depth — react-pdf's barrel set workerSrc to a stub at
    // module load, so we re-assert the correct URL on every render rather
    // than gating on `!workerSrc`. Cheap (one string write per render).
    if (typeof window !== "undefined") {
        // Offline-aware: static asset online, cached blob: URL offline. Never
        // clobbers the offline blob src with the static (404-offline) URL.
        const want = desiredWorkerSrc(pdfjs.version)
        if (pdfjs.GlobalWorkerOptions.workerSrc !== want) {
            pdfjs.GlobalWorkerOptions.workerSrc = want
        }
    }

    // Track which URL we've resolved to avoid re-running
    const resolvedUrlRef = useRef<string | null>(null)
    const retryCountRef = useRef(0)
    const MAX_RETRIES = 3

    // F-07 (2026-05-16 bugstomp): each broken-bond chart click was firing
    // up to 4 logger.error rows — one for the blob: URL stage, one for the
    // /api/drive/file/ stage, doubled on a retry. Sentry burn-rate scales
    // with broken bonds. Dedup by (url, msg) fingerprint so a repeat fail
    // on the same URL doesn't re-log. New URL or new message → logs once.
    //
    // v6 retry-remount fix: hoisted to module scope (`loggedFetchErrorKeys`
    // below). The original component-scoped useRef reset on every Retry
    // click because Retry re-mounted PDFViewer, letting the same failure
    // re-log. Module scope survives remount; cleared per-URL on successful
    // load so a later failure on the same URL re-logs.

    const fetchPdf = useCallback(async (fetchUrl: string, signal?: AbortSignal, isRetry = false) => {
        if (resolvedUrlRef.current === fetchUrl && !isRetry) return

        setLoading(true)
        setError(null)
        resolvedUrlRef.current = fetchUrl

        try {
            // offline-perform-fix: ensure the pdf.js worker is resolvable OFFLINE
            // (a blob: URL built from cached worker bytes) BEFORE <Document> mounts.
            // No-op online. Without this, a cold offline open hits "Setting up fake
            // worker failed" and offline nav hangs on "Rendering…". Re-assert
            // workerSrc so the freshly-built blob URL is in place for worker creation.
            await ensureOfflineWorkerReady(pdfjs.version)
            if (typeof window !== "undefined") {
                pdfjs.GlobalWorkerOptions.workerSrc = desiredWorkerSrc(pdfjs.version)
            }

            // 1. Intercept for Offline PWA Support: Check Dexie IDB first
            const fileIdMatch = fetchUrl.match(/\/api\/drive\/file\/([^/?]+)/)
            if (fileIdMatch && fileIdMatch[1]) {
                const fileId = fileIdMatch[1]
                const cachedBlob = await getFile(fileId)
                if (cachedBlob && cachedBlob.size > 0) {
                    const arrayBuffer = await cachedBlob.arrayBuffer()
                    setSource({ data: new Uint8Array(arrayBuffer) })
                    setError(null)
                    retryCountRef.current = 0
                    clearFetchErrorKeysFor(fetchUrl)
                    setLoading(false)
                    return
                }
            }

            // 2. Fall back to network fetch if not in IDB
            // F-08 (2026-05-16 bugstomp): silently retry on a transient 503
            // (Vercel cold-start signature) before surfacing the error.
            // Bugstomp caught /api/drive/file/<id> returning 503 on the
            // first call and 404 on the second — every broken bond was
            // costing 2× the round-trips and 2× the Sentry log volume.
            // Cold-start usually clears in <1s, so a single ~750ms retry
            // converts the 503-then-real-status sequence into one clean
            // outcome. Genuine 503s that persist still surface via the
            // normal error path (with F-07's dedup keeping it to one log).
            let res = await fetch(fetchUrl, { signal })
            if (res.status === 503 && !signal?.aborted) {
                await new Promise((r) => setTimeout(r, 750))
                if (signal?.aborted) return
                res = await fetch(fetchUrl, { signal })
            }

            if (!res.ok) {
                // Try to read error body for diagnostics
                let detail = `HTTP ${res.status}`
                try {
                    const body = await res.json()
                    if (body.reason) detail += `: ${body.reason}`
                    else if (body.error) detail += `: ${body.error}`
                } catch {
                    // Not JSON, just use status
                }
                throw new Error(detail)
            }

            const contentType = res.headers.get('content-type') || ''

            // Verify we got a PDF (or at least binary data), not an HTML error page
            if (contentType.includes('text/html') || contentType.includes('application/json')) {
                const text = await res.text()
                throw new Error(`Expected PDF but got ${contentType}: ${text.substring(0, 100)}`)
            }

            // F-17 (2026-05-16 bugstomp): a row bonded to an audio file would
            // fall through to react-pdf, which fails with an inscrutable
            // "InvalidPDFException: Invalid PDF structure". The band would
            // see that error verbatim on the iPad — useless. Surface a
            // legible error specifically calling out the mismatch so the
            // operator knows to re-bond the row (or change the row type
            // off 'song'). Audio playback inline is a richer follow-up.
            if (contentType.startsWith('audio/')) {
                throw new Error(
                    `This row is bonded to an audio file (${contentType}), not a chart. Re-bind to a PDF chart, or change the row type away from 'song'.`,
                )
            }

            const arrayBuffer = await res.arrayBuffer()

            if (arrayBuffer.byteLength < 100) {
                throw new Error(`Response too small (${arrayBuffer.byteLength} bytes) — likely not a valid PDF`)
            }

            setSource({ data: new Uint8Array(arrayBuffer) })
            setError(null)
            retryCountRef.current = 0
            clearFetchErrorKeysFor(fetchUrl)
        } catch (e) {
            // Abort is an expected outcome on unmount / URL change — swallow quietly.
            if (e instanceof Error && e.name === 'AbortError') return
            const msg = formatError(e)
            // F-07 dedup: only log once per unique (url, msg) pair so a
            // broken-bond chart click + Retry doesn't write 4 Sentry rows
            // for the same failure. Dedup state is module-scoped above so
            // it survives PDFViewer remount on Retry (v6 retry-remount fix).
            const key = fetchErrorKey(fetchUrl, msg)
            if (!loggedFetchErrorKeys.has(key)) {
                loggedFetchErrorKeys.add(key)
                logger.error('[PDFViewer] Fetch error:', msg, '| url:', fetchUrl.substring(0, 80))
            }
            setError(msg)
            setSource(null)
        } finally {
            // Guard against setting loading=false after an abort already triggered
            // a re-fetch with a new signal.
            if (!signal?.aborted) setLoading(false)
        }
    }, [])

    // Tracks a bust-counter to force-rerun the fetch effect for retries.
    const [retryBust, setRetryBust] = useState(0)

    // Reset retry counter when the URL prop changes — a new chart gets a
    // fresh 3-attempt budget.
    useEffect(() => {
        retryCountRef.current = 0
        setRetryBust(0)
        setRenderTimedOut(false)
        setCurrentPage(1)
        // WS-14: re-measure the page aspect for the new chart (portrait vs
        // landscape source differs); fit math falls back to width until set.
        setPageAspect(0)
    }, [url])

    // WS-05 render-stage watchdog: once bytes are in hand (`source` set, not
    // loading, no error) but the document hasn't reported its page count yet
    // (`numPages === 0`), give pdfjs a bounded window to render. If it never
    // calls onDocumentLoadSuccess (the silent "Rendering…" hang), flip to an
    // error+Retry state instead of spinning forever. Clears the moment the doc
    // loads or any dep changes (Retry bumps retryBust → fresh window).
    useEffect(() => {
        if (renderWatchdogRef.current) {
            clearTimeout(renderWatchdogRef.current)
            renderWatchdogRef.current = null
        }
        if (shouldStartRenderWatchdog({ hasSource: !!source, loading, hasError: !!error, numPages, renderTimedOut })) {
            renderWatchdogRef.current = setTimeout(() => {
                setRenderTimedOut(true)
            }, RENDER_WATCHDOG_MS)
        }
        return () => {
            if (renderWatchdogRef.current) {
                clearTimeout(renderWatchdogRef.current)
                renderWatchdogRef.current = null
            }
        }
    }, [source, loading, error, numPages, renderTimedOut, retryBust])

    // Resolve source when URL changes. A 60s timeout covers hung venue networks.
    useEffect(() => {
        const controller = new AbortController()
        const timer = setTimeout(() => {
            controller.abort(new DOMException('PDF fetch timeout', 'AbortError'))
        }, 60_000)

        const effectiveUrl = retryBust > 0
            ? (url.includes('?') ? `${url}&_r=${retryBust}` : `${url}?_r=${retryBust}`)
            : url
        fetchPdf(effectiveUrl, controller.signal, retryBust > 0)

        return () => {
            clearTimeout(timer)
            controller.abort()
        }
    }, [url, retryBust, fetchPdf])

    // UX-007: cap manual retries at MAX_RETRIES so a genuinely-broken chart
    // doesn't loop forever. resolvedUrlRef is not reset on url change, so if
    // the caller passes a new URL the counter naturally resets via the retry
    // auto-reset on successful fetch (retryCountRef.current = 0 in fetchPdf).
    const handleRetry = () => {
        if (retryCountRef.current >= MAX_RETRIES) return
        retryCountRef.current++
        resolvedUrlRef.current = null
        setRenderTimedOut(false)
        // Bumping the bust counter retriggers the effect, which creates a fresh
        // AbortController + timer. Cache-bust param is appended in the effect.
        setRetryBust(retryCountRef.current)
    }

    // A failed state is either a fetch/render error OR the render watchdog
    // tripping. `renderMessage` gives the watchdog its own user-facing copy.
    const renderMessage = renderTimedOut
        ? 'The chart took too long to render. Tap Retry.'
        : null
    const failed = !!error || renderTimedOut
    const exhausted = retryCountRef.current >= MAX_RETRIES && failed

    // Auto-Resize
    const containerRef = useRef<HTMLDivElement>(null)
    const lastWidthRef = useRef(0)

    useEffect(() => {
        if (!containerRef.current) return

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect) {
                    const w = entry.contentRect.width - 4
                    // WS-14: track height for fit-page (subtract the same slack).
                    // Guard non-finite height (e.g. test environments) → 0, which
                    // makes computeFitPageWidth fall back to the width contract.
                    const h = entry.contentRect.height
                    setContainerHeight(Number.isFinite(h) ? Math.max(0, h - 4) : 0)
                    const prev = lastWidthRef.current
                    // WS-16: a rotate-scale width change (orientation flip, not
                    // scrollbar jitter) restores a fresh retry budget so a
                    // chart that exhausted its 3 retries can be re-attempted by
                    // simply rotating — no leave-and-re-enter required.
                    if (isRotateScaleResize(prev, w)) {
                        retryCountRef.current = 0
                        setRenderTimedOut(false)
                    }
                    lastWidthRef.current = w
                    setWidth(w)
                }
            }
        })

        observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [])

    // WS-07: track the in-view page for the multi-page indicator. Observes the
    // per-page wrappers within the scroll container; the most-visible page wins.
    // Guarded for jsdom (no IntersectionObserver) — currentPage stays 1 there.
    useEffect(() => {
        if (numPages <= 1 || !containerRef.current) return
        if (typeof IntersectionObserver === 'undefined') return
        const root = containerRef.current
        const pageEls = Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-page]'))
        if (pageEls.length === 0) return
        const io = new IntersectionObserver(
            (entries) => {
                let best: { page: number; ratio: number } | null = null
                for (const e of entries) {
                    const page = Number((e.target as HTMLElement).dataset.pdfPage || '0')
                    if (page && (!best || e.intersectionRatio > best.ratio)) {
                        best = { page, ratio: e.intersectionRatio }
                    }
                }
                if (best && best.ratio > 0) setCurrentPage(best.page)
            },
            { root, threshold: [0.25, 0.5, 0.75] },
        )
        pageEls.forEach(el => io.observe(el))
        return () => io.disconnect()
    }, [numPages, width])

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        if (renderWatchdogRef.current) {
            clearTimeout(renderWatchdogRef.current)
            renderWatchdogRef.current = null
        }
        setRenderTimedOut(false)
        setNumPages(numPages)
    }

    function onDocumentLoadError(error: Error) {
        // Telemetry: surface pdfjs's error class so we can tell apart worker
        // failures (UnknownErrorException with "fake worker" / "worker"),
        // corruption (InvalidPDFException), missing files (MissingPDFException),
        // and protected docs (PasswordException). The previous swallow ate
        // exactly the signal needed to debug the 2026-05-15 worker race.
        const errorName = error.name || "Error"
        const workerSrcAtFail =
            typeof window !== "undefined"
                ? pdfjs.GlobalWorkerOptions.workerSrc
                : "(ssr)"
        logger.error(
            `[PDFViewer] react-pdf load error: ${errorName}: ${error.message} ` +
                `(workerSrc=${workerSrcAtFail || "<EMPTY>"})`,
        )
        setError(`${errorName}: ${error.message}`)
    }

    // Use selectors to avoid re-render on unrelated store changes
    const zoom = useMusicStore(s => s.zoom)
    const transposition = useMusicStore(s => s.transposition)
    const fitMode = useMusicStore(s => s.fitMode)

    // WS-14: the per-page render width honors the active fit mode. 'width'
    // (default) = container width * zoom (unchanged); 'page' = fit the page
    // height to the viewport so a portrait chart is fully visible in landscape.
    const pageRenderWidth = computeFitPageWidth({
        containerWidth: width,
        containerHeight,
        pageAspect,
        mode: fitMode,
        zoom,
    })

    return (
        <div className="flex flex-col h-full w-full relative group">
            {/* WAVE1 Bug 1 (2026-08-31) — the page stack is centred by an AUTO
                MARGIN on the child, never by `justify-center` on the scroller.
                A flex item wider than its scroll container that is centred with
                `justify-content: center` has its start edge placed at a NEGATIVE
                offset from the scroll origin. Measured at 820x1180 / 200% zoom
                (page 1602px in an 805px container) that is 398px of clef, key
                signature and first beat of every system: Chromium strands it
                outright (scrollWidth comes back 1204, short by exactly the
                overflow, scrollLeft range [0, 399]); WebKit keeps it reachable
                via a negative scroll origin but still RESTS mid-page, so the
                chart opens with the clef off-screen and only a backwards swipe
                recovers it. Zooming in to read small type was the action that
                hid the start of the music.

                Auto margins absorb only POSITIVE free space (CSS Flexbox L1
                §9.5 — "Otherwise, set all auto margins ... to zero"), so
                `mx-auto` centres a page narrower than the viewport and collapses
                to 0 the moment the page overflows, anchoring the scroll origin
                at the left edge where the music starts. That rule predates every
                shipping flexbox implementation; `justify-content: safe center`
                would also work but Safari/iOS Safari only gained `safe` in 17.6,
                and an iPad held on 17.0-17.5 would drop the declaration.
                `justify-center` MUST NOT come back — it overrides the auto
                margin on overflow (proven in e2e/flex-scroll-reachability.spec.ts,
                which measures this in real Chromium + real iPad WebKit).

                `data-pdf-scroll` / `data-pdf-scroll-content` are the seams the
                reachability tests and the prod probe use to find these two
                boxes. */}
            <div
                ref={containerRef}
                data-pdf-scroll=""
                className="flex-1 overflow-auto bg-muted dark:bg-zinc-900 scrollbar-hide flex justify-start relative pb-32"
            >
                <div data-pdf-scroll-content="" className="relative mx-auto">
                    {loading && (
                        <div className="flex flex-col items-center mt-4 gap-3">
                            <Skeleton className="w-full max-w-[600px] aspect-[8.5/11] rounded-lg" />
                            <Skeleton className="h-4 w-32 rounded" />
                            <p className="text-sm text-muted-foreground">Loading Chart...</p>
                        </div>
                    )}

                    {failed && !loading && (
                        <div className="p-10 text-center space-y-3">
                            <p className="font-semibold text-destructive text-lg">
                                {exhausted ? 'Could not load chart — please try again later' : (renderTimedOut ? 'Chart took too long to render' : 'Failed to load PDF')}
                            </p>
                            <p className="text-sm text-muted-foreground max-w-xs mx-auto break-words">
                                {error ?? renderMessage}
                            </p>
                            {!exhausted && (
                                <Button
                                    variant="secondary"
                                    onClick={handleRetry}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    Retry{retryCountRef.current > 0 ? ` (${retryCountRef.current}/${MAX_RETRIES})` : ''}
                                </Button>
                            )}
                            <ChartSuggestions
                                trackName={trackName}
                                currentFileId={url.split('/').pop()}
                                isReplaceMode
                            />
                        </div>
                    )}

                    {source && !loading && !renderTimedOut && (
                        <Document
                            file={source}
                            onLoadSuccess={onDocumentLoadSuccess}
                            onLoadError={onDocumentLoadError}
                            loading={
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 mt-20">
                                    <Loader2 className="animate-spin h-10 w-10" />
                                    <p>Rendering…</p>
                                </div>
                            }
                            error={
                                <div className="text-destructive p-10 text-center space-y-2">
                                    <p className="font-semibold">PDF render error</p>
                                    {retryCountRef.current < MAX_RETRIES && (
                                        <Button
                                            variant="secondary"
                                            onClick={handleRetry}
                                        >
                                            <RefreshCw className="h-4 w-4" />
                                            Retry
                                        </Button>
                                    )}
                                </div>
                            }
                            className="flex flex-col items-center min-h-screen"
                        >
                            {/* WS-05: only render pages once the container has a real
                                width — a transient 0-width (iPad rotate-during-load)
                                would otherwise paint blank <Page width={0}> pages. */}
                            {width > 0
                                ? Array.from(new Array(numPages), (_, index) => (
                                      <div key={`page_${index + 1}`} data-pdf-page={index + 1}>
                                          <PDFPageWrapper
                                              pageNumber={index + 1}
                                              width={pageRenderWidth}
                                              transposition={transposition}
                                              onPageAspect={index === 0 ? setPageAspect : undefined}
                                          />
                                      </div>
                                  ))
                                : numPages > 0 && (
                                      <div className="flex flex-col items-center justify-center gap-3 mt-20 text-muted-foreground">
                                          <Loader2 className="animate-spin h-8 w-8" />
                                          <p className="text-sm">Measuring…</p>
                                      </div>
                                  )}
                        </Document>
                    )}

                    {/* WS-07: multi-page indicator so page 2+ below the fold is
                        discoverable. Single-page charts show nothing. */}
                    {source && !loading && !renderTimedOut && numPages > 1 && width > 0 && (
                        <div className="pointer-events-none fixed bottom-28 left-1/2 -translate-x-1/2 z-20 rounded-full bg-card/90 border border-border px-3 py-1 text-xs font-medium text-foreground shadow-lg">
                            Page {currentPage} of {numPages}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
