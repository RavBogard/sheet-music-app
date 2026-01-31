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
                const isChanged = transposition !== 0
                const fontSize = Math.max(chord.pxHeight * 0.7, 14)

                // Debug logging
                console.log(`[Transposer] "${chord.originalText}" -> "${transposed}" (semitones: ${transposition}, changed: ${isChanged})`)

                return (
                    <div
                        key={i}
                        className="absolute flex items-center justify-center"
                        style={{
                            left: `${chord.x}%`,
                            top: `${chord.y}%`,
                            transform: 'translate(-50%, -50%)',

                            // Size - much larger to cover original text
                            height: `${Math.max(chord.h * 2.5, 3)}%`,   // At least 3% of page height
                            minWidth: `${Math.max(chord.h * 5, 5)}%`,   // At least 5% of page width
                            padding: '0.4em 0.8em',

                            // Appearance
                            backgroundColor: 'white',
                            border: '2px solid #d1d5db',                 // Thicker border
                            borderRadius: '4px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',    // Stronger shadow

                            // Typography
                            color: isChanged ? '#7c3aed' : '#0284c7',
                            fontSize: `${Math.max(fontSize * 1.2, 16)}px`,  // Minimum 16px
                            fontWeight: 700,
                            fontFamily: 'ui-monospace, monospace',
                            lineHeight: 1,
                            whiteSpace: 'nowrap',

                            zIndex: 100,
                        }}
                    >
                        {transposed}
                    </div>
                )
            })}
        </div>
    )
}


