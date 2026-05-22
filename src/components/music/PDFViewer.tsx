"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { Document, pdfjs } from 'react-pdf'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useMusicStore } from '@/lib/store'
import { PDFPageWrapper } from './PDFPageWrapper'
import { ChartSuggestions } from './ChartSuggestions'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { logger } from "@/lib/logger"
import { getFile } from '@/lib/offline-idb'
import { desiredWorkerSrc, ensureOfflineWorkerReady } from '@/lib/pdf-worker-offline'

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
    const [source, setSource] = useState<{ data: Uint8Array } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

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
            const msg = e instanceof Error ? e.message : String(e)
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
    }, [url])

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
        // Bumping the bust counter retriggers the effect, which creates a fresh
        // AbortController + timer. Cache-bust param is appended in the effect.
        setRetryBust(retryCountRef.current)
    }

    const exhausted = retryCountRef.current >= MAX_RETRIES && !!error

    // Auto-Resize
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!containerRef.current) return

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect) {
                    setWidth(entry.contentRect.width - 4)
                }
            }
        })

        observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [])

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
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

    return (
        <div className="flex flex-col h-full w-full relative group">
            <div ref={containerRef} className="flex-1 overflow-auto bg-muted dark:bg-zinc-900 scrollbar-hide flex justify-center relative pb-32">
                <div className="relative">
                    {loading && (
                        <div className="flex flex-col items-center mt-4 gap-3">
                            <Skeleton className="w-full max-w-[600px] aspect-[8.5/11] rounded-lg" />
                            <Skeleton className="h-4 w-32 rounded" />
                            <p className="text-sm text-muted-foreground">Loading Chart...</p>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="p-10 text-center space-y-3">
                            <p className="font-semibold text-destructive text-lg">
                                {exhausted ? 'Could not load chart — please try again later' : 'Failed to load PDF'}
                            </p>
                            <p className="text-sm text-muted-foreground max-w-xs mx-auto break-words">
                                {error}
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

                    {source && !loading && (
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
                            {Array.from(new Array(numPages), (_, index) => (
                                <PDFPageWrapper
                                    key={`page_${index + 1}`}
                                    pageNumber={index + 1}
                                    width={width * zoom}
                                    transposition={transposition}
                                />
                            ))}
                        </Document>
                    )}
                </div>
            </div>
        </div>
    )
}
