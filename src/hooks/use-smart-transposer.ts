import React, { useEffect, useState, useCallback, useRef } from "react"
import { useMusicStore } from "@/lib/store"
import { scanTextLayer } from "@/lib/text-scanner"
import { transposeChord, estimateKey, keyUsesFlats } from "@/lib/music-math"
import { cleanChordText } from "@/lib/chord-utils"
import { loadChordCache, saveChordCache, saveNativeKey, type CachedChord, type ChordSource } from "@/lib/chord-cache"
import { apiFetch } from "@/lib/api-client"
import { logger } from "@/lib/logger"

export interface ChordOverlay {
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

export function acquireAiSlot(): Promise<void> {
    if (activeAiCalls < AI_MAX_CONCURRENT) {
        activeAiCalls++
        return Promise.resolve()
    }
    return new Promise(resolve => {
        aiQueue.push(() => { activeAiCalls++; resolve() })
    })
}

export function releaseAiSlot() {
    activeAiCalls--
    if (aiQueue.length > 0) {
        const next = aiQueue.shift()
        next?.()
    }
}

/**
 * Resolve the current file's Drive ID from the store.
 */
export function useCurrentFileId(): string | null {
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
 */
export function mergeAiResults(
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
export async function capturePageImage(pageEl: HTMLElement): Promise<string | null> {
    const canvas = pageEl.querySelector('canvas') as HTMLCanvasElement
    if (!canvas) return null

    // Create a smaller canvas for the API (1200px wide max)
    const maxWidth = 1200
    const scale = canvas.width > maxWidth ? maxWidth / canvas.width : 1

    if (typeof OffscreenCanvas !== 'undefined') {
        // OffscreenCanvas is non-blocking for blob conversion
        const offscreen = new OffscreenCanvas(canvas.width * scale, canvas.height * scale)
        const ctx = offscreen.getContext('2d')
        if (!ctx) return null
        ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height)

        try {
            const blob = await offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.7 })
            return new Promise((resolve) => {
                const reader = new FileReader()
                reader.onloadend = () => {
                    const result = reader.result as string
                    resolve(result ? result.split(',')[1] : null)
                }
                reader.readAsDataURL(blob)
            })
        } catch (e) {
            // fallback if convertToBlob fails
        }
    }

    // Fallback for older Safari
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = canvas.width * scale
    tempCanvas.height = canvas.height * scale
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height)
    return tempCanvas.toDataURL('image/jpeg', 0.7).split(',')[1]
}

export interface UseSmartTransposerProps {
    pageRef: React.RefObject<HTMLDivElement | null>
    pageNumber: number
    isRendered: boolean
}

