"use client"

import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { useT } from "@/i18n/client"

// Phase 7 ruling: song-to-song previous/next follows the reading direction.
// The buttons sit in a flex row, so on a right-to-left page "previous" lands
// on the right and its chevron mirrors to point outward (DirectionalIcon).
export function SongNavigation() {
    const t = useT()
    const {
        playbackQueue,
        queueIndex,
        nextSong,
        prevSong
    } = useMusicStore()

    const currentTrack = playbackQueue[queueIndex]
    // PERF-11: "Next: <title> (<key>)" when there is a next song.
    const nextTrack = queueIndex >= 0 ? playbackQueue[queueIndex + 1] : undefined

    const handleNext = () => {
        nextSong() // Updates queueIndex in store; PDFOverlay listens to this
    }

    const handlePrev = () => {
        prevSong() // Updates queueIndex in store; PDFOverlay listens to this
    }

    return (
        <div className="flex items-center gap-2 sm:gap-6 w-full max-w-md sm:max-w-lg justify-center">
            <Button
                variant="ghost"
                size="icon"
                onClick={handlePrev}
                disabled={queueIndex <= 0}
                className="text-muted-foreground hover:text-foreground hover:bg-brand/10 rounded-full h-14 w-14 shrink-0 transition-transform active:scale-95"
                aria-label={t("perform.nav.previousSong")}
            >
                <DirectionalIcon icon={ChevronLeft} className="h-10 w-10" />
            </Button>

            <div className="flex flex-col items-center overflow-hidden min-w-0 flex-1 px-2">
                <span className="text-xl sm:text-3xl font-bold truncate text-center w-full leading-tight text-foreground drop-shadow-md">
                    {currentTrack?.name || t("perform.nav.noSongSelected")}
                </span>
                {/* PERF-11: the next song shares the position line (the toolbar
                    row is 56px tall — a third line would not fit on the iPad). */}
                <div className="flex items-baseline justify-center gap-2 w-full min-w-0 mt-0.5">
                    <span className="shrink-0 text-sm sm:text-base text-muted-foreground font-medium tracking-wide uppercase">
                        {playbackQueue.length > 0
                            ? t("perform.songPosition", { position: queueIndex + 1, total: playbackQueue.length })
                            : t("perform.nav.setlistEmpty")}
                    </span>
                    {nextTrack && (
                        <span
                            data-testid="song-nav-next"
                            className="min-w-0 truncate text-sm sm:text-base text-muted-foreground font-medium"
                        >
                            <span aria-hidden="true">· </span>
                            {nextTrack.key
                                ? t("perform.nav.nextUp", { title: nextTrack.name, key: nextTrack.key })
                                : t("perform.nav.nextUpNoKey", { title: nextTrack.name })}
                        </span>
                    )}
                </div>
            </div>

            <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                disabled={queueIndex >= playbackQueue.length - 1}
                className="text-foreground hover:bg-brand/10 rounded-full h-14 w-14 shrink-0 transition-transform active:scale-95 bg-brand/10 border border-brand/20"
                aria-label={t("perform.nav.nextSong")}
            >
                <DirectionalIcon icon={ChevronRight} className="h-10 w-10" />
            </Button>
        </div>
    )
}
