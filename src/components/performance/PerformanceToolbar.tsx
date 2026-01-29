"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useMusicStore } from "@/lib/store"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { BackingTrackPlayer } from "@/components/audio/BackingTrackPlayer"
import { Tuner } from "@/components/tools/Tuner"
import {
    ChevronLeft, ChevronRight, Home, ListMusic,
    ZoomIn, ZoomOut, Wand2, Loader2, Music2, Guitar, Eye, EyeOff,
    Mic2, Play, Pause
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { NetworkStatus } from "@/components/network-status"
import { SetlistDrawer } from "@/components/performance/SetlistDrawer"
import { useMetronome } from "@/hooks/use-metronome"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface PerformanceToolbarProps {
    onHome: () => void
    onSetlist: () => void
}

const SHAPES = ['C', 'A', 'G', 'E', 'D'] // CAGED system
const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export function PerformanceToolbar({ onHome, onSetlist }: PerformanceToolbarProps) {
    const router = useRouter()
    const { isAdmin, user } = useAuth()
    const {
        fileUrl,
        fileType,
        playbackQueue,
        queueIndex,
        nextSong,
        prevSong,
        zoom,
        setZoom,
        transposition,
        setTransposition,
        aiTransposer,
        setTransposerState,
        capo,
        setCapoState,
        aiXmlContent,
        setAiXmlContent
    } = useMusicStore()

    const [digitizing, setDigitizing] = useState(false)

    const handleDigitize = async () => {
        if (!fileUrl) return

        // If already active, toggle off (return to PDF)
        if (aiXmlContent) {
            setAiXmlContent(null)
            toast.info("Returned to Original PDF")
            return
        }

        const match = fileUrl.match(/\/file\/([a-zA-Z0-9_-]+)/)
        const fileId = match ? match[1] : null

        if (!fileId) {
            toast.error("Could not identify file ID")
            return
        }

        try {
            setDigitizing(true)
            toast.info("AI is reading the music... (this takes ~10s)")

            const token = await user?.getIdToken()
            const res = await fetch('/api/ai/omr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ fileId })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Digitization failed')

            setAiXmlContent(data.xml)
            toast.success("Digitized! Smart View Active.")

        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setDigitizing(false)
        }
    }

    const currentTrack = playbackQueue[queueIndex]

    // Metronome Integration
    const { isPlaying: isMetronomeOn, togglePlay: toggleMetronome, currentBpm, setCurrentBpm, isBeat } = useMetronome(currentTrack?.bpm || 100)

    // Sync metronome BPM when track changes
    useEffect(() => {
        if (currentTrack?.bpm) {
            setCurrentBpm(currentTrack.bpm)
        }
    }, [currentTrack, setCurrentBpm])

    // Capo Calculation Helper
    const calculateCapo = (sourceKey: string, targetShape: string) => {
        const sIndex = KEYS.indexOf(sourceKey.replace(/m$/, ''))
        const tIndex = KEYS.indexOf(targetShape.replace(/m$/, ''))

        if (sIndex === -1 || tIndex === -1) return null

        let fret = sIndex - tIndex
        if (fret < 0) fret += 12
        let transposeDelta = tIndex - sIndex
        return { fret, transposeDelta }
    }

    const applyCapo = (shape: string) => {
        if (!aiTransposer.detectedKey) return

        const result = calculateCapo(aiTransposer.detectedKey, shape)
        if (result) {
            setTransposition(result.transposeDelta)
            setCapoState({ active: true, targetShape: shape, fret: result.fret })
        }
    }

    const clearCapo = () => {
        setCapoState({ active: false, targetShape: '', fret: 0 })
        setTransposition(0)
    }

    // Auto-hide Logic (Desktop Mouse / General Interaction)
    const [visible, setVisible] = useState(true)

    // Allow parent to toggle visibility (Mobile Tap)
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
            timeout = setTimeout(() => {
                // Hide after 3s of inactivity (only if not hovering?)
                // Actually, let's keep it simple: Mouse interaction wakes it.
                // Mobile tap (custom event) toggles it.
                setVisible(false)
            }, 3000)
        }

        // Only use mousemove for desktop "wake"
        window.addEventListener('mousemove', resetTimer)
        // Removed 'touchstart' directly here to avoid scroll-trigger
        // Removed 'click' here to avoid conflict with manual toggle logic

        resetTimer()

        return () => {
            clearTimeout(timeout)
            window.removeEventListener('mousemove', resetTimer)
        }
    }, [])

    return (
        <div
            className={cn(
                "fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800 z-50 transition-all duration-300",
                "h-auto pb-safe sm:h-20 flex flex-col sm:flex-row items-center justify-between px-4 py-2 sm:py-0 gap-2 sm:gap-4",
                visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 hover:translate-y-0 hover:opacity-100"
            )}
        >
            {/* ZONE 1: Navigation & Setlist */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-400 hover:text-white h-12 w-12">
                        <Home className="h-6 w-6" />
                    </Button>
                    <SetlistDrawer />
                </div>

                {/* Mobile Song Nav (Visible only on mobile) */}
                <div className="flex items-center gap-4 sm:hidden">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            const prev = prevSong()
                            if (prev) router.replace(`/perform/${prev.fileId}`)
                        }}
                        disabled={queueIndex <= 0}
                        className="text-white h-12 w-12"
                    >
                        <ChevronLeft className="h-8 w-8" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            const next = nextSong()
                            if (next) router.replace(`/perform/${next.fileId}`)
                        }}
                        disabled={queueIndex >= playbackQueue.length - 1}
                        className="text-white h-12 w-12"
                    >
                        <ChevronRight className="h-8 w-8" />
                    </Button>
                </div>
            </div>

            {/* ZONE 2: Performance Info (Key & BPM) */}
            <div className="flex items-center gap-6 bg-zinc-900/50 rounded-xl px-6 py-2 border border-white/5 shadow-2xl backdrop-blur-sm">
                {/* Key Display - PROMINENT */}
                <div className="flex flex-col items-center min-w-[4rem]">
                    <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">Key</span>
                    <span className="text-4xl font-black text-white leading-none">
                        {currentTrack?.key || "-"}
                    </span>
                </div>

                <div className="w-px h-12 bg-zinc-800" />

                {/* Metronome Control - VISUAL ONLY */}
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center min-w-[4rem]">
                        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">BPM</span>
                        <Input
                            type="number"
                            value={currentBpm}
                            onChange={(e) => setCurrentBpm(parseInt(e.target.value) || 0)}
                            className="h-9 w-20 bg-transparent border-0 text-4xl font-black text-center p-0 focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-zinc-300"
                        />
                    </div>

                    {/* Blinking Light Button */}
                    <div
                        onClick={toggleMetronome}
                        className={cn(
                            "h-14 w-14 rounded-full cursor-pointer transition-all duration-75 border-4 flex items-center justify-center bg-black",
                            isMetronomeOn
                                ? "border-zinc-800"
                                : "border-zinc-800 hover:border-zinc-600",
                        )}
                        title={isMetronomeOn ? "Stop Metronome" : "Start Metronome"}
                    >
                        {/* The Actual Light - Matches Setlist Style */}
                        <div className={cn(
                            "rounded-full transition-all duration-75",
                            isMetronomeOn && isBeat
                                ? "h-10 w-10 bg-red-500 shadow-[0_0_20px_rgba(239,68,68,1)] scale-110"
                                : "h-3 w-3 bg-zinc-800"
                        )} />
                    </div>
                </div>
            </div>

            {/* ZONE 3: Song Navigation (Desktop) */}
            <div className="hidden sm:flex items-center gap-4 flex-1 justify-center max-w-[400px]">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        const prev = prevSong()
                        if (prev) router.replace(`/perform/${prev.fileId}`)
                    }}
                    disabled={queueIndex <= 0}
                    className="text-white h-14 w-14 hover:bg-white/10 rounded-full"
                >
                    <ChevronLeft className="h-8 w-8" />
                </Button>

                <div className="flex flex-col items-center overflow-hidden min-w-0 flex-1">
                    <span className="text-lg font-bold truncate text-center w-full leading-tight">
                        {currentTrack?.name || "No Song Selected"}
                    </span>
                    <span className="text-xs text-zinc-500 mt-1">
                        {playbackQueue.length > 0 ? `${queueIndex + 1} of ${playbackQueue.length}` : "Setlist Empty"}
                    </span>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        const next = nextSong()
                        if (next) router.replace(`/perform/${next.fileId}`)
                    }}
                    disabled={queueIndex >= playbackQueue.length - 1}
                    className="text-white h-14 w-14 hover:bg-white/10 rounded-full"
                >
                    <ChevronRight className="h-8 w-8" />
                </Button>
            </div>

            {/* ZONE 4: Tools (Transpose, Audio, Tuner) */}
            <div className="flex items-center gap-2 justify-end w-full sm:w-auto">
                {/* Admin AI Digitize Tool */}
                {isAdmin && fileType === 'pdf' && (
                    <Button
                        variant={aiXmlContent ? "default" : "ghost"}
                        size="icon"
                        onClick={handleDigitize}
                        disabled={digitizing}
                        className={cn(
                            "h-10 w-10 transition-all",
                            aiXmlContent ? "bg-purple-600 hover:bg-purple-700 text-white" : "text-purple-400 hover:text-purple-300 hover:bg-purple-400/10"
                        )}
                        title="Digitize with AI"
                    >
                        {digitizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
                    </Button>
                )}

                <BackingTrackPlayer />

                {/* Tuner */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" className="text-zinc-400 hover:text-white px-3 font-bold uppercase text-xs tracking-wider" title="Tuner">
                            Tuner
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="end" side="top">
                        <Tuner />
                    </PopoverContent>
                </Popover>

                {/* Transpose Menu reuse */}
                <Popover onOpenChange={(open) => {
                    if (open && fileType === 'pdf' && aiTransposer.status === 'idle') {
                        setTransposerState({ isVisible: true })
                    }
                }}>
                    <PopoverTrigger asChild>
                        <Button
                            variant={transposition !== 0 || capo.active ? "default" : "secondary"}
                            className="bg-zinc-800 text-zinc-200 hover:bg-zinc-700 h-10 px-3"
                        >
                            <Music2 className="h-4 w-4 mr-2" />
                            {capo.active ? `Capo ${capo.fret}` : (transposition !== 0 ? (transposition > 0 ? `+${transposition}` : transposition) : "Transpose")}
                        </Button>
                    </PopoverTrigger>
                    {/* Popover Content (Same as before, simplified for this rewrite) */}
                    <PopoverContent className="w-80 p-0 bg-zinc-950 border-zinc-800 text-white overflow-hidden shadow-2xl" align="end" sideOffset={10}>
                        <div className="bg-zinc-900 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                            <h3 className="font-bold text-sm uppercase tracking-wider text-zinc-400">Transposition</h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                onClick={() => { setTransposition(0); clearCapo(); }}
                            >
                                Reset
                            </Button>
                        </div>

                        <div className="p-4 space-y-6">
                            {/* Visual Feedback of Change */}
                            <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800 text-center">
                                <div className="text-sm text-zinc-500 mb-1">Transformation</div>
                                <div className="flex items-center justify-center gap-3 text-lg font-bold">
                                    <span className="text-zinc-400">{currentTrack?.key || "?"}</span>
                                    <ChevronRight className="h-4 w-4 text-zinc-600" />
                                    <span className="text-cyan-400">
                                        {/* Simple calculation logic for display would be ideal here but for now just showing delta */}
                                        {transposition > 0 ? `+${transposition}` : transposition} Semitones
                                    </span>
                                </div>
                            </div>

                            {/* Pitch Shift Controls */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-500 uppercase">Pitch Shift (Semitones)</label>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        className="h-10 flex-1 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:text-white"
                                        onClick={() => setTransposition(transposition - 1)}
                                    >
                                        -1
                                    </Button>
                                    <div className="w-12 text-center font-mono text-xl font-bold">
                                        {transposition > 0 ? "+" : ""}{transposition}
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="h-10 flex-1 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:text-white"
                                        onClick={() => setTransposition(transposition + 1)}
                                    >
                                        +1
                                    </Button>
                                </div>
                            </div>

                            {/* Capo Controls (if needed) - kept simpler for now as user asked for clarity */}

                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    )
}
