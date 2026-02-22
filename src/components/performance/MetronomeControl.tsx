"use client"

import { useEffect } from "react"
import { useMusicStore } from "@/lib/store"
import { useMetronome } from "@/hooks/use-metronome"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function MetronomeControl() {
    const { playbackQueue, queueIndex } = useMusicStore()
    const currentTrack = playbackQueue[queueIndex]

    const { isPlaying, togglePlay, currentBpm, setCurrentBpm, isBeat } = useMetronome(currentTrack?.bpm || 100)

    // Sync metronome BPM when track changes
    useEffect(() => {
        if (currentTrack?.bpm) {
            setCurrentBpm(currentTrack.bpm)
        }
    }, [currentTrack, setCurrentBpm])

    return (
        <div className="flex items-center gap-2 lg:gap-3 px-1">
            <div className="hidden lg:flex items-center gap-1 bg-black/40 rounded-lg pl-2 pr-1 h-8 border border-border">
                <span className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-wider">BPM</span>
                <Input
                    type="number"
                    value={currentBpm}
                    onChange={(e) => setCurrentBpm(parseInt(e.target.value) || 0)}
                    className="h-full w-12 bg-transparent border-0 text-lg font-bold text-center p-0 focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                />
            </div>

            {/* Blinking Light Button + Label */}
            <button
                onClick={togglePlay}
                className={cn(
                    "flex items-center gap-2 h-9 px-3 sm:px-4 rounded-lg cursor-pointer transition-all border",
                    "bg-card lg:bg-black/50",
                    isPlaying
                        ? "border-red-500/50"
                        : "border-border hover:border-white/30 hover:bg-muted",
                )}
                title={isPlaying ? "Stop Metronome" : "Start Metronome"}
            >
                <div className={cn(
                    "rounded-full transition-all duration-75 shrink-0",
                    isPlaying && isBeat
                        ? "h-4 w-4 bg-red-500 shadow-[0_0_10px_#ef4444] scale-110"
                        : isPlaying
                            ? "h-2.5 w-2.5 bg-red-800"
                            : "h-2 w-2 bg-zinc-700"
                )} />
                <span className={cn(
                    "text-xs font-semibold lg:hidden",
                    isPlaying ? "text-red-400" : "text-muted-foreground"
                )}>
                    {isPlaying ? currentBpm : "Metronome"}
                </span>
            </button>
        </div>
    )
}
