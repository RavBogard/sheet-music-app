"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { X, Printer, Download, Loader2, Mail, FileStack, ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SetlistTrack } from "@/types/models"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { subscribeToAllMusicianProfiles, INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { MusicianProfile } from "@/types/models"
import { TrackPrintOptionsList, TrackTranspose } from "./TrackPrintOptionsList"
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

    // Cover-only toggle (defaults to true per user request to just print the setlist)
    const [coverOnly, setCoverOnly] = useState(true)

    // Track Selection
    const [trackIncludedIds, setTrackIncludedIds] = useState<Set<string>>(() => {
        const set = new Set<string>()
        tracks.filter(t => !!t.fileId).forEach(t => set.add(t.id))
        return set
    })

    const toggleTrackSelection = useCallback((trackId: string, selected: boolean) => {
        setTrackIncludedIds(prev => {
            const next = new Set(prev)
            if (selected) next.add(trackId)
            else next.delete(trackId)
            return next
        })
    }, [])

    const selectAllTracks = useCallback(() => {
        setTrackIncludedIds(new Set(tracks.filter(t => !!t.fileId).map(t => t.id)))
    }, [tracks])

    const selectNoTracks = useCallback(() => {
        setTrackIncludedIds(new Set())
    }, [])

    // Email packets
    const [sendingEmails, setSendingEmails] = useState(false)
    const [showEmailConfirm, setShowEmailConfirm] = useState(false)
    const [emailRecipientUids, setEmailRecipientUids] = useState<Set<string>>(() => {
        return new Set(assignedMusicians?.map(m => m.uid!).filter(Boolean) || [])
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

    const printableSelectedCount = tracks.filter(t => !!t.fileId && trackIncludedIds.has(t.id)).length

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
                        omitPdf: !trackIncludedIds.has(t.id),
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

    const executeEmailPackets = async () => {
        if (!setlistId) {
            toast.error('Cannot email packets: setlist not saved yet')
            return
        }
        if (emailRecipientUids.size === 0) {
            toast.error('Please select at least one recipient')
            return
        }
        setSendingEmails(true)
        try {
            const emailBody: Record<string, unknown> = { setlistId }
            emailBody.recipientUids = Array.from(emailRecipientUids)
            
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
            setShowEmailConfirm(false)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to send packet emails')
        } finally {
            setSendingEmails(false)
        }
    }

    const handleGenerate = async () => {
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

            const a = document.createElement('a')
            a.href = url
            // Convert something like "My Gig Packet!" into "My_Gig_Packet"
            a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            
            onClose()
        } catch (e: unknown) {
            logger.error('Print generation failed:', e)
            setError(e instanceof Error ? e.message : 'Failed to generate PDF')
        } finally {
            setGenerating(false)
        }
    }

    const canGenerate = (coverOnly || printableSelectedCount > 0) && !generating &&
        (printMode !== "select-musicians" || selectedUids.length > 0)

    // Ensure we only render the portal on the client
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    if (!mounted) return null

    return createPortal(
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 sm:p-6 pb-safe" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
            <div className="bg-card rounded-2xl w-full max-w-lg max-h-[90dvh] sm:max-h-[85dvh] flex flex-col shadow-2xl border border-border overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 sm:px-6 sm:py-5 border-b border-border shrink-0 bg-muted/30">
                    <h2 className="text-xl font-bold">Print Gig Packet</h2>
                    <Button size="icon" variant="ghost" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 p-4 space-y-3 min-h-0">
                    {showEmailConfirm ? (
                        <div className="space-y-4 pb-4">
                            <div className="space-y-2">
                                <h3 className="font-semibold text-lg text-foreground">Select Email Recipients</h3>
                                <p className="text-sm text-muted-foreground">
                                    Send personalized gig packet download links directly to these band members.
                                </p>
                            </div>
                            <div className="block border border-border rounded-lg bg-card overflow-hidden">
                                {musicians.map(m => {
                                    const isSelected = emailRecipientUids.has(m.uid)
                                    const preset = m.profile.instrument ? INSTRUMENT_PRESETS[m.profile.instrument] : null
                                    return (
                                        <label key={m.uid} className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer border-b border-border last:border-0 transition-colors">
                                            <input 
                                                type="checkbox" 
                                                className="h-4 w-4 rounded border-primary text-primary focus:ring-primary" 
                                                checked={isSelected}
                                                onChange={(e) => {
                                                    const checked = e.target.checked
                                                    setEmailRecipientUids(prev => {
                                                        const next = new Set(prev)
                                                        if (checked) next.add(m.uid)
                                                        else next.delete(m.uid)
                                                        return next
                                                    })
                                                }}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate">{m.displayName}</p>
                                                {m.profile.instrument && (
                                                    <p className="text-xs text-muted-foreground truncate">{preset?.label || m.profile.instrument}</p>
                                                )}
                                            </div>
                                        </label>
                                    )
                                })}
                                {musicians.length === 0 && (
                                    <div className="p-4 text-center text-sm text-muted-foreground">
                                        No active musicians found.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : generating ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Loader2 className="h-10 w-10 text-primary animate-spin" />
                            <p className="text-sm text-muted-foreground">{progressMsg || 'Generating...'}</p>
                        </div>
                    ) : (
                        <>
                            {/* 1. Packet Type Toggle - MOST PROMINENT */}
                            <div className="space-y-2 pb-1">
                                <label className="text-sm font-medium text-foreground">What to print:</label>
                                <div className="flex rounded-lg border border-border overflow-hidden">
                                    <button
                                        type="button"
                                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors cursor-pointer ${
                                            coverOnly
                                                ? "bg-brand text-primary-foreground"
                                                : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                        }`}
                                        onClick={() => setCoverOnly(true)}
                                    >
                                        <ListChecks className="h-4 w-4" />
                                        Setlist Only
                                    </button>
                                    <button
                                        type="button"
                                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors cursor-pointer ${
                                            !coverOnly
                                                ? "bg-brand text-primary-foreground"
                                                : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                        }`}
                                        onClick={() => setCoverOnly(false)}
                                    >
                                        <FileStack className="h-4 w-4" />
                                        Full Packet (PDFs)
                                    </button>
                                </div>
                            </div>

                            <hr className="border-border my-2" />

                            {/* 2. Print Mode / Audience */}
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

                            <hr className="border-border my-2" />

                            {/* 3. Header Metadata */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Header Details:</label>
                                <div className="grid grid-cols-2 gap-3 bg-muted/30 p-3 rounded-lg border border-border/50">
                                    <div className="col-span-2">
                                        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Setlist title" className="bg-background h-9" />
                                    </div>
                                    <div>
                                        <Input value={date} onChange={e => setDate(e.target.value)} placeholder="Date" className="bg-background h-9" />
                                    </div>
                                    <div>
                                        <Input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="Event (optional)" className="bg-background h-9" />
                                    </div>
                                </div>
                            </div>

                            {/* Print Options Checklist / Transposition */}
                            {!coverOnly && (
                                <TrackPrintOptionsList
                                    tracks={tracks}
                                    trackTranspositions={trackTranspositions}
                                    onUpdateTrack={updateTrackTranspose}
                                    onApplyGlobal={(s) => applyGlobalTranspose(s)}
                                    activeTranspositions={printMode === "just-me" || printMode === "select-musicians" ? activeTranspositions : 0}
                                    selectedTrackIds={trackIncludedIds}
                                    onToggleTrackSelection={toggleTrackSelection}
                                    onSelectAll={selectAllTracks}
                                    onSelectNone={selectNoTracks}
                                />
                            )}

                            <PrintStats
                                totalTracks={tracks.length}
                                linkedPdfCount={printableSelectedCount}
                                activeTranspositions={activeTranspositions}
                                showTranspositions={printMode !== "standard"}
                                coverOnly={coverOnly}
                            />

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm mt-2">
                                    {error}
                                </div>
                            )}

                        </>
                    )}
                </div>

                {/* Actions */}
                <div className="p-4 border-t border-border shrink-0 space-y-3">
                    {showEmailConfirm ? (
                        <div className="flex gap-3 w-full">
                            <Button variant="outline" className="flex-1" onClick={() => setShowEmailConfirm(false)} disabled={sendingEmails}>
                                Cancel
                            </Button>
                            <Button 
                                className="flex-[2] gap-2 transition-all" 
                                onClick={executeEmailPackets} 
                                disabled={sendingEmails || emailRecipientUids.size === 0}
                            >
                                {sendingEmails ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                Send {emailRecipientUids.size} Email{emailRecipientUids.size !== 1 ? 's' : ''}
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-3">
                                <Button
                                    className="flex-1 gap-2"
                                    onClick={handleGenerate}
                                    disabled={!canGenerate}
                                >
                                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    {printMode === "select-musicians" && selectedUids.length > 1 ? "Download ZIP" : "Download PDF"}
                                </Button>
                            </div>
                            {setlistId && (
                                <Button
                                    variant="outline"
                                    className="w-full gap-2 text-muted-foreground"
                                    onClick={() => setShowEmailConfirm(true)}
                                    disabled={sendingEmails}
                                >
                                    <Mail className="h-4 w-4" />
                                    Email Packet Links to Band
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}
