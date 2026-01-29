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
        <div className="flex items-center gap-4">
            <div className="flex flex-col items-center min-w-[4rem]">
                <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">BPM</span>
                <Input
                    type="number"
                    value={currentBpm}
                    onChange={(e) => setCurrentBpm(parseInt(e.target.value) || 0)}
                    className="h-9 w-20 bg-transparent border-0 text-4xl font-black text-center p-0 focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-zinc-300"
                />
            </div>

            {/* Blinking Light Button */}
            <div
                onClick={togglePlay}
                className={cn(
                    "h-14 w-14 rounded-full cursor-pointer transition-all duration-75 border-4 flex items-center justify-center bg-black",
                    isPlaying
                        ? "border-zinc-800"
                        : "border-zinc-800 hover:border-zinc-600",
                )}
                title={isPlaying ? "Stop Metronome" : "Start Metronome"}
            >
                <div className={cn(
                    "rounded-full transition-all duration-75",
                    isPlaying && isBeat
                        ? "h-10 w-10 bg-red-500 shadow-[0_0_20px_rgba(239,68,68,1)] scale-110"
                        : "h-3 w-3 bg-zinc-800"
                )} />
            </div>
        </div>
    )
}
