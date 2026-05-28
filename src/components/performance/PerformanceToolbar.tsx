"use client"

import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Sparkles, Loader2, Speaker, ZoomIn, ZoomOut, X, List, Printer } from "lucide-react"
import { TransposerMenu } from "../music/TransposerMenu"
import { ChordEditBar } from "../music/ChordEditBar"
import { estimateKey, transposeChord } from "@/lib/music-math"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SetlistDrawer } from "@/components/performance/SetlistDrawer"
import { KeepAwakeToggle } from "@/components/performance/KeepAwakeToggle"
import { MetronomeControl } from "./MetronomeControl"
import { SongNavigation } from "./SongNavigation"
import { QuickMonitorPanel } from "@/components/monitor/QuickMonitorPanel"
import { useMonitorAccess } from "@/hooks/use-monitor-access"
import { useMonitorConnection } from "@/hooks/use-monitor-connection"
import { cn } from "@/lib/utils"

/** Wake-lock controls threaded from the parent Perform surface so the
 *  in-chart toolbar can arm "Keep screen on" without exiting back to the
 *  setlist header (C10I1-003 — a deep-linked chart entry left the band with
 *  no reachable wake-lock toggle: the header KeepAwakeToggle is z-stacked
 *  behind this fullscreen overlay. This is the Yizkor screen-timeout
 *  regression class — see use-wake-lock.ts). Sharing the parent's state
 *  keeps the in-chart toggle in sync with the header one. */
export interface PerformanceToolbarWakeLock {
    isActive: boolean
    isSupported: boolean
    onRequest: () => void | Promise<void>
    onRelease: () => void | Promise<void>
}

interface PerformanceToolbarProps {
    onHome: () => void
    onMenuOpenChange?: (open: boolean) => void
    onPrint?: () => void
    wakeLock?: PerformanceToolbarWakeLock
}

