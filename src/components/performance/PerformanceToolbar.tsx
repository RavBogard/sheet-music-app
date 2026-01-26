"use client"

import { useState } from "react"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { BackingTrackPlayer } from "@/components/audio/BackingTrackPlayer"
import {
    ChevronLeft, ChevronRight, Home, ListMusic,
    ZoomIn, ZoomOut, Wand2, Loader2, Music2, Guitar
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface PerformanceToolbarProps {
    onHome: () => void
    onSetlist: () => void
}

const SHAPES = ['C', 'A', 'G', 'E', 'D'] // CAGED system
const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export function PerformanceToolbar({ onHome, onSetlist }: PerformanceToolbarProps) {
    const {
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
        isGigMode,
        setGigMode
    } = useMusicStore()

    const currentTrack = playbackQueue[queueIndex]

    // Long Press Logic for Exit
    const [holdTimeout, setHoldTimeout] = useState<NodeJS.Timeout | null>(null)
    const [isHolding, setIsHolding] = useState(false)

    const startExit = () => {
        setIsHolding(true)
        const timeout = setTimeout(() => {
            setGigMode(false)
            setIsHolding(false)
        }, 2000) // 2 seconds hold
        setHoldTimeout(timeout)
    }

    const cancelExit = () => {
        if (holdTimeout) clearTimeout(holdTimeout)
        setIsHolding(false)
    }

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

    if (isGigMode) {
        return (
            <>
                {/* Red Mode Filter (Backdrop) */}
                <style jsx global>{`
                    html {
                        filter: sepia(100%) saturate(300%) hue-rotate(320deg) brightness(0.8) contrast(1.2) !important;
                        background: #000 !important;
                    }
                `}</style>

                <div className="fixed bottom-0 left-0 right-0 h-24 bg-black border-t-2 border-red-900/50 flex items-center justify-between px-8 z-50">

                    {/* Emergency Exit (Long Press) */}
                    <button
                        onMouseDown={startExit}
                        onMouseUp={cancelExit}
                        onMouseLeave={cancelExit}
                        onTouchStart={startExit}
                        onTouchEnd={cancelExit}
                        className={`
                            border-2 border-red-900 rounded-full h-16 w-16 flex items-center justify-center transition-all duration-200
                            ${isHolding ? 'bg-red-900 scale-95' : 'bg-black'}
                        `}
                    >
                        <div className={`h-12 w-12 rounded-full border border-red-800 ${isHolding ? 'animate-ping opacity-75' : 'opacity-0'}`} />
                        <span className="absolute text-[10px] text-red-700 font-bold uppercase tracking-widest">
                            {isHolding ? "HOLD..." : "EXIT"}
                        </span>
                    </button>

                    {/* Simple Prev/Next - HUGE Targets */}
                    <div className="flex items-center gap-12">
                        <Button
                            variant="ghost"
                            className="h-20 w-32 border border-red-900/30 text-red-500 hover:bg-red-900/20 active:bg-red-900/40 rounded-2xl"
                            onClick={prevSong}
                            disabled={queueIndex <= 0}
                        >
                            <ChevronLeft className="h-12 w-12" />
                        </Button>

                        <div className="flex flex-col items-center">
                            <span className="text-xl font-bold text-red-500 max-w-[300px] truncate text-center">
                                {currentTrack?.name || "No Song"}
                            </span>
                            <span className="text-sm text-red-800 font-mono">
                                {queueIndex + 1} / {playbackQueue.length}
                            </span>
                        </div>

                        <Button
                            variant="ghost"
                            className="h-20 w-32 border border-red-900/30 text-red-500 hover:bg-red-900/20 active:bg-red-900/40 rounded-2xl"
                            onClick={nextSong}
                            disabled={queueIndex >= playbackQueue.length - 1}
                        >
                            <ChevronRight className="h-12 w-12" />
                        </Button>
                    </div>

                    {/* Minimal Tools (Transpose ONLY) */}
                    <div className="flex gap-4">
                        <div className="flex flex-col gap-1 items-center">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setTransposition(transposition + 1)}
                                className="border-red-900/50 text-red-500 hover:bg-red-900/20 h-10 w-10"
                            >
                                +
                            </Button>
                            <span className="text-red-500 font-mono font-bold text-lg">{transposition}</span>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setTransposition(transposition - 1)}
                                className="border-red-900/50 text-red-500 hover:bg-red-900/20 h-10 w-10"
                            >
                                -
                            </Button>
                        </div>
                    </div>

                </div>
            </>
        )
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between px-4 z-50">

            {/* Left: Navigation */}
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-400 hover:text-white">
                    <Home className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onSetlist} className="text-zinc-400 hover:text-white">
                    <ListMusic className="h-5 w-5" />
                </Button>
                {/* Gig Mode Entry */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGigMode(true)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-900/30 gap-2 px-3 ml-2"
                >
                    <Guitar className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase">Gig Mode</span>
                </Button>
            </div>

            {/* Center: Playback */}
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={prevSong}
                    disabled={queueIndex <= 0}
                    className="text-white"
                >
                    <ChevronLeft className="h-6 w-6" />
                </Button>

                <div className="flex flex-col items-center">
                    <span className="text-sm font-bold max-w-[200px] truncate text-center">
                        {currentTrack?.name || "No Song Selected"}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                        {playbackQueue.length > 0 ? `${queueIndex + 1} / ${playbackQueue.length}` : "Empty Queue"}
                    </span>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={nextSong}
                    disabled={queueIndex >= playbackQueue.length - 1}
                    className="text-white"
                >
                    <ChevronRight className="h-6 w-6" />
                </Button>
            </div>

            {/* Right: Tools */}
            <div className="flex items-center gap-2">
                <BackingTrackPlayer />

                {/* Unified Transpose Menu */}
                <Popover onOpenChange={(open) => {
                    // Auto-trigger scan if opening menu, it's a PDF, and we haven't started yet
                    if (open && fileType === 'pdf' && aiTransposer.status === 'idle') {
                        setTransposerState({ isVisible: true })
                    }
                }}>
                    <PopoverTrigger asChild>
                        <Button
                            variant={transposition !== 0 || capo.active ? "default" : "secondary"}
                            size="sm"
                            className="gap-2 min-w-[100px]"
                        >
                            <Music2 className="h-4 w-4" />
                            <span>
                                {capo.active ? `Capo ${capo.fret}` : (transposition !== 0 ? (transposition > 0 ? `+${transposition}` : transposition) : "Transpose")}
                            </span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-4 bg-zinc-900 border-zinc-700 text-white mb-2" align="end" sideOffset={10}>
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg border-b border-zinc-800 pb-2 mb-4">Transposition</h3>

                            {/* PDF Status / Loader */}
                            {fileType === 'pdf' && (
                                <div className="bg-zinc-800/50 rounded-lg p-3 mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-zinc-400">Smart Chords</span>
                                        {aiTransposer.status === 'scanning' && <Loader2 className="h-4 w-4 animate-spin text-purple-400" />}
                                        {aiTransposer.status === 'ready' && <Wand2 className="h-4 w-4 text-purple-400" />}
                                    </div>

                                    {aiTransposer.status === 'idle' && (
                                        <p className="text-xs text-zinc-500">Menu opening triggers scan...</p>
                                    )}

                                    {aiTransposer.status === 'scanning' && (
                                        <div className="space-y-2">
                                            <p className="text-xs text-zinc-300">Analyzing sheet music...</p>
                                            <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                                                <div className="h-full bg-purple-500 animate-indeterminate" />
                                            </div>
                                        </div>
                                    )}

                                    {aiTransposer.status === 'ready' && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-zinc-300">
                                                Detected Key: <span className="text-white font-bold">{aiTransposer.detectedKey}</span>
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 text-xs text-zinc-400 hover:text-white"
                                                onClick={() => setTransposerState({ isVisible: !aiTransposer.isVisible })}
                                            >
                                                {aiTransposer.isVisible ? "Hide Overlay" : "Show Overlay"}
                                            </Button>
                                        </div>
                                    )}

                                    {aiTransposer.status === 'error' && (
                                        <div className="text-xs text-red-400">
                                            Scan failed. <Button variant="link" className="text-red-400 p-0 h-auto" onClick={() => setTransposerState({ status: 'idle', isVisible: true })}>Retry</Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Standard Transpose */}
                            <div>
                                <h4 className="text-xs font-bold text-zinc-500 uppercase mb-2">Manual Shift</h4>
                                <div className="flex items-center justify-center gap-4 bg-zinc-800 rounded-lg p-2">
                                    <Button variant="ghost" size="icon" onClick={() => setTransposition(transposition - 1)}>-</Button>
                                    <span className="font-mono text-xl font-bold w-8 text-center">{transposition}</span>
                                    <Button variant="ghost" size="icon" onClick={() => setTransposition(transposition + 1)}>+</Button>
                                </div>
                            </div>

                            {/* Capo Mode (Only if Key Detected) */}
                            {aiTransposer.detectedKey && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-xs font-bold text-zinc-500 uppercase">Guitar Capo</h4>
                                        {capo.active && (
                                            <Button variant="ghost" size="sm" className="h-4 p-0 text-[10px] text-red-400 hover:text-red-300" onClick={clearCapo}>
                                                Clear
                                            </Button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-5 gap-1">
                                        {SHAPES.map(shape => (
                                            <Button
                                                key={shape}
                                                variant={capo.active && capo.targetShape === shape ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => applyCapo(shape)}
                                                className="h-8 font-bold"
                                            >
                                                {shape}
                                            </Button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-zinc-500 mt-2 text-center">
                                        Select a shape to play in. We'll show you where to capo.
                                    </p>
                                </div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>

                {/* Zoom */}
                <div className="flex items-center bg-zinc-800 rounded-lg ml-2">
                    <Button variant="ghost" size="icon" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className="h-8 w-8">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setZoom(Math.min(3, zoom + 0.1))} className="h-8 w-8">
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </div>

            </div>
        </div>
    )
}
