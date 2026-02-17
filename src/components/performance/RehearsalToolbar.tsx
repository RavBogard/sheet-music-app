"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
    Play, Pause, SkipBack, Volume2, VolumeX,
    Gauge, Repeat, Timer, ChevronDown, ChevronUp,
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
export function RehearsalToolbar({ audioUrl, title, fileId, onPracticeTime }: RehearsalToolbarProps) {
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
                }).catch(() => {})
            })
        })
    }, [fileId])

    // Initialize audio element
    useEffect(() => {
        const audio = new Audio()
        audio.preload = 'auto'
        audio.crossOrigin = 'anonymous'
        audioRef.current = audio

        audio.addEventListener('loadedmetadata', () => setDuration(audio.duration))
        audio.addEventListener('timeupdate', () => {
            setCurrentTime(audio.currentTime)
        })
        audio.addEventListener('ended', () => {
            setPlaying(false)
            if (practiceStart.current) {
                totalPracticed.current += (Date.now() - practiceStart.current) / 1000
                practiceStart.current = null
            }
        })

        audio.src = audioUrl
        audio.volume = 0.8

        return () => {
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
    }, [audioUrl]) // eslint-disable-line react-hooks/exhaustive-deps

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
            audio.play().catch(() => {})
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
                    setDoc(ref, { preferredSpeed: newSpeed }, { merge: true }).catch(() => {})
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

    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border shadow-lg">
            {/* Compact bar */}
            <div className="flex items-center gap-2 px-3 py-2">
                {/* Play/Pause */}
                <button onClick={togglePlay} className="p-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white transition-colors shrink-0">
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                {/* Restart */}
                <button onClick={resetToStart} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                    <SkipBack className="w-3.5 h-3.5" />
                </button>

                {/* Progress bar */}
                <div className="flex-1 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                        {formatTime(currentTime)}
                    </span>
                    <div className="relative flex-1 h-6 flex items-center group cursor-pointer"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const pct = (e.clientX - rect.left) / rect.width
                            seek(pct * duration)
                        }}
                    >
                        <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-violet-500 rounded-full transition-all"
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
                                className="absolute top-1/2 -translate-y-1/2 h-1 bg-amber-500/20 rounded"
                                style={{
                                    left: `${(loopA! / duration) * 100}%`,
                                    width: `${((loopB! - loopA!) / duration) * 100}%`
                                }}
                            />
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-8">
                        {formatTime(duration)}
                    </span>
                </div>

                {/* Speed badge */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${speed !== 1.0 ? 'bg-violet-500/20 text-violet-400' : 'text-muted-foreground'}`}
                >
                    {speed}x
                </button>

                {/* Loop toggle */}
                <button
                    onClick={handleLoopToggle}
                    className={`p-1.5 rounded transition-colors ${loopActive ? 'text-amber-500' : loopA !== null ? 'text-amber-500/60' : 'text-muted-foreground hover:text-foreground'}`}
                    title={loopActive ? 'Clear loop' : loopA !== null ? 'Set loop end (B)' : 'Set loop start (A)'}
                >
                    <Repeat className="w-3.5 h-3.5" />
                </button>

                {/* Expand button */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>
            </div>

            {/* Expanded controls */}
            {expanded && (
                <div className="px-4 pb-3 space-y-3 border-t border-border pt-3">
                    {/* Speed */}
                    <div className="flex items-center gap-3">
                        <Gauge className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground w-12">Speed</span>
                        <div className="flex gap-1 flex-1">
                            {SPEED_OPTIONS.map(s => (
                                <button
                                    key={s}
                                    onClick={() => changeSpeed(s)}
                                    className={`flex-1 text-[10px] font-medium py-1 rounded transition-colors ${speed === s
                                        ? 'bg-violet-600 text-white'
                                        : 'bg-muted text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {s}x
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Volume */}
                    <div className="flex items-center gap-3">
                        <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground">
                            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>
                        <span className="text-xs text-muted-foreground w-12">Volume</span>
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
                            className="flex-1 accent-violet-500 h-1"
                        />
                    </div>

                    {/* Loop info */}
                    {loopA !== null && (
                        <div className="flex items-center gap-3">
                            <Repeat className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="text-xs text-muted-foreground">
                                Loop: {formatTime(loopA)}{loopB !== null ? ` → ${formatTime(loopB)}` : ' → tap loop again for B'}
                            </span>
                            <button
                                onClick={() => { setLoopA(null); setLoopB(null) }}
                                className="text-xs text-muted-foreground hover:text-foreground ml-auto"
                            >
                                Clear
                            </button>
                        </div>
                    )}

                    {/* Practice time */}
                    <div className="flex items-center gap-3">
                        <Timer className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground">
                            This session: {formatTime(totalPracticed.current + (practiceStart.current ? (Date.now() - practiceStart.current) / 1000 : 0))}
                            {cumulativeStats && cumulativeStats.seconds > 0 && (
                                <span className="ml-2 text-muted-foreground/70">
                                    · Total: {formatTime(cumulativeStats.seconds)} across {cumulativeStats.sessions} session{cumulativeStats.sessions !== 1 ? 's' : ''}
                                </span>
                            )}
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
}
