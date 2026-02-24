import React, { useRef, useCallback, useState, useEffect } from "react"
import { transposeChord } from "@/lib/music-math"
import { cleanChordText } from "@/lib/chord-utils"
import { useSmartTransposer } from "@/hooks/use-smart-transposer"
import { computeOverlayDimensions } from "@/lib/overlay-sizing"
import { ChordEditPopover } from "./ChordEditPopover"
import { ErrorBoundary } from "react-error-boundary"
import { FallbackError } from "@/components/ui/fallback-error"
import type { ChordOverlay } from "@/lib/chord-cache"

interface SmartTransposerProps {
    pageRef: React.RefObject<HTMLDivElement | null>
    pageNumber: number
    isRendered: boolean
}

export function SmartTransposer({ pageRef, pageNumber, isRendered }: SmartTransposerProps) {
    const {
        aiState,
        pageData,
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
    } = useSmartTransposer({ pageRef, pageNumber, isRendered })

    // Ref map for chord overlay elements (needed by portal popover positioning)
    const chordElsRef = useRef<Map<number, HTMLElement>>(new Map())

    // Container dimensions for overlay sizing — tracked via ResizeObserver
    // so they update reactively on zoom/resize without reading refs during render.
    const [containerDims, setContainerDims] = useState({ width: 800, height: 1100 })

    useEffect(() => {
        const el = pageRef.current
        if (!el) return

        const measure = () => {
            setContainerDims({ width: el.offsetWidth, height: el.offsetHeight })
        }
        measure()

        const observer = new ResizeObserver(measure)
        observer.observe(el)
        return () => observer.disconnect()
    }, [pageRef, isRendered])

    // Sync the popover anchor element from the ref map into state,
    // so it's available during render without reading refs directly.
    const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null)

    useEffect(() => {
        if (editPopover) {
            setPopoverAnchor(chordElsRef.current.get(editPopover.index) ?? null)
        } else {
            setPopoverAnchor(null)
        }
    }, [editPopover])

    const setChordRef = useCallback((i: number, el: HTMLDivElement | null) => {
        if (el) chordElsRef.current.set(i, el)
        else chordElsRef.current.delete(i)
    }, [])

    if (!aiState?.isEnabled || !pageData) {
        return null
    }

    return (
        <ErrorBoundary FallbackComponent={(props) => <FallbackError {...props} title="Transposer Error" compact />}>
            <div
                className="absolute inset-0 z-10 pointer-events-none"
                onDoubleClick={isEditingChords ? handleBgDoubleClick : undefined}
                style={isEditingChords ? { pointerEvents: 'auto' } : undefined}
            >
                {/* Edit mode hint */}
                {isEditingChords && (
                    <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none z-[101]">
                        <span className="bg-zinc-900/80 text-zinc-400 text-[10px] px-3 py-1 rounded-full border border-zinc-700/50 backdrop-blur-sm">
                            Tap chord to edit &middot; Double-click empty space to add
                        </span>
                    </div>
                )}

                {/* Adding chord indicator */}
                {addingChordAt && (
                    <div
                        className="absolute w-10 h-10 rounded-full border-2 border-violet-400 animate-pulse flex items-center justify-center"
                        style={{
                            left: `${addingChordAt.x}%`,
                            top: `${addingChordAt.y}%`,
                            transform: 'translate(-50%, -50%)',
                        }}
                    >
                        <span className="text-violet-300 text-[10px] font-bold">AI</span>
                    </div>
                )}

                {pageData.chords.map((chord: ChordOverlay, i: number) => {
                    // Transpose from chord.text (includes AI/user corrections), not originalText.
                    // originalText is only used for cover-width sizing.
                    const sourceText = cleanChordText(chord.text)
                    const displayText = transposition !== 0
                        ? transposeChord(sourceText, transposition, preferFlats)
                        : sourceText
                    const isTransposing = transposition !== 0

                    // Show overlay when text differs from original (AI/user corrected or added)
                    const textDiffers = chord.text !== chord.originalText
                    const isAdded = !chord.originalText
                    const needsOverlay = isTransposing || textDiffers || isAdded

                    // In edit mode, always show overlays
                    if (!needsOverlay && !isEditingChords) return null

                    // Compute dimensions using the sizing utility
                    const dims = computeOverlayDimensions(chord, displayText, containerDims.width, containerDims.height)
                    const showPopover = editPopover?.index === i
                    const isVisible = needsOverlay || isEditingChords || showPopover

                    return (
                        <div key={i} className="absolute" style={{ left: `${chord.x}%`, top: `${chord.y}%` }}>
                            <div
                                ref={el => setChordRef(i, el)}
                                className="cursor-pointer"
                                style={{
                                    touchAction: 'manipulation',
                                }}
                                onClick={e => handleChordClick(e, i, chord)}
                                onDoubleClick={e => e.stopPropagation()}
                            >
                                <div
                                    style={{
                                        margin: `0 0 0 -${dims.padH}px`,
                                        padding: `0 ${dims.padH}px`,
                                        minWidth: `${dims.minWidthPx}px`,

                                        backgroundColor: isVisible ? 'rgba(255, 255, 255, 0.97)' : 'transparent',
                                        borderRadius: '2px',
                                        border: (isEditingChords || showPopover) ? '1px dashed rgba(139, 92, 246, 0.5)' : 'none',

                                        color: isVisible ? '#6d28d9' : 'transparent',
                                        fontSize: `${dims.fontSizePx}px`,
                                        fontWeight: 700,
                                        fontFamily: "'Times New Roman', 'Georgia', serif",
                                        lineHeight: 1.1,
                                        whiteSpace: 'nowrap' as const,
                                        zIndex: showPopover ? 150 : 100,
                                        pointerEvents: 'auto' as const,
                                    }}
                                >
                                    {displayText}
                                </div>
                            </div>

                            {/* Portal-based edit popover */}
                            {showPopover && (
                                <ChordEditPopover
                                    chord={chord}
                                    chordIndex={i}
                                    anchorEl={popoverAnchor}
                                    suggestions={getSuggestions(chord, detectedKey)}
                                    transposition={transposition}
                                    preferFlats={preferFlats}
                                    onCorrect={handleChordCorrection}
                                    onDelete={handleChordDelete}
                                    onResize={handleChordResize}
                                    onClose={() => setEditPopover(null)}
                                />
                            )}
                        </div>
                    )
                })}
            </div>
        </ErrorBoundary>
    )
}
