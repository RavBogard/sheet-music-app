import { useEffect, useState, useCallback, useRef } from "react"
import { useMusicStore } from "@/lib/store"
import { scanTextLayer } from "@/lib/text-scanner"
import { transposeChord, estimateKey, keyUsesFlats } from "@/lib/music-math"
import { cleanChordText } from "@/lib/chord-utils"
import { loadChordCache, saveChordCache, saveNativeKey, type CachedChord, type ChordSource } from "@/lib/chord-cache"
import { apiFetch } from "@/lib/api-client"
import { logger } from "@/lib/logger"

interface SmartTransposerProps {
    pageRef: React.RefObject<HTMLDivElement | null>
    pageNumber: number
    isRendered: boolean
}

interface ChordOverlay {
    text: string
    originalText: string
    x: number
    y: number
    w?: number
    h?: number
    pxHeight?: number
    source?: ChordSource
}

// ── Concurrency limiter for AI validation ──
let activeAiCalls = 0
const AI_MAX_CONCURRENT = 2
const aiQueue: (() => void)[] = []

function acquireAiSlot(): Promise<void> {
    if (activeAiCalls < AI_MAX_CONCURRENT) {
        activeAiCalls++
        return Promise.resolve()
    }
    return new Promise(resolve => {
        aiQueue.push(() => { activeAiCalls++; resolve() })
    })
}

function releaseAiSlot() {
    activeAiCalls--
    if (aiQueue.length > 0) {
        const next = aiQueue.shift()
        next?.()
    }
}

/**
 * Resolve the current file's Drive ID from the store.
 */
function useCurrentFileId(): string | null {
    const { playbackQueue, queueIndex, fileUrl } = useMusicStore()

    if (queueIndex >= 0 && playbackQueue[queueIndex]?.fileId) {
        return playbackQueue[queueIndex].fileId
    }

    if (fileUrl && typeof fileUrl === "string") {
        const match = fileUrl.match(/\/api\/drive\/file\/([a-zA-Z0-9_-]+)/)
        if (match) return match[1]
    }

    return null
}

/**
 * Merge AI validation results with text-layer chords.
 * - Match by position (~5% tolerance)
 * - AI corrections update text + set source: 'ai'
 * - Unmatched AI chords are added as source: 'ai'
 * - Text-layer chords without AI match are kept
 */
function mergeAiResults(
    textLayerChords: ChordOverlay[],
    aiChords: { text: string; x: number; y: number }[],
    userOverrides: CachedChord[]
): ChordOverlay[] {
    const TOLERANCE = 5 // percentage points

    const merged = textLayerChords.map(c => ({ ...c }))
    const matchedAiIndices = new Set<number>()

    // Match AI chords to text-layer chords by position
    for (let ai = 0; ai < aiChords.length; ai++) {
        const aiChord = aiChords[ai]
        let bestMatch = -1
        let bestDist = Infinity

        for (let tl = 0; tl < merged.length; tl++) {
            const dx = Math.abs(merged[tl].x - aiChord.x)
            const dy = Math.abs(merged[tl].y - aiChord.y)
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < TOLERANCE && dist < bestDist) {
                bestDist = dist
                bestMatch = tl
            }
        }

        if (bestMatch >= 0) {
            matchedAiIndices.add(ai)
            const cleanAi = cleanChordText(aiChord.text)
            if (cleanAi !== merged[bestMatch].text) {
                // AI corrected this chord
                merged[bestMatch].text = cleanAi
                merged[bestMatch].source = 'ai'
            }
        } else {
            // AI found a chord the text layer missed
            matchedAiIndices.add(ai)
            merged.push({
                text: cleanChordText(aiChord.text),
                originalText: '',
                x: aiChord.x,
                y: aiChord.y,
                source: 'ai'
            })
        }
    }

    // Apply user overrides (highest priority)
    for (const override of userOverrides) {
        const match = merged.find(c =>
            Math.abs(c.x - override.x) < 3 && Math.abs(c.y - override.y) < 3
        )
        if (match) {
            match.text = override.text
            match.source = 'user'
        } else {
            merged.push({
                text: override.text,
                originalText: override.originalText || '',
                x: override.x,
                y: override.y,
                w: override.w,
                h: override.h,
                pxHeight: override.pxHeight,
                source: 'user'
            })
        }
    }

    return merged
}

