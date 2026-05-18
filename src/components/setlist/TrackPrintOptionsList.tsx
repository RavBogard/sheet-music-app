"use client"

import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { SetlistTrack } from "@/types/models"
import { getTransposedKeyName } from "@/lib/music-math"

export interface TrackTranspose {
    transposition: number
    preferFlats: boolean
    capoFret: number
}

interface TrackPrintOptionsListProps {
    tracks: SetlistTrack[]
    trackTranspositions: Record<string, TrackTranspose>
    onUpdateTrack: (trackId: string, field: keyof TrackTranspose, value: number | boolean) => void
    onApplyGlobal: (semitones: number) => void
    activeTranspositions: number
    selectedTrackIds: Set<string>
    onToggleTrackSelection: (trackId: string, selected: boolean) => void
    onSelectAll: () => void
    onSelectNone: () => void
}

export function TrackPrintOptionsList({
    tracks,
    trackTranspositions,
    onUpdateTrack,
    onApplyGlobal,
    activeTranspositions,
    selectedTrackIds,
    onToggleTrackSelection,
    onSelectAll,
    onSelectNone,
}: TrackPrintOptionsListProps) {
    const printableTracks = tracks.filter(t => t.type !== 'header' && !!t.fileId)

    return (
        <div className="space-y-3" data-testid="transpose-track-list">
            {/* Quick Actions */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground mr-1">Include:</span>
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={onSelectAll}
                        className="bg-muted text-muted-foreground hover:text-foreground hover:bg-accent px-3"
                    >
                        All
                    </Button>
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={onSelectNone}
                        className="bg-muted text-muted-foreground hover:text-foreground border border-border hover:bg-destructive/10 px-3"
                    >
                        None
                    </Button>
                </div>

                <div className="flex items-center gap-2 text-xs hidden sm:flex">
                    <span className="text-muted-foreground mr-1">Transpose:</span>
                    {[-2, -1, 1, 2, 3, 5, 7].map(s => (
                        <Button
                            key={s}
                            variant="ghost"
                            size="xs"
                            onClick={() => onApplyGlobal(s)}
                            className="bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
                        >
                            {s > 0 ? `+${s}` : s}
                        </Button>
                    ))}
                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => onApplyGlobal(0)}
                        className="bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                        Reset
                    </Button>
                </div>
            </div>

            {/* Per-Track List */}
            <div className="bg-muted/30 border border-border rounded-lg divide-y divide-border overflow-hidden">
                {printableTracks.map(track => {
                    const tp = trackTranspositions[track.id]
                    if (!tp) return null
                    const transposedKey = (track.key && tp.transposition !== 0)
                        ? getTransposedKeyName(track.key, tp.transposition)
                        : null
                    const isSelected = selectedTrackIds.has(track.id)

                    return (
                        <div 
                            key={track.id} 
                            className={`flex items-center gap-3 px-3 py-2 transition-colors ${!isSelected ? 'opacity-50 grayscale bg-muted/50' : ''}`}
                        >
                            <Checkbox 
                                checked={isSelected}
                                onCheckedChange={(checked) => onToggleTrackSelection(track.id, checked as boolean)}
                                id={`print-track-${track.id}`}
                                className="h-5 w-5 data-[state=checked]:bg-brand data-[state=checked]:border-brand"
                            />
                            
                            <label 
                                htmlFor={`print-track-${track.id}`}
                                className="flex-1 min-w-0 cursor-pointer py-1"
                            >
                                <div className={`text-sm font-medium truncate ${!isSelected ? 'line-through decoration-muted-foreground/50' : ''}`}>
                                    {track.title}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                    {track.key && (
                                        <span className="font-mono">
                                            {track.key}
                                            {transposedKey && (
                                                <span className="text-violet-500 dark:text-violet-400"> → {transposedKey}</span>
                                            )}
                                        </span>
                                    )}
                                </div>
                            </label>

                            {/* Transpose stepper */}
                            <div role="group" aria-label={`Transpose ${track.title}`} className="flex items-center gap-0.5 bg-muted rounded-md shrink-0">
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label="Transpose down one semitone"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => onUpdateTrack(
                                        track.id,
                                        'transposition',
                                        Math.max(tp.transposition - 1, -11)
                                    )}
                                >
                                    <Minus className="h-3 w-3" />
                                </Button>
                                <span className={`w-8 text-center text-xs font-mono ${
                                    tp.transposition !== 0 ? 'text-violet-500 dark:text-violet-400' : 'text-muted-foreground'
                                }`}>
                                    {tp.transposition > 0 ? `+${tp.transposition}` : tp.transposition}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label="Transpose up one semitone"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => onUpdateTrack(
                                        track.id,
                                        'transposition',
                                        Math.min(tp.transposition + 1, 11)
                                    )}
                                >
                                    <Plus className="h-3 w-3" />
                                </Button>
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
