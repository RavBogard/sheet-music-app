"use client"

import { useState, useRef, useEffect, useMemo } from 'react'
import { Document, pdfjs } from 'react-pdf'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useMusicStore } from '@/lib/store'
import { getOfflineFile } from '@/lib/offline-store'
import { PDFPageWrapper } from './PDFPageWrapper'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { logger } from "@/lib/logger"

// Configure PDF.js worker — self-hosted for speed (Vercel edge + SW cache vs unpkg CDN)
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`

interface PDFViewerProps {
    url: string
}

export function PDFViewer({ url }: PDFViewerProps) {
    const { loading } = useAuth()
    const [numPages, setNumPages] = useState<number>(0)
    const [width, setWidth] = useState<number>(0)

    // Source can be: string (blob URL or plain URL) or object with headers
    const [sourceUrl, setSourceUrl] = useState<string | null>(null)
    const [sourceToken, setSourceToken] = useState<string | null>(null)
    const [sourceType, setSourceType] = useState<'blob' | 'authenticated' | 'plain' | null>(null)

    // Track which URL we've already resolved to avoid re-running on auth changes
    const resolvedUrlRef = useRef<string | null>(null)
    // Track blob URL for proper cleanup on unmount (not on effect re-runs)
    const blobUrlRef = useRef<string | null>(null)

    // Clean up blob URL on unmount only
    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current)
                blobUrlRef.current = null
            }
        }
    }, [])

    // 1. Resolve Source — runs ONCE per url prop change, after auth settles
    // CRITICAL: Do NOT depend on `user` — use auth.currentUser directly.
    // Depending on the `user` state from useAuth() causes this effect to re-run
    // on every auth context change (profile updates, etc.), which creates a new
    // source object → react-pdf aborts in-progress download → AbortError flood.
    useEffect(() => {
        // Don't re-resolve if we already have a source for this URL
        if (resolvedUrlRef.current === url) return
        // Wait for auth to settle
        if (loading) return

        let active = true

        const resolveSource = async () => {
            // Extract fileId from Drive API URL
            const fileIdMatch = url.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
            const fileId = fileIdMatch ? fileIdMatch[1] : null

            // A. Try Offline First — no auth needed, IndexedDB is local
            if (fileId) {
                try {
                    const offlineFile = await getOfflineFile(fileId)
                    if (active && offlineFile) {
                        logger.info("Serving offline file for:", fileId)
                        const objectUrl = URL.createObjectURL(offlineFile.blob)
                        blobUrlRef.current = objectUrl
                        resolvedUrlRef.current = url
                        setSourceUrl(objectUrl)
                        setSourceToken(null)
                        setSourceType('blob')
                        return
                    }
                } catch {
                    // IndexedDB may fail — fall through to network
                }
            }

            if (!active) return

            // B. Online fallback — use auth.currentUser directly (stable reference)
            const { auth: firebaseAuth } = await import('@/lib/firebase')
            const currentUser = firebaseAuth.currentUser

            if (currentUser) {
                try {
                    const token = await currentUser.getIdToken()
                    if (active) {
                        resolvedUrlRef.current = url
                        setSourceUrl(url)
                        setSourceToken(token)
                        setSourceType('authenticated')
                    }
                } catch (e) {
                    logger.error("Failed to get token for PDF:", e)
                    if (active) {
                        resolvedUrlRef.current = url
                        setSourceUrl(url)
                        setSourceToken(null)
                        setSourceType('plain')
                    }
                }
            } else {
                // Not logged in — try URL directly (public file proxy)
                resolvedUrlRef.current = url
                setSourceUrl(url)
                setSourceToken(null)
                setSourceType('plain')
            }
        }

        resolveSource()

        return () => {
            active = false
        }
    }, [url, loading])

    // CRITICAL: Memoize the source object passed to react-pdf's <Document>.
    // Without this, every render creates a new {url, httpHeaders} object,
    // which react-pdf treats as a different file → aborts download → restarts.
    // This was the root cause of the AbortError flood.
    const source = useMemo(() => {
        if (!sourceUrl) return null
        if (sourceType === 'authenticated' && sourceToken) {
            return {
                url: sourceUrl,
                httpHeaders: {
                    'Authorization': `Bearer ${sourceToken}`
                }
            }
        }
        return sourceUrl
    }, [sourceUrl, sourceToken, sourceType])

    // 2. Auto-Resize Logic
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!containerRef.current) return

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect) {
                    // Subtract small buffer to prevent horizontal scrollbars
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

    // 3. Transposer State — use selectors to avoid re-render on unrelated store changes
    const zoom = useMusicStore(s => s.zoom)
    const transposition = useMusicStore(s => s.transposition)

    return (
        <div className="flex flex-col h-full w-full relative group">
            <div ref={containerRef} className="flex-1 overflow-auto bg-muted dark:bg-zinc-900 scrollbar-hide flex justify-center relative pb-32">
                <div className="relative">
                    <Document
                        file={source}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 mt-20">
                                <Loader2 className="animate-spin h-10 w-10" />
                                <p>Loading Chart...</p>
                            </div>
                        }
                        error={
                            <div className="text-destructive p-10 text-center">
                                Failed to load PDF.
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
                </div>
            </div>
        </div>
    )
}
