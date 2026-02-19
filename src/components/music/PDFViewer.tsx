"use client"

import { useState, useRef, useEffect } from 'react'
import { Document, pdfjs } from 'react-pdf'
import { Loader2 } from 'lucide-react'
import { useMusicStore } from '@/lib/store'
import { getOfflineFile } from '@/lib/offline-store'
import { PDFPageWrapper } from './PDFPageWrapper'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { logger } from "@/lib/logger"

// Configure PDF.js worker — version MUST match react-pdf's bundled pdfjs-dist.
// react-pdf re-exports pdfjs, so pdfjs.version gives us the exact version it uses.
// Using unpkg CDN with pinned version guarantees version match and eliminates
// the worker/library mismatch that caused AbortErrors.
const PDFJS_VERSION = pdfjs.version // e.g. "5.4.296"
pdfjs.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`

interface PDFViewerProps {
    url: string
}

export function PDFViewer({ url }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number>(0)
    const [width, setWidth] = useState<number>(0)
    const [source, setSource] = useState<string | null>(null)

    // Track blob URL for cleanup on unmount
    const blobUrlRef = useRef<string | null>(null)
    // Track which URL we've resolved to avoid re-running
    const resolvedUrlRef = useRef<string | null>(null)

    // Clean up blob URL on unmount only
    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current)
                blobUrlRef.current = null
            }
        }
    }, [])

    // Resolve source: try offline cache first, then use plain URL.
    // The /api/drive/file/ route is PUBLIC (no auth required), so we
    // don't need auth headers — eliminating all the auth-dependent
    // complexity that was causing cascading re-renders and AbortErrors.
    useEffect(() => {
        if (resolvedUrlRef.current === url) return

        let active = true

        const resolve = async () => {
            // Extract fileId from Drive API URL
            const fileIdMatch = url.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
            const fileId = fileIdMatch ? fileIdMatch[1] : null

            // Try offline cache first — instant, no network
            if (fileId) {
                try {
                    const offlineFile = await getOfflineFile(fileId)
                    if (active && offlineFile) {
                        logger.info("Serving offline file for:", fileId)
                        const objectUrl = URL.createObjectURL(offlineFile.blob)
                        blobUrlRef.current = objectUrl
                        resolvedUrlRef.current = url
                        setSource(objectUrl)
                        return
                    }
                } catch {
                    // IndexedDB may fail — fall through to network
                }
            }

            // Use URL directly — API route is public, no auth needed
            if (active) {
                resolvedUrlRef.current = url
                setSource(url)
            }
        }

        resolve()

        return () => { active = false }
    }, [url])

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

    // Use selectors to avoid re-render on unrelated store changes
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
