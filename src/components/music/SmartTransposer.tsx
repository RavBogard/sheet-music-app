import { useRef, useEffect, useState } from "react"
import { useMusicStore } from "@/lib/store"
import { useAuth } from "@/lib/auth-context"
import { scanTextLayer } from "@/lib/text-scanner"
import { transposeChord } from "@/lib/music-math"
import { loadChordCache, saveChordCache } from "@/lib/chord-cache"

interface SmartTransposerProps {
    pageRef: React.RefObject<HTMLDivElement | null>
    pageNumber: number
    isRendered: boolean
}

/**
 * Extract fileId from the current context.
 * Tries playback queue first, then falls back to parsing the fileUrl.
 */
function useCurrentFileId(): string | null {
    const { playbackQueue, queueIndex, fileUrl } = useMusicStore()

    // From playback queue (perform mode)
    const queueFileId = playbackQueue[queueIndex]?.fileId
    if (queueFileId) return queueFileId

    // From URL pattern /api/drive/file/{fileId}
    if (fileUrl) {
        const match = fileUrl.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
        if (match) return match[1]
    }

    return null
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
    const fileId = useCurrentFileId()

    const [hasScanned, setHasScanned] = useState(false)
    const [localError, setLocalError] = useState<string | null>(null)

    // Data for this specific page
    const pageData = aiState.pageData[pageNumber]

    useEffect(() => {
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

            // 1. Check server cache first
            if (fileId && user) {
                const token = await user.getIdToken()
                const cached = await loadChordCache(fileId, pageNumber, token)
                if (cached && cached.length > 0) {
                    console.log(`[Transposer] Cache hit for ${fileId} page ${pageNumber}: ${cached.length} chords`)
                    setPageData(pageNumber, { chords: cached, strips: [] })
                    setPageScanning(pageNumber, false)
                    return
                }
            }

            const pageEl = pageRef.current;

            // 2. Try Text Layer Scan (Vector PDF) - FAST & PRECISE
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

                // Save to cache (fire-and-forget)
                if (fileId && user) {
                    const token = await user.getIdToken()
                    saveChordCache(fileId, pageNumber, mappedChords, 'textLayer', token)
                }
                return;
            }

            // 3. Fallback: Image Scan via API (Raster PDF)
            const canvas = pageRef.current.querySelector('canvas')
            if (!canvas) {
                throw new Error("Canvas not found")
            }

            const { scanForChordStrips } = await import("@/lib/line-scanner")
            const scanResult = await scanForChordStrips(canvas, canvas.getContext('2d')!)

            if (scanResult.strips.length === 0) {
                setPageData(pageNumber, { chords: [], strips: [] })
                return
            }

            // API Call to Gemini
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

            // Save API results to cache (fire-and-forget)
            if (fileId && user && chords.length > 0) {
                const apiToken = await user.getIdToken()
                saveChordCache(fileId, pageNumber, chords, 'geminiOCR', apiToken)
            }

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
                const baseFontSize = chord.pxHeight
                    ? Math.max(14, Math.min(chord.pxHeight * 1.1, 32))
                    : 18;

                const hasWidth = chord.w && chord.w > 0;

                return (
                    <div
                        key={i}
                        className="absolute"
                        style={{
                            left: `${chord.x}%`,
                            top: `${chord.y}%`,
                            transform: 'translateY(-35%)',
                            ...(hasWidth ? {
                                minWidth: `${Math.max(chord.w + 1, 3)}%`,
                            } : {}),
                            padding: '4px 8px',
                            backgroundColor: 'white',
                            borderRadius: '3px',
                            boxShadow: '0 0 0 2px white',
                            color: '#7c3aed',
                            fontSize: `${baseFontSize}px`,
                            fontWeight: 700,
                            fontFamily: "'Times New Roman', 'Georgia', serif",
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
