"use client"

import { useState, useMemo, useEffect } from "react"
import { X, Printer, Download, Loader2, Music, Users, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SetlistTrack } from "@/types/models"
import { subscribeToAllMusicianProfiles, INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { MusicianProfile } from "@/types/models"
import { TransposeTrackList, TrackTranspose } from "./TransposeTrackList"
import { logger } from "@/lib/logger"

interface PrintModalProps {
    setlistName: string
    tracks: SetlistTrack[]
    onClose: () => void
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

    // Per-track transposition overrides
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

    const applyGlobalTranspose = (semitones: number) => {
        setTrackTranspositions(prev => {
            const next = { ...prev }
            for (const id of Object.keys(next)) {
                next[id] = { ...next[id], transposition: semitones }
            }
            return next
        })
    }

    // When a musician is selected, apply their transposition
    const applyMusicianProfile = (musicianUid: string) => {
        setSelectedMusician(musicianUid)
        const musician = musicians.find(m => m.uid === musicianUid)
        if (!musician) {
            setMusicianName("")
            return
        }

        const instrumentKey = musician.profile.instrument
        const preset = instrumentKey ? INSTRUMENT_PRESETS[instrumentKey] : null
        const label = preset?.label || instrumentKey || ''

        setMusicianName(`${musician.displayName}${label ? ` - ${label}` : ''}`)
        const transposition = musician.profile.defaultTransposition || 0

        if (transposition !== 0) {
            setTransposeMode('transposed')
            applyGlobalTranspose(transposition)
        } else {
            setTransposeMode('standard')
        }
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
        } catch (e: unknown) {
            logger.error('Print generation failed:', e)
            setError(e instanceof Error ? e.message : 'Failed to generate PDF')
        } finally {
            setGenerating(false)
        }
    }

    // Batch: generate all musician packets as a zip
    const [generatingAll, setGeneratingAll] = useState(false)
    const [batchProgress, setBatchProgress] = useState("")

    const handleGenerateAllPackets = async () => {
        if (musicians.length === 0) return
        setGeneratingAll(true)
        setError(null)

        try {
            const JSZip = (await import("jszip")).default
            const zip = new JSZip()
            let completed = 0

            for (const musician of musicians) {
                const preset = musician.profile.instrument ? INSTRUMENT_PRESETS[musician.profile.instrument] : null
                const label = preset?.label || musician.profile.instrument || ''
                const name = `${musician.displayName}${label ? ` - ${label}` : ''}`
                const transposition = musician.profile.defaultTransposition || 0

                completed++
                setBatchProgress(`${completed}/${musicians.length}: ${musician.displayName}`)

                const response = await fetch('/api/setlist/print', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        date,
                        musicianName: name,
                        eventName: eventName || undefined,
                        tracks: tracks.map(t => ({
                            title: t.title,
                            key: t.key || '',
                            notes: t.notes || '',
                            leadMusician: t.leadMusician || '',
                            fileId: t.fileId,
                            transposition,
                            preferFlats: musician.profile.preferFlats || false,
                            capoFret: musician.profile.preferredCapoFret || 0,
                        }))
                    })
                })

                if (!response.ok) continue

                const blob = await response.blob()
                const safeName = musician.displayName.replace(/[^a-z0-9]/gi, '_')
                zip.file(`${safeName}_gig_packet.pdf`, blob)
            }

            setBatchProgress("Creating zip...")
            const zipBlob = await zip.generateAsync({ type: 'blob' })
            const url = URL.createObjectURL(zipBlob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${title.replace(/[^a-z0-9]/gi, '_')}_all_packets.zip`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            onClose()
        } catch (e: unknown) {
            logger.error('Batch packet generation failed:', e)
            setError(e instanceof Error ? e.message : 'Failed to generate packets')
        } finally {
            setGeneratingAll(false)
            setBatchProgress("")
        }
    }

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                    <h2 className="text-xl font-bold">Print Setlist</h2>
                    <Button size="icon" variant="ghost" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 p-6 space-y-4">
                    {/* Basic Fields */}
                    <div>
                        <label className="text-sm text-muted-foreground mb-1 block">Title</label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Setlist title for cover page"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-muted-foreground mb-1 block">Date</label>
                        <Input
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            placeholder="e.g., Saturday, January 25, 2026"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm text-muted-foreground mb-1 block">Musician (optional)</label>
                            <Input
                                value={musicianName}
                                onChange={(e) => setMusicianName(e.target.value)}
                                placeholder="e.g., Daniel - Guitar"
                            />
                        </div>
                        <div>
                            <label className="text-sm text-muted-foreground mb-1 block">Event (optional)</label>
                            <Input
                                value={eventName}
                                onChange={(e) => setEventName(e.target.value)}
                                placeholder="e.g., Shabbat Morning"
                            />
                        </div>
                    </div>

                    {/* Print for Musician — quick select */}
                    {musicians.length > 0 && (
                        <div>
                            <label className="text-sm text-muted-foreground mb-1 flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5" /> Print for musician
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    onClick={() => applyMusicianProfile("")}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                        !selectedMusician
                                            ? 'bg-accent text-foreground'
                                            : 'bg-muted text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    Custom
                                </button>
                                {musicians.map(m => {
                                    const preset = m.profile.instrument ? INSTRUMENT_PRESETS[m.profile.instrument] : null
                                    return (
                                        <button
                                            key={m.uid}
                                            onClick={() => applyMusicianProfile(m.uid)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                                selectedMusician === m.uid
                                                    ? 'bg-violet-600/30 text-violet-600 dark:text-violet-300 border border-violet-500/30'
                                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {m.displayName}
                                            {preset && <span className="opacity-60 ml-1">({preset.label})</span>}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Mode Toggle */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setTransposeMode('standard')}
                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                                transposeMode === 'standard'
                                    ? 'bg-accent text-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Standard Print
                        </button>
                        <button
                            onClick={() => setTransposeMode('transposed')}
                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                transposeMode === 'transposed'
                                    ? 'bg-violet-600/30 text-violet-600 dark:text-violet-300 border border-violet-500/30'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Music className="h-3.5 w-3.5" />
                            Transposed Print
                        </button>
                    </div>

                    {/* Transposition Controls */}
                    {transposeMode === 'transposed' && (
                        <TransposeTrackList
                            tracks={tracks}
                            trackTranspositions={trackTranspositions}
                            onUpdateTrack={updateTrackTranspose}
                            onApplyGlobal={applyGlobalTranspose}
                            activeTranspositions={activeTranspositions}
                        />
                    )}

                    {/* Stats */}
                    <div className="bg-muted rounded-lg p-4 text-sm">
                        <div className="flex justify-between mb-2">
                            <span className="text-muted-foreground">Total songs</span>
                            <span className="font-medium">{tracks.length}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">PDFs to include</span>
                            <span className="font-medium text-green-600 dark:text-green-400">{linkedPdfTracks.length}</span>
                        </div>
                        {transposeMode === 'transposed' && activeTranspositions > 0 && (
                            <div className="flex justify-between mt-2">
                                <span className="text-muted-foreground">To be transposed</span>
                                <span className="font-medium text-violet-600 dark:text-violet-400">{activeTranspositions}</span>
                            </div>
                        )}
                        {linkedPdfTracks.length < tracks.length && (
                            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                                Note: {tracks.length - linkedPdfTracks.length} song(s) don&apos;t have linked PDF files and won&apos;t be included in the packet.
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="p-4 border-t border-border shrink-0 space-y-3">
                    {/* Print All Packets */}
                    {musicians.length > 1 && (
                        <Button
                            variant="outline"
                            className="w-full gap-2 border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
                            onClick={handleGenerateAllPackets}
                            disabled={generating || generatingAll || linkedPdfTracks.length === 0}
                        >
                            {generatingAll ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {batchProgress || "Generating..."}
                                </>
                            ) : (
                                <>
                                    <Package className="h-4 w-4" />
                                    Print All Packets ({musicians.length} musicians)
                                </>
                            )}
                        </Button>
                    )}

                    {/* Individual actions */}
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            className="flex-1 gap-2"
                            onClick={() => handleGenerate('download')}
                            disabled={generating || generatingAll || linkedPdfTracks.length === 0}
                        >
                            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Download PDF
                        </Button>
                        <Button
                            className="flex-1 gap-2"
                            onClick={() => handleGenerate('print')}
                            disabled={generating || generatingAll || linkedPdfTracks.length === 0}
                        >
                            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                            Print Now
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
