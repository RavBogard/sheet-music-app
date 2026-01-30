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
                "fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 transform",
                "h-24 sm:h-20 bg-zinc-950 border-t border-zinc-900 shadow-2xl shrink-0", // Increased height for mobile touch targets
                "flex flex-col sm:flex-row items-center justify-between px-2 sm:px-6",
                visible ? "translate-y-0" : "translate-y-full"
            )}
        >
            {/* ZONE 1: System (Left) */}
            <div className="flex-1 flex items-center justify-start gap-4 w-full sm:w-auto absolute top-2 left-2 sm:static sm:top-auto sm:left-auto">
                <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-500 hover:text-white h-12 w-12 hover:bg-zinc-800 rounded-xl">
                    <Home className="h-6 w-6" />
                </Button>
                <SetlistDrawer />

                {/* Tuner (Moved to Left) */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white h-12 w-12 hover:bg-zinc-800 rounded-xl" title="Tuner">
                            <span className="font-bold text-xs">TUNE</span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="start" side="top">
                        <Tuner />
                    </PopoverContent>
                </Popover>
            </div>

            {/* ZONE 2: Playback (Center) */}
            <div className="w-full sm:w-auto flex-2 flex justify-center mt-12 sm:mt-0 absolute left-0 right-0 top-0 sm:static pointer-events-none sm:pointer-events-auto">
                {/* Pointer events workaround to let clicks pass through to layer below if needed, but buttons need pointer-events-auto */}
                <div className="pointer-events-auto w-full flex justify-center transform sm:translate-y-0 translate-y-2">
                    <SongNavigation />
                </div>
            </div>

            {/* ZONE 3: Tools (Right) */}
            <div className="flex-1 flex items-center justify-end gap-1 sm:gap-4 w-full sm:w-auto absolute right-2 top-2 sm:static">
                {/* Hidden on very small screens? or adapt? */}
                <div className="hidden sm:flex items-center gap-1 sm:gap-2 bg-zinc-900/50 rounded-full p-1 border border-white/5">
                    <MetronomeControl />
                </div>

                <BackingTrackPlayer />

                <div className="flex items-center gap-2">
                    {/* TransposeControl Removed */}
                </div>
            </div>
        </div>
    )
}
