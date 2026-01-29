"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { BackingTrackPlayer } from "@/components/audio/BackingTrackPlayer"
import { Tuner } from "@/components/tools/Tuner"
import { Home, ChevronLeft, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SetlistDrawer } from "@/components/performance/SetlistDrawer"
import { MetronomeControl } from "./MetronomeControl"
import { TransposeControl } from "./TransposeControl"
import { SongNavigation } from "./SongNavigation"
import { cn } from "@/lib/utils"

interface PerformanceToolbarProps {
    onHome: () => void
    onSetlist: () => void
}

export function PerformanceToolbar({ onHome, onSetlist }: PerformanceToolbarProps) {
    const router = useRouter()
    const { playbackQueue, queueIndex, nextSong, prevSong } = useMusicStore()
    const currentTrack = playbackQueue[queueIndex]

    // Auto-hide Logic
    const [visible, setVisible] = useState(true)

    useEffect(() => {
        const handleToggle = (e: CustomEvent) => setVisible(prev => !prev)
        window.addEventListener('toggle-toolbar', handleToggle as EventListener)
        return () => window.removeEventListener('toggle-toolbar', handleToggle as EventListener)
    }, [])

    useEffect(() => {
        let timeout: NodeJS.Timeout
        const resetTimer = () => {
            setVisible(true)
            clearTimeout(timeout)
            timeout = setTimeout(() => setVisible(false), 3000)
        }
        window.addEventListener('mousemove', resetTimer)
        resetTimer()
        return () => {
            clearTimeout(timeout)
            window.removeEventListener('mousemove', resetTimer)
        }
    }, [])

    return (
        <div
            className={cn(
                "fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800 z-50 transition-all duration-300",
                "h-auto pb-safe sm:h-20 flex flex-col sm:flex-row items-center justify-between px-4 py-2 sm:py-0 gap-2 sm:gap-4",
                visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 hover:translate-y-0 hover:opacity-100"
            )}
        >
            {/* ZONE 1: Navigation & Setlist */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-400 hover:text-white h-12 w-12">
                        <Home className="h-6 w-6" />
                    </Button>
                    <SetlistDrawer />
                </div>

                {/* Mobile Song Nav (Keep explicit here or move to component? Keeping explicit for simpler layout control on mobile) */}
                <div className="flex items-center gap-4 sm:hidden">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            const prev = prevSong()
                            if (prev) router.replace(`/perform/${prev.fileId}`)
                        }}
                        disabled={queueIndex <= 0}
                        className="text-white h-12 w-12"
                    >
                        <ChevronLeft className="h-8 w-8" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            const next = nextSong()
                            if (next) router.replace(`/perform/${next.fileId}`)
                        }}
                        disabled={queueIndex >= playbackQueue.length - 1}
                        className="text-white h-12 w-12"
                    >
                        <ChevronRight className="h-8 w-8" />
                    </Button>
                </div>
            </div>

            {/* ZONE 2: Performance Info & Metronome */}
            <div className="flex items-center gap-6 bg-zinc-900/50 rounded-xl px-6 py-2 border border-white/5 shadow-2xl backdrop-blur-sm">
                {/* Key Display */}
                <div className="flex flex-col items-center min-w-[4rem]">
                    <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">Key</span>
                    <span className="text-4xl font-black text-white leading-none">
                        {currentTrack?.key || "-"}
                    </span>
                </div>
                <div className="w-px h-12 bg-zinc-800" />
                <MetronomeControl />
            </div>

            {/* ZONE 3: Song Navigation (Desktop) */}
            <SongNavigation />

            {/* ZONE 4: Tools */}
            <div className="flex items-center gap-2 justify-end w-full sm:w-auto">
                <BackingTrackPlayer />

                {/* Tuner */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" className="text-zinc-400 hover:text-white px-3 font-bold uppercase text-xs tracking-wider" title="Tuner">
                            Tuner
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="end" side="top">
                        <Tuner />
                    </PopoverContent>
                </Popover>

                <TransposeControl />
            </div>
        </div>
    )
}
