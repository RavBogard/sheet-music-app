import React from "react"
import { transposeChord } from "@/lib/music-math"
import { cleanChordText } from "@/lib/chord-utils"
import { useSmartTransposer, type ChordOverlay } from "@/hooks/use-smart-transposer"

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
        addingChord,
        handleBgLongPressStart,
        handleBgLongPressEnd,
        handleChordPointerDown,
        handleChordPointerUpOrCancel,
        handleChordCorrection,
        getSuggestions
    } = useSmartTransposer({ pageRef, pageNumber, isRendered })

    if (!aiState?.isEnabled || !pageData) {
        return null
    }

    return (
        <div
            className="absolute inset-0 z-10 pointer-events-none"
            onPointerDown={isEditingChords ? handleBgLongPressStart : undefined}
            onPointerUp={isEditingChords ? handleBgLongPressEnd : undefined}
            onPointerCancel={isEditingChords ? handleBgLongPressEnd : undefined}
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

                const showPopover = editPopover?.index === i

                return (
                    <div key={i} className="absolute" style={{ left: `${chord.x}%`, top: `${chord.y}%` }}>
                        <div
                            className={isEditingChords ? "cursor-pointer" : "cursor-pointer touch-action-none"}
                            onPointerDown={e => handleChordPointerDown(e, i, chord)}
                            onPointerUp={handleChordPointerUpOrCancel}
                            onPointerCancel={handleChordPointerUpOrCancel}
                            style={{
                                margin: `-${padV}px 0 0 -${padH}px`,
                                padding: `${padV}px ${padH + 2}px ${padV}px ${padH}px`,
                                minWidth: chordWidth > 0 ? `${chordWidth}%` : undefined,

                                backgroundColor: (needsOverlay || isEditingChords || showPopover) ? 'rgba(255, 255, 255, 0.97)' : 'transparent',
                                borderRadius: '1px',

                                // Edit mode: dotted border on all chords
                                border: (isEditingChords || showPopover) ? '1px dashed rgba(139, 92, 246, 0.5)' : 'none',

                                color: (needsOverlay || isEditingChords || showPopover) ? '#6d28d9' : 'transparent',
                                fontSize: `${fontSize}px`,
                                fontWeight: 700,
                                fontFamily: "'Times New Roman', 'Georgia', serif",
                                lineHeight: 1.1,
                                whiteSpace: 'nowrap',
                                zIndex: showPopover ? 150 : 100,
                                pointerEvents: 'auto', // Always allow interaction for long-press
                            }}
                        >
                            {displayText}
                        </div>

                        {/* Edit popover */}
                        {showPopover && (
                            <div
                                className="absolute z-[200] bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-lg shadow-2xl p-2 flex flex-col gap-1.5"
                                style={{ top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '6px', minWidth: '180px' }}
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold px-1 pb-1 border-b border-zinc-500/30">
                                    Quick Fix
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {getSuggestions(chord, detectedKey).map(suggestion => (
                                        <button
                                            key={suggestion}
                                            className="px-2.5 py-1.5 bg-zinc-800 hover:bg-violet-600 active:bg-violet-700 text-white text-sm font-mono rounded transition-colors flex-1 min-w-[30%]"
                                            onClick={() => handleChordCorrection(i, suggestion)}
                                        >
                                            {transposeChord(suggestion, transposition, preferFlats)}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                    <input
                                        type="text"
                                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                                        placeholder="Or type..."
                                        defaultValue={chord.text}
                                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                            if (e.key === 'Enter') handleChordCorrection(i, e.currentTarget.value)
                                        }}
                                        autoFocus
                                    />
                                    <button
                                        className="px-2.5 py-1 text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs rounded transition-colors"
                                        onClick={() => setEditPopover(null)}
                                    >
                                        Esc
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
