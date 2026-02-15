"use client"

import { Minus, Plus } from "lucide-react"
import { SetlistTrack } from "@/types/models"
import { getTransposedKeyName } from "@/lib/music-math"

export interface TrackTranspose {
    transposition: number
    preferFlats: boolean
    capoFret: number
}

interface TransposeTrackListProps {
    tracks: SetlistTrack[]
    trackTranspositions: Record<string, TrackTranspose>
    onUpdateTrack: (trackId: string, field: keyof TrackTranspose, value: number | boolean) => void
    onApplyGlobal: (semitones: number) => void
    activeTranspositions: number
}

export function TransposeTrackList({
    tracks,
    trackTranspositions,
    onUpdateTrack,
    onApplyGlobal,
    activeTranspositions,
}: TransposeTrackListProps) {
    return (
        <div className="space-y-3">
            {/* Quick Actions */}
            <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Quick:</span>
                {[-2, -1, 1, 2, 3, 5, 7].map(s => (
                    <button
                        key={s}
                        onClick={() => onApplyGlobal(s)}
                        className="px-2 py-1 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                        {s > 0 ? `+${s}` : s}
                    </button>
                ))}
                <button
                    onClick={() => onApplyGlobal(0)}
                    className="px-2 py-1 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                    Reset
                </button>
            </div>

            {/* Per-Track List */}
            <div className="bg-muted/50 rounded-lg divide-y divide-border">
                {tracks.filter(t => t.type !== 'header').map(track => {
                    const tp = trackTranspositions[track.id]
                    if (!tp) return null
                    const transposedKey = (track.key && tp.transposition !== 0)
                        ? getTransposedKeyName(track.key, tp.transposition)
                        : null

                    return (
                        <div key={track.id} className="flex items-center gap-2 px-3 py-2">
                            <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">{track.title}</div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {track.key && (
                                        <span className="font-mono">
                                            {track.key}
                                            {transposedKey && (
                                                <span className="text-violet-500 dark:text-violet-400"> → {transposedKey}</span>
                                            )}
                                        </span>
                                    )}
                                    {!track.fileId && (
                                        <span className="text-yellow-600 dark:text-yellow-500/60">no PDF</span>
                                    )}
                                </div>
                            </div>

                            {/* Transpose stepper */}
                            <div className="flex items-center gap-0.5 bg-muted rounded-md shrink-0">
                                <button
                                    className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => onUpdateTrack(
                                        track.id,
                                        'transposition',
                                        Math.max(tp.transposition - 1, -11)
                                    )}
                                >
                                    <Minus className="h-3 w-3" />
                                </button>
                                <span className={`w-8 text-center text-xs font-mono ${
                                    tp.transposition !== 0 ? 'text-violet-500 dark:text-violet-400' : 'text-muted-foreground'
                                }`}>
                                    {tp.transposition > 0 ? `+${tp.transposition}` : tp.transposition}
                                </span>
                                <button
                                    className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => onUpdateTrack(
                                        track.id,
                                        'transposition',
                                        Math.min(tp.transposition + 1, 11)
                                    )}
                                >
                                    <Plus className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {activeTranspositions > 0 && (
                <p className="text-xs text-violet-500 dark:text-violet-400/70">
                    {activeTranspositions} song{activeTranspositions !== 1 ? 's' : ''} will be transposed.
                    Chords are detected from the PDF text layer and replaced in the printed output.
                </p>
            )}
        </div>
    )
}
