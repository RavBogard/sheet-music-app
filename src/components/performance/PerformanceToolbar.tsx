"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Tuner } from "@/components/tools/Tuner"
import { Home, Sparkles, Loader2, Speaker, Pencil, Wrench } from "lucide-react"
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

interface PerformanceToolbarProps {
    onHome: () => void
    onSetlist: () => void
    onMenuOpenChange?: (open: boolean) => void
}

export function PerformanceToolbar({ onHome, onSetlist, onMenuOpenChange }: PerformanceToolbarProps) {
    const router = useRouter()
    const { playbackQueue, queueIndex, nextSong, prevSong, aiState, setAiEnabled, capoFret, transposition, currentVisiblePage } = useMusicStore()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()
    const { isAnnotating, setAnnotating } = useAnnotationStore()

    // Track which popovers are open to keep bars visible
    const [openPopovers, setOpenPopovers] = useState<Set<string>>(new Set())

    const trackPopover = useCallback((id: string, open: boolean) => {
        setOpenPopovers(prev => {
            const next = new Set(prev)
            if (open) next.add(id)
            else next.delete(id)
            return next
        })
    }, [])

    // Notify parent of menu state
    useEffect(() => {
        onMenuOpenChange?.(openPopovers.size > 0)
    }, [openPopovers.size, onMenuOpenChange])

    // Detected key for button display
    const detectedKey = useMemo(() => {
        const chords = Object.values(aiState.pageData).flatMap(
            p => p.chords.map((c: { originalText?: string; text: string }) => c.originalText || c.text)
        )
        if (chords.length === 0) return null
        return estimateKey(chords)
    }, [aiState.pageData])

    // Transposer button label
    const buttonLabel = useMemo(() => {
        if (aiState.scanningPages.length > 0) return "Scan"
        if (capoFret !== null && capoFret > 0 && detectedKey) return `Capo ${capoFret}`
        if (transposition !== 0 && detectedKey) {
            return `${detectedKey} → ${transposeChord(detectedKey, transposition)}`
        }
        if (detectedKey) return detectedKey
        return "Transpose"
    }, [aiState.scanningPages.length, capoFret, transposition, detectedKey])

    return (
        <div className="bg-zinc-950 border-t border-zinc-900 shadow-2xl shrink-0">

            {/* ── MOBILE/TABLET: Two-row layout ── */}
            <div className="lg:hidden w-full">

                {/* Row 1 (top): Annotate + Metronome + Tools + Transposer */}
                <div className="w-full h-11 flex items-center justify-between px-3 border-b border-zinc-900/50">

                    {/* Left: Annotate */}
                    <Button
                        variant="ghost" size="icon"
                        onClick={() => setAnnotating(!isAnnotating)}
                        className={cn("h-9 w-9 rounded-xl", isAnnotating ? "text-amber-400 bg-amber-500/20" : "text-zinc-500 hover:text-white hover:bg-zinc-800")}
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>

                    {/* Right: Metronome + Tools + Transposer */}
                    <div className="flex items-center gap-2">

                        {/* Metronome */}
                        <MetronomeControl />

                        {/* Tools popover */}
                        <Popover onOpenChange={(open) => trackPopover('tools', open)}>
                            <PopoverTrigger asChild>
                                <button className="h-9 px-3 rounded-lg bg-zinc-900/80 border border-white/10 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-all flex items-center gap-1.5">
                                    <Wrench className="h-3.5 w-3.5" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-3 bg-zinc-950 border-zinc-800 space-y-3" align="end" side="top">
                                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-1">Tools</div>
                                <Tuner />
                                {hasMonitorAccess && (
                                    <>
                                        <div className="border-t border-zinc-800" />
                                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-1 flex items-center gap-1.5">
                                            <Speaker className="h-3 w-3" /> Monitor Mix
                                        </div>
                                        <QuickMonitorPanel />
                                    </>
                                )}
                            </PopoverContent>
                        </Popover>

                        {/* Transposer */}
                        <Popover onOpenChange={(open) => {
                            trackPopover('transposer', open)
                            if (open && !aiState.isEnabled) setTimeout(() => setAiEnabled(true), 0)
                        }}>
                            <PopoverTrigger asChild>
                                <button
                                    className={cn(
                                        "h-9 px-3 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5",
                                        aiState.isEnabled
                                            ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)]"
                                            : "bg-zinc-900/80 border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-800"
                                    )}
                                >
                                    {aiState.scanningPages.length > 0 ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                                    ) : (
                                        <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                    )}
                                    <span className="truncate max-w-[90px]">{buttonLabel}</span>
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-0 bg-zinc-950 border-zinc-800" align="end" side="top">
                                <TransposerMenu />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* Row 2 (bottom): Home + Song Navigation (centered) + Setlist */}
                <div className="w-full h-14 flex items-center px-2">

                    {/* Home — fixed width left */}
                    <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-400 hover:text-white h-12 w-12 hover:bg-zinc-800 rounded-xl shrink-0">
                        <Home className="h-6 w-6" />
                    </Button>

                    {/* Song Navigation — centered absolutely */}
                    <div className="flex-1 flex justify-center min-w-0">
                        <SongNavigation />
                    </div>

                    {/* Setlist drawer — fixed width right */}
                    <div className="shrink-0">
                        <SetlistDrawer />
                    </div>
                </div>
            </div>

            {/* ── DESKTOP: Single row ── */}
            <div className="hidden lg:flex w-full h-16 items-center justify-between px-6 relative">

                {/* LEFT: System & Navigation */}
                <div className="flex items-center gap-3 z-10 w-1/4">
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

                {/* CENTER: Song Navigation */}
                <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
                    <div className="pointer-events-auto">
                        <SongNavigation />
                    </div>
                </div>

                {/* RIGHT: Tools + Transposer */}
                <div className="flex items-center justify-end gap-3 z-10 w-1/4">

                    {/* Tools popover: Tuner + Mix */}
                    <Popover onOpenChange={(open) => trackPopover('tools-desktop', open)}>
                        <PopoverTrigger asChild>
                            <button className="h-10 px-4 rounded-xl bg-zinc-900/50 border border-white/5 hover:bg-zinc-800 hover:border-white/10 text-xs font-bold text-zinc-400 hover:text-white transition-all flex items-center gap-2 group">
                                <Wrench className="h-3.5 w-3.5" />
                                TOOLS
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3 bg-zinc-950 border-zinc-800 space-y-3" align="end" side="top">
                            {/* Tuner */}
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-1">Tuner</div>
                            <Tuner />
                            {/* Mix */}
                            {hasMonitorAccess && (
                                <>
                                    <div className="border-t border-zinc-800" />
                                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-1 flex items-center gap-1.5">
                                        <Speaker className="h-3 w-3" /> Monitor Mix
                                    </div>
                                    <QuickMonitorPanel />
                                </>
                            )}
                        </PopoverContent>
                    </Popover>

                    <div className="w-px h-8 bg-zinc-800/50" />

                    {/* Metronome */}
                    <div className="flex items-center">
                        <MetronomeControl />
                    </div>

                    {/* Transposer */}
                    <Popover onOpenChange={(open) => {
                        trackPopover('transposer-desktop', open)
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

            {/* Annotation toolbar overlay */}
            {isAnnotating && (
                <AnnotationToolbar
                    currentPage={currentVisiblePage}
                    onClose={() => setAnnotating(false)}
                />
            )}
        </div>
    )
}
