"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { formatPlaybackTime } from "@/lib/format-utils"
import { cn } from "@/lib/utils"
import {
    Play, Pause, SkipBack, Volume2, VolumeX,
    Repeat, Timer, ChevronDown, ChevronUp,
} from "lucide-react"

interface RehearsalToolbarProps {
    /** The /api/drive/file/{id} URL for the audio */
    audioUrl: string
    /** Track title for display */
    title: string
    /** File ID for saving preferences */
    fileId?: string
    /** Called with seconds practiced on unmount/pause */
    onPracticeTime?: (seconds: number) => void
}

const SPEED_OPTIONS = [0.5, 0.75, 0.85, 1.0, 1.15, 1.25, 1.5]

/**
 * Rehearsal toolbar — appears at the bottom of performance mode
 * when a track has linked audio.
 *
 * Features: play/pause, scrub, speed control, A-B loop, practice timer.
 */
export function RehearsalToolbar({ audioUrl, title: _title, fileId, onPracticeTime }: RehearsalToolbarProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const practiceStart = useRef<number | null>(null)
    const totalPracticed = useRef(0)

    const [playing, setPlaying] = useState(false)
    const [duration, setDuration] = useState(0)
    const [currentTime, setCurrentTime] = useState(0)
    const [volume, setVolume] = useState(0.8)
    const [muted, setMuted] = useState(false)
    const [speed, setSpeed] = useState(1.0)
    const [expanded, setExpanded] = useState(false)

    // A-B Loop
    const [loopA, setLoopA] = useState<number | null>(null)
    const [loopB, setLoopB] = useState<number | null>(null)
    const loopActive = loopA !== null && loopB !== null

    // Cumulative practice stats from Firestore
    const [cumulativeStats, setCumulativeStats] = useState<{ seconds: number; sessions: number } | null>(null)

    // Error state if audio 404s
    const [hasError, setHasError] = useState(false)

    // Load preferred speed and cumulative stats from Firestore
    useEffect(() => {
        if (!fileId) return
        import("@/lib/firebase").then(({ auth, db: clientDb }) => {
            const uid = auth.currentUser?.uid
            if (!uid) return
            import("firebase/firestore").then(({ doc, getDoc }) => {
                getDoc(doc(clientDb, 'users', uid, 'songPreferences', fileId)).then(snap => {
                    const data = snap.data()
                    const saved = data?.preferredSpeed
                    if (saved && SPEED_OPTIONS.includes(saved)) {
                        setSpeed(saved)
                        if (audioRef.current) audioRef.current.playbackRate = saved
                    }
                    if (data?.practiceSeconds) {
                        setCumulativeStats({
                            seconds: data.practiceSeconds || 0,
                            sessions: data.practiceSessionCount || 0,
                        })
                    }
                }).catch(() => { })
            })
        })
    }, [fileId])

    // Initialize audio element
    useEffect(() => {
        const audio = new Audio()
        audio.preload = 'auto'
        audio.crossOrigin = 'anonymous'
        audioRef.current = audio

        const onLoadedMetadata = () => {
            setDuration(audio.duration)
            setHasError(false)
        }
        const onTimeUpdate = () => setCurrentTime(audio.currentTime)
        const onError = () => setHasError(true)
        const onEnded = () => {
            setPlaying(false)
            if (practiceStart.current) {
                totalPracticed.current += (Date.now() - practiceStart.current) / 1000
                practiceStart.current = null
            }
        }

        audio.addEventListener('loadedmetadata', onLoadedMetadata)
        audio.addEventListener('timeupdate', onTimeUpdate)
        audio.addEventListener('ended', onEnded)
        audio.addEventListener('error', onError)

        audio.src = audioUrl
        audio.volume = 0.8

        return () => {
            audio.removeEventListener('loadedmetadata', onLoadedMetadata)
            audio.removeEventListener('timeupdate', onTimeUpdate)
            audio.removeEventListener('ended', onEnded)
            audio.removeEventListener('error', onError)
            audio.pause()
            audio.src = ''
            // Report practice time
            if (practiceStart.current) {
                totalPracticed.current += (Date.now() - practiceStart.current) / 1000
            }
            if (totalPracticed.current > 5 && onPracticeTime) {
                onPracticeTime(Math.round(totalPracticed.current))
            }
        }
    }, [audioUrl])

    // Handle A-B loop
    useEffect(() => {
        const audio = audioRef.current
        if (!audio || !loopActive) return

        const handleLoop = () => {
            if (audio.currentTime >= loopB!) {
                audio.currentTime = loopA!
            }
        }

        audio.addEventListener('timeupdate', handleLoop)
        return () => audio.removeEventListener('timeupdate', handleLoop)
    }, [loopA, loopB, loopActive])

    const togglePlay = useCallback(() => {
        const audio = audioRef.current
        if (!audio) return

        if (playing) {
            audio.pause()
            if (practiceStart.current) {
                totalPracticed.current += (Date.now() - practiceStart.current) / 1000
                practiceStart.current = null
            }
        } else {
            audio.play().catch(() => { })
            practiceStart.current = Date.now()
        }
        setPlaying(!playing)
    }, [playing])

    const seek = useCallback((time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time
            setCurrentTime(time)
        }
    }, [])

    const changeSpeed = useCallback((newSpeed: number) => {
        if (audioRef.current) {
            audioRef.current.playbackRate = newSpeed
        }
        setSpeed(newSpeed)
        // Persist preferred speed
        if (fileId) {
            import("@/lib/firebase").then(({ auth, db: clientDb }) => {
                const uid = auth.currentUser?.uid
                if (!uid) return
                import("firebase/firestore").then(({ doc, setDoc }) => {
                    const ref = doc(clientDb, 'users', uid, 'songPreferences', fileId)
                    setDoc(ref, { preferredSpeed: newSpeed }, { merge: true }).catch(() => { })
                })
            })
        }
    }, [fileId])

    const toggleMute = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.muted = !muted
        }
        setMuted(!muted)
    }, [muted])

    const handleLoopToggle = useCallback(() => {
        if (loopActive) {
            // Clear loop
            setLoopA(null)
            setLoopB(null)
        } else if (loopA === null) {
            // Set A point
            setLoopA(currentTime)
        } else {
            // Set B point
            setLoopB(currentTime)
        }
    }, [loopActive, loopA, currentTime])

    const resetToStart = useCallback(() => {
        seek(loopA ?? 0)
    }, [seek, loopA])

    const [toolbarVisible, setToolbarVisible] = useState(false)
    const toggleToolbar = () => setToolbarVisible(!toolbarVisible)

    if (hasError) return null

    if (!toolbarVisible) {
        return (
            <button
                onClick={toggleToolbar}
                className="fixed bottom-24 right-4 md:bottom-20 z-40 p-3 rounded-full bg-brand shadow-[0_0_20px_oklch(0.50_0.20_275/0.3)] text-foreground hover:bg-brand/90 transition-all hover:scale-105 flex items-center justify-center border border-brand/20"
                title="Open Rehearsal Audio"
            >
                {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </button>
        )
    }

    return (
        <div className="fixed bottom-24 right-4 left-4 md:left-auto md:bottom-20 md:w-80 md:min-w-[320px] z-40 bg-popover/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl overflow-hidden ring-1 ring-border">
            {/* Header / Collapse */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20">
                <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Rehearsal Audio</span>
                <button onClick={toggleToolbar} className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
                    <ChevronDown className="w-4 h-4" />
                </button>
            </div>

            {/* Compact bar */}
            <div className="flex items-center gap-2 px-3 py-3">
                {/* Play/Pause */}
                <button onClick={togglePlay} className="p-2.5 rounded-full bg-brand hover:bg-brand/90 text-foreground transition-colors shrink-0 shadow-lg shadow-brand/20">
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                {/* Restart */}
                <button onClick={resetToStart} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                    <SkipBack className="w-4 h-4" />
                </button>

                {/* Progress bar */}
                <div className="flex-1 flex flex-col gap-1.5">
                    <div className="relative w-full h-5 flex items-center group cursor-pointer"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const pct = (e.clientX - rect.left) / rect.width
                            seek(pct * duration)
                        }}
                    >
                        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-brand rounded-full transition-all"
                                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                        {/* Loop markers */}
                        {loopA !== null && duration > 0 && (
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-amber-500"
                                style={{ left: `${(loopA / duration) * 100}%` }}
                            />
                        )}
                        {loopB !== null && duration > 0 && (
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-amber-500"
                                style={{ left: `${(loopB / duration) * 100}%` }}
                            />
                        )}
                        {loopActive && (
                            <div
                                className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-amber-500/30 rounded"
                                style={{
                                    left: `${(loopA! / duration) * 100}%`,
                                    width: `${((loopB! - loopA!) / duration) * 100}%`
                                }}
                            />
                        )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                        <span>{formatPlaybackTime(currentTime)}</span>
                        <span>{formatPlaybackTime(duration)}</span>
                    </div>
                </div>

                {/* Expand controls */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded-md transition-colors",
                        expanded ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                >
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
            </div>

            {/* Expanded controls */}
            {expanded && (
                <div className="px-4 pb-4 space-y-3 pt-1 border-t border-border/20">
                    {/* Speed options grid */}
                    <div className="flex gap-1">
                        {SPEED_OPTIONS.map(s => (
                            <button
                                key={s}
                                onClick={() => changeSpeed(s)}
                                className={cn(
                                    "flex-1 text-[10px] font-bold py-1.5 rounded-md transition-colors border",
                                    speed === s
                                        ? "bg-brand/20 text-brand border-brand/30"
                                        : "bg-muted/80 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                {s}x
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {/* Loop toggle */}
                        <button
                            onClick={handleLoopToggle}
                            className={cn(
                                "flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors border",
                                loopActive
                                    ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                                    : loopA !== null
                                        ? "bg-amber-500/5 border-amber-500/10 text-amber-500/60"
                                        : "bg-muted/80 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                            title={loopActive ? 'Clear loop' : loopA !== null ? 'Set loop end (B)' : 'Set loop start (A)'}
                        >
                            <Repeat className="w-3.5 h-3.5" />
                            {loopActive ? 'Clear Loop' : loopA !== null ? 'Set Point B' : 'A/B Loop'}
                        </button>

                        {/* Mute toggle */}
                        <button
                            onClick={toggleMute}
                            className={cn(
                                "flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors border",
                                muted
                                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                                    : "bg-muted/80 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                        >
                            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                            {muted ? "Muted" : "Mute"}
                        </button>
                    </div>

                    {/* Volume slider */}
                    <div className="flex items-center gap-3 bg-muted/50 p-2 rounded-lg">
                        <Volume2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <input
                            type="range"
                            min={0} max={1} step={0.05}
                            value={muted ? 0 : volume}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value)
                                setVolume(v)
                                if (audioRef.current) audioRef.current.volume = v
                                if (muted) setMuted(false)
                            }}
                            className="flex-1 h-1 bg-muted rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand cursor-pointer"
                        />
                    </div>

                    {/* Stats & Info */}
                    {(loopA !== null || cumulativeStats) && (
                        <div className="space-y-1.5 pt-2">
                            {loopA !== null && (
                                <div className="text-[10px] flex items-center justify-between text-amber-500/80 bg-amber-500/5 px-2 py-1 rounded">
                                    <span>Looping: {formatPlaybackTime(loopA)} → {loopB !== null ? formatPlaybackTime(loopB) : '...'}</span>
                                    <button onClick={() => { setLoopA(null); setLoopB(null) }} className="hover:text-amber-400 underline">Clear</button>
                                </div>
                            )}
                            {cumulativeStats && cumulativeStats.seconds > 0 && (
                                <div className="text-[10px] flex items-center gap-1.5 text-muted-foreground px-1">
                                    <Timer className="w-3 h-3" />
                                    <span>{formatPlaybackTime(cumulativeStats.seconds)} total practice</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
