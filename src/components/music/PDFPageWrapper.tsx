"use client"

import { useRef, useState } from "react"
import { Page } from "react-pdf"

import { SmartTransposer } from "./SmartTransposer"

interface PDFPageWrapperProps {
    pageNumber: number
    width: number
    transposition: number
    /** WS-14: report this page's intrinsic aspect ratio (height/width) once it
     *  loads, so the viewer can compute a fit-page width. Wired for page 1 only. */
    onPageAspect?: (aspect: number) => void
}

export function PDFPageWrapper({ pageNumber, width, transposition: _transposition, onPageAspect }: PDFPageWrapperProps) {
    const pageRef = useRef<HTMLDivElement>(null)
    const [rendered, setRendered] = useState(false)

    return (
        <div ref={pageRef} className="mb-2 shadow-2xl bg-white relative group/page min-h-[100px]">
            <Page
                pageNumber={pageNumber}
                width={width}
                renderTextLayer={true}
                renderAnnotationLayer={false}
                loading={<div className="h-[800px] w-full bg-white/5 animate-pulse" />}
                onLoadSuccess={(page) => {
                    // WS-14: page.width/height are the page's intrinsic dimensions
                    // (PDF points at scale 1) — orientation-correct for fit-page math.
                    if (onPageAspect && page.width > 0) onPageAspect(page.height / page.width)
                }}
                onRenderSuccess={() => setRendered(true)}
                className="pdf-page"
            />

            <SmartTransposer
                pageRef={pageRef}
                pageNumber={pageNumber}
                isRendered={rendered}
            />
        </div>
    )
}
