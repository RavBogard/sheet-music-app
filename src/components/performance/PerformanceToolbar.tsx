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
                "h-32 lg:h-20 bg-zinc-950 border-t border-zinc-900 shadow-2xl shrink-0",
                "flex flex-col lg:flex-row items-center justify-between",
                visible || menuOpen || aiState.scanningPages.length > 0 ? "translate-y-0" : "translate-y-full"
            )}
        >
            {/* --- MOBILE/TABLET TOP ROW: Tools --- */}
            <div className="lg:hidden w-full h-1/2 flex items-center justify-center gap-2 sm:gap-4 border-b border-zinc-900 bg-zinc-900/30 px-4">
                <SetlistDrawer />

                {/* Tuner */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white h-10 w-10 hover:bg-zinc-800 rounded-xl" title="Tuner">
                            <span className="font-bold text-[10px]">TUNE</span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="center" side="top">
                        <Tuner />
                    </PopoverContent>
                </Popover>

                {/* Mobile Metronome (Icon Only/Small) */}
                <MetronomeControl />

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
                                "h-9 w-9 sm:h-10 sm:w-auto sm:px-3 rounded-lg transition-all font-semibold text-xs sm:text-sm p-0 sm:min-w-0",
                                aiState.isEnabled ? "bg-purple-600 hover:bg-purple-500 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                            )}
                        >
                            {aiState.scanningPages.length > 0 ? (
                                <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" />
                            ) : capoFret !== null && capoFret > 0 ? (
                                <Sparkles className="h-4 w-4 sm:mr-1.5" />
                            ) : (
                                <Sparkles className="h-4 w-4 sm:mr-1.5" />
                            )}
                            <span className="hidden sm:inline">
                                {aiState.scanningPages.length > 0 ? "Scan" : (capoFret !== null && capoFret > 0 ? `Capo ${capoFret}` : "Transpose")}
                            </span>
                        </Button>
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

                <div className="w-full flex justify-center">
                    <SongNavigation />
                </div>
            </div>


            {/* --- DESKTOP VIEW (Hidden on Mobile) --- */}
            <div className="hidden lg:flex w-full h-full items-center justify-between px-6 relative">

                {/* LEFT ZONE: System & Navigation */}
                <div className="flex items-center gap-4 z-10">
                    <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-500 hover:text-white h-12 w-12 hover:bg-zinc-800 rounded-xl">
                        <Home className="h-6 w-6" />
                    </Button>
                    <SetlistDrawer />

                    {/* Tuner */}
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

                {/* CENTER ZONE: Song Navigation */}
                <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
                    <div className="pointer-events-auto">
                        <SongNavigation />
                    </div>
                </div>

                {/* RIGHT ZONE: Tools */}
                <div className="flex items-center gap-4 z-10">

                    {/* Metronome Control */}
                    <div className="flex items-center gap-2 bg-zinc-900/50 rounded-full p-1 border border-white/5">
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
                                    "h-10 px-3 rounded-lg transition-all font-semibold text-sm",
                                    aiState.isEnabled ? "bg-purple-600 hover:bg-purple-500 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                                )}
                            >
                                {aiState.scanningPages.length > 0 ? (
                                    <>
                                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                        Scan
                                    </>
                                ) : capoFret !== null && capoFret > 0 ? (
                                    <>
                                        <Sparkles className="mr-1.5 h-4 w-4" />
                                        Capo {capoFret}
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-1.5 h-4 w-4" />
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
