import { useEffect, useState } from "react"
import { useMusicStore } from "@/lib/store"
import { useAuth } from "@/lib/auth-context"
import { scanForChordStrips } from "@/lib/line-scanner"
import { scanTextLayer } from "@/lib/text-scanner"
import { transposeChord, estimateKey, keyUsesFlats } from "@/lib/music-math"
import { cleanChordText } from "@/lib/chord-utils"
import { loadChordCache, saveChordCache } from "@/lib/chord-cache"
import { logger } from "@/lib/logger"

interface SmartTransposerProps {
    pageRef: React.RefObject<HTMLDivElement | null>
    pageNumber: number
    isRendered: boolean
}

interface ChordOverlay {
    text: string
    originalText?: string
    x: number
    y: number
    w?: number
    h?: number
    pxHeight?: number
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
    const [_localError, setLocalError] = useState<string | null>(null)

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
                const originalStrip = scanResult.strips.find((s: { id: string }) => s.id === stripResult.id)
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

        } catch (err: unknown) {
            logger.error("Scan Error:", err)
            setLocalError(err instanceof Error ? err.message : "Scan failed")
            setAiError(err instanceof Error ? err.message : "Scan failed")
        } finally {
            setPageScanning(pageNumber, false)
        }
    }

    // ── Render ──
    if (!aiState.isEnabled || !pageData) {
        return null
    }

    // Derive flat/sharp preference from the target key
    // Gather all chords across pages, estimate key, transpose to get target key
    const allChords = Object.values(aiState.pageData).flatMap(
        p => p.chords.map((c: { originalText?: string; text: string }) => c.originalText || c.text)
    )
    const detectedKey = allChords.length > 0 ? estimateKey(allChords) : null
    const targetKey = detectedKey && transposition !== 0
        ? transposeChord(detectedKey, transposition)
        : detectedKey
    const preferFlats = keyUsesFlats(targetKey)

    return (
        <div className="absolute inset-0 z-10 pointer-events-none">
            {pageData.chords.map((chord: ChordOverlay, i: number) => {
                // Clean the source text (remove parens, normalize accidentals)
                const sourceText = cleanChordText(chord.originalText || chord.text)
                const transposed = transposeChord(sourceText, transposition, preferFlats)
                const isChanged = transposition !== 0

                // Dynamic font sizing based on detected chord height
                const detectedHeight = chord.pxHeight || 16
                const fontSize = Math.max(12, Math.min(detectedHeight * 0.85, 28))

                // Extend the white background beyond the overlay text to cover
                // any unmerged original chord fragments (e.g. "#m" that wasn't
                // merged with the root note). Use the original chord width
                // from the text scanner as minimum coverage.
                const chordWidth = chord.w || 0
                const padV = 0
                const padH = 2

                // At transposition=0, don't overlay — original PDF text is already correct
                if (!isChanged) return null

                return (
                    <div
                        key={i}
                        className="absolute"
                        style={{
                            left: `${chord.x}%`,
                            top: `${chord.y}%`,

                            margin: `-${padV}px 0 0 -${padH}px`,
                            padding: `${padV}px ${padH + 2}px ${padV}px ${padH}px`,

                            // Ensure white background covers the full extent of the
                            // original chord in the PDF, preventing bleed-through of
                            // unmerged accidental/quality fragments
                            minWidth: chordWidth > 0 ? `${chordWidth}%` : undefined,

                            backgroundColor: 'rgba(255, 255, 255, 0.97)',
                            borderRadius: '1px',

                            color: '#6d28d9',
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
