"use client"

import { useRef, useState } from "react"
import { Page } from "react-pdf"

import { SmartTransposer } from "./SmartTransposer"

interface PDFPageWrapperProps {
    pageNumber: number
    width: number
    transposition: number
}

export function PDFPageWrapper({ pageNumber, width, transposition: _transposition }: PDFPageWrapperProps) {
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
