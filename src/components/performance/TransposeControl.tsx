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

            <PopoverContent className="w-80 p-0 bg-zinc-950 border-zinc-800 text-white overflow-hidden shadow-2xl" align="end" sideOffset={10}>
                <div className="bg-zinc-900 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="font-bold text-sm uppercase tracking-wider text-zinc-400">Transposition</h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10"
                        onClick={() => { setTransposition(0); clearCapo(); }}
                    >
                        Reset
                    </Button>
                </div>

                <div className="p-4 space-y-6">
                    {/* Visual Feedback */}
                    <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800 text-center">
                        <div className="text-sm text-zinc-500 mb-1">Transformation</div>
                        <div className="flex items-center justify-center gap-3 text-lg font-bold">
                            <span className="text-zinc-400">{currentTrack?.key || "?"}</span>
                            <ChevronRight className="h-4 w-4 text-zinc-600" />
                            <span className="text-cyan-400">
                                {transposition > 0 ? `+${transposition}` : transposition} Semitones
                            </span>
                        </div>
                    </div>

                    {/* Pitch Shift */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase">Pitch Shift (Semitones)</label>
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
                </div>
            </PopoverContent>
        </Popover>
    )
}
