"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { Document, pdfjs } from 'react-pdf'
import { Loader2, RefreshCw } from 'lucide-react'
import { useMusicStore } from '@/lib/store'
import { getOfflineFile, saveOfflineFile } from '@/lib/offline-store'
import { PDFPageWrapper } from './PDFPageWrapper'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { logger } from "@/lib/logger"

// Configure PDF.js worker — version MUST match react-pdf's bundled pdfjs-dist.
const PDFJS_VERSION = pdfjs.version
pdfjs.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`

interface PDFViewerProps {
    url: string
}

const MAX_RETRIES = 2
const RETRY_DELAY = 1500

export function PDFViewer({ url }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number>(0)
    const [width, setWidth] = useState<number>(0)
    const [pdfData, setPdfData] = useState<Uint8Array | string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)

    // Track blob URL for cleanup
    const blobUrlRef = useRef<string | null>(null)
    // Track which URL we've fetched
    const fetchedUrlRef = useRef<string | null>(null)
    // Abort controller for cancelling fetches
    const abortRef = useRef<AbortController | null>(null)

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current)
                blobUrlRef.current = null
            }
            abortRef.current?.abort()
        }
    }, [])

    // Fetch PDF data with retry logic
    const fetchPdf = useCallback(async (targetUrl: string, attempt = 0) => {
        // Cancel any in-flight request
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setLoading(true)
        setError(null)

        try {
            // Extract fileId from URL
            const fileIdMatch = targetUrl.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
            const fileId = fileIdMatch ? fileIdMatch[1] : null

            // 1. Try offline cache first
            if (fileId) {
                try {
                    const offlineFile = await getOfflineFile(fileId)
                    if (offlineFile) {
                        logger.info("[PDFViewer] Serving from offline cache:", fileId)
                        const arrayBuffer = await offlineFile.blob.arrayBuffer()
                        setPdfData(new Uint8Array(arrayBuffer))
                        setLoading(false)
                        fetchedUrlRef.current = targetUrl
                        return
                    }
                } catch {
                    // IndexedDB may fail — fall through
                }
            }

            // 2. Fetch from API
            const response = await fetch(targetUrl, {
                signal: controller.signal,
                cache: 'no-cache', // Bypass SW cache for reliability
            })

            if (controller.signal.aborted) return

            if (!response.ok) {
                let errorDetail = `HTTP ${response.status}`
                try {
                    const body = await response.text()
                    // Try to parse as JSON for diagnostic info
                    try {
                        const json = JSON.parse(body)
                        errorDetail = json.reason || json.error || errorDetail
                    } catch {
                        if (body.length < 200) errorDetail = body
                    }
                } catch { /* ignore */ }

                throw new Error(errorDetail)
            }

            const contentType = response.headers.get('content-type') || ''
            if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
                logger.warn('[PDFViewer] Unexpected content-type:', contentType, 'for', targetUrl)
            }

            const arrayBuffer = await response.arrayBuffer()
            if (controller.signal.aborted) return

            if (arrayBuffer.byteLength < 100) {
                throw new Error('Response too small to be a valid PDF')
            }

            const data = new Uint8Array(arrayBuffer)
            setPdfData(data)
            setLoading(false)
            fetchedUrlRef.current = targetUrl

            // Cache for offline use
            if (fileId) {
                try {
                    const blob = new Blob([data], { type: 'application/pdf' })
                    await saveOfflineFile(fileId, blob, fileId, 'application/pdf')
                } catch { /* silent */ }
            }
        } catch (err) {
            if (controller.signal.aborted) return

            const message = err instanceof Error ? err.message : 'Unknown error'
            logger.error('[PDFViewer] Fetch failed:', message, '| url:', targetUrl, '| attempt:', attempt)

            if (attempt < MAX_RETRIES) {
                // Retry with delay
                setTimeout(() => {
                    if (!controller.signal.aborted) {
                        fetchPdf(targetUrl, attempt + 1)
                    }
                }, RETRY_DELAY * (attempt + 1))
            } else {
                setError(message)
                setLoading(false)
            }
        }
    }, [])

    // Trigger fetch when URL changes
    useEffect(() => {
        if (!url) return
        if (fetchedUrlRef.current === url && pdfData) return

        fetchedUrlRef.current = null
        setPdfData(null)
        setRetryCount(0)
        fetchPdf(url)

        return () => {
            abortRef.current?.abort()
        }
    }, [url, fetchPdf, pdfData])

    // Manual retry
    const handleRetry = useCallback(() => {
        fetchedUrlRef.current = null
        setPdfData(null)
        setRetryCount(r => r + 1)
        fetchPdf(url)
    }, [url, fetchPdf])

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
                        <div className="flex flex-col items-center text-center p-10 gap-3 mt-10">
                            <p className="text-destructive font-semibold text-lg">Failed to load PDF</p>
                            <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
                            <button
                                onClick={handleRetry}
                                className="flex items-center gap-2 mt-3 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition-colors"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Retry
                            </button>
                        </div>
                    )}

                    {pdfData && !error && (
                        <Document
                            file={{ data: pdfData }}
                            onLoadSuccess={onDocumentLoadSuccess}
                            onLoadError={onDocumentLoadError}
                            loading={null}
                            error={
                                <div className="flex flex-col items-center text-center p-10 gap-3 mt-10">
                                    <p className="text-destructive font-semibold">Invalid PDF data</p>
                                    <button
                                        onClick={handleRetry}
                                        className="flex items-center gap-2 mt-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition-colors"
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
