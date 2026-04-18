"use client"

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { Trash2, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { transposeChord } from "@/lib/music-math"
import type { ChordOverlay } from "@/lib/chord-cache"

interface ChordEditPopoverProps {
    chord: ChordOverlay
    chordIndex: number
    anchorEl: HTMLElement | null
    suggestions: string[]
    transposition: number
    preferFlats: boolean | undefined
    onCorrect: (index: number, text: string) => void
    onDelete: (index: number) => void
    onResize: (index: number, deltaW: number) => void
    onClose: () => void
}

export function ChordEditPopover({
    chord, chordIndex, anchorEl, suggestions,
    transposition, preferFlats,
    onCorrect, onDelete, onResize, onClose,
}: ChordEditPopoverProps) {
    const [inputValue, setInputValue] = useState(chord.text)
    const inputRef = useRef<HTMLInputElement>(null)
    const popoverRef = useRef<HTMLDivElement>(null)
    const [position, setPosition] = useState({ top: 0, left: 0 })

    // Focus and select on mount
    useEffect(() => {
        const t = setTimeout(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
        }, 50)
        return () => clearTimeout(t)
    }, [])

    // Sync input when switching to a different chord
    useEffect(() => { setInputValue(chord.text) }, [chord.text])

    // Compute portal position from anchor element
    const updatePosition = useCallback(() => {
        if (!anchorEl) return
        const rect = anchorEl.getBoundingClientRect()
        const popoverH = 220
        const popoverW = 210
        const spaceBelow = window.innerHeight - rect.bottom
        const flipUp = spaceBelow < popoverH && rect.top > popoverH

        setPosition({
            top: flipUp ? rect.top - popoverH - 4 : rect.bottom + 4,
            left: Math.min(
                Math.max(rect.left + rect.width / 2 - popoverW / 2, 8),
                window.innerWidth - popoverW - 8
            ),
        })
    }, [anchorEl])

    useLayoutEffect(() => { updatePosition() }, [updatePosition])

    // Re-position on scroll or resize
    useEffect(() => {
        if (!anchorEl) return
        window.addEventListener('scroll', updatePosition, true)
        window.addEventListener('resize', updatePosition)
        return () => {
            window.removeEventListener('scroll', updatePosition, true)
            window.removeEventListener('resize', updatePosition)
        }
    }, [anchorEl, updatePosition])

    // Close on Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    const handleSubmit = () => {
        const text = inputValue.trim()
        if (text && text !== '?') onCorrect(chordIndex, text)
        else onClose()
    }

    return createPortal(
        <>
            {/* Backdrop to catch outside clicks */}
            <div
                className="fixed inset-0 z-popover"
                onClick={onClose}
                aria-hidden
            />

            <div
                ref={popoverRef}
                className="fixed z-toast bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
                style={{ top: position.top, left: position.left, width: 210 }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header with delete */}
                <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-zinc-800">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                        Edit Chord
                    </span>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onDelete(chordIndex)}
                        className="hover:bg-red-500/15 text-zinc-600 hover:text-red-400"
                        title="Delete chord"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>

                {/* Suggestion chips */}
                {suggestions.length > 0 && (
                    <div className="flex gap-1 px-3 pt-2.5">
                        {suggestions.map(s => (
                            <Button
                                key={s}
                                variant="ghost"
                                onClick={() => onCorrect(chordIndex, s)}
                                className="flex-1 min-h-[36px] h-auto bg-zinc-800 hover:bg-violet-600 active:bg-violet-700 rounded-lg font-mono font-bold text-white"
                            >
                                {transposeChord(s, transposition, preferFlats)}
                            </Button>
                        ))}
                    </div>
                )}

                {/* Free text input */}
                <div className="flex items-center gap-1.5 px-3 pt-2 pb-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleSubmit()
                            if (e.key === 'Escape') onClose()
                        }}
                        className="flex-1 min-w-0 bg-zinc-950 border border-zinc-700 focus:border-violet-500 rounded-lg px-2.5 py-2 text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none transition-colors"
                        placeholder="Chord..."
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSubmit}
                        className="shrink-0 px-2.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 rounded-lg text-white text-xs font-semibold"
                    >
                        Set
                    </Button>
                </div>

                {/* Size nudge controls */}
                <div className="flex items-center gap-2 px-3 pb-2.5 border-t border-zinc-800 pt-2">
                    <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">
                        Size
                    </span>
                    <div className="flex items-center gap-1 ml-auto">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onResize(chordIndex, -0.3)}
                            className="h-7 w-7 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white"
                            title="Narrower"
                        >
                            <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-[10px] text-zinc-500 w-12 text-center font-mono">
                            {(chord.sizeOverride?.wPct ?? chord.w ?? 0).toFixed(1)}%
                        </span>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onResize(chordIndex, 0.3)}
                            className="h-7 w-7 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white"
                            title="Wider"
                        >
                            <Plus className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
            </div>
        </>,
        document.body,
    )
}
