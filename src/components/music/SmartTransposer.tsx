import { useRef, useEffect, useState } from "react"
import { useMusicStore } from "@/lib/store"
import { useAuth } from "@/lib/auth-context"
import { scanForChordStrips } from "@/lib/line-scanner"
import { scanTextLayer } from "@/lib/text-scanner"
import { transposeChord } from "@/lib/music-math"
import { loadChordCache, saveChordCache } from "@/lib/chord-cache"

interface SmartTransposerProps {
    pageRef: React.RefObject<HTMLDivElement | null>
    pageNumber: number
    isRendered: boolean
}

/**
 * Resolve the current file's Drive ID from the store.
 * Checks the playback queue first, falls back to parsing the fileUrl.
 */
function useCurrentFileId(): string | null {
    const { playbackQueue, queueIndex, fileUrl } = useMusicStore()

    // From playback queue (setlist/perform mode)
    if (queueIndex >= 0 && playbackQueue[queueIndex]?.fileId) {
        return playbackQueue[queueIndex].fileId
    }

    // From file URL (library single-file view): /api/drive/file/{fileId}
    if (fileUrl && typeof fileUrl === "string") {
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

    const pageData = aiState.pageData[pageNumber]

    useEffect(() => {
        if (aiState.isEnabled && isRendered && !pageData && !hasScanned && !aiState.scanningPages.includes(pageNumber)) {
            runScan()
        }
    }, [aiState.isEnabled, isRendered, pageData, hasScanned])

    const runScan = async () => {
        if (!pageRef.current) return

        try {
            setHasScanned(true)
            setPageScanning(pageNumber, true)
            setLocalError(null)

            const token = await user?.getIdToken()

            // ── Step 1: Check chord cache ──
            if (fileId && token) {
                try {
                    const cached = await loadChordCache(fileId, pageNumber, token)
                    if (cached && cached.length > 0) {
                        const mappedChords = cached.map(c => ({
                            text: c.text,
                            originalText: c.originalText || c.text,
                            x: c.x,
                            y: c.y,
                            w: c.w,
                            h: c.h,
                            pxHeight: c.pxHeight,
                        }))
                        setPageData(pageNumber, { chords: mappedChords, strips: [] })
                        setPageScanning(pageNumber, false)
                        return
                    }
                } catch {
                    // Cache miss or error — proceed with scan
                }
            }

            const pageEl = pageRef.current

            // ── Step 2: Try Text Layer Scan (Vector PDF) ──
            const textChords = scanTextLayer(pageEl)

            if (textChords.length > 0) {
                const mappedChords = textChords.map(c => ({
                    text: c.text,
                    originalText: c.text,
                    x: c.x,
                    y: c.y,
                    w: c.w,
                    h: c.h,
                    pxHeight: c.pxHeight
                }))

                setPageData(pageNumber, { chords: mappedChords, strips: [] })
                setPageScanning(pageNumber, false)

                // Save to cache (fire-and-forget)
                if (fileId && token) {
                    saveChordCache(fileId, pageNumber, mappedChords, 'textLayer', token)
                }
                return
            }

            // ── Step 3: Fallback — Image Scan (Raster PDF) ──
            const canvas = pageRef.current.querySelector('canvas')
            if (!canvas) {
                throw new Error("Canvas not found")
            }

            const scanResult = await scanForChordStrips(canvas, canvas.getContext('2d')!)

            if (scanResult.strips.length === 0) {
                setPageData(pageNumber, { chords: [], strips: [] })
                return
            }

            // API Call to Gemini
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

            const chords = []
            for (const stripResult of json.results) {
                const originalStrip = scanResult.strips.find((s: any) => s.id === stripResult.id)
                if (!originalStrip) continue

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

            // Save to cache (fire-and-forget)
            if (fileId && token && chords.length > 0) {
                saveChordCache(fileId, pageNumber, chords, 'geminiOCR', token)
            }

        } catch (err: any) {
            console.error("Scan Error:", err)
            setLocalError(err.message)
            setAiError(err.message)
        } finally {
            setPageScanning(pageNumber, false)
        }
    }

    // ── Render ──
    if (!aiState.isEnabled || !pageData) {
        return null
    }

    return (
        <div className="absolute inset-0 z-10 pointer-events-none">
            {pageData.chords.map((chord: any, i: number) => {
                const transposed = transposeChord(chord.originalText || chord.text, transposition)
                const isChanged = transposition !== 0

                // Dynamic font sizing based on detected chord height
                const detectedHeight = chord.pxHeight || 16
                const fontSize = Math.max(12, Math.min(detectedHeight * 0.85, 28))

                // Width to cover original text — enough for whichever is wider
                const charCount = Math.max(transposed.length, chord.originalText?.length || 0)
                const minWidth = Math.max(charCount * (fontSize * 0.65), fontSize * 1.5)

                // Padding for white background coverage
                const padV = 2
                const padH = 3

                return (
                    <div
                        key={i}
                        className="absolute"
                        style={{
                            // Position at the exact chord location
                            left: `${chord.x}%`,
                            top: `${chord.y}%`,

                            // Negative margin offsets the padding so the TEXT
                            // stays anchored at the original chord position
                            margin: `-${padV}px 0 0 -${padH}px`,
                            padding: `${padV}px ${padH}px`,

                            minWidth: `${minWidth}px`,

                            backgroundColor: 'white',
                            borderRadius: '1px',

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
