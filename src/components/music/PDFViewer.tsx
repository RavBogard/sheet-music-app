"use client"

import { toast } from "sonner"

import { useState, useRef, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useMusicStore } from '@/lib/store'
import { getOfflineFile } from '@/lib/offline-store'
import { identifyChords, transposeChord } from '@/lib/transposer-logic'
import { TransposerLayer } from './TransposerLayer'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PDFViewerProps {
    url: string
}

export function PDFViewer({ url }: PDFViewerProps) {
    const { user } = useAuth()
    const [numPages, setNumPages] = useState<number>(0)
    const [width, setWidth] = useState<number>(0)

    // sourceUrl can be a string (online URL or blob URL) or an object (online URL + headers)
    const [source, setSource] = useState<any>(url)

    // 1. Resolve Source (Offline vs Online + Auth)
    useEffect(() => {
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
    }, [url, user])

    // 2. Auto-Resize Logic
    const containerRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const updateWidth = () => {
            if (containerRef.current) {
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

    // 3. Transposer / OCR Logic
    const { zoom, transposition, aiTransposer, setTransposerState } = useMusicStore()
    const [rawPageData, setRawPageData] = useState<Record<number, { text: string, x: number, y: number, w: number, h: number, refWidth: number, refHeight: number }[]>>({})

    const scanPages = async () => {
        if (!containerRef.current) return
        try {
            setTransposerState({ status: 'scanning' })

            // Retry mechanism for canvas
            let canvas: HTMLCanvasElement | null = null
            for (let i = 0; i < 10; i++) {
                canvas = containerRef.current.querySelector('.react-pdf__Page__canvas') as HTMLCanvasElement
                if (!canvas) canvas = containerRef.current.querySelector('canvas')
                if (canvas) break
                await new Promise(r => setTimeout(r, 200))
            }

            if (!canvas) throw new Error("No canvas found")

            // Get File ID
            const fileIdMatch = url.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
            const fileId = fileIdMatch ? fileIdMatch[1] : null

            const imageBase64 = canvas.toDataURL('image/jpeg', 0.8)

            // Get Token for OCR API
            const token = user ? await user.getIdToken() : null

            const res = await fetch('/api/vision/ocr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ imageBase64, fileId, pageNumber: 1 })
            })

            if (!res.ok) throw new Error("OCR Failed")
            const data = await res.json()

            const { chordBlocks, detectedKey } = identifyChords(data.blocks)
            const chords = chordBlocks.map(b => ({
                text: b.text,
                x: b.poly[0].x,
                y: b.poly[0].y,
                w: b.poly[2].x - b.poly[0].x,
                h: b.poly[2].y - b.poly[0].y,
                refWidth: canvas!.width,
                refHeight: canvas!.height
            }))

            setRawPageData(prev => ({ ...prev, 1: chords }))
            setTransposerState({ status: 'ready', detectedKey })

        } catch (e: any) {
            console.error(e)
            setTransposerState({ status: 'error' })
            toast.error(`Scan Failed: ${e.message}`)
        }
    }

    // Effect: Watch for global activation (Fix for "Menu opening triggers scan..." hanging)
    useEffect(() => {
        if (aiTransposer.isVisible && aiTransposer.status === 'idle') {
            console.log("Transposer activated, triggering scan...")
            scanPages()
        }
    }, [aiTransposer.isVisible, aiTransposer.status])

    return (
        <div className="flex flex-col h-full w-full relative group">
            <div ref={containerRef} className="flex-1 overflow-auto bg-zinc-900 scrollbar-hide flex justify-center relative">
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
                        {Array.from(new Array(numPages), (_, index) => {
                            const pageNum = index + 1
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
                                                scanPages()
                                            }
                                        }}
                                        loading={<div className="h-[800px] w-full bg-white/5 animate-pulse" />}
                                    />
                                    {pageChords.length > 0 && (
                                        <TransposerLayer
                                            width={width * zoom}
                                            height={0}
                                            scale={(width * zoom) / (rawPageData[pageNum]?.[0]?.refWidth || 1)}
                                            chords={pageChords}
                                            visible={aiTransposer.isVisible}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </Document>
                </div>
            </div>
        </div>
    )
}