export function useSmartTransposer({ pageRef, pageNumber, isRendered }: UseSmartTransposerProps) {
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

    const nativeKeyWritten = useRef(false)
    const pageData = aiState.pageData[pageNumber]

    useEffect(() => {
        if (aiState.isEnabled && isRendered && !pageData && !hasScanned && !aiState.scanningPages.includes(pageNumber)) {
            runScan()
        }
    }, [aiState.isEnabled, isRendered, pageData, hasScanned, pageNumber, aiState.scanningPages])

    // Write native key when we have enough data (once per file)
    useEffect(() => {
        if (!fileId || nativeKeyWritten.current) return
        const allChords = Object.values(aiState.pageData).flatMap(
            (p: any) => p.chords.map((c: { text: string }) => c.text)
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
                        userOverrides = cached.chords.filter(c => c.source === 'user')
                        const autoChords = cached.chords.filter(c => c.source !== 'user')

                        if (autoChords.length > 0 && cached.aiValidated) {
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
                    }
                } catch {
                    // Cache miss
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

            setPageData(pageNumber, { chords: mappedChords, strips: [] })
            setPageScanning(pageNumber, false)

            // ── Step 3: AI Validation (async) ──
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(() => {
                    runAiValidation(pageEl, mappedChords, userOverrides)
                }, { timeout: 2000 })
            } else {
                setTimeout(() => {
                    runAiValidation(pageEl, mappedChords, userOverrides)
                }, 100)
            }

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

            const image = await capturePageImage(pageEl)
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

            const merged = mergeAiResults(currentChords, aiChords, userOverrides)
            setPageData(pageNumber, { chords: merged, strips: [] })

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
        }
    }

    const handleChordCorrection = useCallback((chordIndex: number, newText: string) => {
        if (!pageData) return

        const updatedChords = pageData.chords.map((c: ChordOverlay, i: number) => {
            if (i === chordIndex) {
                return { ...c, text: newText, source: 'user' as ChordSource }
            }
            return c
        })

        setPageData(pageNumber, { ...pageData, chords: updatedChords })
        setEditPopover(null)

        if (fileId) {
            saveChordCache(fileId, pageNumber, updatedChords.map((c: ChordOverlay) => ({
                text: c.text, originalText: c.originalText || c.text,
                x: c.x, y: c.y, w: c.w, h: c.h, pxHeight: c.pxHeight,
                source: (c.source || 'textLayer') as ChordSource,
            })), 'textLayer+ai', true)
        }
    }, [pageData, pageNumber, fileId, setPageData])

    const bgLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [addingChord, setAddingChord] = useState<{ x: number; y: number } | null>(null)

    const handleBgLongPressStart = useCallback((e: React.PointerEvent) => {
        if (!isEditingChords || !pageRef.current) return

        const pageEl = pageRef.current
        const rect = pageEl.getBoundingClientRect()
        const xPct = ((e.clientX - rect.left) / rect.width) * 100
        const yPct = ((e.clientY - rect.top) / rect.height) * 100

        bgLongPressTimer.current = setTimeout(async () => {
            setAddingChord({ x: xPct, y: yPct })

            try {
                const image = await capturePageImage(pageEl)
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

    const handleBgLongPressEnd = useCallback(() => {
        if (bgLongPressTimer.current) {
            clearTimeout(bgLongPressTimer.current)
            bgLongPressTimer.current = null
        }
    }, [])

    const chordPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const handleChordPointerDown = useCallback((e: React.PointerEvent, i: number, chord: ChordOverlay) => {
        e.stopPropagation()

        if (isEditingChords) {
            setEditPopover(editPopover?.index === i ? null : { index: i, x: chord.x, y: chord.y })
            return
        }

        chordPressTimer.current = setTimeout(() => {
            setEditPopover({ index: i, x: chord.x, y: chord.y })
        }, 500)
    }, [isEditingChords, editPopover])

    const handleChordPointerUpOrCancel = useCallback((e: React.PointerEvent) => {
        if (chordPressTimer.current) {
            clearTimeout(chordPressTimer.current)
            chordPressTimer.current = null
        }
    }, [])

    // Derive flat/sharp preference from the target key
    const allChords = Object.values(aiState.pageData).flatMap(
        (p: any) => p.chords.map((c: { originalText?: string; text: string }) => c.originalText || c.text)
    )
    const detectedKey = allChords.length > 0 ? estimateKey(allChords) : null
    const targetKey = detectedKey && transposition !== 0
        ? transposeChord(detectedKey, transposition)
        : detectedKey
    const preferFlats = keyUsesFlats(targetKey || 'C')

    const getSuggestions = (chord: ChordOverlay, detKey: string | null): string[] => {
        const rootMatch = chord.text.match(/^([A-G][#b]?)/)
        if (!rootMatch) return []
        const root = rootMatch[1]
        const isMinor = chord.text.includes('m') && !chord.text.includes('maj')
        const suggestions = new Set<string>()

        if (isMinor) {
            suggestions.add(chord.text.replace('m', ''))
        } else {
            suggestions.add(root + 'm' + chord.text.slice(root.length))
        }

        if (chord.text.includes('7')) {
            suggestions.add(chord.text.replace('7', ''))
        } else {
            suggestions.add(chord.text + '7')
        }

        if (root.includes('#')) {
            suggestions.add(transposeChord(root, 0, true) + chord.text.slice(root.length))
        } else if (root.includes('b')) {
            suggestions.add(transposeChord(root, 0, false) + chord.text.slice(root.length))
        }

        if (detKey) {
            const prefer = keyUsesFlats(detKey || 'C')
            const keyIsMinor = detKey.endsWith('m') && !detKey.endsWith('maj')
            const keyRoot = detKey.replace(/m$/, '')

            if (keyIsMinor) {
                suggestions.add(transposeChord(keyRoot, 0, prefer) + 'm')
                suggestions.add(transposeChord(keyRoot, 3, prefer))
                suggestions.add(transposeChord(keyRoot, 5, prefer) + 'm')
                suggestions.add(transposeChord(keyRoot, 7, prefer) + 'm')
                suggestions.add(transposeChord(keyRoot, 8, prefer))
                suggestions.add(transposeChord(keyRoot, 10, prefer))
            } else {
                suggestions.add(transposeChord(keyRoot, 0, prefer))
                suggestions.add(transposeChord(keyRoot, 5, prefer))
                suggestions.add(transposeChord(keyRoot, 7, prefer))
                suggestions.add(transposeChord(keyRoot, 9, prefer) + 'm')
                suggestions.add(transposeChord(keyRoot, 2, prefer) + 'm')
            }
        }

        suggestions.delete(chord.text)
        return Array.from(suggestions).slice(0, 3)
    }

    return {
        aiState,
        pageData,
        hasScanned,
        editPopover,
        setEditPopover,
        isEditingChords,
        transposition,
        preferFlats,
        detectedKey,
        addingChord,
        handleBgLongPressStart,
        handleBgLongPressEnd,
        handleChordPointerDown,
        handleChordPointerUpOrCancel,
        handleChordCorrection,
        getSuggestions
    }
}
