"use client"

import { useRef, useEffect, useState } from "react"
import { Page } from "react-pdf"
import { TransposerOverlay } from "./TransposerOverlay"
import { useMusicStore } from "@/lib/store"

interface PDFPageWrapperProps {
    pageNumber: number
    width: number
    transposition: number
}

export function PDFPageWrapper({ pageNumber, width, transposition }: PDFPageWrapperProps) {
    const pageRef = useRef<HTMLDivElement>(null)
    const { aiTransposer, setTransposerState } = useMusicStore()
    const [rendered, setRendered] = useState(false)

    // Trigger scan if global state requests it and we haven't scanned
    // But TransposerOverlay handles that internally via "enabled" state usually.
    // We want to control it via the store's "isVisible".

    // Actually TransposerOverlay's internal "enabled" state was the issue.
    // It checked its own local state.
    // We should make TransposerOverlay respect the global store. 
    // I already updated TransposerOverlay to use useMusicStore logic for rendering.
    // So just mounting it should work.

    return (
        <div ref={pageRef} className="mb-2 shadow-2xl bg-white relative group/page min-h-[100px]">
            <Page
                pageNumber={pageNumber}
                width={width}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={<div className="h-[800px] w-full bg-white/5 animate-pulse" />}
                onRenderSuccess={() => setRendered(true)}
            />

            {/* 
                We always mount the overlay so it can react to store changes (Scanning/Edit Mode)
                It will return null if !isVisible internally or we can short-circuit here.
                Better to let it handle logic. 
             */}
            <TransposerOverlay
                parentRef={pageRef as React.RefObject<HTMLDivElement>}
                pageNumber={pageNumber}
                transposition={transposition}
                startScanning={rendered}
            />
        </div>
    )
}
