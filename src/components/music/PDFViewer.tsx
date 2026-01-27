"use client"

import { useState, useRef, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Loader2, ZoomIn, ZoomOut, Maximize, Minimize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMusicStore } from '@/lib/store'

// import { TransposerOverlay } from './TransposerOverlay' // Deprecated
// import { TransposerLayer, TransposedChord } from './TransposerLayer' // Moved up
import { TransposerLayer, TransposedChord } from './TransposerLayer'
import { identifyChords, transposeChord } from '@/lib/transposer-logic'
import { Wand2, Check } from 'lucide-react'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PDFViewerProps {
    url: string
}

// ... imports
import { getOfflineFile } from '@/lib/offline-store'

// ...

export function PDFViewer({ url }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number>(0)
    const [width, setWidth] = useState<number>(0)

    // Offline / Source URL Logic
    const [sourceUrl, setSourceUrl] = useState<string>(url)

    useEffect(() => {
        let active = true
        let objectUrl: string | null = null

        const loadOffline = async () => {
            // Extract File ID from URL: /api/drive/file/[FILE_ID]
            const fileIdMatch = url.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
            const fileId = fileIdMatch ? fileIdMatch[1] : null

            if (fileId) {
                const offlineFile = await getOfflineFile(fileId)
                if (active && offlineFile) {
                    console.log("Serving offline file for:", fileId)
                    objectUrl = URL.createObjectURL(offlineFile.blob)
                    setSourceUrl(objectUrl)
                } else if (active) {
                    setSourceUrl(url)
                }
            } else {
                if (active) setSourceUrl(url)
            }
        }

        loadOffline()

        return () => {
            active = false
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [url])

    const containerRef = useRef<HTMLDivElement>(null)

    const { zoom, setZoom, transposition, aiTransposer, setTransposerState } = useMusicStore()

    // Store raw OCR data: page -> { text, x, y, w, h, refWidth, refHeight }[]
    const [rawPageData, setRawPageData] = useState<Record<number, { text: string, x: number, y: number, w: number, h: number, refWidth: number, refHeight: number }[]>>({})

    const scanPages = async () => {
        if (!containerRef.current) return
        try {
            setTransposerState({ status: 'scanning' })

            // MVP: Scan Page 1 (first canvas)
            // Retry mechanism for mobile/slow rendering
            let canvas: HTMLCanvasElement | null = null
            for (let i = 0; i < 10; i++) {
                // Try specific class first (more robust)
                canvas = containerRef.current.querySelector('.react-pdf__Page__canvas') as HTMLCanvasElement
                if (!canvas) {
                    canvas = containerRef.current.querySelector('canvas')
                }

                if (canvas) break

                // Wait 200ms
                await new Promise(r => setTimeout(r, 200))
            }

            if (!canvas) throw new Error("No canvas found after retries")

            // Extract File ID from URL for Caching
            // URL format: /api/drive/file/[FILE_ID]
            const fileIdMatch = url.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
            const fileId = fileIdMatch ? fileIdMatch[1] : null

            const imageBase64 = canvas.toDataURL('image/jpeg', 0.8)
            const res = await fetch('/api/vision/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64,
                    fileId,
                    pageNumber: 1
                })
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}))
                console.error("OCR API Error Details:", errData)
                throw new Error(errData.details || errData.error || "OCR Request Failed")
            }
            const data = await res.json()
            const { chordBlocks, detectedKey } = identifyChords(data.blocks)

            // Map to generic format
            const chords = chordBlocks.map(b => ({
                text: b.text,
                x: b.poly[0].x,
                y: b.poly[0].y,
                w: b.poly[2].x - b.poly[0].x,
                h: b.poly[2].y - b.poly[0].y,
                refWidth: canvas.width,    // Store the pixel width of the image sent to AI
                refHeight: canvas.height
            }))

            setRawPageData(prev => ({ ...prev, 1: chords }))

            // Update Global Store
            setTransposerState({ status: 'ready', detectedKey })

        } catch (e: any) {
            console.error(e)
            setTransposerState({ status: 'error' })
            alert(`Scan Failed: ${e.message}`)
        }
    }

    // Effect: Watch for global activation
    // Logic moved to onRenderSuccess of Page component to avoid race conditions
    // useEffect(() => {
    //     if (aiTransposer.isVisible && aiTransposer.status === 'idle') {
    //         setTimeout(() => scanPages(), 500)
    //     }
    // }, [aiTransposer.isVisible, aiTransposer.status])

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


            {/* Local Controls Removed - Hoisted to PerformanceToolbar */}
            {/* We maintain only the document container here */}


            {/* Scrollable Container */}
            <div ref={containerRef} className="flex-1 overflow-auto bg-zinc-900 scrollbar-hide flex justify-center relative">
                <div className="relative">
                    <Document
                        file={sourceUrl}
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
                        {Array.from(new Array(numPages), (el, index) => {
                            const pageNum = index + 1
                            // Compute transposed chords for this page if available
                            const pageChords = (rawPageData[pageNum] || []).map(c => ({
                                x: c.x, y: c.y, width: c.w, height: c.h,
                                original: c.text,
                                transposed: transposeChord(c.text, transposition)
                            }))

                            return (
                                <div key={`page_${pageNum}`} className="mb-2 shadow-2xl bg-white relative group/page">
                                    <Page
                                        pageNumber={pageNum}
                                        width={width * zoom}
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                        onRenderSuccess={() => {
                                            if (aiTransposer.isVisible && aiTransposer.status === 'idle') {
                                                console.log("Page rendered, triggering scan...")
                                                scanPages()
                                            }
                                        }}
                                        loading={
                                            <div className="h-[800px] w-full bg-white/5 animate-pulse" />
                                        }
                                    />
                                    {/* Per-Page Transposer Layer */}
                                    {pageChords.length > 0 && (
                                        <TransposerLayer
                                            width={width * zoom}
                                            height={0} // Relative positioning handles this
                                            // The scale is key! 
                                            // The coordinates (c.x) are based on `c.refWidth`.
                                            // The current DOM is `width * zoom`.
                                            // So scale = (width * zoom) / c.refWidth
                                            scale={(width * zoom) / (rawPageData[pageNum]?.[0]?.refWidth || 1)}
                                            chords={pageChords}
                                            visible={aiTransposer.isVisible}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </Document>

                    {/* (Old Global Layer Removed) */}
                </div>
            </div>
        </div>
    )
}
