"use client"

import { useRef, useEffect, useState } from "react"
import { Page } from "react-pdf"

import { useMusicStore } from "@/lib/store"
import { SmartTransposer } from "./SmartTransposer"

interface PDFPageWrapperProps {
    pageNumber: number
    width: number
    transposition: number
}

export function PDFPageWrapper({ pageNumber, width, transposition: _transposition }: PDFPageWrapperProps) {
    const pageRef = useRef<HTMLDivElement>(null)
    const [rendered, setRendered] = useState(false)
    const setCurrentVisiblePage = useMusicStore(s => s.setCurrentVisiblePage)

    // Track which page is most visible for live session broadcasting
    useEffect(() => {
        const el = pageRef.current
        if (!el) return
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                    setCurrentVisiblePage(pageNumber)
                }
            },
            { threshold: 0.5 }
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [pageNumber, setCurrentVisiblePage])

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
