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

export function PDFViewer({ url }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number>(0)
    const [width, setWidth] = useState<number>(0)
    const containerRef = useRef<HTMLDivElement>(null)

    const { zoom, setZoom, transposition } = useMusicStore()

    // Transposer State
    const [showTransposer, setShowTransposer] = useState(false)
    const [status, setStatus] = useState<'idle' | 'scanning' | 'ready' | 'error'>('idle')
    const [visibleKey, setVisibleKey] = useState<string>('')
    // Store raw OCR data: page -> { text, x, y, w, h, refWidth, refHeight }[]
    const [rawPageData, setRawPageData] = useState<Record<number, { text: string, x: number, y: number, w: number, h: number, refWidth: number, refHeight: number }[]>>({})

    const scanPages = async () => {
        if (!containerRef.current) return
        try {
            setStatus('scanning')
            setShowTransposer(true)

            // MVP: Scan Page 1 (first canvas)
            const canvas = containerRef.current.querySelector('canvas')
            if (!canvas) throw new Error("No canvas found")

            const imageBase64 = canvas.toDataURL('image/jpeg', 0.8)
            const res = await fetch('/api/vision/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64 })
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
            setVisibleKey(detectedKey)
            setStatus('ready')

        } catch (e: any) {
            console.error(e)
            setStatus('error')
            alert(`Scan Failed: ${e.message}`)
        }
    }

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

            {/* Transposer Toggle (Bottom Left - Moved to avoid blocking top controls) */}
            <div className="absolute bottom-6 left-6 z-50 flex gap-2">
                {status === 'ready' && (
                    <div className="bg-white/90 text-black px-3 py-2 rounded-lg shadow-xl backdrop-blur flex items-center gap-2 border border-purple-100">
                        <div className="text-xs font-bold text-purple-600 uppercase tracking-wider">
                            {visibleKey} <span className="text-zinc-400">→</span> {transposeChord(visibleKey, transposition)}
                        </div>
                    </div>
                )}
                <Button
                    variant={showTransposer ? "secondary" : "default"}
                    onClick={status === 'ready' ? () => setShowTransposer(!showTransposer) : scanPages}
                    disabled={status === 'scanning'}
                    className="shadow-lg gap-2"
                >
                    {status === 'scanning' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    {status === 'idle' || status === 'error' ? "Magic Transpose" : (showTransposer ? "Hide Chords" : "Show Chords")}
                </Button>
            </div>

            {/* Scrollable Container */}
            <div ref={containerRef} className="flex-1 overflow-auto bg-zinc-900 scrollbar-hide flex justify-center relative">
                <div className="relative">
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
                                            visible={showTransposer}
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
