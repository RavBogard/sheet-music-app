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
            // User requested 10 seconds timeout
            if (!menuOpen && aiState.scanningPages.length === 0 && !aiState.isEnabled) {
                timeout = setTimeout(() => setVisible(false), 10000)
            }
        }

        // If menu state or scanning state changes, trigger reset
        resetTimer()

        window.addEventListener('mousemove', resetTimer)
        window.addEventListener('click', resetTimer)
        window.addEventListener('touchstart', resetTimer)
        return () => {
            clearTimeout(timeout)
            window.removeEventListener('mousemove', resetTimer)
            window.removeEventListener('click', resetTimer)
            window.removeEventListener('touchstart', resetTimer)
        }
    }, [menuOpen, aiState.scanningPages.length, aiState.isEnabled])

    return (
        <div
            className={cn(
                "fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 transform",
                "h-32 lg:h-20 bg-zinc-950 border-t border-zinc-900 shadow-2xl shrink-0",
                "flex flex-col lg:flex-row items-center justify-between",
                visible || menuOpen || aiState.isEnabled || aiState.scanningPages.length > 0 ? "translate-y-0" : "translate-y-full"
            )}
        >
            {/* --- MOBILE/TABLET TOP ROW: Tools --- */}
            <div className="lg:hidden w-full h-1/2 flex items-center justify-evenly gap-2 sm:gap-4 border-b border-zinc-900 bg-zinc-900/30 px-2 sm:px-6">

                {/* Tuner */}
                <Popover>
                    <PopoverTrigger asChild>
                        <button className="h-9 px-3 sm:px-4 rounded-lg bg-zinc-900/80 border border-white/10 hover:bg-zinc-800 text-xs sm:text-sm font-semibold text-zinc-300 hover:text-white transition-all flex items-center gap-2 min-w-[80px] sm:min-w-[100px] justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                            <span>Tune</span>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="center" side="top">
                        <Tuner />
                    </PopoverContent>
                </Popover>

                {/* Mobile Metronome */}
                <div className="flex items-center">
                    <MetronomeControl />
                </div>

                {/* Transposer */}
                <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                    <PopoverTrigger asChild>
                        <button
                            onClick={() => { if (!aiState.isEnabled) setAiEnabled(true) }}
                            className={cn(
                                "h-9 px-3 sm:px-4 rounded-lg border text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 min-w-[100px] sm:min-w-[140px] justify-center",
                                aiState.isEnabled
                                    ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)]"
                                    : "bg-zinc-900/80 border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800"
                            )}
                        >
                            {aiState.scanningPages.length > 0 ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                            )}
                            <span>
                                {aiState.scanningPages.length > 0 ? "Scan" : (capoFret !== null && capoFret > 0 ? `Capo ${capoFret}` : "Transpose")}
                            </span>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0 bg-zinc-950 border-zinc-800" align="end" side="top">
                        <TransposerMenu />
                    </PopoverContent>
                </Popover>

                <BackingTrackPlayer />
            </div>

            {/* --- MOBILE/TABLET BOTTOM ROW: Navigation --- */}
            <div className="lg:hidden w-full h-1/2 flex items-center justify-between px-2 relative">
                <div className="absolute left-2 z-10">
                    <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-500 hover:text-white h-10 w-10 hover:bg-zinc-800 rounded-xl">
                        <Home className="h-5 w-5" />
                    </Button>
                </div>

                <div className="w-full flex justify-center pointer-events-none">
                    <div className="pointer-events-auto">
                        <SongNavigation />
                    </div>
                </div>

                <div className="absolute right-2 z-10">
                    <SetlistDrawer />
                </div>
            </div>


            {/* --- DESKTOP VIEW (Hidden on Mobile) --- */}
            <div className="hidden lg:flex w-full h-full items-center justify-between px-6 relative">

                {/* LEFT ZONE: System & Navigation */}
                <div className="flex items-center gap-4 z-10 w-1/4">
                    <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-500 hover:text-white h-11 w-11 hover:bg-zinc-800 rounded-xl transition-all hover:scale-105" title="Home">
                        <Home className="h-6 w-6" />
                    </Button>
                    <SetlistDrawer />
                </div>

                {/* CENTER ZONE: Song Navigation */}
                <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
                    <div className="pointer-events-auto">
                        <SongNavigation />
                    </div>
                </div>

                {/* RIGHT ZONE: Tools (Tuner, Metronome, Transposer, Tracks) */}
                <div className="flex items-center justify-end gap-3 z-10 w-1/4">

                    {/* Tuner */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <button className="h-10 px-4 rounded-xl bg-zinc-900/50 border border-white/5 hover:bg-zinc-800 hover:border-white/10 text-xs font-bold text-zinc-400 hover:text-white transition-all flex items-center gap-2 group">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500/50 group-hover:bg-green-400 transition-colors" />
                                TUNE
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="center" side="top">
                            <Tuner />
                        </PopoverContent>
                    </Popover>

                    <div className="w-px h-8 bg-zinc-800/50" />

                    {/* Metronome Control - Pill Scale */}
                    <div className="flex items-center">
                        <MetronomeControl />
                    </div>

                    {/* Transposer */}
                    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                        <PopoverTrigger asChild>
                            <button
                                onClick={() => { if (!aiState.isEnabled) setAiEnabled(true) }}
                                className={cn(
                                    "h-10 px-4 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 min-w-[100px] justify-center",
                                    aiState.isEnabled
                                        ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)] hover:bg-purple-500"
                                        : "bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-white/10"
                                )}
                            >
                                {aiState.scanningPages.length > 0 ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        <span>SCANNING</span>
                                    </>
                                ) : capoFret !== null && capoFret > 0 ? (
                                    <>
                                        <Sparkles className="h-3.5 w-3.5" />
                                        <span>CAPO {capoFret}</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-3.5 w-3.5" />
                                        <span>KEY / CAPO</span>
                                    </>
                                )}
                            </button>
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
