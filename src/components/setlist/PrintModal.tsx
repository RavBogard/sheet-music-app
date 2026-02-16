"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { X, Printer, Download, Loader2, Users, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SetlistTrack } from "@/types/models"
import { useAuth } from "@/lib/auth-context"
import { subscribeToAllMusicianProfiles, INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { MusicianProfile } from "@/types/models"
import { TransposeTrackList, TrackTranspose } from "./TransposeTrackList"
import { logger } from "@/lib/logger"

const STORAGE_KEY = "crc-print-selection"

type PrintMode = "standard" | "just-me" | "select-musicians"

interface SavedSelection {
    mode: PrintMode
    selectedUids: string[]
}

function loadSavedSelection(): SavedSelection | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : null
    } catch { return null }
}

function saveSelection(sel: SavedSelection) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sel)) } catch { /* noop */ }
}

interface PrintModalProps {
    setlistName: string
    tracks: SetlistTrack[]
    onClose: () => void
}

export function PrintModal({ setlistName, tracks, onClose }: PrintModalProps) {
    const { user, profile } = useAuth()
    const [title, setTitle] = useState(setlistName)
    const [date, setDate] = useState(new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }))
    const [eventName, setEventName] = useState("")
    const [generating, setGenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Musicians
    const [musicians, setMusicians] = useState<{ uid: string; displayName: string; profile: MusicianProfile }[]>([])
    useEffect(() => {
        const unsub = subscribeToAllMusicianProfiles(setMusicians)
        return unsub
    }, [])

    // ── Print Mode ──
    const saved = useMemo(() => loadSavedSelection(), [])
    const myProfile = profile?.musicianProfile
    const hasMyProfile = !!myProfile?.instrument

    const [printMode, setPrintMode] = useState<PrintMode>(() => {
        if (saved?.mode) return saved.mode
        return hasMyProfile ? "just-me" : "standard"
    })

    const [selectedUids, setSelectedUids] = useState<string[]>(() => {
        return saved?.selectedUids || []
    })

    // Persist on change
    useEffect(() => {
        saveSelection({ mode: printMode, selectedUids })
    }, [printMode, selectedUids])

    const toggleMusician = (uid: string) => {
        setSelectedUids(prev =>
            prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid]
        )
    }

    // ── Per-track transposition (for "just-me" or single selected musician) ──
    const [trackTranspositions, setTrackTranspositions] = useState<Record<string, TrackTranspose>>(() => {
        const init: Record<string, TrackTranspose> = {}
        tracks.forEach(t => {
            init[t.id] = { transposition: t.transposition || 0, preferFlats: false, capoFret: 0 }
        })
        return init
    })

    const updateTrackTranspose = (trackId: string, field: keyof TrackTranspose, value: number | boolean) => {
        setTrackTranspositions(prev => ({
            ...prev, [trackId]: { ...prev[trackId], [field]: value }
        }))
    }

    const applyGlobalTranspose = useCallback((semitones: number, preferFlats = false, capoFret = 0) => {
        setTrackTranspositions(prev => {
            const next = { ...prev }
            for (const id of Object.keys(next)) {
                next[id] = { ...next[id], transposition: semitones, preferFlats, capoFret }
            }
            return next
        })
    }, [])

    // Auto-apply "just me" profile transposition
    useEffect(() => {
        if (printMode === "just-me" && myProfile) {
            applyGlobalTranspose(
                myProfile.defaultTransposition || 0,
                myProfile.preferFlats || false,
                myProfile.preferredCapoFret || 0,
            )
        }
    }, [printMode, myProfile, applyGlobalTranspose])

    const linkedPdfTracks = tracks.filter(t => !!t.fileId)

    const activeTranspositions = useMemo(() => {
        if (printMode === "standard") return 0
        return Object.values(trackTranspositions).filter(t => t.transposition !== 0).length
    }, [printMode, trackTranspositions])

    // ── My label ──
    const myLabel = useMemo(() => {
        if (!myProfile?.instrument) return null
        const preset = INSTRUMENT_PRESETS[myProfile.instrument]
        const parts = [user?.displayName?.split(' ')[0] || "Me"]
        if (preset?.label) parts.push(preset.label)
        if (myProfile.preferredCapoFret) parts.push(`Capo ${myProfile.preferredCapoFret}`)
        return parts.join(" — ")
    }, [myProfile, user])

    // ── Generate single PDF ──
    const generateForMusician = async (
        name: string,
        transposition: number,
        preferFlats: boolean,
        capoFret: number,
    ): Promise<Blob> => {
        const response = await fetch('/api/setlist/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title, date,
                musicianName: name || undefined,
                eventName: eventName || undefined,
                tracks: tracks.map(t => {
                    const useTransposition = printMode === "just-me"
                    const tp = useTransposition ? trackTranspositions[t.id] : null
                    return {
                        title: t.title, key: t.key || '', notes: t.notes || '',
                        leadMusician: t.leadMusician || '', fileId: t.fileId,
                        transposition: tp ? tp.transposition : transposition,
                        preferFlats: tp ? tp.preferFlats : preferFlats,
                        capoFret: tp ? tp.capoFret : capoFret,
                    }
                })
            })
        })
        if (!response.ok) {
            const err = await response.json()
            throw new Error(err.error || 'Failed to generate PDF')
        }
        return response.blob()
    }

    const handleGenerate = async (mode: 'download' | 'print') => {
        setGenerating(true)
        setError(null)

        try {
            if (printMode === "select-musicians" && selectedUids.length > 1) {
                // Multi-musician → ZIP
                const JSZip = (await import("jszip")).default
                const zip = new JSZip()

                for (const uid of selectedUids) {
                    const m = musicians.find(x => x.uid === uid)
                    if (!m) continue
                    const preset = m.profile.instrument ? INSTRUMENT_PRESETS[m.profile.instrument] : null
                    const label = preset?.label || ''
                    const name = `${m.displayName}${label ? ` - ${label}` : ''}`
                    const blob = await generateForMusician(
                        name,
                        m.profile.defaultTransposition || 0,
                        m.profile.preferFlats || false,
                        m.profile.preferredCapoFret || 0,
                    )
                    zip.file(`${m.displayName.replace(/[^a-z0-9]/gi, '_')}_gig_packet.pdf`, blob)
                }

                const zipBlob = await zip.generateAsync({ type: 'blob' })
                const url = URL.createObjectURL(zipBlob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${title.replace(/[^a-z0-9]/gi, '_')}_packets.zip`
                document.body.appendChild(a); a.click(); document.body.removeChild(a)
                URL.revokeObjectURL(url)
                onClose()
                return
            }

            // Single PDF
            let name = ""
            let transposition = 0
            let preferFlats = false
            let capoFret = 0

            if (printMode === "just-me" && myProfile) {
                const preset = myProfile.instrument ? INSTRUMENT_PRESETS[myProfile.instrument] : null
                name = `${user?.displayName || ""}${preset?.label ? ` - ${preset.label}` : ''}`
                transposition = myProfile.defaultTransposition || 0
                preferFlats = myProfile.preferFlats || false
                capoFret = myProfile.preferredCapoFret || 0
            } else if (printMode === "select-musicians" && selectedUids.length === 1) {
                const m = musicians.find(x => x.uid === selectedUids[0])
                if (m) {
                    const preset = m.profile.instrument ? INSTRUMENT_PRESETS[m.profile.instrument] : null
                    name = `${m.displayName}${preset?.label ? ` - ${preset.label}` : ''}`
                    transposition = m.profile.defaultTransposition || 0
                    preferFlats = m.profile.preferFlats || false
                    capoFret = m.profile.preferredCapoFret || 0
                }
            }

            const blob = await generateForMusician(name, transposition, preferFlats, capoFret)
            const url = URL.createObjectURL(blob)

            if (mode === 'download') {
                const a = document.createElement('a')
                a.href = url
                a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`
                document.body.appendChild(a); a.click(); document.body.removeChild(a)
                URL.revokeObjectURL(url)
                onClose()
            } else {
                const printWindow = window.open(url)
                if (printWindow) { printWindow.onload = () => printWindow.print() }
            }
        } catch (e: unknown) {
            logger.error('Print generation failed:', e)
            setError(e instanceof Error ? e.message : 'Failed to generate PDF')
        } finally {
            setGenerating(false)
        }
    }

    const canGenerate = linkedPdfTracks.length > 0 && !generating &&
        (printMode !== "select-musicians" || selectedUids.length > 0)

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                    <h2 className="text-xl font-bold">Print Gig Packet</h2>
                    <Button size="icon" variant="ghost" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 p-6 space-y-5">
                    {/* Basic Fields */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="text-sm text-muted-foreground mb-1 block">Title</label>
                            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Setlist title" />
                        </div>
                        <div>
                            <label className="text-sm text-muted-foreground mb-1 block">Date</label>
                            <Input value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm text-muted-foreground mb-1 block">Event (optional)</label>
                            <Input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="e.g., Shabbat Morning" />
                        </div>
                    </div>

                    {/* ── Print Mode Selector ── */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Print for:</label>

                        {/* Standard */}
                        <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                            <input
                                type="radio" name="printMode" value="standard"
                                checked={printMode === "standard"}
                                onChange={() => setPrintMode("standard")}
                                className="accent-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium">Standard</span>
                                <span className="text-xs text-muted-foreground ml-2">No transposition</span>
                            </div>
                        </label>

                        {/* Just Me */}
                        {hasMyProfile && (
                            <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                printMode === "just-me"
                                    ? "border-violet-500/50 bg-violet-500/5"
                                    : "border-border hover:bg-muted/50"
                            }`}>
                                <input
                                    type="radio" name="printMode" value="just-me"
                                    checked={printMode === "just-me"}
                                    onChange={() => setPrintMode("just-me")}
                                    className="accent-violet-500"
                                />
                                <User className="h-4 w-4 text-violet-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium">Just me</span>
                                    <span className="text-xs text-muted-foreground ml-2">{myLabel}</span>
                                </div>
                            </label>
                        )}

                        {/* Select Musicians */}
                        {musicians.length > 0 && (
                            <div className={`rounded-lg border transition-colors ${
                                printMode === "select-musicians"
                                    ? "border-violet-500/50 bg-violet-500/5"
                                    : "border-border"
                            }`}>
                                <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 rounded-t-lg">
                                    <input
                                        type="radio" name="printMode" value="select-musicians"
                                        checked={printMode === "select-musicians"}
                                        onChange={() => setPrintMode("select-musicians")}
                                        className="accent-violet-500"
                                    />
                                    <Users className="h-4 w-4 text-violet-500 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium">Select musicians</span>
                                        {printMode === "select-musicians" && selectedUids.length > 0 && (
                                            <span className="text-xs text-violet-500 ml-2">
                                                {selectedUids.length} selected
                                                {selectedUids.length > 1 && " → ZIP"}
                                            </span>
                                        )}
                                    </div>
                                </label>

                                {/* Musician Checkboxes (always visible when mode selected) */}
                                {printMode === "select-musicians" && (
                                    <div className="px-3 pb-3 space-y-1">
                                        <div className="flex gap-2 mb-2">
                                            <button
                                                onClick={() => setSelectedUids(musicians.map(m => m.uid))}
                                                className="text-xs text-muted-foreground hover:text-foreground"
                                            >
                                                Select all
                                            </button>
                                            <span className="text-muted-foreground/30">·</span>
                                            <button
                                                onClick={() => setSelectedUids([])}
                                                className="text-xs text-muted-foreground hover:text-foreground"
                                            >
                                                Deselect all
                                            </button>
                                        </div>
                                        {musicians.map(m => {
                                            const preset = m.profile.instrument ? INSTRUMENT_PRESETS[m.profile.instrument] : null
                                            return (
                                                <label key={m.uid} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedUids.includes(m.uid)}
                                                        onChange={() => toggleMusician(m.uid)}
                                                        className="accent-violet-600 w-4 h-4 rounded"
                                                    />
                                                    <span className="text-sm">{m.displayName}</span>
                                                    {preset && <span className="text-xs text-muted-foreground">({preset.label})</span>}
                                                </label>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Transposition Details (just-me mode) */}
                    {printMode === "just-me" && activeTranspositions > 0 && (
                        <TransposeTrackList
                            tracks={tracks}
                            trackTranspositions={trackTranspositions}
                            onUpdateTrack={updateTrackTranspose}
                            onApplyGlobal={(s) => applyGlobalTranspose(s)}
                            activeTranspositions={activeTranspositions}
                        />
                    )}

                    {/* Stats */}
                    <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Songs</span>
                            <span className="font-medium">{tracks.length}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">PDFs included</span>
                            <span className="font-medium text-green-600 dark:text-green-400">{linkedPdfTracks.length}</span>
                        </div>
                        {printMode !== "standard" && activeTranspositions > 0 && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Transposed</span>
                                <span className="font-medium text-violet-500">{activeTranspositions}</span>
                            </div>
                        )}
                        {linkedPdfTracks.length < tracks.length && (
                            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                                {tracks.length - linkedPdfTracks.length} song(s) without PDFs won&apos;t be included.
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
                <div className="p-4 border-t border-border shrink-0">
                    <div className="flex gap-3">
                        <Button
                            variant="outline" className="flex-1 gap-2"
                            onClick={() => handleGenerate('download')}
                            disabled={!canGenerate}
                        >
                            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            {printMode === "select-musicians" && selectedUids.length > 1 ? "Download ZIP" : "Download PDF"}
                        </Button>
                        <Button
                            className="flex-1 gap-2"
                            onClick={() => handleGenerate('print')}
                            disabled={!canGenerate || (printMode === "select-musicians" && selectedUids.length > 1)}
                        >
                            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                            Print
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
