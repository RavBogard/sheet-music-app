import React, { useEffect, useState, useCallback, useRef } from "react"
import { useMusicStore } from "@/lib/store"
import { transposeChord, estimateKey, keyUsesFlats } from "@/lib/music-math"
import { cleanChordText } from "@/lib/chord-utils"
import { loadChordCache, saveChordCache, saveNativeKey, toCache, type CachedChord, type ChordSource, type ChordOverlay } from "@/lib/chord-cache"
import { acquireAiSlot, releaseAiSlot } from "@/lib/ai-concurrency"
import { apiFetch } from "@/lib/api-client"
import { logger } from "@/lib/logger"

// Re-export for consumers that import from here
export type { ChordOverlay } from "@/lib/chord-cache"

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
 * Capture a page canvas as a JPEG base64 string for AI validation.
 */
export async function capturePageImage(pageEl: HTMLElement): Promise<string | null> {
    const canvas = pageEl.querySelector('canvas') as HTMLCanvasElement
    if (!canvas) return null

    const maxWidth = 1200
    const scale = canvas.width > maxWidth ? maxWidth / canvas.width : 1

    if (typeof OffscreenCanvas !== 'undefined') {
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
        } catch {
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
        incrementPendingEdits,
    } = useMusicStore()
    const fileId = useCurrentFileId()

    const [hasScanned, setHasScanned] = useState(false)
    const [_localError, setLocalError] = useState<string | null>(null)
    const [editPopover, setEditPopover] = useState<{ index: number; x: number; y: number } | null>(null)
    const [addingChordAt, setAddingChordAt] = useState<{ x: number; y: number } | null>(null)

    const nativeKeyWritten = useRef(false)
    const backgroundScanDispatched = useRef(false)
    const pageData = aiState.pageData[pageNumber]

    // ── Trigger scan when enabled and page is rendered ──
    useEffect(() => {
        if (aiState.isEnabled && isRendered && !pageData && !hasScanned && !aiState.scanningPages.includes(pageNumber)) {
            runScan()
        }
    }, [aiState.isEnabled, isRendered, pageData, hasScanned, pageNumber, aiState.scanningPages])

    // ── Preemptively scan next page ──
    useEffect(() => {
        if (isRendered && (pageData || hasScanned) && !backgroundScanDispatched.current && aiState.isEnabled) {
            backgroundScanDispatched.current = true
            // Give the UI a moment to breathe before kicking off a background task
            setTimeout(() => {
                dispatchBackgroundScan(pageNumber + 1)
            }, 3000)
        }
    }, [isRendered, pageData, hasScanned, pageNumber, aiState.isEnabled])

    // ── Write native key when we have enough data (once per file) ──
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

    // ── Helper: persist chords to store + cache ──
    const persistChords = useCallback((chords: ChordOverlay[]) => {
        // Read fresh strips from store to avoid stale closure
        const freshStrips = useMusicStore.getState().aiState.pageData[pageNumber]?.strips ?? []
        setPageData(pageNumber, { chords, strips: freshStrips })
        if (fileId) {
            saveChordCache(fileId, pageNumber, chords.map(toCache), 'textLayer+ai', true)
        }
    }, [pageNumber, fileId, setPageData])

    // ════════════════════════════════════════════════════
    // SCAN PIPELINE (cache → AI vision endpoint)
    // ════════════════════════════════════════════════════

    const runScan = async () => {
        if (!pageRef.current) return

        try {
            setHasScanned(true)
            setPageScanning(pageNumber, true)
            setLocalError(null)

            let userOverrides: CachedChord[] = []

            // Step 1: Check chord cache (global Firestore cache)
            if (fileId) {
                try {
                    const cached = await loadChordCache(fileId, pageNumber)
                    if (cached && cached.chords.length > 0) {
                        const isValid = cached.chords.every(c => typeof c.x === 'number' && !isNaN(c.x) && typeof c.y === 'number' && !isNaN(c.y))
                        if (isValid) {
                            userOverrides = cached.chords.filter(c => c.source === 'user')
                            const autoChords = cached.chords.filter(c => c.source !== 'user')

                            if (autoChords.length > 0) {
                                // Cache hit! Skip the vision API.
                                const mappedChords: ChordOverlay[] = cached.chords.map(c => ({
                                    text: c.text,
                                    originalText: c.originalText || c.text,
                                    x: c.x, y: c.y, w: c.w, h: c.h,
                                    pxHeight: c.pxHeight,
                                    source: (c.source || 'ai') as ChordSource,
                                    sizeOverride: c.sizeOverride,
                                }))
                                setPageData(pageNumber, { chords: mappedChords, strips: [] })
                                setPageScanning(pageNumber, false)
                                return
                            }
                        }
                    }
                } catch {
                    // Cache miss
                }
            }

            const pageEl = pageRef.current

            // Step 2: AI Validation (async generation from image)
            // Schedule via idle callback if possible so rendering isn't blocked
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(() => {
                    runAiVisionExtration(pageEl, userOverrides)
                }, { timeout: 2000 })
            } else {
                setTimeout(() => {
                    runAiVisionExtration(pageEl, userOverrides)
                }, 100)
            }

        } catch (err) {
            logger.error("Scan Error:", err)
            setLocalError(err instanceof Error ? err.message : "Scan failed")
            setAiError(err instanceof Error ? err.message : "Scan failed")
            setPageScanning(pageNumber, false)
        }
    }

    const runAiVisionExtration = async (
        pageEl: HTMLElement,
        userOverrides: CachedChord[]
    ) => {
        await acquireAiSlot()
        try {
            const image = await capturePageImage(pageEl)
            if (!image) return

            const res = await apiFetch('/api/ai/transposer/scan', {
                method: 'POST',
                body: JSON.stringify({ base64Image: image })
            })

            if (!res.ok) return

            const json = await res.json()
            const aiChords = json.chords as { text: string; x: number; y: number; width: number; height: number }[]

            let mappedChords: ChordOverlay[] = []

            if (aiChords && aiChords.length > 0) {
                mappedChords = aiChords.map(c => ({
                    text: cleanChordText(c.text),
                    originalText: c.text,
                    x: c.x,
                    y: c.y,
                    w: c.width,
                    h: c.height,
                    source: 'ai' as ChordSource
                }))
            }

            // Apply overrides
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

            if (fileId) {
                saveChordCache(fileId, pageNumber, mappedChords.map(toCache), 'ai', true)
            }
        } catch (err) {
            logger.warn("[AI Vision Extraction] Failed (non-fatal):", err)
        } finally {
            setPageScanning(pageNumber, false)
            releaseAiSlot()
        }
    }

    const dispatchBackgroundScan = async (nextPage: number) => {
        if (!fileId) return

        // Ensure the next page isn't already scanned or scanning
        const state = useMusicStore.getState().aiState
        if (state.pageData[nextPage] || state.scanningPages.includes(nextPage)) return

        try {
            // First check if it's already cached — if so, do nothing, subsequent loads will hit cache
            const cached = await loadChordCache(fileId, nextPage)
            if (cached && cached.chords.length > 0) return

            // If not cached, we need the DOM element for the next page to capture the image.
            // Since this is a React hook tied to a specific page component, we query the DOM
            // to find the next page's canvas if it has been rendered by react-pdf.
            const nextCanvas = document.querySelector(`.react-pdf__Page[data-page-number="${nextPage}"] canvas`) as HTMLCanvasElement
            if (!nextCanvas) return // Page isn't rendered in DOM yet, can't capture

            // Schedule via idle callback if possible so rendering isn't blocked
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(() => {
                    executeBackgroundScan(fileId, nextPage, nextCanvas)
                }, { timeout: 5000 })
            } else {
                setTimeout(() => {
                    executeBackgroundScan(fileId, nextPage, nextCanvas)
                }, 500)
            }
        } catch (e) {
            logger.warn("[Background Scan Check] Failed:", e)
        }
    }

    const executeBackgroundScan = async (targetFileId: string, targetPage: number, canvas: HTMLCanvasElement) => {
        await acquireAiSlot()
        // Signal we are scanning so multiple instances don't try
        useMusicStore.getState().setPageScanning(targetPage, true)

        try {
            // Create a temporary container to use capturePageImage
            const tempDiv = document.createElement('div')
            tempDiv.appendChild(canvas.cloneNode(true)) // Clone to avoid detaching

            const image = await capturePageImage(tempDiv)
            if (!image) return

            const res = await apiFetch('/api/ai/transposer/scan', {
                method: 'POST',
                body: JSON.stringify({ base64Image: image })
            })

            if (!res.ok) return

            const json = await res.json()
            const aiChords = json.chords as { text: string; x: number; y: number; width: number; height: number }[]

            if (aiChords && aiChords.length > 0) {
                const mappedChords = aiChords.map(c => ({
                    text: cleanChordText(c.text),
                    originalText: c.text,
                    x: c.x,
                    y: c.y,
                    w: c.width,
                    h: c.height,
                    source: 'ai' as ChordSource
                }))
                // Save to Firestore so it's ready when user scrolls to it
                saveChordCache(targetFileId, targetPage, mappedChords.map(toCache), 'ai', true)
                // Also optimistically insert into zustand
                useMusicStore.getState().setPageData(targetPage, { chords: mappedChords, strips: [] })
            }
        } catch (err) {
            logger.warn("[Background Vision Extraction] Failed:", err)
        } finally {
            useMusicStore.getState().setPageScanning(targetPage, false)
            releaseAiSlot()
        }
    }

    // ════════════════════════════════════════════════════
    // EDIT MODE HANDLERS
    // ════════════════════════════════════════════════════

    /** Single-click on a chord in edit mode → open popover */
    const handleChordClick = useCallback((e: React.MouseEvent, i: number, chord: ChordOverlay) => {
        e.stopPropagation()

        if (isEditingChords) {
            // Toggle popover
            setEditPopover(editPopover?.index === i ? null : { index: i, x: chord.x, y: chord.y })
        }
    }, [isEditingChords, editPopover])

    /** Double-click on empty background → AI detects chord at that position */
    const handleBgDoubleClick = useCallback(async (e: React.MouseEvent) => {
        if (!isEditingChords || !pageRef.current) return

        const pageEl = pageRef.current
        const rect = pageEl.getBoundingClientRect()
        const xPct = ((e.clientX - rect.left) / rect.width) * 100
        const yPct = ((e.clientY - rect.top) / rect.height) * 100

        setAddingChordAt({ x: xPct, y: yPct })
        setEditPopover(null)

        try {
            const image = await capturePageImage(pageEl)
            if (!image) { setAddingChordAt(null); return }

            const res = await apiFetch('/api/ai/transposer/scan', {
                method: 'POST',
                body: JSON.stringify({ base64Image: image })
            })

            if (!res.ok) { setAddingChordAt(null); return }

            const json = await res.json()
            const aiChords = json.chords as { text: string; x: number; y: number }[]

            if (aiChords && aiChords.length > 0 && pageData) {
                // Find closest chord to click point
                const closest = aiChords.reduce((best, c) => {
                    const dist = Math.sqrt((c.x - xPct) ** 2 + (c.y - yPct) ** 2)
                    const bestDist = Math.sqrt((best.x - xPct) ** 2 + (best.y - yPct) ** 2)
                    return dist < bestDist ? c : best
                })

                const newChord: ChordOverlay = {
                    text: cleanChordText(closest.text),
                    originalText: '',
                    x: closest.x, y: closest.y,
                    source: 'user'
                }
                const updated = [...pageData.chords, newChord]
                persistChords(updated)
                incrementPendingEdits()
                // Open popover on the new chord so user can confirm/edit
                setEditPopover({ index: updated.length - 1, x: newChord.x, y: newChord.y })
            } else if (pageData) {
                // AI found nothing — insert a placeholder the user can fill in
                const placeholder: ChordOverlay = {
                    text: '?',
                    originalText: '',
                    x: xPct, y: yPct,
                    source: 'user'
                }
                const updated = [...pageData.chords, placeholder]
                persistChords(updated)
                incrementPendingEdits()
                setEditPopover({ index: updated.length - 1, x: xPct, y: yPct })
            }
        } catch (err) {
            logger.warn("[Add Chord] Failed:", err)
        } finally {
            setAddingChordAt(null)
        }
    }, [isEditingChords, pageRef, pageData, persistChords, incrementPendingEdits])

    /** Correct a chord's text */
    const handleChordCorrection = useCallback((chordIndex: number, newText: string) => {
        if (!pageData) return
        const text = newText.trim()
        if (!text || text === '?') return

        const updatedChords = pageData.chords.map((c: ChordOverlay, i: number) =>
            i === chordIndex ? { ...c, text, source: 'user' as ChordSource } : c
        )

        persistChords(updatedChords)
        setEditPopover(null)
        incrementPendingEdits()
    }, [pageData, persistChords, incrementPendingEdits])

    /** Delete a chord */
    const handleChordDelete = useCallback((chordIndex: number) => {
        if (!pageData) return

        const updatedChords = pageData.chords.filter((_: ChordOverlay, i: number) => i !== chordIndex)
        persistChords(updatedChords)
        setEditPopover(null)
        incrementPendingEdits()
    }, [pageData, persistChords, incrementPendingEdits])

    /** Nudge a chord's width override */
    const handleChordResize = useCallback((chordIndex: number, deltaW: number) => {
        if (!pageData) return

        const updatedChords = pageData.chords.map((c: ChordOverlay, i: number) => {
            if (i !== chordIndex) return c
            const currentW = c.sizeOverride?.wPct ?? c.w ?? 2
            return {
                ...c,
                sizeOverride: {
                    ...c.sizeOverride,
                    wPct: Math.max(0.5, currentW + deltaW),
                },
            }
        })

        persistChords(updatedChords)
        incrementPendingEdits()
    }, [pageData, persistChords, incrementPendingEdits])

    // ════════════════════════════════════════════════════
    // DERIVED STATE
    // ════════════════════════════════════════════════════

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
        addingChordAt,
        handleChordClick,
        handleBgDoubleClick,
        handleChordCorrection,
        handleChordDelete,
        handleChordResize,
        getSuggestions,
    }
}
