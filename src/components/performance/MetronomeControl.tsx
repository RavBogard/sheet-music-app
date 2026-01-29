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
        <div className="flex items-center gap-2 sm:gap-3 px-1">
            <div className="flex items-center gap-1 bg-black/40 rounded-lg pl-2 pr-1 h-8 border border-zinc-800">
                <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">BPM</span>
                <Input
                    type="number"
                    value={currentBpm}
                    onChange={(e) => setCurrentBpm(parseInt(e.target.value) || 0)}
                    className="h-full w-12 bg-transparent border-0 text-lg font-bold text-center p-0 focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-zinc-300"
                />
            </div>

            {/* Blinking Light Button */}
            <div
                onClick={togglePlay}
                className={cn(
                    "h-8 w-8 rounded-full cursor-pointer transition-all duration-75 border-2 flex items-center justify-center bg-black",
                    isPlaying
                        ? "border-zinc-700"
                        : "border-zinc-800 hover:border-zinc-600",
                )}
                title={isPlaying ? "Stop Metronome" : "Start Metronome"}
            >
                <div className={cn(
                    "rounded-full transition-all duration-75",
                    isPlaying && isBeat
                        ? "h-5 w-5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,1)] scale-110"
                        : "h-2 w-2 bg-zinc-800"
                )} />
            </div>
        </div>
    )
}
