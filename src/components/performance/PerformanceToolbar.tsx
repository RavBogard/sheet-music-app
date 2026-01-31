"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { BackingTrackPlayer } from "@/components/audio/BackingTrackPlayer"
import { Tuner } from "@/components/tools/Tuner"
import { Settings, Timer as MetronomeIcon, Music, Eye, EyeOff, Minus, Plus, Home, Sparkles, Loader2 } from "lucide-react"
import { TransposerMenu } from "../music/TransposerMenu"
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
    const { playbackQueue, queueIndex, nextSong, prevSong, aiState, setAiEnabled, capoFret } = useMusicStore()
    const currentTrack = playbackQueue[queueIndex]

    // Auto-hide Logic
    const [visible, setVisible] = useState(true)
    const [menuOpen, setMenuOpen] = useState(false)

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
            // Don't auto-hide if menu is open or scanning
            if (!menuOpen && aiState.scanningPages.length === 0) {
                timeout = setTimeout(() => setVisible(false), 3000)
            }
        }

        // If menu state or scanning state changes, trigger reset
        resetTimer()

        window.addEventListener('mousemove', resetTimer)
        return () => {
            clearTimeout(timeout)
            window.removeEventListener('mousemove', resetTimer)
        }
    }, [menuOpen, aiState.scanningPages.length])

    return (
        <div
            className={cn(
                "fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 transform",
                "h-32 lg:h-20 bg-zinc-950 border-t border-zinc-900 shadow-2xl shrink-0", // Increased height for mobile/tablet 2-row layout
                "flex flex-col lg:flex-row items-center justify-between", // Column on mobile/tablet, Row on desktop
                visible || menuOpen || aiState.scanningPages.length > 0 ? "translate-y-0" : "translate-y-full"
            )}
        >
            {/* --- MOBILE/TABLET TOP ROW: Navigation --- */}
            <div className="lg:hidden w-full h-1/2 flex items-center justify-center border-b border-zinc-900 bg-zinc-950/50">
                <SongNavigation />
            </div>

            {/* --- MAIN BAR (Mobile/Tablet Bottom Row / Desktop Full Bar) --- */}
            <div className="w-full h-1/2 lg:h-full flex items-center justify-between px-3 lg:px-6 relative">

                {/* LEFT ZONE: System & Navigation */}
                <div className="flex items-center gap-2 lg:gap-4 z-10">
                    <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-500 hover:text-white h-10 w-10 lg:h-12 lg:w-12 hover:bg-zinc-800 rounded-xl">
                        <Home className="h-5 w-5 lg:h-6 lg:w-6" />
                    </Button>
                    <SetlistDrawer />

                    {/* Tuner */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white h-10 w-10 lg:h-12 lg:w-12 hover:bg-zinc-800 rounded-xl" title="Tuner">
                                <span className="font-bold text-[10px] lg:text-xs">TUNE</span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="start" side="top">
                            <Tuner />
                        </PopoverContent>
                    </Popover>
                </div>

                {/* CENTER ZONE (Desktop): Song Navigation */}
                <div className="hidden lg:flex absolute left-0 right-0 justify-center pointer-events-none">
                    <div className="pointer-events-auto">
                        <SongNavigation />
                    </div>
                </div>

                {/* CENTER ZONE (Mobile/Tablet): Visual Metronome */}
                <div className="lg:hidden flex items-center justify-center absolute left-1/2 -translate-x-1/2">
                    <MetronomeControl />
                </div>

                {/* RIGHT ZONE: Tools */}
                <div className="flex items-center gap-2 lg:gap-4 z-10">

                    {/* Metronome Control (Desktop) - Swapped to Left of Transposer */}
                    <div className="hidden lg:flex items-center gap-1 lg:gap-2 bg-zinc-900/50 rounded-full p-1 border border-white/5">
                        <MetronomeControl />
                    </div>

                    {/* Transposer */}
                    <Popover open={menuOpen} onOpenChange={(open) => {
                        setMenuOpen(open)
                        if (open && !aiState.isEnabled) {
                            setAiEnabled(true)
                        }
                    }}>
                        <PopoverTrigger asChild>
                            <Button
                                variant={aiState.isEnabled ? "default" : "ghost"}
                                className={cn(
                                    "h-9 sm:h-10 px-3 rounded-lg transition-all font-semibold text-xs sm:text-sm",
                                    aiState.isEnabled ? "bg-purple-600 hover:bg-purple-500 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                                )}
                            >
                                {aiState.scanningPages.length > 0 ? (
                                    <>
                                        <Loader2 className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                                        Scan
                                    </>
                                ) : capoFret !== null && capoFret > 0 ? (
                                    <>
                                        <Sparkles className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4" />
                                        Capo {capoFret}
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4" />
                                        Transpose
                                    </>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0 bg-zinc-950 border-zinc-800" align="end" side="top">
                            <TransposerMenu />
                        </PopoverContent>
                    </Popover>

                    <BackingTrackPlayer />
                </div>
            </div>
        </div>
    )
}
