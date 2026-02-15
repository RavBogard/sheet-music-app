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

            // 2. Fallback: Image Scan (Raster PDF)
            const canvas = pageRef.current.querySelector('canvas')
            if (!canvas) {
                throw new Error("Canvas not found")
            }

            // Client-side Line Scanning
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

    // RENDER
    if (!aiState.isEnabled || !pageData) {
        return null;
    }

    return (
        <div className="absolute inset-0 z-10 pointer-events-none">
            {pageData.chords.map((chord: any, i: number) => {
                const transposed = transposeChord(chord.originalText, transposition)
                const isChanged = transposition !== 0

                // Dynamic font sizing based on detected chord height
                // Use pxHeight from the scan, with reasonable bounds
                const detectedHeight = chord.pxHeight || 16
                const fontSize = Math.max(12, Math.min(detectedHeight * 0.85, 28))

                // Calculate overlay width to fully cover original text
                // Wider for longer chord names (e.g., "F#m7/C#")
                const charCount = Math.max(transposed.length, chord.originalText?.length || 0)
                const minWidth = Math.max(charCount * (fontSize * 0.65), fontSize * 1.5)

                return (
                    <div
                        key={i}
                        className="absolute"
                        style={{
                            left: `${chord.x}%`,
                            top: `${chord.y}%`,
                            transform: 'translateY(-45%)',

                            // Sized to cover original chord
                            minWidth: `${minWidth}px`,
                            padding: `${fontSize * 0.25}px ${fontSize * 0.35}px`,

                            // Clean white overlay
                            backgroundColor: 'white',
                            border: 'none',
                            borderRadius: '2px',

                            // Dynamic font matching PDF scale
                            color: isChanged ? '#6d28d9' : '#1e40af',
                            fontSize: `${fontSize}px`,
                            fontWeight: 700,
                            fontFamily: "'Times New Roman', 'Georgia', serif",
                            lineHeight: 1.1,
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
