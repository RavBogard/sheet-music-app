"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Sparkles, Loader2, Speaker, Pencil, ZoomIn, ZoomOut, X } from "lucide-react"
import { TransposerMenu, ChordEditBar } from "../music/TransposerMenu"
import { estimateKey, transposeChord } from "@/lib/music-math"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SetlistDrawer } from "@/components/performance/SetlistDrawerLegacy"
import { MetronomeControl } from "./MetronomeControl"
import { SongNavigation } from "./SongNavigation"
import { QuickMonitorPanel } from "@/components/monitor/QuickMonitorPanel"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { useAnnotationStore } from "@/lib/annotation-store"
import { AnnotationToolbar } from "@/components/music/AnnotationToolbar"
import { cn } from "@/lib/utils"
import { LiveSession, subscribeToLiveSessions } from "@/lib/live-session-firebase"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { Link as LinkIcon, Unlink } from "lucide-react"

interface PerformanceToolbarProps {
    onHome: () => void
    onMenuOpenChange?: (open: boolean) => void
}

export function PerformanceToolbar({ onHome, onMenuOpenChange }: PerformanceToolbarProps) {
    const {
        aiState, setAiEnabled, capoFret, transposition, currentVisiblePage, zoom, setZoom,
        currentSetlistId, syncedBroadcasterId, setSyncedBroadcasterId, jumpToSong, setCurrentVisiblePage, playbackQueue, queueIndex
    } = useMusicStore()
    const { hasAccess: hasMonitorAccess } = useMonitorAccess()
    const { isAnnotating, setAnnotating } = useAnnotationStore()
    const { user, isAdmin, isBandLeader } = useAuth()
    const router = useRouter()

    const isBroadcaster = (isAdmin || isBandLeader) && !!user?.uid

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

    // ── Live Session Sync Logic ──
    const [activeSessions, setActiveSessions] = useState<LiveSession[]>([])

    useEffect(() => {
        if (!currentSetlistId || isBroadcaster) return
        const unsub = subscribeToLiveSessions(currentSetlistId, setActiveSessions)
        return () => unsub()
    }, [currentSetlistId, isBroadcaster])

    useEffect(() => {
        if (!syncedBroadcasterId || isBroadcaster) return

        const session = activeSessions.find(s => s.broadcasterId === syncedBroadcasterId)
        if (!session) return // Keep state just in case they drop momentarily

        if (session.queueIndex !== queueIndex && session.queueIndex >= 0 && session.queueIndex < playbackQueue.length) {
            const track = jumpToSong(session.queueIndex)
            if (track) router.push(`/perform/${track.fileId}`)
        }

        if (session.currentVisiblePage !== currentVisiblePage && session.currentVisiblePage > 0) {
            setCurrentVisiblePage(session.currentVisiblePage)
            const pageEl = document.querySelector(`[data-page-number="${session.currentVisiblePage}"]`)
            if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    }, [activeSessions, syncedBroadcasterId, queueIndex, currentVisiblePage, playbackQueue, jumpToSong, isBroadcaster, router, setCurrentVisiblePage])

    const availableSession = activeSessions[0]

    return (
        <div className="material-thick border-t-0 shrink-0 pb-safe shadow-2xl">

            {/* ── MOBILE/TABLET: Two-row layout ── */}
            <div className="lg:hidden w-full">

                {/* Row 1 (top): Annotate | Metronome | Audio | Transposer — evenly spread */}
                <div className="w-full h-14 flex items-center justify-between px-3 border-b border-brand/10">

                    {/* Annotate */}
                    <Button
                        variant="ghost" size="icon"
                        onClick={() => setAnnotating(!isAnnotating)}
                        className={cn("h-11 w-11 rounded-xl", isAnnotating ? "text-amber-400 bg-amber-500/20" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                    >
                        <Pencil className="h-5 w-5" />
                    </Button>

                    {/* Metronome */}
                    <MetronomeControl />

                    {/* Sync Button (if not broadcaster and session available) */}
                    {!isBroadcaster && availableSession && (
                        <button
                            onClick={() => setSyncedBroadcasterId(syncedBroadcasterId ? null : availableSession.broadcasterId)}
                            className={cn(
                                "h-11 px-3 rounded-xl text-xs font-semibold fluid-interaction flex items-center gap-1.5 transition-all max-w-[110px]",
                                syncedBroadcasterId
                                    ? "bg-green-600 border border-green-500/50 text-foreground shadow-lg shadow-green-900/20"
                                    : "glass-card text-foreground hover:bg-muted animate-pulse"
                            )}
                        >
                            {syncedBroadcasterId ? <LinkIcon className="h-3.5 w-3.5 shrink-0" /> : <Unlink className="h-3.5 w-3.5 shrink-0" />}
                            <span className="truncate">{syncedBroadcasterId ? "Following" : "Sync"}</span>
                        </button>
                    )}

                    {/* Monitor Mix popover */}
                    <Popover onOpenChange={(open) => trackPopover('tools', open)}>
                        <PopoverTrigger asChild>
                            <button className="h-11 px-3 rounded-xl fluid-interaction glass-card text-xs font-semibold text-foreground/80 hover:text-foreground flex items-center gap-1.5" aria-label="Audio monitor mix">
                                <Speaker className="h-3.5 w-3.5" />
                                <span>Audio</span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3 bg-popover border-border space-y-3" align="center" side="top">
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

                    {/* Transposer */}
                    <Popover open={transposerOpenMobile} onOpenChange={(open) => {
                        setTransposerOpenMobile(open)
                        trackPopover('transposer', open)
                        if (open && !aiState.isEnabled) setTimeout(() => setAiEnabled(true), 0)
                    }}>
                        <PopoverTrigger asChild>
                            <button
                                className={cn(
                                    "h-11 px-3 rounded-xl text-xs font-semibold fluid-interaction flex items-center gap-1.5",
                                    aiState.isEnabled
                                        ? "bg-brand border border-brand/50 text-foreground shadow-lg shadow-brand/20"
                                        : "glass-card text-foreground/80 hover:text-foreground"
                                )}
                            >
                                {aiState.scanningPages.length > 0 ? (
                                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                                ) : (
                                    <Sparkles className="h-4 w-4 shrink-0" />
                                )}
                                <span className="truncate max-w-[90px]">{buttonLabel}</span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0 bg-popover border-border" align="end" side="top">
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
                        className={cn("h-11 w-11 rounded-xl transition-all hover:scale-105", isAnnotating ? "text-amber-400 bg-amber-500/20" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                        title="Annotate"
                    >
                        <Pencil className="h-5 w-5" />
                    </Button>

                    {/* Sync Button (Desktop) */}
                    {!isBroadcaster && availableSession && (
                        <button
                            onClick={() => setSyncedBroadcasterId(syncedBroadcasterId ? null : availableSession.broadcasterId)}
                            className={cn(
                                "h-11 px-4 rounded-xl text-xs font-bold uppercase tracking-wider fluid-interaction flex items-center gap-2 min-w-[120px]",
                                syncedBroadcasterId
                                    ? "bg-green-600 border border-green-500/50 text-foreground shadow-lg shadow-green-900/20"
                                    : "glass-card text-foreground hover:bg-muted animate-pulse"
                            )}
                        >
                            {syncedBroadcasterId ? <LinkIcon className="h-4 w-4 shrink-0" /> : <Unlink className="h-4 w-4 shrink-0" />}
                            <span className="truncate">{syncedBroadcasterId ? `Following ${availableSession.broadcasterName.split(' ')[0]}` : "Sync to Leader"}</span>
                        </button>
                    )}

                    {/* Scale Controls */}
                    <div className="flex items-center bg-muted/50 border border-border/10 rounded-xl p-1 gap-1 h-11">
                        <Button
                            variant="ghost" size="icon"
                            onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                            className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                            title="Zoom Out"
                        >
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <span className="text-xs font-medium text-foreground w-10 text-center">
                            {Math.round(zoom * 100)}%
                        </span>
                        <Button
                            variant="ghost" size="icon"
                            onClick={() => setZoom(Math.min(2.0, zoom + 0.1))}
                            className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
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
                        <PopoverContent className="w-auto p-3 bg-popover border-border space-y-3" align="end" side="top">
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

                    <div className="w-px h-8 bg-border/50" />

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
                                        ? "bg-brand border border-brand/50 text-foreground shadow-lg shadow-brand/20"
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
                        <PopoverContent className="w-80 p-0 bg-popover border-border" align="end" side="top">
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
