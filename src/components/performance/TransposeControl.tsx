"use client"

import { useState } from "react"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Music2, ChevronRight } from "lucide-react"

export function TransposeControl() {
    const {
        fileType,
        transposition,
        setTransposition,
        capo,
        setCapoState,
        aiTransposer,
        setTransposerState,
        playbackQueue,
        queueIndex
    } = useMusicStore()

    const currentTrack = playbackQueue[queueIndex]

    const clearCapo = () => {
        setCapoState({ active: false, targetShape: '', fret: 0 })
        setTransposition(0)
    }

    // Reuse the popover logic
    const handleOpenChange = (open: boolean) => {
        if (open && fileType === 'pdf' && aiTransposer.status === 'idle') {
            setTransposerState({ isVisible: true })
        }
    }

    return (
        <Popover onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant={transposition !== 0 || capo.active ? "default" : "secondary"}
                    className="bg-zinc-800 text-zinc-200 hover:bg-zinc-700 h-10 px-3"
                >
                    <Music2 className="h-4 w-4 mr-2" />
                    {capo.active ? `Capo ${capo.fret}` : (transposition !== 0 ? (transposition > 0 ? `+${transposition}` : transposition) : "Transpose")}
                </Button>
            </PopoverTrigger>

            <div className="bg-zinc-900 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="font-bold text-sm uppercase tracking-wider text-zinc-400">Transposition</h3>
                {(transposition !== 0 || capo.active) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10"
                        onClick={() => { setTransposition(0); clearCapo(); }}
                    >
                        Reset
                    </Button>
                )}
            </div>

            <div className="p-4 space-y-6">
                {/* Mode Toggle */}
                <div className="grid grid-cols-2 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                    <button
                        onClick={() => { if (capo.active) clearCapo(); }}
                        className={`text-xs font-bold py-1.5 rounded-md transition-all ${!capo.active ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        MANUAL
                    </button>
                    <button
                        onClick={() => { if (!capo.active) setCapoState({ active: true, fret: 0, targetShape: currentTrack?.key || 'C' }) }}
                        className={`text-xs font-bold py-1.5 rounded-md transition-all ${capo.active ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        SMART CAPO
                    </button>
                </div>

                {!capo.active ? (
                    /* Manual Mode */
                    <>
                        <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800 text-center">
                            <div className="text-sm text-zinc-500 mb-1">Tranformation</div>
                            <div className="flex items-center justify-center gap-3 text-lg font-bold">
                                <span className="text-zinc-400">{currentTrack?.key || "?"}</span>
                                <ChevronRight className="h-4 w-4 text-zinc-600" />
                                <span className="text-cyan-400">
                                    {transposition > 0 ? `+${transposition}` : transposition} Semitones
                                </span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase">Pitch Shift</label>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    className="h-10 flex-1 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:text-white"
                                    onClick={() => setTransposition(transposition - 1)}
                                >
                                    -1
                                </Button>
                                <div className="w-12 text-center font-mono text-xl font-bold">
                                    {transposition > 0 ? "+" : ""}{transposition}
                                </div>
                                <Button
                                    variant="outline"
                                    className="h-10 flex-1 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:text-white"
                                    onClick={() => setTransposition(transposition + 1)}
                                >
                                    +1
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    /* Capo Mode */
                    <>
                        <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800 text-center space-y-2">
                            <div className="text-sm text-zinc-500">Capo Position</div>
                            <div className="text-3xl font-bold text-orange-400">
                                {capo.fret === 0 ? "No Capo" : `Capo ${capo.fret}`}
                            </div>
                            <div className="text-xs text-zinc-500">
                                (Chords will show as {capo.targetShape})
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-500 uppercase">I want to play using...</label>
                            <div className="grid grid-cols-4 gap-2">
                                {['C', 'D', 'E', 'G', 'A', 'Am', 'Em', 'Dm'].map(shape => (
                                    <button
                                        key={shape}
                                        onClick={() => {
                                            const originalKey = currentTrack?.key || 'C'
                                            const result = calculateCapo(originalKey, shape)
                                            if (result) {
                                                setCapoState({ active: true, targetShape: shape, fret: result.fret })
                                                setTransposition(result.transposition)
                                            }
                                        }}
                                        className={`h-9 rounded-md text-sm font-bold border transition-all ${capo.targetShape === shape
                                            ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                                            : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                                            }`}
                                    >
                                        {shape}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* AI Chords Toggle */}
                <div className="pt-4 mt-4 border-t border-zinc-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-500 uppercase">Show Chords</span>
                    <button
                        onClick={() => setTransposerState({ isVisible: !aiTransposer.isVisible })}
                        className={`w-10 h-6 rounded-full transition-colors relative ${aiTransposer.isVisible ? 'bg-green-500' : 'bg-zinc-700'}`}
                    >
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${aiTransposer.isVisible ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>
        </PopoverContent>
    </Popover >
    )
}

import { calculateCapo } from "@/lib/transposer-logic"
