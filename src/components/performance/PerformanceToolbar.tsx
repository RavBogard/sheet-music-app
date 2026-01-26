"use client"

import { useState } from "react"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import {
    ChevronLeft, ChevronRight, Home, ListMusic,
    ZoomIn, ZoomOut, Wand2, Loader2, Music2, Guitar
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { transposeChord } from "@/lib/transposer-logic"

interface PerformanceToolbarProps {
    onHome: () => void
    onSetlist: () => void
}

const SHAPES = ['C', 'A', 'G', 'E', 'D'] // CAGED system
const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export function PerformanceToolbar({ onHome, onSetlist }: PerformanceToolbarProps) {
    const {
        fileType,
        playbackQueue,
        queueIndex,
        nextSong,
        prevSong,
        zoom,
        setZoom,
        transposition,
        setTransposition,
        aiTransposer,
        setTransposerState,
        capo,
        setCapoState
    } = useMusicStore()

    const currentTrack = playbackQueue[queueIndex]

    // Capo Calculation Helper
    // Returns { delta, fret }
    const calculateCapo = (sourceKey: string, targetShape: string) => {
        const sIndex = KEYS.indexOf(sourceKey.replace(/m$/, '')) // simplify
        const tIndex = KEYS.indexOf(targetShape.replace(/m$/, ''))

        if (sIndex === -1 || tIndex === -1) return null

        let delta = tIndex - sIndex // How much to shift CHORDS
        // Example: Key F (5), Shape G (7). Delta = +2. Shift chords UP 2? 
        // No, if playing G shapes to sound like F... wait.
        // To Sound Like (Source) using Shapes (Target).
        // F (Real) = G (Shape) + Capo? 
        // No, F is LOWER than G. F = G - 2 semitones. 
        // Capo only goes UP. 
        // So F = E (Shape) + 1 fret (Capo 1).

        // Correct Math: Capo Fret = Source - Target (mod 12)
        // Example: Source F (5), Target E (4). Fret = 5 - 4 = 1. Capo 1. Correct.
        // Example: Source F (5), Target G (7). Fret = 5 - 7 = -2 -> +12 = 10. Capo 10.

        let fret = sIndex - tIndex
        if (fret < 0) fret += 12

        // The TRANSPOSITION needed for the text is: Target - Source.
        // We want the text to say "G". It currently says "F".
        // Delta = G - F = +2. 
        // So we transpose +2 (or +14, or -10).
        // Let's check: transposeChord("F", +2) -> "G". Correct.

        let transposeDelta = tIndex - sIndex

        return { fret, transposeDelta }
    }

    const applyCapo = (shape: string) => {
        if (!aiTransposer.detectedKey) return

        const result = calculateCapo(aiTransposer.detectedKey, shape)
        if (result) {
            setTransposition(result.transposeDelta)
            setCapoState({ active: true, targetShape: shape, fret: result.fret })
        }
    }

    const clearCapo = () => {
        setCapoState({ active: false, targetShape: '', fret: 0 })
        setTransposition(0)
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between px-4 z-50">

            {/* Left: Navigation */}
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-400 hover:text-white">
                    <Home className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onSetlist} className="text-zinc-400 hover:text-white">
                    <ListMusic className="h-5 w-5" />
                </Button>
            </div>

            {/* Center: Playback */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={prevSong}
                    disabled={queueIndex <= 0}
                    className="text-white"
                >
                    <ChevronLeft className="h-6 w-6" />
                </Button>

                <div className="flex flex-col items-center">
                    <span className="text-sm font-bold max-w-[200px] truncate text-center">
                        {currentTrack?.name || "No Song Selected"}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                        {playbackQueue.length > 0 ? `${queueIndex + 1} / ${playbackQueue.length}` : "Empty Queue"}
                    </span>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={nextSong}
                    disabled={queueIndex >= playbackQueue.length - 1}
                    className="text-white"
                >
                    <ChevronRight className="h-6 w-6" />
                </Button>
            </div>

            {/* Right: Tools */}
            <div className="flex items-center gap-2">

                {/* PDF AI Toggle */}
                {fileType === 'pdf' && (
                    <Button
                        size="sm"
                        variant={aiTransposer.isVisible ? "secondary" : "ghost"}
                        className={`gap-2 ${aiTransposer.isVisible ? "bg-purple-600 hover:bg-purple-500 text-white" : "text-zinc-400"}`}
                        onClick={() => setTransposerState({ isVisible: !aiTransposer.isVisible })}
                    >
                        {aiTransposer.status === 'scanning' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                        <span className="hidden md:inline">Magic</span>
                    </Button>
                )}

                {/* Transpose / Capo Menu */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant={capo.active ? "default" : "secondary"} size="sm" className="gap-2 min-w-[80px]">
                            {capo.active ? (
                                <>
                                    <Guitar className="h-4 w-4" />
                                    <span>Capo {capo.fret}</span>
                                </>
                            ) : (
                                <>
                                    <Music2 className="h-4 w-4" />
                                    <span>
                                        {transposition > 0 ? `+${transposition}` : transposition}
                                    </span>
                                </>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-4 bg-zinc-900 border-zinc-700 text-white mb-2" align="end" sideOffset={10}>
                        <div className="space-y-4">
                            {/* Standard Transpose */}
                            <div>
                                <h4 className="text-xs font-bold text-zinc-500 uppercase mb-2">Manual Transpose</h4>
                                <div className="flex items-center justify-center gap-4 bg-zinc-800 rounded-lg p-2">
                                    <Button variant="ghost" size="icon" onClick={() => setTransposition(transposition - 1)}>-</Button>
                                    <span className="font-mono text-xl font-bold w-8 text-center">{transposition}</span>
                                    <Button variant="ghost" size="icon" onClick={() => setTransposition(transposition + 1)}>+</Button>
                                </div>
                            </div>

                            {/* Capo Mode (Only if Key Detected) */}
                            {aiTransposer.detectedKey ? (
                                <div>
                                    <h4 className="text-xs font-bold text-zinc-500 uppercase mb-2">Guitar Capo Mode</h4>
                                    <p className="text-xs text-zinc-400 mb-2">Original Key: <span className="text-purple-400 font-bold">{aiTransposer.detectedKey}</span></p>

                                    <div className="grid grid-cols-5 gap-1">
                                        {SHAPES.map(shape => (
                                            <Button
                                                key={shape}
                                                variant={capo.active && capo.targetShape === shape ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => applyCapo(shape)}
                                                className="h-8 font-bold"
                                            >
                                                {shape}
                                            </Button>
                                        ))}
                                    </div>

                                    {capo.active && (
                                        <Button variant="ghost" size="sm" className="w-full mt-2 text-red-400 hover:text-red-300 h-8" onClick={clearCapo}>
                                            Clear Capo
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="text-xs text-zinc-500 italic text-center p-2">
                                    Use Magic Wand to enable Capo Mode
                                </div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

                {/* Zoom */}
                <div className="flex items-center bg-zinc-800 rounded-lg ml-2">
                    <Button variant="ghost" size="icon" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className="h-8 w-8">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setZoom(Math.min(3, zoom + 0.1))} className="h-8 w-8">
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </div>

            </div>
        </div>
    )
}
