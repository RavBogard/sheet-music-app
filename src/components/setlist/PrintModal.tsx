"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { X, Printer, Download, Loader2, Mail, FileStack, ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SetlistTrack } from "@/types/models"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
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
    assignedMusicians?: Array<{ uid?: string; name: string; displayName?: string }>
    eventDate?: string | null
}

export function PrintModal({ setlistName, tracks, onClose, setlistId, assignedMusicians, eventDate }: PrintModalProps) {
    const { user, profile } = useAuth()
    const [title, setTitle] = useState(setlistName)
    const [date, setDate] = useState(() => {
        const d = eventDate ? new Date(eventDate) : new Date()
        return d.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        })
    })
    const [eventName, setEventName] = useState("")
    const [generating, setGenerating] = useState(false)
    const [progressMsg, setProgressMsg] = useState("")
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
        if (saved?.selectedUids?.length) return saved.selectedUids
        if (assignedMusicians?.length) return assignedMusicians.filter(m => m.uid).map(m => m.uid!)
        return []
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

    // Cover-only toggle
    const [coverOnly, setCoverOnly] = useState(false)

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

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myProfile, user?.uid])

    // ── PDF Generation (direct blob fetch — no Inngest, no Firestore polling) ──
    const generateForMusician = async (
        name: string, transposition: number, preferFlats: boolean, capoFret: number
    ): Promise<Blob> => {
        const response = await apiFetch('/api/setlist/print', {
            method: 'POST',
            body: JSON.stringify({
                title, date,
                musicianName: name || undefined,
                eventName: eventName || undefined,
                coverOnly,
                tracks: tracks.map(t => {
                    const useTransposition = printMode === "just-me"
                    const tp = useTransposition ? trackTranspositions[t.id] : null
                    return {
                        title: t.title, key: t.key || '', notes: t.notes || '',
                        leadMusician: t.leadMusician || '', fileId: t.fileId,
                        transposition: tp ? tp.transposition : transposition,
                        preferFlats: tp ? tp.preferFlats : preferFlats,
                        capoFret: tp ? tp.capoFret : capoFret,
                        type: t.type,
                        performer: t.performer,
                        estimatedMinutes: t.estimatedMinutes,
                        description: t.description,
                    }
                })
            })
        })

        if (!response.ok) {
            let errorMsg = 'Failed to generate PDF'
            try {
                const err = await response.json()
                errorMsg = err.error || errorMsg
            } catch {
                // Response might be non-JSON for 500s
                errorMsg = `Server error (${response.status})`
            }
            throw new Error(errorMsg)
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
            const emailBody: Record<string, unknown> = { setlistId }
            if (printMode === "select-musicians" && selectedUids.length > 0) {
                emailBody.recipientUids = selectedUids
            }
            const response = await apiFetch('/api/setlist/email-packets', {
                method: 'POST',
                body: JSON.stringify(emailBody),
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
        setProgressMsg("Generating gig packet...")

        try {
            if (printMode === "select-musicians" && selectedUids.length > 1) {
                const JSZip = (await import("jszip")).default
                const zip = new JSZip()

                let completed = 0
                const total = selectedUids.length

                const promises = selectedUids.map(async (uid) => {
                    const m = musicians.find(x => x.uid === uid)
                    if (!m) return
                    const preset = m.profile.instrument ? INSTRUMENT_PRESETS[m.profile.instrument] : null
                    const label = preset?.label || ''
                    const name = `${m.displayName}${label ? ` - ${label}` : ''}`

                    const blob = await generateForMusician(
                        name, m.profile.defaultTransposition || 0,
                        m.profile.preferFlats || false, m.profile.preferredCapoFret || 0
                    )

                    zip.file(`${m.displayName.replace(/[^a-z0-9]/gi, '_')}_gig_packet.pdf`, blob)
                    completed++
                    setProgressMsg(`Processing packets... (${completed}/${total})`)
                })

                await Promise.all(promises)

                setProgressMsg("Zipping files...")
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
                const iframe = document.createElement('iframe')
                iframe.style.position = 'fixed'
                iframe.style.top = '-10000px'
                iframe.style.left = '-10000px'
                iframe.style.width = '1px'
                iframe.style.height = '1px'
                iframe.src = url
                document.body.appendChild(iframe)
                iframe.onload = () => {
                    try {
                        iframe.contentWindow?.print()
                    } catch {
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`
                        document.body.appendChild(a); a.click(); document.body.removeChild(a)
                    }
                    setTimeout(() => {
                        document.body.removeChild(iframe)
                        URL.revokeObjectURL(url)
                    }, 1000)
                }
            }
        } catch (e: unknown) {
            logger.error('Print generation failed:', e)
            setError(e instanceof Error ? e.message : 'Failed to generate PDF')
        } finally {
            setGenerating(false)
        }
    }

    const canGenerate = (coverOnly || linkedPdfTracks.length > 0) && !generating &&
        (printMode !== "select-musicians" || selectedUids.length > 0)

    return (
        <div className="fixed inset-0 bg-black/60 flex items-start sm:items-center justify-center z-50 pt-8 sm:pt-4 px-4 pb-4">
            <div className="bg-card rounded-xl w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                    <h2 className="text-xl font-bold">Print Gig Packet</h2>
                    <Button size="icon" variant="ghost" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 p-4 space-y-3">
                    {generating ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Loader2 className="h-10 w-10 text-primary animate-spin" />
                            <p className="text-sm text-muted-foreground">{progressMsg || 'Generating...'}</p>
                        </div>
                    ) : (
                        <>
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

                            {/* Packet Type Toggle */}
                            <div className="flex rounded-lg border border-border overflow-hidden">
                                <button
                                    type="button"
                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                                        !coverOnly
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                    }`}
                                    onClick={() => setCoverOnly(false)}
                                >
                                    <FileStack className="h-4 w-4" />
                                    Full Packet
                                </button>
                                <button
                                    type="button"
                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                                        coverOnly
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                    }`}
                                    onClick={() => setCoverOnly(true)}
                                >
                                    <ListChecks className="h-4 w-4" />
                                    Setlist Only
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground -mt-1">
                                {coverOnly
                                    ? "Prints just the song list — one page, no chart PDFs."
                                    : "Prints cover page with all chart PDFs."
                                }
                            </p>

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
                                coverOnly={coverOnly}
                            />

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                        </>
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
