"use client"

import { useState, useMemo, useEffect } from "react"
import { X, Printer, Download, Loader2, Minus, Plus, Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SetlistTrack } from "@/types/models"
import { getTransposedKeyName } from "@/lib/music-math"
import { subscribeToAllMusicianProfiles, INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { MusicianProfile } from "@/types/models"

interface PrintModalProps {
    setlistName: string
    tracks: SetlistTrack[]
    onClose: () => void
}

interface TrackTranspose {
    transposition: number
    preferFlats: boolean
    capoFret: number
}

export function PrintModal({ setlistName, tracks, onClose }: PrintModalProps) {
    const [title, setTitle] = useState(setlistName)
    const [date, setDate] = useState(new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }))
    const [musicianName, setMusicianName] = useState("")
    const [eventName, setEventName] = useState("")
    const [generating, setGenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Transposition mode
    const [transposeMode, setTransposeMode] = useState<'standard' | 'transposed'>('standard')

    // Musician profiles for "Print for..." feature
    const [musicians, setMusicians] = useState<{ uid: string; displayName: string; profile: MusicianProfile }[]>([])
    const [selectedMusician, setSelectedMusician] = useState<string>("")

    useEffect(() => {
        const unsub = subscribeToAllMusicianProfiles(setMusicians)
        return unsub
    }, [])

    // When a musician is selected, apply their transposition to all tracks
    const applyMusicianProfile = (musicianUid: string) => {
        setSelectedMusician(musicianUid)
        const musician = musicians.find(m => m.uid === musicianUid)
        if (!musician) {
            // "None" selected - reset
            setMusicianName("")
            return
        }

        setMusicianName(musician.displayName)
        const transposition = musician.profile.defaultTransposition || 0

        if (transposition !== 0) {
            setTransposeMode('transposed')
            applyGlobalTranspose(transposition)
        } else {
            setTransposeMode('standard')
        }
    }

    // Per-track transposition overrides — initialized from setlist data
    const [trackTranspositions, setTrackTranspositions] = useState<Record<string, TrackTranspose>>(() => {
        const init: Record<string, TrackTranspose> = {}
        tracks.forEach(t => {
            init[t.id] = {
                transposition: t.transposition || 0,
                preferFlats: false,
                capoFret: 0,
            }
        })
        return init
    })

    const linkedPdfTracks = tracks.filter(t => !!t.fileId)

    // Count how many tracks have active transposition
    const activeTranspositions = useMemo(() => {
        if (transposeMode !== 'transposed') return 0
        return Object.values(trackTranspositions).filter(t => t.transposition !== 0).length
    }, [transposeMode, trackTranspositions])

    const updateTrackTranspose = (trackId: string, field: keyof TrackTranspose, value: number | boolean) => {
        setTrackTranspositions(prev => ({
            ...prev,
            [trackId]: { ...prev[trackId], [field]: value }
        }))
    }

    // Apply a global transposition to all tracks at once
    const applyGlobalTranspose = (semitones: number) => {
        setTrackTranspositions(prev => {
            const next = { ...prev }
            for (const id of Object.keys(next)) {
                next[id] = { ...next[id], transposition: semitones }
            }
            return next
        })
    }

    const handleGenerate = async (mode: 'download' | 'print') => {
        setGenerating(true)
        setError(null)

        try {
            const response = await fetch('/api/setlist/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    date,
                    musicianName: musicianName || undefined,
                    eventName: eventName || undefined,
                    tracks: tracks.map(t => {
                        const tp = transposeMode === 'transposed' ? trackTranspositions[t.id] : null
                        return {
                            title: t.title,
                            key: t.key || '',
                            notes: t.notes || '',
                            leadMusician: t.leadMusician || '',
                            fileId: t.fileId,
                            transposition: tp?.transposition || 0,
                            preferFlats: tp?.preferFlats || false,
                            capoFret: tp?.capoFret || 0,
                        }
                    })
                })
            })

            if (!response.ok) {
                const errData = await response.json()
                throw new Error(errData.error || 'Failed to generate PDF')
            }

            const blob = await response.blob()
            const url = URL.createObjectURL(blob)

            if (mode === 'download') {
                const a = document.createElement('a')
                a.href = url
                a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
                onClose()
            } else {
                const printWindow = window.open(url)
                if (printWindow) {
                    printWindow.onload = () => {
                        printWindow.print()
                    }
                }
            }
        } catch (e: any) {
            console.error('Print generation failed:', e)
            setError(e.message || 'Failed to generate PDF')
        } finally {
            setGenerating(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
                    <h2 className="text-xl font-bold">Print Setlist</h2>
                    <Button size="icon" variant="ghost" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 p-6 space-y-4">
                    {/* Basic Fields */}
                    <div>
                        <label className="text-sm text-zinc-400 mb-1 block">Title</label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Setlist title for cover page"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-zinc-400 mb-1 block">Date</label>
                        <Input
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            placeholder="e.g., Saturday, January 25, 2026"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm text-zinc-400 mb-1 block">Musician (optional)</label>
                            <Input
                                value={musicianName}
                                onChange={(e) => setMusicianName(e.target.value)}
                                placeholder="e.g., Daniel - Guitar"
                            />
                        </div>
                        <div>
                            <label className="text-sm text-zinc-400 mb-1 block">Event (optional)</label>
                            <Input
                                value={eventName}
                                onChange={(e) => setEventName(e.target.value)}
                                placeholder="e.g., Shabbat Morning"
                            />
                        </div>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setTransposeMode('standard')}
                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                                transposeMode === 'standard'
                                    ? 'bg-zinc-700 text-white'
                                    : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            Standard Print
                        </button>
                        <button
                            onClick={() => setTransposeMode('transposed')}
                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                transposeMode === 'transposed'
                                    ? 'bg-violet-600/30 text-violet-300 border border-violet-500/30'
                                    : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            <Music className="h-3.5 w-3.5" />
                            Transposed Print
                        </button>
                    </div>

                    {/* Transposition Controls */}
                    {transposeMode === 'transposed' && (
                        <div className="space-y-3">
                            {/* Quick Actions */}
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-zinc-500">Quick:</span>
                                {[-2, -1, 1, 2, 3, 5, 7].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => applyGlobalTranspose(s)}
                                        className="px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                                    >
                                        {s > 0 ? `+${s}` : s}
                                    </button>
                                ))}
                                <button
                                    onClick={() => applyGlobalTranspose(0)}
                                    className="px-2 py-1 rounded bg-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                                >
                                    Reset
                                </button>
                            </div>

                            {/* Per-Track List */}
                            <div className="bg-zinc-800/50 rounded-lg divide-y divide-zinc-800">
                                {tracks.filter(t => t.type !== 'header').map(track => {
                                    const tp = trackTranspositions[track.id]
                                    if (!tp) return null
                                    const transposedKey = (track.key && tp.transposition !== 0)
                                        ? getTransposedKeyName(track.key, tp.transposition)
                                        : null

                                    return (
                                        <div key={track.id} className="flex items-center gap-2 px-3 py-2">
                                            {/* Song info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm truncate">{track.title}</div>
                                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                                    {track.key && (
                                                        <span className="font-mono">
                                                            {track.key}
                                                            {transposedKey && (
                                                                <span className="text-violet-400"> → {transposedKey}</span>
                                                            )}
                                                        </span>
                                                    )}
                                                    {!track.fileId && (
                                                        <span className="text-yellow-500/60">no PDF</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Transpose stepper */}
                                            <div className="flex items-center gap-0.5 bg-zinc-900 rounded-md shrink-0">
                                                <button
                                                    className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                                                    onClick={() => updateTrackTranspose(
                                                        track.id,
                                                        'transposition',
                                                        Math.max(tp.transposition - 1, -11)
                                                    )}
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </button>
                                                <span className={`w-8 text-center text-xs font-mono ${
                                                    tp.transposition !== 0 ? 'text-violet-400' : 'text-zinc-600'
                                                }`}>
                                                    {tp.transposition > 0 ? `+${tp.transposition}` : tp.transposition}
                                                </span>
                                                <button
                                                    className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                                                    onClick={() => updateTrackTranspose(
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
                                <p className="text-xs text-violet-400/70">
                                    {activeTranspositions} song{activeTranspositions !== 1 ? 's' : ''} will be transposed.
                                    Chords are detected from the PDF text layer and replaced in the printed output.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Stats */}
                    <div className="bg-zinc-800 rounded-lg p-4 text-sm">
                        <div className="flex justify-between mb-2">
                            <span className="text-zinc-400">Total songs</span>
                            <span className="font-medium">{tracks.length}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-zinc-400">PDFs to include</span>
                            <span className="font-medium text-green-400">{linkedPdfTracks.length}</span>
                        </div>
                        {transposeMode === 'transposed' && activeTranspositions > 0 && (
                            <div className="flex justify-between mt-2">
                                <span className="text-zinc-400">To be transposed</span>
                                <span className="font-medium text-violet-400">{activeTranspositions}</span>
                            </div>
                        )}
                        {linkedPdfTracks.length < tracks.length && (
                            <p className="text-xs text-yellow-400 mt-2">
                                Note: {tracks.length - linkedPdfTracks.length} song(s) don't have linked PDF files and won't be included in the packet.
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 p-4 border-t border-zinc-800 shrink-0">
                    <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => handleGenerate('download')}
                        disabled={generating || linkedPdfTracks.length === 0}
                    >
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Download PDF
                    </Button>
                    <Button
                        className="flex-1 gap-2"
                        onClick={() => handleGenerate('print')}
                        disabled={generating || linkedPdfTracks.length === 0}
                    >
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                        Print Now
                    </Button>
                </div>
            </div>
        </div>
    )
}
