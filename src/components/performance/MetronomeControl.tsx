"use client"

import { useEffect } from "react"
import { useMusicStore } from "@/lib/store"
import { useMetronome } from "@/hooks/use-metronome"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/client"

export function MetronomeControl() {
    const t = useT()
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
            {/* v45-emergency: BPM is the first control to collapse when toolbar is tight.
                Changed from `hidden lg:flex` (1024+) to `hidden min-[1280px]:flex` so the
                BPM number input disappears on iPad-portrait-lg and narrower desktop widths
                where LEFT+RIGHT toolbar content would otherwise overlap chart navigation.
                The blink/tap button below stays visible at all sizes. */}
            <div className="hidden min-[1280px]:flex items-center gap-1 bg-background/40 rounded-lg ps-2 pe-1 h-11 border border-border">
                {/* i18n-ignore: BPM is a musical unit, shown verbatim in every language */}
                <span className="text-xs text-muted-foreground/60 font-bold uppercase tracking-wider">BPM</span>
                <Input
                    type="number"
                    value={currentBpm}
                    onChange={(e) => setCurrentBpm(parseInt(e.target.value) || 0)}
                    className="h-full w-12 bg-transparent border-0 text-lg font-bold text-center p-0 focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                />
            </div>

            {/* Blinking Light Button + Label */}
            <Button
                variant="ghost"
                onClick={togglePlay}
                className={cn(
                    "h-11 min-w-11 px-3 sm:px-4 rounded-lg cursor-pointer border",
                    "bg-card lg:bg-background/50",
                    isPlaying
                        ? "border-destructive/50"
                        : "border-border hover:border-muted-foreground hover:bg-muted",
                )}
                title={isPlaying ? t("perform.metronome.stopTitle") : t("perform.metronome.startTitle")}
                aria-label={isPlaying ? t("perform.metronome.stopAria") : t("perform.metronome.startAria")}
            >
                <div className={cn(
                    "rounded-full transition-all duration-75 shrink-0",
                    isPlaying && isBeat
                        ? "h-4 w-4 bg-destructive scale-110"
                        : isPlaying
                            ? "h-2.5 w-2.5 bg-destructive/40"
                            : "h-2 w-2 bg-muted-foreground/40"
                )} />
                {/* v45-emergency: show this compact BPM label until the wide BPM input
                    kicks in at 1280px+. Matches the visibility breakpoint above. */}
                <span className={cn(
                    "text-xs font-semibold min-[1280px]:hidden",
                    isPlaying ? "text-destructive" : "text-muted-foreground"
                )}>
                    {/* i18n-ignore: BPM is a musical unit, shown verbatim in every language */}
                    {isPlaying ? currentBpm : "BPM"}
                </span>
            </Button>
        </div>
    )
}
