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
        <div className="hidden sm:flex items-center gap-4 flex-1 justify-center max-w-[400px]">
            <Button
                variant="ghost"
                size="icon"
                onClick={handlePrev}
                disabled={queueIndex <= 0}
                className="text-white h-14 w-14 hover:bg-white/10 rounded-full"
            >
                <ChevronLeft className="h-8 w-8" />
            </Button>

            <div className="flex flex-col items-center overflow-hidden min-w-0 flex-1">
                <span className="text-lg font-bold truncate text-center w-full leading-tight">
                    {currentTrack?.name || "No Song Selected"}
                </span>
                <span className="text-xs text-zinc-500 mt-1">
                    {playbackQueue.length > 0 ? `${queueIndex + 1} of ${playbackQueue.length}` : "Setlist Empty"}
                </span>
            </div>

            <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                disabled={queueIndex >= playbackQueue.length - 1}
                className="text-white h-14 w-14 hover:bg-white/10 rounded-full"
            >
                <ChevronRight className="h-8 w-8" />
            </Button>
        </div>
    )
}
