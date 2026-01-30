import { useRef, useEffect, useState } from "react"
import { useMusicStore } from "@/lib/store"
import { useAuth } from "@/lib/auth-context"
import { scanForChordStrips } from "@/lib/line-scanner"
import { scanTextLayer } from "@/lib/text-scanner"
import { transposeChord } from "@/lib/music-math"

interface SmartTransposerProps {
    pageRef: React.RefObject<HTMLDivElement | null>
    pageNumber: number
    isRendered: boolean
}

export function SmartTransposer({ pageRef, pageNumber, isRendered }: SmartTransposerProps) {
    const {
        aiState,
        setPageScanning,
        setPageData,
        setAiError,
        transposition
    } = useMusicStore()
    const { user } = useAuth()

    const [hasScanned, setHasScanned] = useState(false)
    const [localError, setLocalError] = useState<string | null>(null)

    // Data for this specific page
    const pageData = aiState.pageData[pageNumber]

    useEffect(() => {
        // Trigger Scan if enabled, rendered, and no data yet
        if (aiState.isEnabled && isRendered && !pageData && !hasScanned && !aiState.scanningPages.includes(pageNumber)) {
            runScan()
        }
    }, [aiState.isEnabled, isRendered, pageData, hasScanned])

    const runScan = async () => {
        if (!pageRef.current) return;

        try {
            setHasScanned(true)
            setPageScanning(pageNumber, true)
            setLocalError(null)

            const pageEl = pageRef.current;

            // 1. Try Text Layer Scan (Vector PDF) - FAST & PRECISE
            // We need to wait for text layer to render? `isRendered` passed prop handles canvas, 
            // but text layer might lag slightly.
            // Let's assume if isRendered is true, text layer is likely there or coming.
            // We can retry? Or just run.

            const textChords = scanTextLayer(pageEl);

            if (textChords.length > 0) {
                console.log("Text Layer Matches Found:", textChords.length);
                // Map to same format as API
                const mappedChords = textChords.map(c => ({
                    text: c.text,
                    originalText: c.text,
                    x: c.x,
                    y: c.y,
                    h: c.h,
                    pxHeight: c.pxHeight
                }));

                // No strips needed for text layer mode
                setPageData(pageNumber, { chords: mappedChords, strips: [] })
                setPageScanning(pageNumber, false)
                return;
            }

            // 2. Fallback: Image Scan (Raster PDF)
            console.log("No text layer chords found. Falling back to Image Scan...");

            // Find Canvas
            const canvas = pageRef.current.querySelector('canvas')
            if (!canvas) {
                throw new Error("Canvas not found")
            }

            // Client-side Line Scanning
            const scanResult = await scanForChordStrips(canvas, canvas.getContext('2d')!)

            if (scanResult.strips.length === 0) {
                // No chords found in image either
                setPageData(pageNumber, { chords: [], strips: [] })
                return
            }

            // API Call
            const token = await user?.getIdToken()
            const res = await fetch('/api/ai/transposer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ strips: scanResult.strips })
            })

            if (!res.ok) {
                throw new Error("AI Processing Failed")
            }

            const json = await res.json()

            // Map Results
            const chords = [];

            for (const stripResult of json.results) {
                const originalStrip = scanResult.strips.find(s => s.id === stripResult.id)
                if (!originalStrip) continue;

                for (const chord of stripResult.chords) {
                    const msgHeight = originalStrip.height
                    const centerY = originalStrip.y + (msgHeight / 2)
                    const yPct = (centerY / canvas.height) * 100
                    const hPct = (msgHeight / canvas.height) * 100

                    chords.push({
                        text: chord.text,
                        originalText: chord.text,
                        x: chord.x,
                        y: yPct,
                        h: hPct,
                        pxHeight: msgHeight
                    })
                }
            }

            setPageData(pageNumber, { chords, strips: scanResult.strips })

        } catch (err: any) {
            console.error("Scan Error:", err)
            setLocalError(err.message)
            setAiError(err.message)
        } finally {
            setPageScanning(pageNumber, false)
        }
    }

    // Helper to get token (firebase-client dependent)
    // We can't easily import `auth` here if component is server? No "use client".
    // We need to pass token or use hook. `useAuth` hook from context.

    // RENDER
    if (!aiState.isEnabled || !pageData) {
        return null;
    }

    return (
        <div className="absolute inset-0 z-10 pointer-events-none">
            {pageData.chords.map((chord: any, i: number) => {
                const transposed = transposeChord(chord.originalText, transposition)
                const isChanged = transposed !== chord.originalText

                // Dynamic styling
                // We want the font size to be roughly 80% of the strip height
                // But we need to convert pixel height to relative unit or just use a standard 'large' size?
                // The chord.h is a percentage of page height.
                // Let's use `container` query or just `vh`? No, page wrapper defines context. `height: 100%`.
                // We can use style={{ fontSize: `${chord.h * 0.8}%` }}? No, font-size % is relative to parent font-size.
                // We can use Viewport units? No.
                // We can use a heuristic. If strip is 50px on a 1000px canvas, that's 5%.
                // Let's try explicit height style on the box and flex center.

                return (
                    <div
                        key={i}
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-auto"
                        style={{
                            left: `${chord.x}%`,
                            top: `${chord.y}%`,
                            height: `${chord.h}%`, // Match strip height
                            minWidth: `${chord.h * 2.0}%`, // slightly wider
                            padding: '0 0.2em',

                            // Visual Tweaks
                            backgroundColor: 'white', // Opaque
                            border: '1px solid #e2e8f0', // Slight border
                            borderRadius: '4px',
                            zIndex: 50, // Higher than before
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',

                            // Font
                            color: isChanged ? '#9333ea' : '#0ea5e9', // Purple if transposed, Blue if original (to show it's "Smart")
                            // Use pure pixel size for accuracy, maybe scale up slightly
                            fontSize: `${chord.pxHeight * 0.9}px`,
                            lineHeight: 1,
                            fontWeight: '800', // Extra bold
                            fontFamily: 'monospace' // Or system-ui but mono is safer for alignment?
                        }}
                    >
                        {transposed}
                    </div>
                )
            })}
        </div>
    )
}


