"use client"

import { toast } from "sonner"

import { useState, useRef, useEffect } from 'react'
import { Document, pdfjs } from 'react-pdf'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useMusicStore } from '@/lib/store'
import { getOfflineFile } from '@/lib/offline-store'
import { PDFPageWrapper } from './PDFPageWrapper'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PDFViewerProps {
    url: string
}

export function PDFViewer({ url }: PDFViewerProps) {
    const { user, loading } = useAuth()
    const [numPages, setNumPages] = useState<number>(0)
    const [width, setWidth] = useState<number>(0)

    // sourceUrl can be a string (online URL or blob URL) or an object (online URL + headers)
    const [source, setSource] = useState<any>(null) // Default to null until resolved

    // 1. Resolve Source (Offline vs Online + Auth)
    useEffect(() => {
        if (loading) return // Wait for auth to settle

        let active = true
        let objectUrl: string | null = null

        const resolveSource = async () => {
            // Check if it's a Drive file URL
            const fileIdMatch = url.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
            const fileId = fileIdMatch ? fileIdMatch[1] : null

            // A. Try Offline First
            if (fileId) {
                const offlineFile = await getOfflineFile(fileId)
                if (active && offlineFile) {
                    console.log("Serving offline file for:", fileId)
                    objectUrl = URL.createObjectURL(offlineFile.blob)
                    setSource(objectUrl)
                    return
                }
            }

            // B. If Online, we need an Auth Token for our API
            if (active) {
                if (user) {
                    try {
                        const token = await user.getIdToken()
                        setSource({
                            url: url,
                            httpHeaders: {
                                'Authorization': `Bearer ${token}`
                            }
                        })
                    } catch (e) {
                        console.error("Failed to get token for PDF:", e)
                        setSource(url) // Fallback
                    }
                } else {
                    // Not logged in? Just try the URL (will likely fail if protected)
                    setSource(url)
                }
            }
        }

        resolveSource()

        return () => {
            active = false
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [url, user, loading])

    // 2. Auto-Resize Logic
    const containerRef = useRef<HTMLDivElement>(null)
    // 2. Auto-Resize Logic (Responsive to container changes)

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

    // 3. Transposer State (Just for zoom/transposition read)
    const { zoom, transposition } = useMusicStore()

    return (
        <div className="flex flex-col h-full w-full relative group">
            <div ref={containerRef} className="flex-1 overflow-auto bg-zinc-900 scrollbar-hide flex justify-center relative pb-32">
                <div className="relative">
                    <Document
                        file={source}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4 mt-20">
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
