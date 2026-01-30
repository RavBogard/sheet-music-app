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

                    // Y Calculation (Center of strip)
                    // (originalStrip.y + height/2) / canvas.height
                    const msgHeight = originalStrip.height
                    const centerY = originalStrip.y + (msgHeight / 2)
                    const yPct = (centerY / canvas.height) * 100

                    // Height % (for scaling font?)
                    const hPct = (msgHeight / canvas.height) * 100

                    chords.push({
                        text: chord.text,
                        originalText: chord.text,
                        x: chord.x,
                        y: yPct,
                        h: hPct,
                        pxHeight: msgHeight // Store raw pixel height for font calc if needed
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
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center bg-white shadow-sm border border-zinc-200 z-20"
                        style={{
                            left: `${chord.x}%`,
                            top: `${chord.y}%`,
                            height: `${chord.h}%`, // Match strip height
                            minWidth: `${chord.h * 1.5}%`, // roughly square+ aspect aspect
                            padding: '0 0.2em',

                            // Heuristic for font size: 80% of the box height
                            // Since we can't easily do `80% of height` in CSS font-size:
                            // We can use container query units `cqh` if we had a container?
                            // Or just a massive font scaled down? 
                            // Let's just hardcode a generous size for now or assume standard strip ~40px.
                            fontSize: 'clamp(12px, 2.5cqw, 30px)', // Fallback
                            containerType: 'size', // Does not apply to self...

                        }}
                    >
                        {/* Inner text wrapper to scale? */}
                        <span
                            style={{
                                fontSize: `${chord.pxHeight * 0.8}px`, // Use the raw pixel height we captured!
                                lineHeight: 1,
                                fontWeight: 'bold',
                                color: isChanged ? '#d946ef' : 'black'
                            }}
                        >
                            {transposed}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}


