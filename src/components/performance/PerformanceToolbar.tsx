"use client"

import { useState, useEffect } from "react"
import { useMusicStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { BackingTrackPlayer } from "@/components/audio/BackingTrackPlayer"
import { Tuner } from "@/components/tools/Tuner"
import {
    ChevronLeft, ChevronRight, Home, ListMusic,
    ZoomIn, ZoomOut, Wand2, Loader2, Music2, Guitar, Eye, EyeOff
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { NetworkStatus } from "@/components/network-status"

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
    } = useMusicStore()

    const currentTrack = playbackQueue[queueIndex]

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

    // Focus Mode Logic
    const [visible, setVisible] = useState(true)

    useEffect(() => {
        let timeout: NodeJS.Timeout

        const resetTimer = () => {
            setVisible(true)
            clearTimeout(timeout)
            timeout = setTimeout(() => {
                // Only hide if not interacting with a menu
                // Simple heuristic: if we are here, we are interacting.
                // But we need to handle "mouse stop".
                // Actually, a simpler way is: hide after 3s of no mouse move.
                // But we don't want to hide if hovering the toolbar itself?
                // Let's implement simple "hide after 3s" but listener is on window.
                setVisible(false)
            }, 3000)
        }

        window.addEventListener('mousemove', resetTimer)
        window.addEventListener('touchstart', resetTimer)
        window.addEventListener('click', resetTimer)

        resetTimer()

        return () => {
            clearTimeout(timeout)
            window.removeEventListener('mousemove', resetTimer)
            window.removeEventListener('touchstart', resetTimer)
            window.removeEventListener('click', resetTimer)
        }
    }, [])

    return (
        <div
            className={`fixed bottom-0 left-0 right-0 h-16 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between px-2 sm:px-4 z-50 transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
        >

            {/* Left: Navigation */}
            <div className="flex items-center gap-1 sm:gap-2">
                <Button variant="ghost" size="icon" onClick={onHome} className="text-zinc-400 hover:text-white">
                    <Home className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={onSetlist} className="text-zinc-400 hover:text-white">
                    <ListMusic className="h-5 w-5" />
                </Button>
            </div>

            {/* Center: Playback */}
            <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-center max-w-[50%] sm:max-w-none">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        const prev = prevSong()
                        if (prev) window.history.pushState(null, '', `/perform/${prev.fileId}`)
                    }}
                    disabled={queueIndex <= 0}
                    className="text-white"
                >
                    <ChevronLeft className="h-6 w-6" />
                </Button>

                <div className="flex flex-col items-center overflow-hidden">
                    <span className="text-sm font-bold truncate text-center w-full px-2">
                        {currentTrack?.name || "No Song Selected"}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                        {playbackQueue.length > 0 ? `${queueIndex + 1} / ${playbackQueue.length}` : "Empty Queue"}
                    </span>
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                        const next = nextSong()
                        if (next) window.history.pushState(null, '', `/perform/${next.fileId}`)
                    }}
                    disabled={queueIndex >= playbackQueue.length - 1}
                    className="text-white"
                >
                    <ChevronRight className="h-6 w-6" />
                </Button>
            </div>

            {/* Right: Tools */}
            <div className="flex items-center gap-1 sm:gap-2 justify-end">
                <BackingTrackPlayer />

                {/* Tuner */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white" title="Tuner">
                            <Guitar className="h-5 w-5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800" align="end" side="top">
                        <Tuner />
                    </PopoverContent>
                </Popover>

                {/* Transposer Visibility Toggle (Direct Access) */}
                {aiTransposer.status === 'ready' && (
                    <Button
                        variant={aiTransposer.isVisible ? "default" : "ghost"}
                        size="icon"
                        onClick={() => setTransposerState({ isVisible: !aiTransposer.isVisible })}
                        className={`h-9 w-9 ${aiTransposer.isVisible ? 'bg-purple-600 hover:bg-purple-700' : 'text-zinc-500'}`}
                        title={aiTransposer.isVisible ? "Hide Chords" : "Show Chords"}
                    >
                        {aiTransposer.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                )}

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
                            className="gap-2 min-w-[50px] sm:min-w-[100px]"
                        >
                            <Music2 className="h-4 w-4" />
                            <span className="hidden sm:inline">
                                {capo.active ? `Capo ${capo.fret}` : (transposition !== 0 ? (transposition > 0 ? `+${transposition}` : transposition) : "Transpose")}
                            </span>
                            {/* Mobile Only Value Indicator */}
                            {(transposition !== 0 || capo.active) && (
                                <span className="sm:hidden text-xs font-bold">
                                    {capo.active ? `C${capo.fret}` : (transposition > 0 ? `+${transposition}` : transposition)}
                                </span>
                            )}
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
                <div className="flex items-center bg-zinc-800 rounded-lg ml-2 hidden sm:flex">
                    <Button variant="ghost" size="icon" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className="h-8 w-8">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setZoom(Math.min(3, zoom + 0.1))} className="h-8 w-8">
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </div>
                <NetworkStatus />
            </div>
        </div>
    )
}
