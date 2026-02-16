"use client"

import { useRef, useEffect, useState } from "react"
import { Page } from "react-pdf"

import { useMusicStore } from "@/lib/store"
import { SmartTransposer } from "./SmartTransposer"
import { AnnotationLayer } from "./AnnotationLayer"

interface PDFPageWrapperProps {
    pageNumber: number
    width: number
    transposition: number
}

export function PDFPageWrapper({ pageNumber, width, transposition }: PDFPageWrapperProps) {
    const pageRef = useRef<HTMLDivElement>(null)
    const [rendered, setRendered] = useState(false)
    const [pageHeight, setPageHeight] = useState(0)
    const setCurrentVisiblePage = useMusicStore(s => s.setCurrentVisiblePage)

    // Measure page height after render
    useEffect(() => {
        if (rendered && pageRef.current) {
            const canvas = pageRef.current.querySelector("canvas")
            if (canvas) setPageHeight(canvas.height / (window.devicePixelRatio || 1))
        }
    }, [rendered])

    // Track which page is most visible for annotation toolbar
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

            {/* D2: Chart annotation overlay */}
            {rendered && pageHeight > 0 && (
                <AnnotationLayer
                    pageNumber={pageNumber}
                    width={width}
                    height={pageHeight}
                />
            )}
        </div>
    )
}
