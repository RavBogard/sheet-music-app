import { useRef, useEffect, useState } from "react"
import { useMusicStore } from "@/lib/store"
import { useAuth } from "@/lib/auth-context"
import { scanForChordStrips } from "@/lib/line-scanner"
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

            // 1. Find Canvas
            const canvas = pageRef.current.querySelector('canvas')
            if (!canvas) {
                throw new Error("Canvas not found")
            }

            // 2. Client-side Line Scanning
            const scanResult = await scanForChordStrips(canvas, canvas.getContext('2d')!)

            if (scanResult.strips.length === 0) {
                // No chords found logic? Or just empty result.
                setPageData(pageNumber, { chords: [], strips: [] })
                return
            }

            // 3. API Call
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

            // 4. Map Results
            // Result is [{ id, chords: [{ text, x }] }]
            // We need to map strip Y + chord relative X to page coordinates
            // Strips are in raw pixels relative to canvas.

            // We need to normalize to PERCENTAGE so it scales if resizing
            // Note: Canvas pixel size might differ from CSS size (Retina)
            // But line-scanner uses canvas.width/height directly.

            const chords = [];

            for (const stripResult of json.results) {
                const originalStrip = scanResult.strips.find(s => s.id === stripResult.id)
                if (!originalStrip) continue;

                for (const chord of stripResult.chords) {
                    // stripResult.chords: { text: "Am", x: 15 } // x is 0-100? Prompt asked for "horizontal position (0-100%)"

                    // Y Calculation
                    // Strip Y is in pixels. Canvas Height is in pixels.
                    // Y % = (originalStrip.y / canvas.height) * 100
                    const yPct = (originalStrip.y / canvas.height) * 100

                    // X Calculation
                    // chord.x is already percentage 0-100 from prompt?
                    // We prompt: "approximate horizontal position (0-100%)"
                    // Let's assume it returns a number 0-100.

                    chords.push({
                        text: chord.text,
                        originalText: chord.text,
                        x: chord.x,
                        y: yPct
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

                // Diff style?
                const isChanged = transposed !== chord.originalText

                return (
                    <div
                        key={i}
                        className="absolute transform -translate-y-1/2 px-1 rounded bg-white/90 text-black font-bold font-mono text-sm sm:text-base border border-blue-200/50 shadow-sm"
                        style={{
                            left: `${chord.x}%`,
                            top: `${chord.y}%`,
                            color: isChanged ? '#d946ef' : 'black', // Fuchsia if transposed
                        }}
                    >
                        {transposed}
                    </div>
                )
            })}
        </div>
    )
}


