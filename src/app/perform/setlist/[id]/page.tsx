"use client"

/**
 * Setlist Performance Redirect
 *
 * Loads a setlist, builds a unified playback queue (songs + flow items),
 * and redirects to the standard queue-based performance view.
 *
 * This eliminates the separate setlist performance implementation,
 * ensuring every musician gets the same tools (transpose, annotate,
 * metronome, foot pedal support) regardless of entry path.
 */

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useMusicStore, QueueItem } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { SetlistTrack } from "@/types/models"
import { logger } from "@/lib/logger"

/** Convert a SetlistTrack to a QueueItem for the unified performance view */
function toQueueItem(track: SetlistTrack, index: number): QueueItem {
    const isSong = !track.type || track.type === 'song'
    const fileId = isSong && track.fileId
        ? track.fileId
        : `flow-${index}` // Synthetic ID for non-song items

    const fileType = (() => {
        if (!track.fileId) return 'pdf'
        if (track.fileId.startsWith('db-') || track.fileId.endsWith('.musicxml') || track.fileId.endsWith('.xml') || track.fileId.endsWith('.mxl')) return 'musicxml'
        if (track.fileId.endsWith('.chordpro')) return 'chordpro'
        return 'pdf'
    })()

    return {
        name: track.title,
        fileId,
        type: fileType as QueueItem['type'],
        audioFileId: track.audioFileId,
        transposition: track.transposition,
        key: track.key,
        bpm: track.bpm,
        trackType: track.type || 'song',
        performer: track.performer,
        description: track.description,
        estimatedMinutes: track.estimatedMinutes,
    }
}

export default function SetlistPerformPage() {
    const router = useRouter()
    const params = useParams()
    const setlistId = params?.id as string
    const { user } = useAuth()
    const { setQueue } = useMusicStore()
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!setlistId || !user) return

        async function loadAndRedirect() {
            try {
                const snap = await getDoc(doc(db, 'setlists', setlistId))
                if (!snap.exists()) {
                    setError("Setlist not found")
                    return
                }

                const data = snap.data()
                const tracks: SetlistTrack[] = data.tracks || []

                if (tracks.length === 0) {
                    setError("Setlist has no tracks")
                    return
                }

                // Build unified queue with all track types
                const queue = tracks.map(toQueueItem)

                // Find the first playable song (has a real fileId)
                const firstSong = queue.find(q => !q.fileId.startsWith('flow-'))
                const firstId = firstSong?.fileId || queue[0].fileId
                const startIndex = firstSong ? queue.indexOf(firstSong) : 0

                setQueue(queue, startIndex, `/setlists/${setlistId}`, setlistId)
                router.replace(`/perform/${firstId}`)
            } catch (err) {
                logger.error("[SetlistPerform] Load error:", err)
                setError("Failed to load setlist")
            }
        }

        loadAndRedirect()
    }, [setlistId, user, setQueue, router])

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-black text-white">
                <p className="text-zinc-400">{error}</p>
                <Button variant="outline" onClick={() => router.push(`/setlists/${setlistId}`)}>
                    Back to Setlist
                </Button>
            </div>
        )
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-black">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                <p className="text-sm text-zinc-500 font-medium">Loading setlist…</p>
            </div>
        </div>
    )
}
