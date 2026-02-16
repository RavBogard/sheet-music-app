"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Tuner } from "@/components/tools/Tuner"
import { Settings, Timer as MetronomeIcon, Music, Eye, EyeOff, Minus, Plus, Home, Sparkles, Loader2, Speaker, Pencil } from "lucide-react"
import { TransposerMenu } from "../music/TransposerMenu"
import { estimateKey, transposeChord } from "@/lib/music-math"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SetlistDrawer } from "@/components/performance/SetlistDrawer"
import { MetronomeControl } from "./MetronomeControl"
import { SongNavigation } from "./SongNavigation"
import { QuickMonitorPanel } from "@/components/monitor/QuickMonitorPanel"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useAnnotationStore } from "@/lib/annotation-store"
import { AnnotationToolbar } from "@/components/music/AnnotationToolbar"
import { cn } from "@/lib/utils"
import { LiveIndicator } from "./LiveIndicator"

interface PerformanceToolbarProps {
    onHome: () => void
    onSetlist: () => void
}

export function PerformanceToolbar({ onHome, onSetlist }: PerformanceToolbarProps) {
    const router = useRouter()
    const { playbackQueue, queueIndex, nextSong, prevSong, aiState, setAiEnabled, capoFret, transposition } = useMusicStore()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()
    const { isAnnotating, setAnnotating } = useAnnotationStore()
    const currentTrack = playbackQueue[queueIndex]

    // Detected key for button display
    const detectedKey = useMemo(() => {
        const chords = Object.values(aiState.pageData).flatMap(
            p => p.chords.map((c: { originalText?: string; text: string }) => c.originalText || c.text)
        )
        if (chords.length === 0) return null
        return estimateKey(chords)
    }, [aiState.pageData])

    // Button label logic
    const buttonLabel = useMemo(() => {
        if (aiState.scanningPages.length > 0) return "Scan"
        if (capoFret !== null && capoFret > 0 && detectedKey) {
            return `Capo ${capoFret}`
        }
        if (transposition !== 0 && detectedKey) {
            const transposed = transposeChord(detectedKey, transposition)
            return `${detectedKey} → ${transposed}`
        }
        if (detectedKey) return detectedKey
        return "Transpose"
    }, [aiState.scanningPages.length, capoFret, transposition, detectedKey])

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

                {/* Monitor Quick Access */}
                {hasMonitorAccess && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <button className="h-9 px-3 sm:px-4 rounded-lg bg-zinc-900/80 border border-white/10 hover:bg-zinc-800 text-xs sm:text-sm font-semibold text-zinc-300 hover:text-white transition-all flex items-center gap-2 justify-center">
                                <Speaker className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Mix</span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="center" side="top">
                            <QuickMonitorPanel />
                        </PopoverContent>
                    </Popover>
                )}

                {/* Mobile Metronome */}
                <div className="flex items-center">
                    <MetronomeControl />
                </div>

                {/* Transposer */}
                <Popover onOpenChange={(open) => {
                    setMenuOpen(open)
                    if (open && !aiState.isEnabled) setTimeout(() => setAiEnabled(true), 0)
                }}>
                    <PopoverTrigger asChild>
                        <button
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
                                {buttonLabel}
                            </span>
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0 bg-zinc-950 border-zinc-800" align="end" side="top">
                        <TransposerMenu />
                    </PopoverContent>
                </Popover>
            </div>

            {/* --- MOBILE/TABLET BOTTOM ROW: Navigation --- */}
            <div className="lg:hidden w-full h-1/2 flex items-center justify-between px-2 relative">
                <div className="absolute left-2 z-10 flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-500 hover:text-white h-10 w-10 hover:bg-zinc-800 rounded-xl">
                        <Home className="h-5 w-5" />
                    </Button>
                    <Button
                        variant="ghost" size="icon"
                        onClick={() => setAnnotating(!isAnnotating)}
                        className={cn("h-10 w-10 rounded-xl", isAnnotating ? "text-amber-400 bg-amber-500/20" : "text-zinc-500 hover:text-white hover:bg-zinc-800")}
                        title="Annotate"
                    >
                        <Pencil className="h-4 w-4" />
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
                    <Button
                        variant="ghost" size="icon"
                        onClick={() => setAnnotating(!isAnnotating)}
                        className={cn("h-11 w-11 rounded-xl transition-all hover:scale-105", isAnnotating ? "text-amber-400 bg-amber-500/20" : "text-zinc-500 hover:text-white hover:bg-zinc-800")}
                        title="Annotate"
                    >
                        <Pencil className="h-5 w-5" />
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

                    {/* Monitor Quick Access */}
                    {hasMonitorAccess && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <button className="h-10 px-4 rounded-xl bg-zinc-900/50 border border-white/5 hover:bg-zinc-800 hover:border-white/10 text-xs font-bold text-zinc-400 hover:text-white transition-all flex items-center gap-2 group">
                                    <Speaker className="h-3.5 w-3.5" />
                                    MIX
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="end" side="top">
                                <QuickMonitorPanel />
                            </PopoverContent>
                        </Popover>
                    )}

                    <div className="w-px h-8 bg-zinc-800/50" />

                    {/* Metronome Control - Pill Scale */}
                    <div className="flex items-center">
                        <MetronomeControl />
                    </div>

                    {/* Transposer */}
                    <Popover onOpenChange={(open) => {
                    setMenuOpen(open)
                    if (open && !aiState.isEnabled) setTimeout(() => setAiEnabled(true), 0)
                }}>
                        <PopoverTrigger asChild>
                            <button
                                className={cn(
                                    "h-10 px-4 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 min-w-[100px] justify-center",
                                    aiState.isEnabled
                                        ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)] hover:bg-purple-500"
                                        : "bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-white/10"
                                )}
                            >
                                {aiState.scanningPages.length > 0 ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="h-3.5 w-3.5" />
                                )}
                                <span>{buttonLabel.toUpperCase()}</span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0 bg-zinc-950 border-zinc-800" align="end" side="top">
                            <TransposerMenu />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {/* D2: Annotation toolbar (shown when annotating) */}
            {isAnnotating && (
                <AnnotationToolbar
                    currentPage={1}
                    onClose={() => setAnnotating(false)}
                />
            )}
        </div>
    )
}
