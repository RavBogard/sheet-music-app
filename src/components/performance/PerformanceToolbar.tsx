"use client"

import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Sparkles, Loader2, Speaker, ZoomIn, ZoomOut, X, List, Settings, Printer } from "lucide-react"
import { TransposerMenu } from "../music/TransposerMenu"
import { ChordEditBar } from "../music/ChordEditBar"
import { estimateKey, transposeChord } from "@/lib/music-math"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SetlistDrawer } from "@/components/performance/SetlistDrawer"
import { MetronomeControl } from "./MetronomeControl"
import { SongNavigation } from "./SongNavigation"
import { QuickMonitorPanel } from "@/components/monitor/QuickMonitorPanel"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { cn } from "@/lib/utils"

interface PerformanceToolbarProps {
    onHome: () => void
    onMenuOpenChange?: (open: boolean) => void
    onPrint?: () => void
}

export function PerformanceToolbar({ onHome, onMenuOpenChange, onPrint }: PerformanceToolbarProps) {
    const {
        aiState, setAiEnabled, capoFret, transposition, zoom, setZoom
    } = useMusicStore()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()
    const { isBandLeader, isAdmin, isMusician } = useAuth()
    const params = useParams()
    const router = useRouter()
    
    const setlistId = params?.id as string | undefined

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

    // ── Shared sub-components ──

    const printButton = (compact = false) => {
        const canPrint = isBandLeader || isAdmin || isMusician
        if (!canPrint || !onPrint) return null
        return (
            <Button
                variant="ghost"
                onClick={onPrint}
                className={cn(
                    "glass-card text-foreground/80 hover:text-foreground fluid-interaction rounded-xl flex items-center gap-2",
                    compact ? "h-12 px-4 shrink-0" : "h-11 px-3 shrink-0"
                )}
                title="Print Gig Packet"
            >
                <Printer className={compact ? "h-5 w-5" : "h-4 w-4"} />
                {!compact && <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Print</span>}
            </Button>
        )
    }

    const editButton = (compact = false) => {
        if (!isBandLeader || !setlistId) return null
        return (
            <Button
                variant="ghost"
                onClick={() => router.push(`/setlists/${setlistId}`)}
                className={cn(
                    "glass-card text-foreground/80 hover:text-foreground fluid-interaction rounded-xl flex items-center gap-2",
                    compact ? "h-12 px-4 shrink-0" : "h-11 px-3 shrink-0"
                )}
                title="Edit Setlist"
            >
                <Settings className={compact ? "h-5 w-5" : "h-4 w-4"} />
                {!compact && <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Edit</span>}
            </Button>
        )
    }

    const zoomControls = (compact = false) => (
        <div className={cn(
            "flex items-center bg-muted/50 border border-border/10 rounded-xl p-1 gap-1",
            compact ? "h-12" : "h-11"
        )}>
            <Button
                variant="ghost" size="icon"
                onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                className={cn(
                    "text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg",
                    compact ? "h-11 w-11" : "h-10 w-10"
                )}
                aria-label="Zoom out"
            >
                <ZoomOut className={compact ? "h-5 w-5" : "h-4 w-4"} />
            </Button>
            <span className={cn(
                "font-medium text-foreground text-center",
                compact ? "text-xs w-10" : "text-xs w-10"
            )}>
                {Math.round(zoom * 100)}%
            </span>
            <Button
                variant="ghost" size="icon"
                onClick={() => setZoom(Math.min(2.0, zoom + 0.1))}
                className={cn(
                    "text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg",
                    compact ? "h-11 w-11" : "h-10 w-10"
                )}
                aria-label="Zoom in"
            >
                <ZoomIn className={compact ? "h-5 w-5" : "h-4 w-4"} />
            </Button>
        </div>
    )



    const monitorPopover = (id: string, compact = false, side: "top" | "left" = "top") => (
        <Popover onOpenChange={(open) => trackPopover(id, open)}>
            <PopoverTrigger asChild>
                <Button variant="ghost" className={cn(
                    "rounded-xl fluid-interaction glass-card text-foreground/80 hover:text-foreground flex items-center gap-1.5",
                    compact ? "h-11 px-3 text-xs font-semibold" : "h-10 px-4 text-xs font-bold gap-2 group"
                )} aria-label="Monitor mix">
                    <Speaker className="h-3.5 w-3.5" />
                    <span>{compact ? "Monitor" : "MONITOR"}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover border-border space-y-3" align={side === "left" ? "start" : "center"} side={side}>
                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider px-1 flex items-center gap-1.5">
                    <Speaker className="h-3 w-3" /> Monitor Mix
                </div>
                {hasMonitorAccess ? (
                    <QuickMonitorPanel />
                ) : (
                    <div className="text-xs text-muted-foreground/60 px-1 py-2">No monitor connected</div>
                )}
            </PopoverContent>
        </Popover>
    )

    const transposerPopover = (
        openState: boolean,
        setOpenState: (open: boolean) => void,
        id: string,
        compact = false,
        side: "top" | "left" = "top"
    ) => (
        <Popover open={openState} onOpenChange={(open) => {
            setOpenState(open)
            trackPopover(id, open)
            if (open && !aiState.isEnabled) setTimeout(() => setAiEnabled(true), 0)
        }}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    className={cn(
                        "rounded-xl font-semibold fluid-interaction flex items-center",
                        compact
                            ? "h-11 px-3 text-xs gap-1.5"
                            : "h-10 px-4 text-xs font-bold gap-2 min-w-[100px] justify-center",
                        aiState.isEnabled
                            ? "bg-brand border border-brand/50 text-foreground shadow-lg shadow-brand/20"
                            : "glass-card text-foreground/80 hover:text-foreground"
                    )}
                >
                    {aiState.scanningPages.length > 0 ? (
                        <Loader2 className={cn("animate-spin shrink-0", compact ? "h-4 w-4" : "h-3.5 w-3.5")} />
                    ) : (
                        <Sparkles className={cn("shrink-0", compact ? "h-4 w-4" : "h-3.5 w-3.5")} />
                    )}
                    <span className="truncate">{compact ? buttonLabel : buttonLabel.toUpperCase()}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-w-[85vw] p-0 bg-popover border-border" align={side === "left" ? "start" : "end"} side={side}>
                <TransposerMenu onRequestClose={() => setOpenState(false)} />
            </PopoverContent>
        </Popover>
    )

    // ── BOTTOM BAR LAYOUT (all viewports) ──
    return (
        <div className="material-thick border-t-0 shrink-0 pb-safe shadow-2xl">

            {/* ── MOBILE: Two-row layout (< md) ── */}
            <div className="md:hidden w-full">

                {/* Row 1 (top): Zoom | Annotate | Metronome | Audio | Transposer */}
                <div className="w-full h-14 flex items-center justify-between px-3 border-b border-brand/10">

                    {/* Zoom controls (compact) */}
                    {zoomControls(true)}

                    {/* Metronome */}
                    <MetronomeControl />

                    {/* Monitor Mix popover */}
                    {monitorPopover('tools', true)}

                    {/* Transposer */}
                    {transposerPopover(transposerOpenMobile, setTransposerOpenMobile, 'transposer', true)}
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
                    <div className="shrink-0 flex items-center gap-1">
                        {printButton(true)}
                        {editButton(true)}
                        <SetlistDrawer />
                    </div>
                </div>
            </div>

            {/* ── TABLET: Single row (md to lg) ── */}
            <div className="hidden md:flex lg:hidden w-full h-16 items-center justify-between px-4 relative">
                {/* LEFT: Exit + Zoom + Setlist */}
                <div className="flex items-center gap-2 z-10">
                    <Button variant="ghost" onClick={onHome} className="h-11 px-3 glass-card text-foreground/80 hover:text-foreground fluid-interaction rounded-xl shrink-0 flex items-center gap-2" title="Exit Gig Mode">
                        <X className="h-5 w-5" />
                        <span className="text-xs font-bold uppercase tracking-wider">Exit</span>
                    </Button>
                    {zoomControls(false)}
                    {printButton(true)}
                    {editButton(false)}
                    <SetlistDrawer />
                </div>

                {/* CENTER: Song Navigation */}
                <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
                    <div className="pointer-events-auto">
                        <SongNavigation />
                    </div>
                </div>

                {/* RIGHT: Sync + Monitor + Metronome + Transposer */}
                <div className="flex items-center gap-2 z-10">
                    {monitorPopover('tools-tablet', true)}
                    <MetronomeControl />
                    {transposerPopover(transposerOpenDesktop, setTransposerOpenDesktop, 'transposer-tablet', true)}
                </div>
            </div>

            {/* ── DESKTOP: Single row (≥ lg) ── */}
            <div className="hidden lg:flex w-full h-16 items-center justify-between px-6 relative">

                {/* LEFT: System & Navigation */}
                <div className="flex items-center gap-3 z-10 w-1/4">
                    <Button variant="ghost" onClick={onHome} className="h-11 px-4 glass-card text-foreground/80 hover:text-foreground fluid-interaction rounded-xl flex items-center gap-2" title="Exit Gig Mode">
                        <X className="h-5 w-5" />
                        <span className="text-xs font-bold uppercase tracking-wider">Exit</span>
                    </Button>

                    {/* Scale Controls */}
                    {zoomControls(false)}

                    {printButton(false)}
                    {editButton(false)}
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
                    {monitorPopover('tools-desktop', false)}

                    <div className="w-px h-8 bg-border/50" />

                    {/* Metronome */}
                    <div className="flex items-center">
                        <MetronomeControl />
                    </div>

                    {/* Transposer */}
                    {transposerPopover(transposerOpenDesktop, setTransposerOpenDesktop, 'transposer-desktop', false)}
                </div>
            </div>

            {/* Chord edit floating bar */}
            <ChordEditBar />
        </div>
    )
}
