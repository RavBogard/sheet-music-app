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
        <div className="flex items-center gap-2 sm:gap-6 w-full max-w-md sm:max-w-lg justify-center">
            <Button
                variant="ghost"
                size="icon"
                onClick={handlePrev}
                disabled={queueIndex <= 0}
                className="text-muted-foreground hover:text-foreground hover:bg-brand/10 rounded-full h-14 w-14 shrink-0 transition-transform active:scale-95"
                aria-label="Previous song"
            >
                <ChevronLeft className="h-10 w-10" />
            </Button>

            <div className="flex flex-col items-center overflow-hidden min-w-0 flex-1 px-2">
                <span className="text-xl sm:text-3xl font-bold truncate text-center w-full leading-tight text-foreground drop-shadow-md">
                    {currentTrack?.name || "No Song Selected"}
                </span>
                <span className="text-sm sm:text-base text-muted-foreground font-medium tracking-wide uppercase mt-0.5">
                    {playbackQueue.length > 0 ? `Song ${queueIndex + 1} of ${playbackQueue.length}` : "Setlist Empty"}
                </span>
            </div>

            <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                disabled={queueIndex >= playbackQueue.length - 1}
                className="text-foreground hover:bg-brand/10 rounded-full h-14 w-14 shrink-0 transition-transform active:scale-95 bg-brand/10 border border-brand/20"
                aria-label="Next song"
            >
                <ChevronRight className="h-10 w-10" />
            </Button>
        </div>
    )
}
