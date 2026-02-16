"use client"

import { useMusicStore, QueueItem } from "@/lib/store"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { toDate as toDateHelper } from "@/lib/firestore-helpers"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ListMusic, PlayCircle, Music2, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { logger } from "@/lib/logger"

export function SetlistDrawer() {
    const router = useRouter()
    const { playbackQueue, queueIndex, setQueue } = useMusicStore()
    const { user } = useAuth()
    const [open, setOpen] = useState(false)
    const [publicSetlists, setPublicSetlists] = useState<Setlist[]>([])
    const [loading, setLoading] = useState(false)

    // Calculate if we should show the empty state (Public Setlists)
    const showPublicPicker = playbackQueue.length === 0

    useEffect(() => {
        if (open && showPublicPicker) {
            setLoading(true)
            const service = createSetlistService(user?.uid || null, user?.displayName || null)
            const unsubscribe = service.subscribeToPublicSetlists(
                (data) => {
                    setPublicSetlists(data)
                    setLoading(false)
                },
                (err) => {
                    logger.error("Failed to load public setlists", err)
                    setLoading(false)
                }
            )
            return () => unsubscribe()
        }
    }, [open, showPublicPicker, user])

    const handleSelectSetlist = (setlist: Setlist) => {
        if (!setlist.tracks || setlist.tracks.length === 0) return

        const queue = setlist.tracks
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
            setQueue(queue, 0)
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

                <ScrollArea className="flex-1 h-full bg-background">
                    {showPublicPicker ? (
                        <div className="p-4 grid gap-3">
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
                        <div className="flex flex-col p-2 gap-1">
                            {playbackQueue.map((track, index) => {
                                const isCurrent = index === queueIndex
                                return (
                                    <button
                                        key={`${track.fileId}-${index}`}
                                        onClick={() => {
                                            router.push(`/perform/${track.fileId}`)
                                            setOpen(false)
                                        }}
                                        className={cn(
                                            "flex items-center gap-4 p-4 rounded-xl transition-all text-left",
                                            isCurrent
                                                ? "bg-blue-600 text-foreground shadow-lg"
                                                : "hover:bg-card text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                            isCurrent ? "bg-white/20 text-foreground" : "bg-muted text-muted-foreground"
                                        )}>
                                            {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <div className="font-bold truncate text-lg">
                                                    {track.name}
                                                </div>
                                                {track.key && (
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-xs font-bold border shrink-0",
                                                        isCurrent
                                                            ? "bg-white/20 border-white/30 text-foreground"
                                                            : "bg-muted border-border text-muted-foreground"
                                                    )}>
                                                        {track.key}
                                                    </span>
                                                )}
                                            </div>
                                            {track.type && (
                                                <div className="text-xs opacity-70 uppercase tracking-wider">
                                                    {track.type}
                                                </div>
                                            )}
                                        </div>
                                        {isCurrent && <PlayCircle className="h-6 w-6 fill-white text-blue-600" />}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </ScrollArea>

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
