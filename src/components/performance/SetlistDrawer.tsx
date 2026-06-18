"use client"

import { useMusicStore, QueueItem } from "@/lib/store"
import { useAuth } from "@/lib/auth-context"
import { useOrg } from "@/lib/org/org-context"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { toDate as toDateHelper } from "@/lib/firestore-helpers"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ListMusic, PlayCircle, Globe, FileMusic } from "lucide-react"
import { cn } from "@/lib/utils"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useState, useEffect, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { logger } from "@/lib/logger"
import { getDb } from "@/lib/local/schema"
import { getTracksForSetlistClient } from "@/lib/client-tracks"

/**
 * A single queue row inside the perform-nav drawer. Extracted from the
 * virtualized list so the bonded-chart affordance is unit-testable without the
 * virtualizer/store. cowork #6 (option b): a flow item (prayer/reading/…) that
 * carries a bonded chart is openable, so it must read as tappable — leading
 * FileMusic glyph (shape cue, color-not-alone) + full opacity — not the passive
 * dimmed label an unbonded flow item gets. Song rows are unchanged.
 */
export function QueueRow({
    track,
    globalIndex,
    isCurrent,
    onOpen,
}: {
    track: QueueItem
    globalIndex: number
    isCurrent: boolean
    onOpen: () => void
}) {
    const isFlowItem = Boolean(track.trackType && track.trackType !== 'song')
    const openableFlowItem = isFlowItem && Boolean(track.fileId)

    return (
        <button
            onClick={onOpen}
            aria-label={openableFlowItem ? `Open chart: ${track.name}` : undefined}
            className={cn(
                "flex items-center gap-4 h-full px-4 rounded-xl transition-all text-left w-full",
                isCurrent
                    ? "bg-blue-600 text-white shadow-lg"
                    : "hover:bg-card text-muted-foreground hover:text-foreground",
                // Only a NON-openable flow item stays dimmed; an openable one
                // reads as tappable at full opacity.
                isFlowItem && !openableFlowItem && !isCurrent && "opacity-60"
            )}
        >
            <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                isCurrent ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}>
                {globalIndex + 1}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-2">
                    {openableFlowItem && (
                        <FileMusic
                            aria-hidden="true"
                            data-testid="queue-row-chart-glyph"
                            className={cn("h-4 w-4 shrink-0", isCurrent ? "text-white" : "text-brand")}
                        />
                    )}
                    <div className={cn(
                        "font-bold truncate",
                        isFlowItem ? "text-base" : "text-lg",
                        isCurrent && "text-white"
                    )}>
                        {track.name}
                    </div>
                    {track.key && (
                        <span className={cn(
                            "px-2 py-0.5 rounded text-xs font-bold border shrink-0",
                            isCurrent
                                ? "bg-transparent border-white/30 text-white"
                                : "bg-muted border-border text-muted-foreground"
                        )}>
                            {track.key}
                        </span>
                    )}
                </div>
                {isFlowItem && track.trackType && (
                    <div className={cn(
                        "text-xs uppercase tracking-wider mt-0.5",
                        isCurrent ? "opacity-90 text-blue-100" : "opacity-70"
                    )}>
                        {track.trackType}
                    </div>
                )}
            </div>
            {isCurrent && <PlayCircle className="h-6 w-6 fill-white text-blue-600 shrink-0" />}
        </button>
    )
}