/**
 * Capture a page canvas as a JPEG base64 string for AI validation.
 */
function capturePageImage(pageEl: HTMLElement): string | null {
    const canvas = pageEl.querySelector('canvas') as HTMLCanvasElement
    if (!canvas) return null

    // Create a smaller canvas for the API (1200px wide max)
    const maxWidth = 1200
    const scale = canvas.width > maxWidth ? maxWidth / canvas.width : 1
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = canvas.width * scale
    tempCanvas.height = canvas.height * scale
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height)
    return tempCanvas.toDataURL('image/jpeg', 0.7).split(',')[1]
}

export function SmartTransposer({ pageRef, pageNumber, isRendered }: SmartTransposerProps) {
    const {
        aiState,
        setPageScanning,
        setPageData,
        setAiError,
        transposition,
        isEditingChords,
    } = useMusicStore()
    const fileId = useCurrentFileId()

    const [hasScanned, setHasScanned] = useState(false)
    const [_localError, setLocalError] = useState<string | null>(null)
    const [editPopover, setEditPopover] = useState<{ index: number; x: number; y: number } | null>(null)

    // Track whether native key has been written for this file
    const nativeKeyWritten = useRef(false)

    const pageData = aiState.pageData[pageNumber]

    useEffect(() => {
        if (aiState.isEnabled && isRendered && !pageData && !hasScanned && !aiState.scanningPages.includes(pageNumber)) {
            runScan()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aiState.isEnabled, isRendered, pageData, hasScanned])

    // Write native key when we have enough data (once per file)
    useEffect(() => {
        if (!fileId || nativeKeyWritten.current) return
        const allChords = Object.values(aiState.pageData).flatMap(
            p => p.chords.map((c: { text: string }) => c.text)
        )
        if (allChords.length < 3) return

        const key = estimateKey(allChords)
        if (key) {
            nativeKeyWritten.current = true
            saveNativeKey(fileId, key, 'auto')
        }
    }, [aiState.pageData, fileId])

    const runScan = async () => {
        if (!pageRef.current) return

        try {
            setHasScanned(true)
            setPageScanning(pageNumber, true)
            setLocalError(null)

            let userOverrides: CachedChord[] = []

            // ── Step 1: Check chord cache ──
            if (fileId) {
                try {
                    const cached = await loadChordCache(fileId, pageNumber)
                    if (cached && cached.chords.length > 0) {
                        // Separate user overrides from auto-detected chords
                        userOverrides = cached.chords.filter(c => c.source === 'user')
                        const autoChords = cached.chords.filter(c => c.source !== 'user')

                        if (autoChords.length > 0 && cached.aiValidated) {
                            // Full valid cache hit — use directly
                            const mappedChords = cached.chords.map(c => ({
                                text: c.text,
                                originalText: c.originalText || c.text,
                                x: c.x, y: c.y, w: c.w, h: c.h,
                                pxHeight: c.pxHeight,
                                source: (c.source || 'textLayer') as ChordSource,
                            }))
                            setPageData(pageNumber, { chords: mappedChords, strips: [] })
                            setPageScanning(pageNumber, false)
                            return
                        }
                        // Cache exists but not AI-validated — continue to scan + validate
                    }
                } catch {
                    // Cache miss — proceed with scan
                }
            }

            const pageEl = pageRef.current

            // ── Step 2: Text Layer Scan ──
            const textChords = scanTextLayer(pageEl)

            const mappedChords: ChordOverlay[] = textChords.map(c => ({
                text: c.text,
                originalText: c.text,
                x: c.x, y: c.y, w: c.w, h: c.h,
                pxHeight: c.pxHeight,
                source: 'textLayer' as ChordSource,
            }))

            // Apply user overrides immediately
            if (userOverrides.length > 0) {
                for (const override of userOverrides) {
                    const match = mappedChords.find(c =>
                        Math.abs(c.x - override.x) < 3 && Math.abs(c.y - override.y) < 3
                    )
                    if (match) {
                        match.text = override.text
                        match.source = 'user'
                    } else {
                        mappedChords.push({
                            text: override.text,
                            originalText: override.originalText || '',
                            x: override.x, y: override.y,
                            w: override.w, h: override.h,
                            pxHeight: override.pxHeight,
                            source: 'user',
                        })
                    }
                }
            }

            // Show text-layer results immediately
            setPageData(pageNumber, { chords: mappedChords, strips: [] })
            setPageScanning(pageNumber, false)

            // ── Step 3: AI Validation (async, non-blocking) ──
            runAiValidation(pageEl, mappedChords, userOverrides)

        } catch (err: unknown) {
            logger.error("Scan Error:", err)
            setLocalError(err instanceof Error ? err.message : "Scan failed")
            setAiError(err instanceof Error ? err.message : "Scan failed")
        } finally {
            setPageScanning(pageNumber, false)
        }
    }

    const runAiValidation = async (
        pageEl: HTMLElement,
        currentChords: ChordOverlay[],
        userOverrides: CachedChord[]
    ) => {
        try {
            await acquireAiSlot()

            const image = capturePageImage(pageEl)
            if (!image) {
                releaseAiSlot()
                return
            }

            const existingChords = currentChords
                .filter(c => c.source !== 'user')
                .map(c => ({ text: c.text, x: c.x, y: c.y }))

            const res = await apiFetch('/api/ai/chord-validate', {
                method: 'POST',
                body: JSON.stringify({ image, existingChords })
            })

            if (!res.ok) {
                releaseAiSlot()
                return
            }

            const json = await res.json()
            const aiChords = json.chords as { text: string; x: number; y: number }[]

            if (!aiChords || aiChords.length === 0) {
                // AI found nothing — keep text-layer results, mark as validated
                if (fileId) {
                    saveChordCache(fileId, pageNumber, currentChords.map(c => ({
                        text: c.text, originalText: c.originalText,
                        x: c.x, y: c.y, w: c.w, h: c.h, pxHeight: c.pxHeight,
                        source: c.source,
                    })), 'textLayer+ai', true)
                }
                releaseAiSlot()
                return
            }

            // Merge AI results with text-layer chords
            const merged = mergeAiResults(currentChords, aiChords, userOverrides)

            // Update display
            setPageData(pageNumber, { chords: merged, strips: [] })

            // Save to cache with aiValidated: true
            if (fileId) {
                saveChordCache(fileId, pageNumber, merged.map(c => ({
                    text: c.text, originalText: c.originalText,
                    x: c.x, y: c.y, w: c.w, h: c.h, pxHeight: c.pxHeight,
                    source: c.source,
                })), 'textLayer+ai', true)
            }

            releaseAiSlot()
        } catch (err) {
            logger.warn("[AI Validation] Failed (non-fatal):", err)
            releaseAiSlot()
            // Text-layer results stand — this is by design
        }
    }

    // ── Handle chord correction (edit mode) ──
    const handleChordCorrection = useCallback((chordIndex: number, newText: string) => {
        if (!pageData) return

        const updatedChords = pageData.chords.map((c, i) => {
            if (i === chordIndex) {
                return { ...c, text: newText, source: 'user' as ChordSource }
            }
            return c
        })

        setPageData(pageNumber, { ...pageData, chords: updatedChords })
        setEditPopover(null)

        // Save to cache
        if (fileId) {
            saveChordCache(fileId, pageNumber, updatedChords.map(c => ({
                text: c.text, originalText: c.originalText || c.text,
                x: c.x, y: c.y, w: c.w, h: c.h, pxHeight: c.pxHeight,
                source: (c.source || 'textLayer') as ChordSource,
            })), 'textLayer+ai', true)
        }
    }, [pageData, pageNumber, fileId, setPageData])

    // ── Long-press to add chord ──
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [addingChord, setAddingChord] = useState<{ x: number; y: number } | null>(null)

    const handleLongPressStart = useCallback((e: React.PointerEvent) => {
        if (!isEditingChords || !pageRef.current) return

        const pageEl = pageRef.current
        const rect = pageEl.getBoundingClientRect()
        const xPct = ((e.clientX - rect.left) / rect.width) * 100
        const yPct = ((e.clientY - rect.top) / rect.height) * 100

        longPressTimer.current = setTimeout(async () => {
            setAddingChord({ x: xPct, y: yPct })

            // Crop region and send to AI
            try {
                const image = capturePageImage(pageEl)
                if (!image) { setAddingChord(null); return }

                const res = await apiFetch('/api/ai/chord-validate', {
                    method: 'POST',
                    body: JSON.stringify({
                        image,
                        existingChords: [],
                        regionHint: { x: xPct, y: yPct }
                    })
                })

                if (!res.ok) { setAddingChord(null); return }

                const json = await res.json()
                const aiChords = json.chords as { text: string; x: number; y: number }[]

                if (aiChords && aiChords.length > 0) {
                    // Find the closest chord to where the user tapped
                    let closest = aiChords[0]
                    let closestDist = Infinity
                    for (const c of aiChords) {
                        const dist = Math.sqrt((c.x - xPct) ** 2 + (c.y - yPct) ** 2)
                        if (dist < closestDist) {
                            closestDist = dist
                            closest = c
                        }
                    }

                    if (pageData) {
                        const newChord: ChordOverlay = {
                            text: cleanChordText(closest.text),
                            originalText: '',
                            x: closest.x, y: closest.y,
                            source: 'user'
                        }
                        const updatedChords = [...pageData.chords, newChord]
                        setPageData(pageNumber, { ...pageData, chords: updatedChords })

                        if (fileId) {
                            saveChordCache(fileId, pageNumber, updatedChords.map(c => ({
                                text: c.text, originalText: c.originalText || c.text,
                                x: c.x, y: c.y, w: c.w, h: c.h, pxHeight: c.pxHeight,
                                source: (c.source || 'textLayer') as ChordSource,
                            })), 'textLayer+ai', true)
                        }
                    }
                }
            } catch (err) {
                logger.warn("[Add Chord] Failed:", err)
            }

            setAddingChord(null)
        }, 500)
    }, [isEditingChords, pageRef, pageData, pageNumber, fileId, setPageData])

    const handleLongPressEnd = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current)
            longPressTimer.current = null
        }
    }, [])

    // ── Render ──
    if (!aiState.isEnabled || !pageData) {
        return null
    }

    // Derive flat/sharp preference from the target key
    const allChords = Object.values(aiState.pageData).flatMap(
        p => p.chords.map((c: { originalText?: string; text: string }) => c.originalText || c.text)
    )
    const detectedKey = allChords.length > 0 ? estimateKey(allChords) : null
    const targetKey = detectedKey && transposition !== 0
        ? transposeChord(detectedKey, transposition)
        : detectedKey
    const preferFlats = keyUsesFlats(targetKey)

    // Common correction suggestions for edit mode
    const getSuggestions = (chord: ChordOverlay): string[] => {
        const root = chord.text.match(/^([A-G][#b]?)/)?.[1] || ''
        if (!root) return []
        const suggestions = new Set<string>()
        // Common corrections: add/remove minor, add 7, major variants
        if (!chord.text.includes('m')) suggestions.add(root + 'm')
        if (chord.text.includes('m') && !chord.text.includes('maj')) suggestions.add(root)
        suggestions.add(root + '7')
        suggestions.add(root + 'm7')
        suggestions.add(root + 'maj7')
        suggestions.delete(chord.text) // Don't suggest current value
        return Array.from(suggestions).slice(0, 4)
    }

    return (
        <div
            className="absolute inset-0 z-10 pointer-events-none"
            onPointerDown={isEditingChords ? handleLongPressStart : undefined}
            onPointerUp={isEditingChords ? handleLongPressEnd : undefined}
            onPointerCancel={isEditingChords ? handleLongPressEnd : undefined}
            style={isEditingChords ? { pointerEvents: 'auto' } : undefined}
        >
            {/* Adding chord indicator */}
            {addingChord && (
                <div
                    className="absolute w-8 h-8 rounded-full border-2 border-violet-500 animate-pulse"
                    style={{
                        left: `${addingChord.x}%`,
                        top: `${addingChord.y}%`,
                        transform: 'translate(-50%, -50%)',
                    }}
                />
            )}

            {pageData.chords.map((chord: ChordOverlay, i: number) => {
                const sourceText = cleanChordText(chord.originalText || chord.text)
                const transposed = transposeChord(sourceText, transposition, preferFlats)
                const displayText = transposition !== 0 ? transposed : chord.text
                const isTransposing = transposition !== 0

                // t=0 fix: show overlay when text differs from original PDF
                // (AI corrected, user corrected, or AI added)
                const textDiffers = chord.text !== chord.originalText
                const isAdded = !chord.originalText // AI or user added this chord
                const needsOverlay = isTransposing || textDiffers || isAdded

                // In edit mode, always show overlays (with dotted border for visibility)
                if (!needsOverlay && !isEditingChords) return null

                const detectedHeight = chord.pxHeight || 16
                const fontSize = Math.max(12, Math.min(detectedHeight * 0.85, 28))
                const chordWidth = chord.w || 0
                const padV = 0
                const padH = 2

                return (
                    <div key={i} className="absolute" style={{ left: `${chord.x}%`, top: `${chord.y}%` }}>
                        <div
                            className={isEditingChords ? "cursor-pointer" : ""}
                            onClick={isEditingChords ? (e) => {
                                e.stopPropagation()
                                setEditPopover(editPopover?.index === i ? null : { index: i, x: chord.x, y: chord.y })
                            } : undefined}
                            style={{
                                margin: `-${padV}px 0 0 -${padH}px`,
                                padding: `${padV}px ${padH + 2}px ${padV}px ${padH}px`,
                                minWidth: chordWidth > 0 ? `${chordWidth}%` : undefined,

                                backgroundColor: (needsOverlay || isEditingChords) ? 'rgba(255, 255, 255, 0.97)' : 'transparent',
                                borderRadius: '1px',

                                // Edit mode: dotted border on all chords
                                border: isEditingChords ? '1px dashed rgba(139, 92, 246, 0.5)' : 'none',

                                color: (needsOverlay || isEditingChords) ? '#6d28d9' : 'transparent',
                                fontSize: `${fontSize}px`,
                                fontWeight: 700,
                                fontFamily: "'Times New Roman', 'Georgia', serif",
                                lineHeight: 1.1,
                                whiteSpace: 'nowrap',
                                zIndex: 100,
                                pointerEvents: isEditingChords ? 'auto' : 'none',
                            }}
                        >
                            {displayText}
                        </div>

                        {/* Edit popover */}
                        {isEditingChords && editPopover?.index === i && (
                            <div
                                className="absolute z-[200] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2 flex flex-wrap gap-1"
                                style={{ top: '100%', left: '0', marginTop: '4px', minWidth: '180px' }}
                                onClick={e => e.stopPropagation()}
                            >
                                {getSuggestions(chord).map(suggestion => (
                                    <button
                                        key={suggestion}
                                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-violet-600/30 text-white text-sm font-mono rounded transition-colors"
                                        onClick={() => handleChordCorrection(i, suggestion)}
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                                <button
                                    className="px-2.5 py-1.5 text-zinc-500 hover:text-white text-xs rounded transition-colors"
                                    onClick={() => setEditPopover(null)}
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
