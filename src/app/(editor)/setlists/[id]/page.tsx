"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { useLibraryStore } from "@/lib/library-store"
import { useSetlistStore } from "@/lib/setlist-store"
import { useMusicStore, FileType } from "@/lib/store"
import { SetlistEditorV2 } from "@/components/setlist/v2/SetlistEditorV2"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { SetlistTrack } from "@/types/models"
import { toDate } from "@/lib/firestore-helpers"

export default function SetlistEditorPage() {
    const router = useRouter()
    const params = useParams()
    const searchParams = useSearchParams()
    const id = params?.id as string
    const isPublic = searchParams?.get("public") === "true"

    const { loadLibrary } = useLibraryStore()
    const { items: pendingItems, clear: clearPending } = useSetlistStore()
    const { setQueue } = useMusicStore()
    const { user } = useAuth()
    const uid = user?.uid || null
    const displayName = user?.displayName || null

    const [existingSetlist, setExistingSetlist] = useState<Setlist | null>(null)
    const [loading, setLoading] = useState(id !== "new")

    useEffect(() => {
        if (uid) loadLibrary()
    }, [loadLibrary, uid])

    // Fetch existing setlist — depend on uid (stable string), not user object
    useEffect(() => {
        if (id && id !== "new") {
            const service = createSetlistService(uid, displayName)
            const unsubscribe = service.subscribeToSetlist(id, isPublic, (data: Setlist | null) => {
                if (data) setExistingSetlist(data)
                setLoading(false)
            })
            return () => unsubscribe()
        }
    }, [id, uid, displayName, isPublic])

    if (loading) {
        return (
            <div className="h-[100dvh] flex items-center justify-center text-muted-foreground">
                <div className="animate-pulse">Loading setlist...</div>
            </div>
        )
    }

    const isNew = id === "new"
    const tracks = isNew
        ? pendingItems.map((item) => ({
              id: item.id,
              title: item.name,
              fileId: item.fileId,
              transposition: item.transposition,
          } as SetlistTrack))
        : existingSetlist?.tracks || []

    return (
        <SetlistEditorV2
            key={id}
            setlistId={isNew ? undefined : id}
            initialTracks={tracks}
            initialName={isNew ? "" : existingSetlist?.name}
            initialIsPublic={existingSetlist?.isPublic || false}
            initialOwnerId={existingSetlist?.ownerId}
            initialEventDate={existingSetlist?.eventDate ? toDate(existingSetlist.eventDate) : undefined}
            initialRabbi={existingSetlist?.rabbi}
            initialServiceNotes={existingSetlist?.serviceNotes}
            initialMusicians={existingSetlist?.musicians}
            onBack={() => {
                clearPending()
                // Existing setlists: back to perform view. New: back to dashboard.
                router.push(isNew ? "/setlists" : `/perform/setlist/${id}`)
            }}
            onSave={() => {
                clearPending()
                router.push("/setlists")
            }}
            onPlayTrack={(fileId) => {
                const queue = tracks
                    .filter((t: SetlistTrack) => t.fileId)
                    .map((t: SetlistTrack) => {
                        const type: FileType =
                            t.fileId?.startsWith("db-") || t.fileId?.endsWith(".musicxml") || t.fileId?.endsWith(".xml") || t.fileId?.endsWith(".mxl")
                                ? "musicxml"
                                : t.fileId?.endsWith(".chordpro")
                                  ? "chordpro"
                                  : "pdf"
                        return {
                            name: t.title,
                            fileId: t.fileId as string,
                            type,
                            audioFileId: t.audioFileId,
                            bpm: t.bpm,
                            key: t.key,
                        }
                    })

                const clickedIdx = queue.findIndex((q) => q.fileId === fileId)
                if (clickedIdx !== -1) {
                    setQueue(queue, clickedIdx, `/setlists/${id}`, id)
                    router.push(`/perform/${fileId}`)
                }
            }}
        />
    )
}