export function SetlistDrawer() {
    const router = useRouter()
    const { playbackQueue, queueIndex, setQueue, jumpToSong } = useMusicStore()
    const { user } = useAuth()
    // v11-04-03: scope the public-picker subscription to the host's tenant.
    const org = useOrg()
    const [open, setOpen] = useState(false)
    const [publicSetlists, setPublicSetlists] = useState<Setlist[]>([])
    const [loading, setLoading] = useState(false)

    // Group queue items by section headers
    const sections = useMemo(() => {
        const result: { label: string | null; tracks: { item: QueueItem; globalIndex: number }[] }[] = []
        let currentSection: typeof result[0] = { label: null, tracks: [] }

        playbackQueue.forEach((item, index) => {
            if (item.trackType === 'header') {
                // Start a new section
                if (currentSection.tracks.length > 0 || currentSection.label !== null) {
                    result.push(currentSection)
                }
                currentSection = { label: item.name, tracks: [] }
            } else {
                currentSection.tracks.push({ item, globalIndex: index })
            }
        })
        // Push last section
        if (currentSection.tracks.length > 0 || currentSection.label !== null) {
            result.push(currentSection)
        }
        return result
    }, [playbackQueue])

    const sectionLabels = sections.filter(s => s.label).map(s => s.label!)

    // --- Flatten for Virtualization ---
    // We create a 1D array where each item is either a "header" or a "track"
    const virtualItemsData = useMemo(() => {
        const flat: { type: 'header' | 'track'; label?: string; track?: QueueItem; globalIndex?: number }[] = []
        sections.forEach(sec => {
            if (sec.label) {
                flat.push({ type: 'header', label: sec.label })
            }
            sec.tracks.forEach(t => {
                flat.push({ type: 'track', track: t.item, globalIndex: t.globalIndex })
            })
        })
        return flat
    }, [sections])

    const parentRef = useRef<HTMLDivElement>(null)

    // eslint-disable-next-line react-hooks/incompatible-library
    const rowVirtualizer = useVirtualizer({
        count: virtualItemsData.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => {
            return virtualItemsData[index].type === 'header' ? 36 : 80 // Base estimates
        },
        overscan: 5
    })

    // Calculate if we should show the empty state (Public Setlists)
    const showPublicPicker = playbackQueue.length === 0

    // Re-measure virtualizer after sheet animation completes
    useEffect(() => {
        if (open && !showPublicPicker) {
            // Sheet open animation is 500ms — re-measure after it settles
            const measureTimer = setTimeout(() => {
                rowVirtualizer.measure()
            }, 520)

            // Find index in 1D array for auto-scroll
            const targetVirtualIdx = virtualItemsData.findIndex(
                v => v.type === 'track' && v.globalIndex === queueIndex
            )

            if (targetVirtualIdx !== -1) {
                // Scroll after re-measure
                const scrollTimer = setTimeout(() => {
                    rowVirtualizer.scrollToIndex(targetVirtualIdx, { align: 'center', behavior: 'smooth' })
                }, 550)
                return () => {
                    clearTimeout(measureTimer)
                    clearTimeout(scrollTimer)
                }
            }
            return () => clearTimeout(measureTimer)
        }
    }, [open, showPublicPicker, queueIndex, virtualItemsData, rowVirtualizer])

    const scrollToSection = (label: string) => {
        const targetVirtualIdx = virtualItemsData.findIndex(
            v => v.type === 'header' && v.label === label
        )

        if (targetVirtualIdx !== -1) {
            rowVirtualizer.scrollToIndex(targetVirtualIdx, { align: 'start', behavior: 'smooth' })
        }
    }

    useEffect(() => {
        if (open && showPublicPicker) {
            setLoading(true)
            const service = createSetlistService(user?.uid || null, user?.displayName || null)
            const unsubscribe = service.subscribeToAllSetlists(
                (data) => {
                    setPublicSetlists(data)
                    setLoading(false)
                },
                (err) => {
                    logger.error("Failed to load public setlists", err)
                    setLoading(false)
                },
                org,
            )
            return () => unsubscribe()
        }
    }, [open, showPublicPicker, user?.uid, user?.displayName, org])

    const handleSelectSetlist = async (setlist: Setlist) => {
        // v60-06-05: read tracks from Dexie (canonical) with embedded-array
        // fallback via getTracksForSetlistClient — same 3-branch logic the
        // perf-view destination uses via useSetlistPerformance.
        let resolvedTracks
        try {
            const dexieTracks = await getDb()
                .tracks.where("setlistId")
                .equals(setlist.id)
                .sortBy("order")
            resolvedTracks = getTracksForSetlistClient(dexieTracks, setlist)
        } catch (err) {
            logger.error("[SetlistDrawer] failed to read tracks for setlist", err)
            return
        }

        if (resolvedTracks.length === 0) return

        const queue = resolvedTracks
            .filter(t => t.fileId)
            .map(t => ({
                name: t.title,
                fileId: t.fileId!,
                type: (t.fileId?.startsWith('db-') || t.fileId?.endsWith('.musicxml') || t.fileId?.endsWith('.xml') || t.fileId?.endsWith('.mxl'))
                    ? 'musicxml'
                    : t.fileId?.endsWith('.chordpro') ? 'chordpro' : 'pdf',
                audioFileId: t.audioFileId,
                bpm: t.bpm,
                transposition: t.transposition,
                key: t.key
            } as QueueItem))

        if (queue.length > 0) {
            setQueue(queue, 0, `/perform/setlist/${setlist.id}`, setlist.id)
            router.push(`/perform/${queue[0].fileId}`)
            setOpen(false)
        }
    }

    // Determine Trigger Icon based on state
    const TriggerIcon = showPublicPicker ? Globe : ListMusic
    const triggerLabel = showPublicPicker ? "Connect" : "Setlist"

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <button
                    className={cn(
                        "h-10 w-10 lg:h-12 lg:w-12 flex items-center justify-center rounded-xl transition-all",
                        "hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                    title={triggerLabel}
                >
                    <TriggerIcon className="h-5 w-5 lg:h-6 lg:w-6" />
                </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh] bg-background border-t border-border p-0 flex flex-col sm:max-w-4xl sm:mx-auto sm:rounded-t-2xl sm:shadow-2xl sm:border-x">
                <SheetHeader className="p-4 border-b border-border bg-muted sm:rounded-t-2xl">
                    <SheetTitle className="flex items-center gap-2 text-foreground">
                        <TriggerIcon className="h-5 w-5 text-blue-500" />
                        {showPublicPicker ? "Join a Setlist" : "Current Setlist"}
                    </SheetTitle>
                </SheetHeader>

                <div className="flex-1 min-h-0 flex flex-col bg-background">
                    {showPublicPicker ? (
                        <div className="p-4 grid gap-3 flex-1 overflow-auto">
                            {loading && <div className="text-muted-foreground text-center py-10">Loading active setlists...</div>}

                            {!loading && publicSetlists.length === 0 && (
                                <div className="text-muted-foreground text-center py-10 flex flex-col items-center gap-2">
                                    <Globe className="h-8 w-8 opacity-50" />
                                    <p>No public setlists active right now.</p>
                                </div>
                            )}

                            {publicSetlists.map(setlist => (
                                <button
                                    key={setlist.id}
                                    onClick={() => handleSelectSetlist(setlist)}
                                    className="bg-muted hover:bg-card border border-border hover:border-border rounded-xl p-4 text-left transition-all group flex items-start gap-4"
                                >
                                    <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                                        <PlayCircle className="h-6 w-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-lg text-foreground group-hover:text-blue-300 transition-colors truncate">
                                            {setlist.name}
                                        </h3>
                                        <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                                            <span>{setlist.trackCount || 0} songs</span>
                                            {setlist.ownerName && <span>• {setlist.ownerName}</span>}
                                        </div>
                                        {setlist.eventDate && (
                                            <div className="text-xs text-blue-400 mt-2 font-medium bg-blue-500/10 px-2 py-1 rounded w-fit">
                                                {toDateHelper(setlist.eventDate)?.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col flex-1 min-h-0">
                            <div className="border-t border-border">
                                {/* Deprecated AutoFollow here */}
                            </div>
                            {/* Section quick-jump chips */}
                            {sectionLabels.length > 1 && (
                                <div className="flex gap-2 px-4 py-2.5 overflow-x-auto border-b border-border bg-muted/50 scrollbar-hide">
                                    {sectionLabels.map(label => (
                                        <button
                                            key={label}
                                            onClick={() => scrollToSection(label)}
                                            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold
                                                bg-muted hover:bg-accent text-muted-foreground hover:text-foreground
                                                border border-border transition-colors"
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div
                                className="flex-1 min-h-0 overflow-auto"
                                ref={parentRef}
                            >
                                <div
                                    style={{
                                        height: `${rowVirtualizer.getTotalSize()}px`,
                                        width: '100%',
                                        position: 'relative',
                                    }}
                                >
                                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                        const item = virtualItemsData[virtualRow.index]

                                        if (item.type === 'header') {
                                            return (
                                                <div
                                                    key={virtualRow.index}
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        width: '100%',
                                                        height: `${virtualRow.size}px`,
                                                        transform: `translateY(${virtualRow.start}px)`,
                                                    }}
                                                    className="bg-background/90 backdrop-blur-sm px-4 flex items-center
                                                        text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground border-b border-border/50"
                                                >
                                                    {item.label}
                                                </div>
                                            )
                                        }

                                        // Track row
                                        const track = item.track!
                                        const globalIndex = item.globalIndex!
                                        const isCurrent = globalIndex === queueIndex
                                        return (
                                            <div
                                                key={virtualRow.index}
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100%',
                                                    height: `${virtualRow.size}px`,
                                                    transform: `translateY(${virtualRow.start}px)`,
                                                    padding: '4px 8px', // Outer spacing
                                                }}
                                            >
                                                <QueueRow
                                                    track={track}
                                                    globalIndex={globalIndex}
                                                    isCurrent={isCurrent}
                                                    onOpen={() => {
                                                        if (!track.fileId) return
                                                        // Jump WITHIN the live queue so Next/Prev keep
                                                        // traversing the full setlist — a router.push to
                                                        // the standalone /perform/<fileId> route drops the
                                                        // queue and dead-ends at "Song 1 of 1" (WS-08).
                                                        jumpToSong(globalIndex)
                                                        setOpen(false)
                                                    }}
                                                />
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border bg-muted">
                    <Button
                        variant="outline"
                        className="w-full h-12 text-lg font-bold border-border hover:bg-muted text-foreground"
                        onClick={() => setOpen(false)}
                    >
                        Close
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
