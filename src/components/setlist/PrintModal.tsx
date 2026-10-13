"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { X, Download, Loader2, Mail, FileStack, ListChecks, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SetlistTrack } from "@/types/models"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { fetchTenantMusicianProfiles, INSTRUMENT_PRESETS } from "@/lib/musician-profile"
import { instrumentLabel } from "@/lib/instrument-labels"
import { MusicianProfile } from "@/types/models"
import { TrackPrintOptionsList, TrackTranspose } from "./TrackPrintOptionsList"
import { PrintModeSelector, PrintMode } from "./PrintModeSelector"
import { PrintStats } from "./PrintStats"
import { logger } from "@/lib/logger"
import { useFeature } from "@/lib/org/use-feature"
import { toast } from "sonner"
import { useT, useFormat } from "@/i18n/client"
import {
    generatePdfBlob,
    generateZipBlob,
    downloadBlob,
    PrintChartsOmittedError,
    type OmittedPrintChart,
} from "@/lib/print-generation"

const STORAGE_KEY = "crc-print-selection"

interface SavedSelection {
    mode: PrintMode
    selectedUids: string[]
}

type PendingPacketAction = "download" | "email"

/**
 * Match preview_notify_band's unbonded-song boundary: an absent type is the
 * backward-compatible song default, while explicit service-flow rows are
 * intentionally chartless. The print pipeline needs fileId bytes, so a song
 * row without one would otherwise disappear from a full packet silently.
 */
export function isPacketSongMissingChart(track: SetlistTrack): boolean {
    const isSong = !track.type || track.type === "song"
    return isSong && !(typeof track.fileId === "string" && track.fileId.trim())
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
    rabbi?: string
    /**
     * Phase 4: display title of the setlist's prayer book, already resolved
     * from the slug by the caller via `bookTitle()` in @/lib/books/titles
     * (the modal never imports @/lib/books/registry — it statically pulls in
     * every book's page JSON and this is a client component). Drawn on the
     * gig-packet cover under the date so the folio column's `p. <n>` names
     * the book it indexes. Absent → the cover names no book.
     */
    bookTitle?: string
}

