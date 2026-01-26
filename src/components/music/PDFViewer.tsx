"use client"

import { useState, useRef, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Loader2, ZoomIn, ZoomOut, Maximize, Minimize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMusicStore } from '@/lib/store'
import { TransposerOverlay } from './TransposerOverlay'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PDFViewerProps {
    url: string
}

export function PDFViewer({ url }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number>(0)
    const [width, setWidth] = useState<number>(0)
    const containerRef = useRef<HTMLDivElement>(null)
    const { zoom, setZoom, transposition } = useMusicStore()

    // 1. Auto-Resize to fit Width
    useEffect(() => {
        if (!containerRef.current) return

        const updateWidth = () => {
            if (containerRef.current) {
                // Subtract a tiny bit for scrollbar safety
                setWidth(containerRef.current.clientWidth - 4)
            }
        }

        updateWidth()
        window.addEventListener('resize', updateWidth)
        return () => window.removeEventListener('resize', updateWidth)
    }, [])

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages)
    }

    return (
        <div className="flex flex-col h-full w-full relative group">

            {/* Floating Zoom Controls (Bottom Right) */}
            <div className="absolute bottom-6 right-6 z-50 flex gap-2 bg-black/60 backdrop-blur rounded-full p-2 opacity-30 group-hover:opacity-100 transition-opacity">
                <Button onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} size="icon" variant="ghost" className="h-10 w-10 text-white rounded-full hover:bg-white/20">
                    <ZoomOut className="h-5 w-5" />
                </Button>
                <Button onClick={() => setZoom(1)} size="icon" variant="ghost" className="h-10 w-10 text-white rounded-full hover:bg-white/20 font-mono">
                    {Math.round(zoom * 100)}%
                </Button>
                <Button onClick={() => setZoom(Math.min(3, zoom + 0.1))} size="icon" variant="ghost" className="h-10 w-10 text-white rounded-full hover:bg-white/20">
                    <ZoomIn className="h-5 w-5" />
                </Button>
            </div>

            {/* Scrollable Container */}
            <div ref={containerRef} className="flex-1 overflow-auto bg-zinc-900 scrollbar-hide flex justify-center">
                <Document
                    file={url}
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
                    {Array.from(new Array(numPages), (el, index) => (
                        <PDFPageWrapper
                            key={`page_${index + 1}`}
                            pageNumber={index + 1}
                            width={width}
                            zoom={zoom}
                            transposition={transposition}
                        />
                    ))}
                </Document>
            </div>
        </div>
    )
}

function PDFPageWrapper({ pageNumber, width, zoom, transposition }: { pageNumber: number, width: number, zoom: number, transposition: number }) {
    const ref = useRef<HTMLDivElement>(null)

    return (
        <div ref={ref} className="mb-2 shadow-2xl bg-white relative group/page">
            <Page
                pageNumber={pageNumber}
                width={width * zoom} // Dynamic Width * Zoom Factor
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={
                    <div className="h-[800px] w-full bg-white/5 animate-pulse" />
                }
            />
            {/* Overlay Layer */}
            {/* Overlay Layer */}
            <TransposerOverlay parentRef={ref as React.RefObject<HTMLDivElement>} pageNumber={pageNumber} transposition={transposition} />
        </div>
    )
}
