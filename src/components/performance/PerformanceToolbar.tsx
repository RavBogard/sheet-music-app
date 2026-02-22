"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Home, Sparkles, Loader2, Speaker, Pencil, ZoomIn, ZoomOut, X } from "lucide-react"
import { TransposerMenu, ChordEditBar } from "../music/TransposerMenu"
import { estimateKey, transposeChord } from "@/lib/music-math"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SetlistDrawer } from "@/components/performance/SetlistDrawer"
import { MetronomeControl } from "./MetronomeControl"
import { SongNavigation } from "./SongNavigation"
import { QuickMonitorPanel } from "@/components/monitor/QuickMonitorPanel"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { useAnnotationStore } from "@/lib/annotation-store"
import { AnnotationToolbar } from "@/components/music/AnnotationToolbar"
import { cn } from "@/lib/utils"

interface PerformanceToolbarProps {
    onHome: () => void
    onMenuOpenChange?: (open: boolean) => void
}

export function PerformanceToolbar({ onHome, onMenuOpenChange }: PerformanceToolbarProps) {
    const { aiState, setAiEnabled, capoFret, transposition, currentVisiblePage, zoom, setZoom } = useMusicStore()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()
    const { isAnnotating, setAnnotating } = useAnnotationStore()

    // Establish WebSocket connection immediately so the bridge is 
    // ready *before* the user opens the Audio popover (zero latency).
    useMonitorConnection()

    // Track which popovers are open to keep bars visible
    const [openPopovers, setOpenPopovers] = useState<Set<string>>(new Set())
    // Separate state for mobile vs desktop transposer — sharing one controlled
    // state across two Radix Popovers causes their dismiss layers to conflict
    // (the hidden breakpoint's portal fires onOpenChange(false) immediately)
    const [transposerOpenMobile, setTransposerOpenMobile] = useState(false)
    const [transposerOpenDesktop, setTransposerOpenDesktop] = useState(false)

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
        <div className="glass border-t-0 shrink-0 pb-safe">

            {/* ── MOBILE/TABLET: Two-row layout ── */}
            <div className="lg:hidden w-full">

                {/* Row 1 (top): Annotate | Metronome | Audio | Transposer — evenly spread */}
                <div className="w-full h-11 flex items-center justify-between px-3 border-b border-border/30">

                    {/* Annotate */}
                    <Button
                        variant="ghost" size="icon"
                        onClick={() => setAnnotating(!isAnnotating)}
                        className={cn("h-9 w-9 rounded-xl", isAnnotating ? "text-amber-400 bg-amber-500/20" : "text-zinc-500 hover:text-white hover:bg-zinc-800")}
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>

                    {/* Metronome */}
                    <MetronomeControl />

                    {/* Monitor Mix popover */}
                    <Popover onOpenChange={(open) => trackPopover('tools', open)}>
                        <PopoverTrigger asChild>
                            <button className="h-9 px-3 rounded-xl fluid-interaction glass-card text-xs font-semibold text-foreground/80 hover:text-foreground flex items-center gap-1.5" aria-label="Audio monitor mix">
                                <Speaker className="h-3.5 w-3.5" />
                                <span>Audio</span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3 bg-zinc-950 border-zinc-800 space-y-3" align="center" side="top">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-1 flex items-center gap-1.5">
                                <Speaker className="h-3 w-3" /> Monitor Mix
                            </div>
                            {hasMonitorAccess ? (
                                <QuickMonitorPanel />
                            ) : (
                                <div className="text-xs text-zinc-600 px-1 py-2">No monitor connected</div>
                            )}
                        </PopoverContent>
                    </Popover>

                    {/* Transposer */}
                    <Popover open={transposerOpenMobile} onOpenChange={(open) => {
                        setTransposerOpenMobile(open)
                        trackPopover('transposer', open)
                        if (open && !aiState.isEnabled) setTimeout(() => setAiEnabled(true), 0)
                    }}>
                        <PopoverTrigger asChild>
                            <button
                                className={cn(
                                    "h-9 px-3 rounded-xl text-xs font-semibold fluid-interaction flex items-center gap-1.5",
                                    aiState.isEnabled
                                        ? "bg-blue-600 border border-blue-500/50 text-white shadow-lg shadow-blue-900/20"
                                        : "glass-card text-foreground/80 hover:text-foreground"
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
                            <TransposerMenu onRequestClose={() => setTransposerOpenMobile(false)} />
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Row 2 (bottom): Home + Song Navigation (centered) + Setlist */}
                <div className="w-full h-14 flex items-center px-2">
                    <Button variant="ghost" onClick={onHome} className="h-12 px-4 glass-card text-foreground/80 hover:text-foreground fluid-interaction rounded-xl shrink-0 flex items-center gap-2">
                        <X className="h-5 w-5" />
                        <span className="text-xs font-bold uppercase tracking-wider">Exit</span>
                    </Button>
                    <div className="flex-1 flex justify-center min-w-0">
                        <SongNavigation />
                    </div>
                    <div className="shrink-0">
                        <SetlistDrawer />
                    </div>
                </div>
            </div>

            {/* ── DESKTOP: Single row ── */}
            <div className="hidden lg:flex w-full h-16 items-center justify-between px-6 relative">

                {/* LEFT: System & Navigation */}
                <div className="flex items-center gap-3 z-10 w-1/4">
                    <Button variant="ghost" onClick={onHome} className="h-11 px-4 glass-card text-foreground/80 hover:text-foreground fluid-interaction rounded-xl flex items-center gap-2" title="Exit Gig Mode">
                        <X className="h-5 w-5" />
                        <span className="text-xs font-bold uppercase tracking-wider">Exit</span>
                    </Button>
                    <Button
                        variant="ghost" size="icon"
                        onClick={() => setAnnotating(!isAnnotating)}
                        className={cn("h-11 w-11 rounded-xl transition-all hover:scale-105", isAnnotating ? "text-amber-400 bg-amber-500/20" : "text-zinc-500 hover:text-white hover:bg-zinc-800")}
                        title="Annotate"
                    >
                        <Pencil className="h-5 w-5" />
                    </Button>

                    {/* Scale Controls */}
                    <div className="flex items-center bg-zinc-900/50 border border-white/5 rounded-xl p-1 gap-1 h-11">
                        <Button
                            variant="ghost" size="icon"
                            onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                            className="h-9 w-9 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg"
                            title="Zoom Out"
                        >
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <span className="text-xs font-medium text-zinc-300 w-10 text-center">
                            {Math.round(zoom * 100)}%
                        </span>
                        <Button
                            variant="ghost" size="icon"
                            onClick={() => setZoom(Math.min(2.0, zoom + 0.1))}
                            className="h-9 w-9 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg"
                            title="Zoom In"
                        >
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                    </div>

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

                    {/* Monitor Mix popover */}
                    <Popover onOpenChange={(open) => trackPopover('tools-desktop', open)}>
                        <PopoverTrigger asChild>
                            <button className="h-10 px-4 rounded-xl glass-card fluid-interaction text-xs font-bold text-foreground/80 hover:text-foreground flex items-center gap-2 group" aria-label="Audio monitor mix">
                                <Speaker className="h-3.5 w-3.5" />
                                AUDIO
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3 bg-zinc-950 border-zinc-800 space-y-3" align="end" side="top">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-1 flex items-center gap-1.5">
                                <Speaker className="h-3 w-3" /> Monitor Mix
                            </div>
                            {hasMonitorAccess ? (
                                <QuickMonitorPanel />
                            ) : (
                                <div className="text-xs text-zinc-600 px-1 py-2">No monitor connected</div>
                            )}
                        </PopoverContent>
                    </Popover>

                    <div className="w-px h-8 bg-zinc-800/50" />

                    {/* Metronome */}
                    <div className="flex items-center">
                        <MetronomeControl />
                    </div>

                    {/* Transposer */}
                    <Popover open={transposerOpenDesktop} onOpenChange={(open) => {
                        setTransposerOpenDesktop(open)
                        trackPopover('transposer-desktop', open)
                        if (open && !aiState.isEnabled) setTimeout(() => setAiEnabled(true), 0)
                    }}>
                        <PopoverTrigger asChild>
                            <button
                                className={cn(
                                    "h-10 px-4 rounded-xl text-xs font-bold fluid-interaction flex items-center gap-2 min-w-[100px] justify-center",
                                    aiState.isEnabled
                                        ? "bg-blue-600 border border-blue-500/50 text-white shadow-lg shadow-blue-900/20"
                                        : "glass-card text-foreground/80 hover:text-foreground"
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
                            <TransposerMenu onRequestClose={() => setTransposerOpenDesktop(false)} />
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

            {/* Chord edit floating bar */}
            <ChordEditBar />
        </div>
    )
}
