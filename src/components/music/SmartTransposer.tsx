import { useRef, useEffect, useState } from "react"
import { useMusicStore } from "@/lib/store"
import { useAuth } from "@/lib/auth-context"
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
            const textChords = scanTextLayer(pageEl);

            if (textChords.length > 0) {
                const mappedChords = textChords.map(c => ({
                    text: c.text,
                    originalText: c.text,
                    x: c.x,
                    y: c.y,
                    w: c.w,
                    h: c.h,
                    pxHeight: c.pxHeight
                }));

                setPageData(pageNumber, { chords: mappedChords, strips: [] })
                setPageScanning(pageNumber, false)
                return;
            }

            // 2. Fallback: Image Scan via API (Raster PDF)
            const canvas = pageRef.current.querySelector('canvas')
            if (!canvas) {
                throw new Error("Canvas not found")
            }

            // Client-side Line Scanning
            const { scanForChordStrips } = await import("@/lib/line-scanner")
            const scanResult = await scanForChordStrips(canvas, canvas.getContext('2d')!)

            if (scanResult.strips.length === 0) {
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
                const originalStrip = scanResult.strips.find((s: any) => s.id === stripResult.id)
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

    // RENDER
    if (!aiState.isEnabled || !pageData) {
        return null;
    }

    // Don't render overlays if no transposition is applied
    if (transposition === 0) {
        return null;
    }

    return (
        <div className="absolute inset-0 z-10 pointer-events-none">
            {pageData.chords.map((chord: any, i: number) => {
                const transposed = transposeChord(chord.originalText, transposition)
                const isChanged = transposed !== chord.originalText

                // Don't overlay if the chord didn't actually change
                if (!isChanged) return null;

                // Dynamic font size based on detected chord height
                // The pxHeight from text scanner is the actual rendered height of the chord text
                // We scale it slightly larger to ensure full coverage
                const baseFontSize = chord.pxHeight
                    ? Math.max(14, Math.min(chord.pxHeight * 1.1, 32))
                    : 18;

                // Use the width from scanner if available for better coverage
                const hasWidth = chord.w && chord.w > 0;

                return (
                    <div
                        key={i}
                        className="absolute"
                        style={{
                            // Position at detected location
                            left: `${chord.x}%`,
                            top: `${chord.y}%`,
                            transform: 'translateY(-35%)',

                            // Size: use detected width if available, otherwise auto
                            ...(hasWidth ? {
                                minWidth: `${Math.max(chord.w + 1, 3)}%`,
                            } : {}),

                            // Padding to cover original
                            padding: '4px 8px',

                            // Clean white overlay
                            backgroundColor: 'white',
                            borderRadius: '3px',
                            boxShadow: '0 0 0 2px white', // Extra white bleed to cover edges

                            // Typography: match lead sheet aesthetic
                            color: '#7c3aed', // Purple for transposed chords
                            fontSize: `${baseFontSize}px`,
                            fontWeight: 700,
                            fontFamily: "'Times New Roman', 'Georgia', serif", // Lead sheets typically use serif
                            lineHeight: 1.1,
                            whiteSpace: 'nowrap',
                            letterSpacing: '-0.02em',

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
