'use client'

import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useT } from '@/i18n/client'
import { recordingFileUrl } from '@/lib/recordings/featured'
import { claimPlayback, releasePlayback } from '@/lib/recordings/now-playing'
import { cn } from '@/lib/utils'

export interface RecordingPlayerProps {
    recordingId: string
    title: string
    /** Drops the take title, for a row that already says what it is. */
    compact?: boolean
    className?: string
}

function clock(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00'
    const s = Math.floor(sec)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The one recording player: play/pause, a scrubber and the take title, on a
 * native audio element with preload none, so nothing downloads until someone
 * taps play. Starting one player pauses any other (now-playing). Ink chrome,
 * 44px targets; the blue stays with the page's one action.
 */
export function RecordingPlayer({ recordingId, title, compact, className }: RecordingPlayerProps) {
    const t = useT()
    const audioRef = useRef<HTMLAudioElement>(null)
    const [playing, setPlaying] = useState(false)
    const [time, setTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        const el = audioRef.current
        return () => {
            if (el) {
                el.pause()
                releasePlayback(el)
            }
        }
    }, [])

    const toggle = () => {
        const el = audioRef.current
        if (!el) return
        if (el.paused) {
            claimPlayback(el)
            setFailed(false)
            void el.play().catch(() => setFailed(true))
        } else {
            el.pause()
        }
    }

    const known = duration > 0
    return (
        <div data-testid="recording-player" className={cn('flex min-w-0 items-center gap-2', className)}>
            <audio
                ref={audioRef}
                preload="none"
                src={recordingFileUrl(recordingId)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                    setPlaying(false)
                    setTime(0)
                }}
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onDurationChange={(e) => setDuration(e.currentTarget.duration)}
                onError={() => setFailed(true)}
            />
            <button
                type="button"
                onClick={toggle}
                aria-label={playing ? t('recordings.pauseAria', { title }) : t('recordings.playAria', { title })}
                data-testid="recording-player-toggle"
                className={cn(
                    'touch-hit inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                    'border border-input bg-background text-foreground hover:bg-accent',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'transition-colors motion-reduce:transition-none',
                )}
            >
                {playing ? (
                    <Pause aria-hidden className="h-4 w-4 fill-current" />
                ) : (
                    // A physical icon: it never mirrors in right-to-left.
                    <Play aria-hidden className="ms-0.5 h-4 w-4 fill-current" />
                )}
            </button>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
                {compact ? null : (
                    <span className="truncate text-sm font-semibold text-foreground">{title}</span>
                )}
                {failed ? (
                    <span role="alert" className="text-xs text-destructive">
                        {t('recordings.playFailed')}
                    </span>
                ) : (
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            min={0}
                            max={known ? duration : 0}
                            step={1}
                            value={known ? Math.min(time, duration) : 0}
                            disabled={!known}
                            aria-label={t('recordings.seekAria', { title })}
                            onChange={(e) => {
                                const el = audioRef.current
                                const v = Number(e.target.value)
                                if (el) el.currentTime = v
                                setTime(v)
                            }}
                            className="h-11 min-w-0 flex-1 cursor-pointer accent-foreground disabled:cursor-default disabled:opacity-40"
                        />
                        <span className="tnum w-9 shrink-0 text-end text-xs text-muted-foreground">
                            {clock(known ? duration - time : 0)}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