export function PrintModal({ setlistName, tracks, onClose, setlistId, assignedMusicians, eventDate, rabbi, bookTitle }: PrintModalProps) {
    const { user, profile } = useAuth()
    const t = useT()
    const fmt = useFormat()
    // Multi-tenant phase 6: emailing packet links to the band is notifyBand.
    const notifyBandOn = useFeature("notifyBand")
    const [title, setTitle] = useState(setlistName)
    const [date, setDate] = useState(() => {
        const d = eventDate ? new Date(eventDate) : new Date()
        return fmt.date(d, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        })
    })
    const [eventName, setEventName] = useState("")
    const [generating, setGenerating] = useState(false)
    const [progressMsg, setProgressMsg] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [pendingPacketAction, setPendingPacketAction] = useState<PendingPacketAction | null>(null)
    const [detectedOmissions, setDetectedOmissions] = useState<OmittedPrintChart[]>([])

    /**
     * A signed-out guest may print (Daniel, 2026-09-10), but printing is all
     * they get: the per-musician packet modes, the band roster and the email
     * action are band administration, not printing, and the roster read is
     * authenticated anyway. `isSignedIn` gates all three below.
     */
    const isSignedIn = !!user

    // Musicians
    const [musicians, setMusicians] = useState<{ uid: string; displayName: string; profile: MusicianProfile }[]>([])
    useEffect(() => {
        // No session → no roster read; the request would only be refused.
        // Multi-tenant phase 2: the roster is the host tenant's, read through
        // /api/tenant/people (below band leader it comes back empty, as before).
        if (!isSignedIn) return
        let cancelled = false
        void fetchTenantMusicianProfiles().then((list) => {
            if (!cancelled) setMusicians(list)
        })
        return () => { cancelled = true }
    }, [isSignedIn])

    // ── Print Mode ──
    const saved = useMemo(() => loadSavedSelection(), [])
    const myProfile = profile?.musicianProfile
    const hasMyProfile = !!myProfile?.instrument

    const [printMode, setPrintMode] = useState<PrintMode>(() => {
        // A guest gets the standard printout — the other modes need a profile
        // or the roster. Note the saved mode is per-BROWSER, so on a shared
        // shul iPad it can be the leader's "select-musicians"; ignoring it
        // when signed out is deliberate, not just a default.
        if (!isSignedIn) return "standard"
        if (saved?.mode) return saved.mode
        return hasMyProfile ? "just-me" : "standard"
    })

    const [selectedUids, setSelectedUids] = useState<string[]>(() => {
        if (saved?.selectedUids?.length) return saved.selectedUids
        if (assignedMusicians?.length) return assignedMusicians.filter(m => m.uid).map(m => m.uid!)
        return []
    })

    useEffect(() => {
        // Don't let a guest's forced "standard" overwrite the leader's saved
        // preference on a shared device.
        if (!isSignedIn) return
        saveSelection({ mode: printMode, selectedUids })
    }, [isSignedIn, printMode, selectedUids])

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
    const missingChartItems = useMemo(() => {
        const items = new Map<string, OmittedPrintChart>()
        for (const track of tracks.filter(isPacketSongMissingChart)) {
            items.set(track.id, {
                title: track.title,
                reason: t("setlistPrint.noChartAttached"),
            })
        }
        for (const omission of detectedOmissions) {
            items.set(omission.fileId ?? `title:${omission.title}`, omission)
        }
        return [...items.values()]
    }, [tracks, detectedOmissions, t])

    const myLabel = useMemo(() => {
        if (!myProfile?.instrument) return null
        const preset = INSTRUMENT_PRESETS[myProfile.instrument]
        const parts = [user?.displayName?.split(' ')[0] || t("setlistPrint.me")]
        if (preset?.label) parts.push(instrumentLabel(myProfile.instrument, t))
        if (myProfile.preferredCapoFret) parts.push(t("setlistPrint.capoFret", { fret: myProfile.preferredCapoFret }))
        return parts.join(" — ")

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myProfile, user?.uid, t])

    // ── PDF Generation (direct blob fetch — no Inngest, no Firestore polling) ──
    const generateForMusician = async (
        name: string, transposition: number, preferFlats: boolean, capoFret: number,
        allowOmissions = false,
    ): Promise<Blob> => {
        return generatePdfBlob({
            title, date,
            musicianName: name || undefined,
            eventName: eventName || undefined,
            rabbi: rabbi || undefined,
            // Phase 4: qualifies every `p. <n>` on the cover's folio column.
            bookTitle: bookTitle || undefined,
            coverOnly,
            allowOmissions,
            tracks: tracks.map(t => {
                const useTransposition = printMode === "just-me"
                const tp = useTransposition ? trackTranspositions[t.id] : null
                return {
                    title: t.title, key: t.key || '', tune: t.tune || '', notes: t.notes || '',
                    leadMusician: t.leadMusician || '', fileId: t.fileId,
                    // v70-01-01 Task 3: propagate fileName + mimeType so the
                    // print-pipeline image-skip guard works for both
                    // legacy (extension-bearing) and picker-bound (mimeType-bearing) tracks.
                    fileName: t.fileName,
                    mimeType: t.mimeType,
                    transposition: tp ? tp.transposition : transposition,
                    preferFlats: tp ? tp.preferFlats : preferFlats,
                    capoFret: tp ? tp.capoFret : capoFret,
                    omitPdf: !trackIncludedIds.has(t.id),
                    type: t.type,
                    performer: t.performer,
                    estimatedMinutes: t.estimatedMinutes,
                    description: t.description,
                    // Phase 4: the prayer-book page number. This map dropped it
                    // silently, so the musicians' packet printed no page numbers
                    // while the rabbi's sheet did.
                    liturgyRef: t.liturgyRef,
                    honors: t.honors,
                }
            })
        })
    }

    const executeEmailPackets = async () => {
        if (!setlistId) {
            toast.error(t("setlistPrint.emailNotSaved"))
            return
        }
        if (emailRecipientUids.size === 0) {
            toast.error(t("setlistPrint.emailSelectRecipient"))
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
                throw new Error(err.error || t("setlistPrint.emailSendFailed"))
            }
            const result = await response.json()
            toast.success(t("setlistPrint.emailSent", { count: result.sent }))
            if (result.failed > 0) {
                toast.warning(t("setlistPrint.emailFailedCount", { count: result.failed }))
            }
            setShowEmailConfirm(false)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : t("setlistPrint.emailPacketsFailed"))
        } finally {
            setSendingEmails(false)
        }
    }

    const handleGenerate = async (allowOmissions = false) => {
        setGenerating(true)
        setError(null)
        setProgressMsg(t("setlistPrint.progressGenerating"))

        try {
            if (printMode === "select-musicians" && selectedUids.length > 1) {
                let completed = 0
                const total = selectedUids.length

                const files = await Promise.all(selectedUids.map(async (uid) => {
                    const m = musicians.find(x => x.uid === uid)
                    if (!m) return null
                    const preset = m.profile.instrument ? INSTRUMENT_PRESETS[m.profile.instrument] : null
                    const label = preset?.label && m.profile.instrument ? instrumentLabel(m.profile.instrument, t) : ''
                    const name = `${m.displayName}${label ? ` - ${label}` : ''}`

                    const blob = await generateForMusician(
                        name, m.profile.defaultTransposition || 0,
                        m.profile.preferFlats || false, m.profile.preferredCapoFret || 0,
                        allowOmissions,
                    )
                    
                    completed++
                    setProgressMsg(t("setlistPrint.progressPackets", { completed, total }))

                    return {
                        name: `${m.displayName.replace(/[^a-z0-9]/gi, '_')}_print.pdf`,
                        blob
                    }
                }))

                setProgressMsg(t("setlistPrint.progressZipping"))
                const validFiles = files.filter(f => f !== null) as { name: string, blob: Blob }[]
                const zipBlob = await generateZipBlob(validFiles)
                
                downloadBlob(zipBlob, `${title.replace(/[^a-z0-9]/gi, '_')}_packets.zip`)
                onClose()
                return
            }

            let name = ""
            let transposition = 0
            let preferFlats = false
            let capoFret = 0

            if (printMode === "just-me" && myProfile) {
                const preset = myProfile.instrument ? INSTRUMENT_PRESETS[myProfile.instrument] : null
                name = `${user?.displayName || ""}${preset?.label && myProfile.instrument ? ` - ${instrumentLabel(myProfile.instrument, t)}` : ''}`
                transposition = myProfile.defaultTransposition || 0
                preferFlats = myProfile.preferFlats || false
                capoFret = myProfile.preferredCapoFret || 0
            } else if (printMode === "select-musicians" && selectedUids.length === 1) {
                const m = musicians.find(x => x.uid === selectedUids[0])
                if (m) {
                    const preset = m.profile.instrument ? INSTRUMENT_PRESETS[m.profile.instrument] : null
                    name = `${m.displayName}${preset?.label && m.profile.instrument ? ` - ${instrumentLabel(m.profile.instrument, t)}` : ''}`
                    transposition = m.profile.defaultTransposition || 0
                    preferFlats = m.profile.preferFlats || false
                    capoFret = m.profile.preferredCapoFret || 0
                }
            }

            const blob = await generateForMusician(name, transposition, preferFlats, capoFret, allowOmissions)

            downloadBlob(blob, `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`)
            
            onClose()
        } catch (e: unknown) {
            if (e instanceof PrintChartsOmittedError) {
                setDetectedOmissions(e.omittedCharts)
                setPendingPacketAction("download")
                setError(null)
                return
            }
            logger.error('Print generation failed:', e)
            setError(e instanceof Error ? e.message : t("setlistPrint.generateFailed"))
        } finally {
            setGenerating(false)
        }
    }

    const beginPacketAction = (action: PendingPacketAction) => {
        const actionNeedsCharts = action === "email" || !coverOnly
        const hasKnownMissingChart = tracks.some(isPacketSongMissingChart)
        if (actionNeedsCharts && (hasKnownMissingChart || detectedOmissions.length > 0)) {
            setPendingPacketAction(action)
            return
        }

        if (action === "email") {
            setShowEmailConfirm(true)
        } else {
            void handleGenerate(false)
        }
    }

    const proceedWithoutMissingCharts = () => {
        const action = pendingPacketAction
        setPendingPacketAction(null)
        if (action === "email") {
            setShowEmailConfirm(true)
        } else if (action === "download") {
            void handleGenerate(true)
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
                    <h2 className="text-xl font-bold">{t("setlistPrint.title")}</h2>
                    <Button size="icon" variant="ghost" onClick={onClose} aria-label={t("setlistPrint.closeDialog")}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 p-4 space-y-3 min-h-0">
                    {pendingPacketAction ? (
                        <div className="space-y-4 pb-4" role="alert" aria-labelledby="missing-chart-title">
                            <div className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                                <div className="min-w-0 space-y-1">
                                    <h3 id="missing-chart-title" className="font-semibold text-foreground">
                                        {t("setlistPrint.missingChartsTitle", { count: missingChartItems.length })}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {pendingPacketAction === "email"
                                            ? t("setlistPrint.missingChartsLeftOutEmail", { count: missingChartItems.length })
                                            : t("setlistPrint.missingChartsLeftOutDownload", { count: missingChartItems.length })}{" "}
                                        {t("setlistPrint.missingChartsRepairHint", { count: missingChartItems.length })}
                                    </p>
                                </div>
                            </div>
                            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-sm" aria-label={t("setlistPrint.missingChartsListLabel")}>
                                {missingChartItems.map((item, index) => (
                                    <li key={`${item.fileId ?? item.title}-${index}`}>
                                        <span className="font-medium">{item.title}</span>
                                        <span className="block text-xs text-muted-foreground">{item.reason}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : showEmailConfirm ? (
                        <div className="space-y-4 pb-4">
                            <div className="space-y-2">
                                <h3 className="font-semibold text-lg text-foreground">{t("setlistPrint.emailRecipientsTitle")}</h3>
                                <p className="text-sm text-muted-foreground">
                                    {t("setlistPrint.emailRecipientsHint")}
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
                                                    <p className="text-xs text-muted-foreground truncate">{preset?.label && m.profile.instrument ? instrumentLabel(m.profile.instrument, t) : m.profile.instrument}</p>
                                                )}
                                            </div>
                                        </label>
                                    )
                                })}
                                {musicians.length === 0 && (
                                    <div className="p-4 text-center text-sm text-muted-foreground">
                                        {t("setlistPrint.noActiveMusicians")}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : generating ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Loader2 className="h-10 w-10 text-primary animate-spin" />
                            <p className="text-sm text-muted-foreground">{progressMsg || t("setlistPrint.generating")}</p>
                        </div>
                    ) : (
                        <>
                            {/* 1. Packet Type Toggle - MOST PROMINENT */}
                            <div className="space-y-2 pb-1">
                                <label className="text-sm font-medium text-foreground">{t("setlistPrint.whatToPrint")}</label>
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
                                        {t("setlistPrint.setlistOnly")}
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
                                        {t("setlistPrint.fullPacket")}
                                    </button>
                                </div>
                            </div>

                            <hr className="border-border my-2" />

                            {/* 2. Print Mode / Audience — signed-in only */}
                            {isSignedIn && (
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
                            )}

                            {isSignedIn && <hr className="border-border my-2" />}

                            {/* 3. Header Metadata */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">{t("setlistPrint.headerDetails")}</label>
                                <div className="grid grid-cols-2 gap-3 bg-muted/30 p-3 rounded-lg border border-border/50">
                                    <div className="col-span-2">
                                        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("setlistPrint.headerTitle")} aria-label={t("setlistPrint.headerTitle")} className="bg-background h-9" />
                                    </div>
                                    <div>
                                        <Input value={date} onChange={e => setDate(e.target.value)} placeholder={t("setlistPrint.headerDate")} aria-label={t("setlistPrint.headerDate")} className="bg-background h-9" />
                                    </div>
                                    <div>
                                        <Input value={eventName} onChange={e => setEventName(e.target.value)} placeholder={t("setlistPrint.headerEvent")} aria-label={t("setlistPrint.headerEvent")} className="bg-background h-9" />
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
                    {pendingPacketAction ? (
                        <div className="flex gap-3 w-full">
                            <Button variant="outline" className="flex-1" onClick={() => {
                                setPendingPacketAction(null)
                                setDetectedOmissions([])
                            }}>
                                {t("setlistPrint.cancel")}
                            </Button>
                            <Button className="flex-[2]" onClick={proceedWithoutMissingCharts}>
                                {t("setlistPrint.continueWithout", { count: missingChartItems.length })}
                            </Button>
                        </div>
                    ) : showEmailConfirm ? (
                        <div className="flex gap-3 w-full">
                            <Button variant="outline" className="flex-1" onClick={() => setShowEmailConfirm(false)} disabled={sendingEmails}>
                                {t("setlistPrint.cancel")}
                            </Button>
                            <Button 
                                className="flex-[2] gap-2 transition-all" 
                                onClick={executeEmailPackets} 
                                disabled={sendingEmails || emailRecipientUids.size === 0}
                            >
                                {sendingEmails ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                {t("setlistPrint.sendEmails", { count: emailRecipientUids.size })}
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-3">
                                <Button
                                    className="flex-1 gap-2"
                                    onClick={() => beginPacketAction("download")}
                                    disabled={!canGenerate}
                                >
                                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    {printMode === "select-musicians" && selectedUids.length > 1 ? t("setlistPrint.downloadZip") : t("setlistPrint.downloadPdf")}
                                </Button>
                            </div>
                            {setlistId && isSignedIn && notifyBandOn && (
                                <Button
                                    variant="outline"
                                    className="w-full gap-2 text-muted-foreground"
                                    onClick={() => beginPacketAction("email")}
                                    disabled={sendingEmails}
                                >
                                    <Mail className="h-4 w-4" />
                                    {t("setlistPrint.emailPacketLinks")}
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