export function PerformanceToolbar({ onHome, onMenuOpenChange, onPrint, wakeLock }: PerformanceToolbarProps) {
    const {
        aiState, setAiEnabled, capoFret, transposition, zoom, setZoom, musicXmlKey
    } = useMusicStore()
    // v70-01-01 Task 3: image-typed charts have no extractable chord data,
    // so transposition + AI-chord editing are unavailable. Disable the
    // transposer popover trigger entirely (it gates both the transpose UI
    // AND the "Edit Chords" entry point inside TransposerMenu) and surface
    // a tooltip explaining why. Constraint #11: keep the control VISIBLE so
    // Daniel can see the option exists.
    const currentType = useMusicStore((s) => s.playbackQueue[s.queueIndex]?.type)
    const isImageChart = currentType === 'image'
    const transposeDisabledReason =
        "Transposing isn't available for image charts. Re-upload as a PDF or MusicXML to change keys."
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
    // 2026-05-26 monitor-popup-fullbottom-redesign: monitor popovers now controlled so
    // the in-panel close (×) button can programmatically dismiss. Same dual-state
    // shape as transposer (one per breakpoint) to avoid the hidden-portal dismiss-layer
    // race documented above.
    const [monitorOpenMobile, setMonitorOpenMobile] = useState(false)
    const [monitorOpenDesktop, setMonitorOpenDesktop] = useState(false)

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

    // Detected key for button display. PDF AI-chord path stays authoritative
    // when populated; MusicXML's native first-measure key is the fallback so
    // the toolbar label + capo badge light up for MusicXML charts that have
    // no AI overlay. (Parallel of TransposerMenu's detectedKey fallback —
    // both surfaces feed off this same store slot.)
    const detectedKey = useMemo(() => {
        const chords = Object.values(aiState.pageData).flatMap(
            p => p.chords.map((c: { originalText?: string; text: string }) => c.originalText || c.text)
        )
        const aiEstimate = chords.length === 0 ? null : estimateKey(chords)
        return aiEstimate ?? musicXmlKey ?? null
    }, [aiState.pageData, musicXmlKey])

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

    // ── Shared sub-components ──

    const zoomControls = (compact = false) => (
        <div className={cn(
            // C10I1-001: container holds the ≥44px (h-11) zoom buttons + p-1 on
            // both branches now, so h-12 unified (was h-11 non-compact → clipped
            // the bumped buttons).
            "flex items-center bg-muted/50 border border-border/10 rounded-xl p-1 gap-1 h-12"
        )}>
            <Button
                variant="ghost" size="icon"
                onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                className={cn(
                    // C10I1-001: ≥44px (h-11 w-11) on all viewports — was h-10
                    // (40px) on the non-compact/desktop+iPad-landscape branch.
                    "text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg h-11 w-11"
                )}
                aria-label="Zoom out"
            >
                <ZoomOut className="h-5 w-5" />
            </Button>
            <span className={cn(
                "font-medium text-foreground text-center flex items-center justify-center",
                compact ? "text-xs" : "text-xs w-10"
            )}>
                <span className="md:hidden text-muted-foreground/30 font-light px-0.5">/</span>
                <span className="hidden md:inline w-10">{Math.round(zoom * 100)}%</span>
            </span>
            <Button
                variant="ghost" size="icon"
                onClick={() => setZoom(Math.min(2.0, zoom + 0.1))}
                className={cn(
                    // C10I1-001: ≥44px (h-11 w-11) on all viewports.
                    "text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg h-11 w-11"
                )}
                aria-label="Zoom in"
            >
                <ZoomIn className="h-5 w-5" />
            </Button>
        </div>
    )



    const monitorPopover = (
        id: string,
        openState: boolean,
        setOpenState: (open: boolean) => void,
        compact = false,
        side: "top" | "left" = "top"
    ) => (
        <Popover open={openState} onOpenChange={(open) => { setOpenState(open); trackPopover(id, open) }}>
            <PopoverTrigger asChild>
                <Button variant="ghost" className={cn(
                    "rounded-xl fluid-interaction glass-card text-foreground/80 hover:text-foreground flex items-center justify-center",
                    compact ? "h-11 w-11 md:w-auto md:px-3 overflow-hidden text-xs font-semibold gap-1.5" : "h-11 px-4 text-xs font-bold gap-2 group"
                )} aria-label="Monitor mix">
                    <Speaker className={compact ? "h-4 w-4 md:h-3.5 md:w-3.5 shrink-0" : "h-3.5 w-3.5 shrink-0"} />
                    <span className="hidden md:inline">{compact ? "Monitor" : "MONITOR"}</span>
                </Button>
            </PopoverTrigger>
            {/* 2026-05-26 monitor-popup-fullbottom-redesign (coder-5): popup spans the FULL
                bottom-third of the chart viewport (w-screen + h-[33vh]) so faders get real
                horizontal room on iPad portrait (820×1180). align="center" + collisionPadding=0
                lets Radix Floating UI clamp the 100vw content to left:0 inside the viewport. */}
            <PopoverContent
                className="w-screen max-w-[100vw] h-[33vh] min-h-[280px] max-h-[420px] p-0 bg-popover border-x border-t border-b-0 border-border rounded-t-2xl rounded-b-none"
                align={side === "left" ? "start" : "center"}
                side={side}
                sideOffset={4}
                collisionPadding={0}
            >
                {hasMonitorAccess ? (
                    <QuickMonitorPanel onClose={() => setOpenState(false)} />
                ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground/60 px-4 py-6">No monitor connected</div>
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
    ) => {
        // v70-01-01 Task 3: when current chart is an image, render the
        // trigger as a disabled, tooltip-bearing button outside the Popover
        // entirely. Wrapping inside the Popover with onOpenChange-suppression
        // would still allow Radix to enter the open state momentarily; this
        // is cleaner and guarantees no popover menu can ever appear for
        // image charts. Native `title=` is the iPad long-press / hover
        // floor (the project does not yet have a shadcn Tooltip primitive
        // installed; carry-forward note in the SUMMARY).
        if (isImageChart) {
            return (
                <Button
                    variant="ghost"
                    type="button"
                    aria-disabled="true"
                    aria-label={transposeDisabledReason}
                    title={transposeDisabledReason}
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                    }}
                    className={cn(
                        "rounded-xl font-semibold flex items-center select-none",
                        compact
                            ? "h-11 px-3 text-xs gap-1.5"
                            : "h-11 px-4 text-xs font-bold gap-2 min-w-[100px] justify-center",
                        "glass-card text-foreground/80 opacity-50 cursor-not-allowed",
                        "hover:bg-transparent hover:text-foreground/80",
                    )}
                >
                    <Sparkles
                        className={cn("shrink-0", compact ? "h-4 w-4" : "h-3.5 w-3.5")}
                        aria-hidden="true"
                    />
                    <span className="truncate">
                        {compact ? "Transpose" : "TRANSPOSE"}
                    </span>
                </Button>
            )
        }
        return (
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
                                : "h-11 px-4 text-xs font-bold gap-2 min-w-[100px] justify-center",
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
    }

    // ── BOTTOM BAR LAYOUT (all viewports) ──
    return (
        <div className="material-thick border-t-0 shrink-0 pb-safe shadow-2xl">

            {/* ── TOUCH DEVICES (Mobile & Tablet): Two-row layout (< lg) ── */}
            <div className="lg:hidden w-full">

                {/* Row 1 (top): Evenly Spaced - Zoom | BPM | Transpose | Monitor */}
                <div className="w-full h-14 flex items-center justify-between px-3 border-b border-brand/10">
                    {zoomControls(true)}
                    <MetronomeControl />
                    {transposerPopover(transposerOpenMobile, setTransposerOpenMobile, 'transposer', true, 'top')}
                    {monitorPopover('tools', monitorOpenMobile, setMonitorOpenMobile, true)}
                    {/* C10I1-003: in-chart "Keep screen on" — reachable on the
                        iPad-portrait two-row toolbar (the header toggle is
                        z-stacked behind this overlay on a deep-linked entry). */}
                    {wakeLock && (
                        <KeepAwakeToggle
                            isActive={wakeLock.isActive}
                            isSupported={wakeLock.isSupported}
                            onRequest={wakeLock.onRequest}
                            onRelease={wakeLock.onRelease}
                        />
                    )}
                </div>

                {/* Row 2 (bottom): Home | Song Navigation (flex-center, never covered) | Setlist */}
                {/* v45-emergency: swapped absolute-center for flex-based layout. Absolute
                    positioning meant LEFT/RIGHT blocks could visually overlap the centered
                    SongNavigation when content exceeded expected widths, covering the
                    chart prev/next arrows. flex + min-w-0 + shrink-0 prevents overlap. */}
                <div className="w-full h-14 flex items-center gap-2 px-2">
                    {/* Far Left: Exit X */}
                    <div className="shrink-0">
                        <Button variant="ghost" onClick={onHome} className="h-12 px-4 glass-card text-foreground/80 hover:text-foreground fluid-interaction rounded-xl flex items-center gap-2">
                            <X className="h-5 w-5" />
                            <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Exit</span>
                        </Button>
                    </div>

                    {/* Center: Song Navigation — flex-1 + min-w-0 so it shrinks rather than overlaps */}
                    <div className="flex-1 flex justify-center min-w-0">
                        <SongNavigation />
                    </div>

                    {/* Far Right: Setlist Drawer */}
                    <div className="shrink-0 flex items-center gap-1">
                        <SetlistDrawer />
                    </div>
                </div>
            </div>

            {/* ── DESKTOP: Single row (≥ lg) ── */}
            {/* v45-emergency: LEFT/RIGHT were pinned to w-1/4 (~341px on 1366, ~256px on
                1024) but actual content (~380-400px each) overflowed into the absolute-
                centered SongNavigation, visually covering chart prev/next. Switched to
                flex-based: LEFT/RIGHT shrink-0 (content width), CENTER flex-1 min-w-0
                (takes remaining, shrinks SongNavigation title before chevrons). */}
            <div className="hidden lg:flex w-full h-16 items-center gap-4 px-6">

                {/* LEFT: System & Navigation */}
                <div className="flex items-center gap-3 shrink-0">
                    <Button variant="ghost" onClick={onHome} className="h-11 px-4 glass-card text-foreground/80 hover:text-foreground fluid-interaction rounded-xl flex items-center gap-2" title="Exit Gig Mode">
                        <X className="h-5 w-5" />
                        <span className="text-xs font-bold uppercase tracking-wider">Exit</span>
                    </Button>

                    {/* Scale Controls */}
                    {zoomControls(false)}

                    <SetlistDrawer />
                </div>

                {/* CENTER: Song Navigation — flex-1 + min-w-0 so it shrinks, never overlaps */}
                <div className="flex-1 flex justify-center min-w-0">
                    <SongNavigation />
                </div>

                {/* RIGHT: Tools + Transposer */}
                <div className="flex items-center justify-end gap-3 shrink-0">

                    {/* C10I1-003: in-chart "Keep screen on" so a deep-linked
                        chart entry (iPad landscape ≥ lg) can arm the wake-lock
                        without exiting to the setlist header. Shares the
                        parent's wake-lock state. */}
                    {wakeLock && (
                        <KeepAwakeToggle
                            isActive={wakeLock.isActive}
                            isSupported={wakeLock.isSupported}
                            onRequest={wakeLock.onRequest}
                            onRelease={wakeLock.onRelease}
                        />
                    )}

                    {/* Monitor Mix popover */}
                    {monitorPopover('tools-desktop', monitorOpenDesktop, setMonitorOpenDesktop, false)}

                    <div className="w-px h-8 bg-border/50" />

                    {/* Metronome — BPM input collapses first per v45-emergency AC-2 */}
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
