"use client"

/**
 * Setlist Performance View
 *
 * The primary way musicians interact with a setlist. Shows all tracks
 * in a dark, stage-friendly layout. Tapping a track sets the playback
 * queue starting at that position and navigates to the chart.
 *
 * Edit mode is secondary — accessed via the pencil icon in the header.
 */

import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useMusicStore } from "@/lib/store"
import { toQueueItem } from "@/lib/queue-utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, ArrowLeft, Pencil, PlayCircle, Music, BookOpen, Mic2, ChevronRight, Printer, ExternalLink } from "lucide-react"
import { PrintModal } from "@/components/setlist/PrintModal"
import { Metronome } from "@/components/performance/Metronome"
import { SetlistTrack } from "@/types/models"
import { QueueItem } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"

type Section = {
    label: string | null
    tracks: { item: QueueItem; globalIndex: number; track: SetlistTrack }[]
}

export default function SetlistPerformPage() {
    const router = useRouter()
    const params = useParams()
    const setlistId = params?.id as string
    const { setQueue } = useMusicStore()

    const [name, setName] = useState("")
    const [tracks, setTracks] = useState<SetlistTrack[]>([])
    const [serviceNotes, setServiceNotes] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [tappedIndex, setTappedIndex] = useState<number | null>(null)
    const [changesSummary, setChangesSummary] = useState<string | null>(null)
    const [showChangeBanner, setShowChangeBanner] = useState(true)
    const [showPrintModal, setShowPrintModal] = useState(false)

    // Real-time subscription to setlist
    const setlistRef = useMemo(() => setlistId ? doc(db, "setlists", setlistId) : null, [setlistId])
    const { data: setlistData, loading: setlistLoading, error: setlistError } = useSafeFirestoreSync<any>(setlistRef as any)

    useEffect(() => {
        setLoading(setlistLoading)
        if (setlistLoading) return

        if (setlistError) {
            console.error("[SetlistPerform]", setlistError)
            // Distinguish error types for clear user messaging
            const code = (setlistError as { code?: string })?.code
            if (code === 'permission-denied') {
                setError("This setlist hasn't been published yet, or you don't have access.")
            } else if (code === 'not-found') {
                setError("Setlist not found — it may have been deleted.")
            } else {
                setError("Couldn't load setlist — check your connection and try again.")
            }
            return
        }

        if (setlistData) {
            const data = setlistData
            setName(data.name || "Untitled")
            setTracks(data.tracks || [])
            setServiceNotes(data.serviceNotes || null)

            // Compute diff against last published snapshot
            const snapshot = data.publishedSnapshot as Array<{ title: string }> | undefined
            if (snapshot && data.isPublic) {
                const currentSongs = (data.tracks || [])
                    .filter((t: SetlistTrack) => !t.type || t.type === 'song')
                    .map((t: SetlistTrack) => t.title)
                const snapshotSongs = snapshot.map((s: { title: string }) => s.title)
                const added = currentSongs.filter((t: string) => !snapshotSongs.includes(t))
                const removed = snapshotSongs.filter((t: string) => !currentSongs.includes(t))
                if (added.length > 0 || removed.length > 0) {
                    const parts: string[] = []
                    if (added.length) parts.push(`+${added.join(', +')}`)
                    if (removed.length) parts.push(`−${removed.join(', −')}`)
                    setChangesSummary(parts.join(' · '))
                } else {
                    setChangesSummary(null)
                }
            }
        } else if (!setlistLoading) {
            setError("Setlist not found")
        }
    }, [setlistData, setlistLoading, setlistError])

    // Build queue items from tracks
    const queue = useMemo(() => tracks.map(toQueueItem), [tracks])

    // Group by section headers
    const sections = useMemo((): Section[] => {
        const result: Section[] = []
        let current: Section = { label: null, tracks: [] }

        queue.forEach((item, index) => {
            if (item.trackType === "header") {
                if (current.tracks.length > 0 || current.label !== null) {
                    result.push(current)
                }
                current = { label: item.name, tracks: [] }
            } else {
                current.tracks.push({ item, globalIndex: index, track: tracks[index] })
            }
        })
        if (current.tracks.length > 0 || current.label !== null) {
            result.push(current)
        }
        return result
    }, [queue, tracks])

    const sectionLabels = sections.filter((s) => s.label).map((s) => s.label!)

    const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const scrollToSection = useCallback((label: string) => {
        const el = sectionRefs.current.get(label)
        if (el) el.scrollIntoView({ block: "start", behavior: "smooth" })
    }, [])

    // Navigate to a track
    const handleTrackTap = useCallback((globalIndex: number) => {
        const item = queue[globalIndex]
        if (!item) return

        setTappedIndex(globalIndex)
        setQueue(queue, globalIndex, `/perform/setlist/${setlistId}`, setlistId)
        router.push(`/perform/${item.fileId}`)
    }, [queue, setQueue, setlistId, router])

    const trackIcon = (type?: string) => {
        switch (type) {
            case "reading":
            case "prayer":
                return <BookOpen className="h-4 w-4" />
            case "moment":
                return <Mic2 className="h-4 w-4" />
            default:
                return <Music className="h-4 w-4" />
        }
    }

    // Track count (excluding headers)
    const songCount = tracks.filter((t) => !t.type || t.type === "song").length
    const totalCount = tracks.filter((t) => t.type !== "header").length

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                    <p className="text-sm text-zinc-500 font-medium">Loading setlist…</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="text-zinc-400">{error}</p>
                <Button asChild variant="outline">
                    <Link href="/setlists">Back to Setlists</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 glass border-b-0 z-20 relative">
                <Link
                    href="/setlists"
                    className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-bold truncate">{name}</h1>
                    <p className="text-xs text-muted-foreground">
                        {songCount} song{songCount !== 1 ? "s" : ""}
                        {totalCount > songCount ? ` · ${totalCount} items` : ""}
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowPrintModal(true)}
                        className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
                        title="Print gig packet"
                    >
                        <Printer className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                    </button>
                    <Link
                        href={`/setlists/${setlistId}`}
                        className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
                        title="Edit setlist"
                    >
                        <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                    </Link>
                </div>
            </div>

            {/* Track list */}
            <div className="flex-1 overflow-y-auto w-full">
                <div className="flex flex-col p-2 pb-24 gap-0.5">

                    {/* Service notes banner */}
                    {serviceNotes && (
                        <div className="mx-1 mb-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <p className="text-sm text-blue-200 whitespace-pre-wrap">{serviceNotes}</p>
                        </div>
                    )}

                    {/* Changes since last notification */}
                    {changesSummary && showChangeBanner && (
                        <div className="mx-1 mb-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                            <span className="text-amber-400 text-xs font-semibold whitespace-nowrap mt-0.5">UPDATED</span>
                            <p className="text-xs text-amber-200/80 flex-1">{changesSummary}</p>
                            <button
                                onClick={() => setShowChangeBanner(false)}
                                className="text-amber-400/50 hover:text-amber-400 text-xs shrink-0"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {tracks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <Music className="h-12 w-12 mb-3 opacity-30" />
                            <p className="text-lg font-medium">No tracks yet</p>
                            <Button
                                asChild
                                variant="outline"
                                className="mt-4"
                            >
                                <Link href={`/setlists/${setlistId}`}>
                                    <Pencil className="h-4 w-4 mr-2" /> Add tracks
                                </Link>
                            </Button>
                        </div>
                    ) : (
                        sections.map((section, sectionIdx) => (
                            <div
                                key={`section-${sectionIdx}`}
                                ref={(el) => {
                                    if (el && section.label) sectionRefs.current.set(section.label, el)
                                }}
                            >
                                {/* Section header */}
                                {section.label && (
                                    <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm px-4 py-2 mt-3 first:mt-0
                                        text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground border-b border-border/50">
                                        {section.label}
                                    </div>
                                )}

                                {/* Tracks in section */}
                                {section.tracks.map(({ item: track, globalIndex, track: rawTrack }) => {
                                    const isFlowItem = track.trackType && track.trackType !== "song"
                                    const isTapped = tappedIndex === globalIndex
                                    const hasChart = !track.fileId.startsWith("flow-")

                                    return (
                                        <div
                                            key={`${track.fileId}-${globalIndex}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => handleTrackTap(globalIndex)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTrackTap(globalIndex) }}
                                            className={cn(
                                                "flex items-center gap-3 py-3 px-4 rounded-2xl fluid-interaction text-left w-full glass-card",
                                                isTapped
                                                    ? "bg-blue-600/90 border-blue-400/50 shadow-blue-900/20 text-white"
                                                    : "hover:bg-card/90",
                                                isFlowItem && !isTapped && "opacity-70",
                                                tappedIndex !== null && !isTapped && "opacity-50 pointer-events-none"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm transition-colors",
                                                isTapped
                                                    ? "bg-white text-blue-600 shadow-md"
                                                    : isFlowItem
                                                        ? "bg-transparent text-muted-foreground"
                                                        : "glass border border-white/10 text-foreground"
                                            )}>
                                                {isTapped ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : isFlowItem ? (
                                                    trackIcon(track.trackType)
                                                ) : (
                                                    globalIndex + 1
                                                )}
                                            </div>

                                            {/* Track info */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "font-medium truncate",
                                                        isFlowItem ? "text-sm text-muted-foreground" : "text-base text-foreground",
                                                        isTapped && "text-white font-semibold"
                                                    )}>
                                                        {track.name}
                                                    </div>

                                                    {/* Key Badge */}
                                                    {track.key && (
                                                        <span className={cn(
                                                            "px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 shadow-sm",
                                                            isTapped
                                                                ? "bg-white/20 text-white border border-white/10"
                                                                : "bg-muted text-muted-foreground border border-border/50"
                                                        )}>
                                                            {track.key}
                                                        </span>
                                                    )}

                                                    {/* BPM Metronome Badge */}
                                                    {rawTrack.bpm && (
                                                        <Metronome bpm={rawTrack.bpm} />
                                                    )}

                                                    {/* Lead Musician Badge */}
                                                    {(rawTrack.leadMusician || rawTrack.performer) && (
                                                        <span className={cn(
                                                            "px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 max-w-[80px] truncate",
                                                            isTapped
                                                                ? "bg-white/10 text-white/90"
                                                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                                        )}>
                                                            {rawTrack.leadMusician || rawTrack.performer}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Subtitle info / Notes */}
                                                {(rawTrack.notes || rawTrack.referenceLink || isFlowItem) && (
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        {isFlowItem && track.trackType && (
                                                            <span className={cn("text-[10px] uppercase font-medium tracking-wide", isTapped ? "text-white/70" : "text-muted-foreground/60")}>
                                                                {track.trackType}
                                                            </span>
                                                        )}
                                                        {rawTrack.notes && !isFlowItem && (
                                                            <span className={cn("text-xs truncate", isTapped ? "text-white/80" : "text-muted-foreground")}>{rawTrack.notes}</span>
                                                        )}
                                                        {rawTrack.referenceLink && !isFlowItem && (
                                                            <a
                                                                href={rawTrack.referenceLink}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className={cn(
                                                                    "inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 ml-1 transition-colors shadow-sm",
                                                                    isTapped
                                                                        ? "bg-white/20 text-white hover:bg-white/30"
                                                                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/50"
                                                                )}
                                                            >
                                                                Ref Audio <ExternalLink className="h-2.5 w-2.5" />
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right Chevron */}
                                            {hasChart && !isTapped && (
                                                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                            )}
                                            {isTapped && (
                                                <PlayCircle className="h-5 w-5 fill-white text-blue-600 shrink-0 shadow-sm rounded-full" />
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Bottom action bar */}
            {tracks.length > 0 && (
                <div className="px-4 py-3 glass border-t-0 z-20 pb-safe">
                    <Button
                        className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                        onClick={() => {
                            const firstSongIdx = queue.findIndex((q) => !q.fileId.startsWith("flow-"))
                            if (firstSongIdx >= 0) handleTrackTap(firstSongIdx)
                        }}
                        disabled={tappedIndex !== null}
                    >
                        <PlayCircle className="h-5 w-5" />
                        Play from start
                    </Button>
                </div>
            )}

            {/* Print Modal Overlay */}
            {showPrintModal && (
                <PrintModal
                    setlistName={name}
                    tracks={tracks}
                    setlistId={setlistId}
                    onClose={() => setShowPrintModal(false)}
                />
            )}
        </div>
    )
}
