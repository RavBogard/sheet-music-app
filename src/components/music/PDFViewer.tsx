"use client"

import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useMusicStore } from '@/lib/store'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Configure worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PDFViewerProps {
    url: string
}

export function PDFViewer({ url }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number>(0)
    const { zoom, setZoom } = useMusicStore()

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages)
    }

    return (
        <div className="flex flex-col items-center gap-4 p-4 w-full">
            <div className="flex gap-2 sticky top-2 z-10 bg-background/80 backdrop-blur p-2 rounded-lg border">
                <Button onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} variant="outline" size="sm">
                    -
                </Button>
                <span className="flex items-center text-sm font-mono min-w-[3ch]">
                    {Math.round(zoom * 100)}%
                </span>
                <Button onClick={() => setZoom(Math.min(3, zoom + 0.1))} variant="outline" size="sm">
                    +
                </Button>
            </div>

            <Card className="p-4 bg-muted/20 min-h-[0px] w-full flex justify-center overflow-auto">
                <Document
                    file={url}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={
                        <div className="flex items-center gap-2 h-96">
                            <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
                            <span className="text-muted-foreground">Loading Score...</span>
                        </div>
                    }
                    error={
                        <div className="text-destructive p-4">
                            Failed to load PDF.
                        </div>
                    }
                >
                    {Array.from(new Array(numPages), (el, index) => (
                        <div key={`page_${index + 1}`} className="mb-4 shadow-lg">
                            <Page
                                pageNumber={index + 1}
                                scale={zoom}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                            />
                        </div>
                    ))}
                </Document>
            </Card>
        </div>
    )
}
