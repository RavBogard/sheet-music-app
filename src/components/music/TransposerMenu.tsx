"use client"

import { useMemo } from "react"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { ChevronUp, ChevronDown, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { calculateCapo, estimateKey, transposeChord } from "@/lib/music-math"
import { useMusicianTransposition } from "@/hooks/use-musician-transposition"

// Common guitar-friendly shapes for the "Play As" grid
const SHAPES = [
    { label: "G", minor: false },
    { label: "C", minor: false },
    { label: "D", minor: false },
    { label: "A", minor: false },
    { label: "E", minor: false },
    { label: "Am", minor: true },
    { label: "Em", minor: true },
    { label: "Dm", minor: true },
]

export function TransposerMenu() {
    const {
        transposition,
        setTransposition,
        aiState,
        setCapoFret,
        capoFret,
    } = useMusicStore()

    // Musician profile for auto-transposition indicator
    const { profile, isAutoTransposed, instrumentLabel } = useMusicianTransposition()

    // Gather all detected chords across pages
    const allChords = useMemo(() => {
        return Object.values(aiState.pageData).flatMap(
            p => p.chords.map((c: { originalText?: string; text: string }) => c.originalText || c.text)
        )
    }, [aiState.pageData])

    // Detect key from chords
    const detectedKey = useMemo(() => {
        if (allChords.length === 0) return null
        return estimateKey(allChords)
    }, [allChords])

    // Pre-compute capo results for all shapes
    const capoResults = useMemo(() => {
        if (!detectedKey) return {}
        const results: Record<string, { fret: number; transposition: number } | null> = {}
        for (const shape of SHAPES) {
            results[shape.label] = calculateCapo(detectedKey, shape.label)
        }
        return results
    }, [detectedKey])

    // Current "play as" shape (reverse-lookup from current transposition + capoFret)
    const activeShape = useMemo(() => {
        if (!capoFret || capoFret === 0) return null
        for (const shape of SHAPES) {
            const result = capoResults[shape.label]
            if (result && result.fret === capoFret && result.transposition === transposition) {
                return shape.label
            }
        }
        return null
    }, [capoFret, transposition, capoResults])

    const handleCapoSelect = (shape: string) => {
        const result = capoResults[shape]
        if (!result) return
        setTransposition(result.transposition)
        setCapoFret(result.fret)
    }

    const handleReset = () => {
        setTransposition(0)
        setCapoFret(null)
    }

    const isScanning = aiState.scanningPages.length > 0
    const hasChords = allChords.length > 0
    const isModified = transposition !== 0

    return (
        <div className="flex flex-col gap-3 p-4 min-w-[300px]">
            {/* Musician Profile Indicator */}
            {instrumentLabel && (
                <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 rounded-lg border border-violet-500/20 text-xs">
                    <span className="text-violet-400 font-semibold">{instrumentLabel}</span>
                    {isAutoTransposed && (
                        <span className="text-violet-400/60">• auto-transposed</span>
                    )}
                </div>
            )}

            {/* ── Detected Key ── */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                        {isScanning ? "Scanning..." : hasChords ? "Detected Key" : "Waiting for scan..."}
                    </div>
                    {detectedKey && (
                        <div className="text-2xl font-bold text-white leading-tight">
                            {detectedKey}
                            {isModified && (
                                <span className="text-violet-400 text-lg ml-2">
                                    → {transposeChord(detectedKey, transposition)}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                {isModified && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleReset}
                        className="text-zinc-500 hover:text-white h-8 px-2"
                    >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Reset
                    </Button>
                )}
            </div>

            {/* ── Key Shift Stepper ── */}
            <div className="flex items-center gap-2 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        setTransposition(transposition - 1)
                        setCapoFret(null)
                    }}
                    className="h-8 w-10 hover:bg-zinc-800"
                >
                    <ChevronDown className="h-4 w-4" />
                </Button>

                <div className="flex-1 text-center">
                    <span className={cn(
                        "font-bold text-base",
                        isModified ? "text-violet-400" : "text-zinc-500"
                    )}>
                        {transposition === 0 ? "Original Key" : (transposition > 0 ? `+${transposition}` : `${transposition}`)}
                    </span>
                    {transposition !== 0 && (
                        <span className="text-zinc-600 text-xs ml-1.5">semitones</span>
                    )}
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        setTransposition(transposition + 1)
                        setCapoFret(null)
                    }}
                    className="h-8 w-10 hover:bg-zinc-800"
                >
                    <ChevronUp className="h-4 w-4" />
                </Button>
            </div>

            {/* ── Play As (Capo Shapes) ── */}
            {detectedKey && (
                <div className="space-y-2">
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                        Play As (with capo)
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                        {SHAPES.map(shape => {
                            const result = capoResults[shape.label]
                            const isActive = activeShape === shape.label
                            const isSameKey = result?.fret === 0

                            return (
                                <button
                                    key={shape.label}
                                    onClick={() => handleCapoSelect(shape.label)}
                                    disabled={!result || isSameKey}
                                    className={cn(
                                        "rounded-lg px-1 py-2 text-center transition-all border",
                                        isActive
                                            ? "bg-violet-600/20 border-violet-500/40 text-violet-300"
                                            : isSameKey
                                                ? "bg-zinc-900/30 border-zinc-800/50 text-zinc-700 cursor-default"
                                                : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                                    )}
                                >
                                    <div className="font-bold text-sm leading-tight">{shape.label}</div>
                                    {result && !isSameKey && (
                                        <div className={cn(
                                            "text-[10px] leading-tight mt-0.5",
                                            isActive ? "text-violet-400" : "text-zinc-500"
                                        )}>
                                            capo {result.fret}
                                        </div>
                                    )}
                                    {isSameKey && (
                                        <div className="text-[10px] leading-tight mt-0.5 text-zinc-700">
                                            same
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                    </div>

                    {/* Active capo chain display */}
                    {activeShape && capoFret && capoFret > 0 && (
                        <div className="bg-violet-600/10 border border-violet-500/20 rounded-lg px-3 py-2 text-center">
                            <span className="text-violet-300 text-sm font-medium">
                                {activeShape} shapes
                            </span>
                            <span className="text-zinc-500 text-sm mx-2">→</span>
                            <span className="text-violet-400 text-sm font-bold">
                                Capo {capoFret}
                            </span>
                            <span className="text-zinc-500 text-sm mx-2">→</span>
                            <span className="text-white text-sm font-medium">
                                sounds {detectedKey}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* ── Chord Count ── */}
            {hasChords && (
                <div className="text-[10px] text-zinc-600 text-center">
                    {allChords.length} chords detected across {Object.keys(aiState.pageData).length} page{Object.keys(aiState.pageData).length !== 1 ? 's' : ''}
                </div>
            )}
        </div>
    )
}
