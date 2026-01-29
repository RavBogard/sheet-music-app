"use client"

import { useRouter } from "next/navigation"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

export function SongNavigation() {
    const router = useRouter()
    const {
        playbackQueue,
        queueIndex,
        nextSong,
        prevSong
    } = useMusicStore()

    const currentTrack = playbackQueue[queueIndex]

    const handleNext = () => {
        const next = nextSong()
        if (next) router.replace(`/perform/${next.fileId}`)
    }

    const handlePrev = () => {
        const prev = prevSong()
        if (prev) router.replace(`/perform/${prev.fileId}`)
    }

    return (
        <div className="flex items-center gap-2 sm:gap-6 w-full max-w-sm sm:max-w-md justify-center">
            <Button
                variant="ghost"
                size="icon"
                onClick={handlePrev}
                disabled={queueIndex <= 0}
                className="text-zinc-400 hover:text-white hover:bg-white/10 rounded-full h-12 w-12 shrink-0 transition-transform active:scale-95"
            >
                <ChevronLeft className="h-8 w-8" />
            </Button>

            <div className="flex flex-col items-center overflow-hidden min-w-0 flex-1 px-2">
                <span className="text-base sm:text-xl font-bold truncate text-center w-full leading-tight text-white drop-shadow-md">
                    {currentTrack?.name || "No Song Selected"}
                </span>
                <span className="text-[10px] sm:text-xs text-zinc-500 font-medium tracking-wide uppercase mt-0.5">
                    {playbackQueue.length > 0 ? `Song ${queueIndex + 1} of ${playbackQueue.length}` : "Setlist Empty"}
                </span>
            </div>

            <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                disabled={queueIndex >= playbackQueue.length - 1}
                className="text-white hover:bg-white/10 rounded-full h-12 w-12 shrink-0 transition-transform active:scale-95 bg-white/5 border border-white/5"
            >
                <ChevronRight className="h-8 w-8" />
            </Button>
        </div>
    )
}
