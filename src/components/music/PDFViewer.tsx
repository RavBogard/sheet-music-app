"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { Document, pdfjs } from 'react-pdf'
import { Loader2, RefreshCw } from 'lucide-react'
import { useMusicStore } from '@/lib/store'
import { getOfflineFile } from '@/lib/offline-store'
import { PDFPageWrapper } from './PDFPageWrapper'
import { ChartSuggestions } from './ChartSuggestions'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { logger } from "@/lib/logger"

// Configure PDF.js worker — version MUST match react-pdf's bundled pdfjs-dist.
// react-pdf re-exports pdfjs, so pdfjs.version gives us the exact version it uses.
// Using unpkg CDN with pinned version guarantees version match and eliminates
// the worker/library mismatch that caused AbortErrors.
const PDFJS_VERSION = pdfjs.version // e.g. "5.4.296"

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

    // Sandbox PDF Worker init to prevent main-thread execution on non-perform routes
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`
    }

    // Track which URL we've resolved to avoid re-running
    const resolvedUrlRef = useRef<string | null>(null)
    const retryCountRef = useRef(0)

    const fetchPdf = useCallback(async (fetchUrl: string, isRetry = false) => {
        if (resolvedUrlRef.current === fetchUrl && !isRetry) return

        setLoading(true)
        setError(null)
        resolvedUrlRef.current = fetchUrl

        // Extract fileId from Drive API URL
        const fileIdMatch = fetchUrl.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
        const fileId = fileIdMatch ? fileIdMatch[1] : null

        // Try offline cache first — instant, no network
        if (fileId) {
            try {
                const offlineFile = await getOfflineFile(fileId)
                if (offlineFile) {
                    logger.info("Serving offline file for:", fileId)
                    const arrayBuffer = await offlineFile.blob.arrayBuffer()
                    setSource({ data: new Uint8Array(arrayBuffer) })
                    setLoading(false)
                    return
                }
            } catch {
                // IndexedDB may fail — fall through to network
            }
        }

        // Fetch the PDF ourselves so we can diagnose failures
        try {
            const res = await fetch(fetchUrl)

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

            const arrayBuffer = await res.arrayBuffer()

            if (arrayBuffer.byteLength < 100) {
                throw new Error(`Response too small (${arrayBuffer.byteLength} bytes) — likely not a valid PDF`)
            }

            setSource({ data: new Uint8Array(arrayBuffer) })
            setError(null)
            retryCountRef.current = 0
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error('[PDFViewer] Fetch error:', msg, '| url:', fetchUrl.substring(0, 80))
            setError(msg)
            setSource(null)
        } finally {
            setLoading(false)
        }
    }, [])

    // Resolve source when URL changes
    useEffect(() => {
        // Cache-bust v2: forces CDN cache invalidation after fix for
        // stale error responses being cached. Can be removed after 2026-02-20.
        const bustUrl = url.includes('?') ? `${url}&_v=2` : `${url}?_v=2`
        fetchPdf(bustUrl)
    }, [url, fetchPdf])

    const handleRetry = () => {
        retryCountRef.current++
        resolvedUrlRef.current = null
        // Add cache-bust param to bypass any stale CDN-cached errors
        const bustUrl = url.includes('?')
            ? `${url}&_r=${retryCountRef.current}`
            : `${url}?_r=${retryCountRef.current}`
        fetchPdf(bustUrl, true)
    }

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
        logger.error('[PDFViewer] react-pdf load error:', error.message)
        setError(error.message)
    }

    // Use selectors to avoid re-render on unrelated store changes
    const zoom = useMusicStore(s => s.zoom)
    const transposition = useMusicStore(s => s.transposition)

    return (
        <div className="flex flex-col h-full w-full relative group">
            <div ref={containerRef} className="flex-1 overflow-auto bg-muted dark:bg-zinc-900 scrollbar-hide flex justify-center relative pb-32">
                <div className="relative">
                    {loading && (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 mt-20">
                            <Loader2 className="animate-spin h-10 w-10" />
                            <p>Loading Chart...</p>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="text-destructive p-10 text-center space-y-3">
                            <p className="font-semibold">Failed to load PDF</p>
                            <p className="text-xs text-muted-foreground max-w-xs mx-auto break-words">
                                {error}
                            </p>
                            <button
                                onClick={handleRetry}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-accent text-sm font-medium text-foreground transition-colors"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Retry{retryCountRef.current > 0 ? ` (${retryCountRef.current})` : ''}
                            </button>
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
                                    <button
                                        onClick={handleRetry}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-accent text-sm font-medium text-foreground transition-colors"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        Retry
                                    </button>
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
