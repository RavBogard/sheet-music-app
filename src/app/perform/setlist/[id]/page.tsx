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
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useMusicStore } from "@/lib/store"
import { toQueueItem } from "@/lib/queue-utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, ArrowLeft, Pencil, PlayCircle, Music, BookOpen, Mic2, ChevronRight } from "lucide-react"
import { SetlistTrack } from "@/types/models"
import { QueueItem } from "@/lib/store"
import { cn } from "@/lib/utils"

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

    // Real-time subscription to setlist
    useEffect(() => {
        if (!setlistId) return

        const unsub = onSnapshot(
            doc(db, "setlists", setlistId),
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data()
                    setName(data.name || "Untitled")
                    setTracks(data.tracks || [])
                    setServiceNotes(data.serviceNotes || null)

                    // Compute diff against last published snapshot
                    const snapshot = data.publishedSnapshot as Array<{ title: string }> | undefined
                    if (snapshot && data.isPublic) {
                        const currentSongs = (data.tracks || [])
                            .filter((t: SetlistTrack) => !t.type || t.type === 'song')
                            .map((t: SetlistTrack) => t.title)
                        const snapshotSongs = snapshot.map(s => s.title)
                        const added = currentSongs.filter((t: string) => !snapshotSongs.includes(t))
                        const removed = snapshotSongs.filter(t => !currentSongs.includes(t))
                        if (added.length > 0 || removed.length > 0) {
                            const parts: string[] = []
                            if (added.length) parts.push(`+${added.join(', +')}`)
                            if (removed.length) parts.push(`−${removed.join(', −')}`)
                            setChangesSummary(parts.join(' · '))
                        } else {
                            setChangesSummary(null)
                        }
                    }
                } else {
                    setError("Setlist not found")
                }
                setLoading(false)
            },
            (err) => {
                console.error("[SetlistPerform]", err)
                // Distinguish error types for clear user messaging
                const code = (err as { code?: string })?.code
                if (code === 'permission-denied') {
                    setError("This setlist hasn't been published yet, or you don't have access.")
                } else if (code === 'not-found') {
                    setError("Setlist not found — it may have been deleted.")
                } else {
                    setError("Couldn't load setlist — check your connection and try again.")
                }
                setLoading(false)
            }
        )
        return () => unsub()
    }, [setlistId])

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
        <div className="flex flex-col h-[100dvh]">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
                <Link
                    href="/setlists"
                    className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-zinc-800 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 text-zinc-400" />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-bold truncate">{name}</h1>
                    <p className="text-xs text-zinc-500">
                        {songCount} song{songCount !== 1 ? "s" : ""}
                        {totalCount > songCount ? ` · ${totalCount} items` : ""}
                    </p>
                </div>
                <Link
                    href={`/setlists/${setlistId}`}
                    className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-zinc-800 transition-colors"
                    title="Edit setlist"
                >
                    <Pencil className="h-4 w-4 text-zinc-500" />
                </Link>
            </div>

            {/* Track list */}
            <ScrollArea className="flex-1">
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

                    {/* Section quick-jump chips — inside scroll area */}
                    {sectionLabels.length > 1 && (
                        <div className="flex gap-2 px-2 py-2 mb-1 overflow-x-auto">
                            {sectionLabels.map((label) => (
                                <button
                                    key={label}
                                    onClick={() => scrollToSection(label)}
                                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold
                                        bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white
                                        border border-zinc-700/50 transition-colors"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}

                    {tracks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
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
                                    <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm px-4 py-2 mt-3 first:mt-0
                                        text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500 border-b border-zinc-800/50">
                                        {section.label}
                                    </div>
                                )}

                                {/* Tracks in section */}
                                {section.tracks.map(({ item: track, globalIndex, track: rawTrack }) => {
                                    const isFlowItem = track.trackType && track.trackType !== "song"
                                    const isTapped = tappedIndex === globalIndex
                                    const hasChart = !track.fileId.startsWith("flow-")

                                    return (
                                        <button
                                            key={`${track.fileId}-${globalIndex}`}
                                            onClick={() => handleTrackTap(globalIndex)}
                                            disabled={tappedIndex !== null}
                                            className={cn(
                                                "flex items-center gap-4 p-4 rounded-xl transition-all text-left w-full",
                                                isTapped
                                                    ? "bg-blue-600 text-white"
                                                    : "hover:bg-zinc-900 active:bg-zinc-800",
                                                isFlowItem && !isTapped && "opacity-60",
                                                tappedIndex !== null && !isTapped && "opacity-40 pointer-events-none"
                                            )}
                                        >
                                            {/* Track number / icon */}
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                                                isTapped
                                                    ? "bg-white/20 text-white"
                                                    : isFlowItem
                                                        ? "bg-transparent text-zinc-600"
                                                        : "bg-zinc-800 text-zinc-400"
                                            )}>
                                                {isTapped ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : isFlowItem ? (
                                                    trackIcon(track.trackType)
                                                ) : (
                                                    globalIndex + 1
                                                )}
                                            </div>

                                            {/* Track info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "font-bold truncate",
                                                        isFlowItem ? "text-sm" : "text-base"
                                                    )}>
                                                        {track.name}
                                                    </div>
                                                    {track.key && (
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded text-xs font-bold border shrink-0",
                                                            isTapped
                                                                ? "bg-white/20 border-white/30 text-white"
                                                                : "bg-zinc-800 border-zinc-700 text-zinc-400"
                                                        )}>
                                                            {track.key}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Subtitle info */}
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {isFlowItem && track.trackType && (
                                                        <span className="text-[10px] opacity-70 uppercase tracking-wider">
                                                            {track.trackType}
                                                        </span>
                                                    )}
                                                    {track.performer && (
                                                        <span className="text-xs text-zinc-500">{track.performer}</span>
                                                    )}
                                                    {rawTrack.notes && !isFlowItem && (
                                                        <span className="text-xs text-zinc-600 truncate">{rawTrack.notes}</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Chevron / play indicator */}
                                            {hasChart && !isTapped && (
                                                <ChevronRight className="h-5 w-5 text-zinc-700 shrink-0" />
                                            )}
                                            {isTapped && (
                                                <PlayCircle className="h-6 w-6 fill-white text-blue-600 shrink-0" />
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>

            {/* Bottom action bar */}
            {tracks.length > 0 && (
                <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
                    <Button
                        className="w-full h-12 text-base font-bold bg-blue-600 hover:bg-blue-500 text-white gap-2"
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
        </div>
    )
}
