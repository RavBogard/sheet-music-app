"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { X, Printer, Download, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SetlistTrack } from "@/types/models"
import { useAuth } from "@/lib/auth-context"
import { subscribeToAllMusicianProfiles, INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { MusicianProfile } from "@/types/models"
import { TransposeTrackList, TrackTranspose } from "./TransposeTrackList"
import { PrintModeSelector, PrintMode } from "./PrintModeSelector"
import { PrintStats } from "./PrintStats"
import { logger } from "@/lib/logger"
import { toast } from "sonner"

const STORAGE_KEY = "crc-print-selection"

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
    setlistId?: string
}

export function PrintModal({ setlistName, tracks, onClose, setlistId }: PrintModalProps) {
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

    useEffect(() => {
        saveSelection({ mode: printMode, selectedUids })
    }, [printMode, selectedUids])

    const toggleMusician = (uid: string) => {
        setSelectedUids(prev =>
            prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid]
        )
    }

    // ── Per-track transposition ──
    const [trackTranspositions, setTrackTranspositions] = useState<Record<string, TrackTranspose>>(() => {
        const init: Record<string, TrackTranspose> = {}
        tracks.forEach(t => {
            init[t.id] = { transposition: t.transposition || 0, preferFlats: false, capoFret: 0 }
        })
        return init
    })

    // Email packets
    const [sendingEmails, setSendingEmails] = useState(false)

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

    useEffect(() => {
        if (printMode === "just-me" && myProfile) {
            applyGlobalTranspose(
                myProfile.defaultTransposition || 0,
                myProfile.preferFlats || false,
                myProfile.preferredCapoFret || 0,
            )
        }
    }, [printMode, myProfile, applyGlobalTranspose])

    // ── Computed values ──
    const linkedPdfTracks = tracks.filter(t => !!t.fileId)

    const activeTranspositions = useMemo(() => {
        if (printMode === "standard") return 0
        return Object.values(trackTranspositions).filter(t => t.transposition !== 0).length
    }, [printMode, trackTranspositions])

    const myLabel = useMemo(() => {
        if (!myProfile?.instrument) return null
        const preset = INSTRUMENT_PRESETS[myProfile.instrument]
        const parts = [user?.displayName?.split(' ')[0] || "Me"]
        if (preset?.label) parts.push(preset.label)
        if (myProfile.preferredCapoFret) parts.push(`Capo ${myProfile.preferredCapoFret}`)
        return parts.join(" — ")
    }, [myProfile, user])

    // ── PDF Generation ──
    const generateForMusician = async (
        name: string, transposition: number, preferFlats: boolean, capoFret: number,
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
                        // Service flow fields
                        type: t.type,
                        performer: t.performer,
                        estimatedMinutes: t.estimatedMinutes,
                        description: t.description,
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

    const handleEmailPackets = async () => {
        if (!setlistId) {
            toast.error('Cannot email packets: setlist not saved yet')
            return
        }
        setSendingEmails(true)
        try {
            const response = await fetch('/api/setlist/email-packets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ setlistId }),
            })
            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Failed to send emails')
            }
            const result = await response.json()
            toast.success(`Packet links emailed to ${result.sent} musician${result.sent !== 1 ? 's' : ''}`)
            if (result.failed > 0) {
                toast.warning(`${result.failed} email${result.failed !== 1 ? 's' : ''} failed to send`)
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to send packet emails')
        } finally {
            setSendingEmails(false)
        }
    }

    const handleGenerate = async (mode: 'download' | 'print') => {
        setGenerating(true)
        setError(null)

        try {
            if (printMode === "select-musicians" && selectedUids.length > 1) {
                const JSZip = (await import("jszip")).default
                const zip = new JSZip()

                for (const uid of selectedUids) {
                    const m = musicians.find(x => x.uid === uid)
                    if (!m) continue
                    const preset = m.profile.instrument ? INSTRUMENT_PRESETS[m.profile.instrument] : null
                    const label = preset?.label || ''
                    const name = `${m.displayName}${label ? ` - ${label}` : ''}`
                    const blob = await generateForMusician(
                        name, m.profile.defaultTransposition || 0,
                        m.profile.preferFlats || false, m.profile.preferredCapoFret || 0,
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

                    <PrintModeSelector
                        printMode={printMode}
                        setPrintMode={setPrintMode}
                        hasMyProfile={hasMyProfile}
                        myLabel={myLabel}
                        musicians={musicians}
                        selectedUids={selectedUids}
                        setSelectedUids={setSelectedUids}
                        toggleMusician={toggleMusician}
                    />

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

                    <PrintStats
                        totalTracks={tracks.length}
                        linkedPdfCount={linkedPdfTracks.length}
                        activeTranspositions={activeTranspositions}
                        showTranspositions={printMode !== "standard"}
                    />

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="p-4 border-t border-border shrink-0 space-y-3">
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
                    {setlistId && (
                        <Button
                            variant="outline"
                            className="w-full gap-2 text-muted-foreground"
                            onClick={handleEmailPackets}
                            disabled={sendingEmails}
                        >
                            {sendingEmails ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                            Email Packet Links to Band
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
