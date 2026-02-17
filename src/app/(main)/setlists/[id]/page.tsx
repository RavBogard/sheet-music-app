"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { useLibraryStore } from "@/lib/library-store"
import { useSetlistStore } from "@/lib/setlist-store"
import { useMusicStore, FileType } from "@/lib/store"
import { SetlistEditor } from "@/components/setlist/SetlistEditor"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { DriveFile, SetlistTrack } from "@/types/models"
import { toDate } from "@/lib/firestore-helpers"
import { logger } from "@/lib/logger"

export default function SetlistEditorPage() {
    const router = useRouter()
    const params = useParams()
    const searchParams = useSearchParams()
    const id = params?.id as string
    const isPublic = searchParams?.get('public') === 'true'

    const { loadLibrary } = useLibraryStore()
    const { items: pendingItems, clear: clearPending } = useSetlistStore()
    const { setQueue } = useMusicStore()
    const { user } = useAuth()

    const [existingSetlist, setExistingSetlist] = useState<Setlist | null>(null)
    const [loading, setLoading] = useState(id !== 'new')
    const [_guestFiles, setGuestFiles] = useState<DriveFile[]>([])

    useEffect(() => {
        if (user) {
            loadLibrary()
        }
    }, [loadLibrary, user])

    // Fetch existing setlist
    useEffect(() => {
        if (id && id !== 'new') {
            const service = createSetlistService(user?.uid || null, user?.displayName || null)
            const unsubscribe = service.subscribeToSetlist(id, isPublic, (data: Setlist | null) => {
                if (data) {
                    setExistingSetlist(data)
                }
                setLoading(false)
            })
            return () => unsubscribe()
        }
        // When id === 'new', loading was initialized to false — no setState needed
    }, [id, user, isPublic])

    // Guest Mode: Fetch file metadata for tracks
    useEffect(() => {
        if (!user && existingSetlist?.tracks) {
            const fileIds = existingSetlist.tracks
                .map((t: SetlistTrack) => t.fileId)
                .filter(Boolean)

            if (fileIds.length === 0) return

            fetch('/api/drive/metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileIds })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.files) {
                        setGuestFiles(data.files)
                    }
                })
                .catch(err => logger.error("Failed to load guest files", err))
        }
    }, [user, existingSetlist])

    if (loading) return <div className="h-screen flex items-center justify-center text-foreground">Loading...</div>

    const isNew = id === 'new'
    // pendingItems (SetlistItem[]) and existingSetlist.tracks (SetlistTrack[]) share compatible shapes
    const tracks = isNew
        ? pendingItems.map(item => ({
            id: item.id,
            title: item.name,
            fileId: item.fileId,
            transposition: item.transposition,
        })) as SetlistTrack[]
        : (existingSetlist?.tracks || [])
    const name = isNew ? "" : existingSetlist?.name
    // Files available via SetlistEditor props

    return (
        <SetlistEditor
            setlistId={isNew ? undefined : id}
            initialTracks={tracks}
            initialName={name}
            initialIsPublic={existingSetlist?.isPublic || false}
            initialOwnerId={existingSetlist?.ownerId}
            initialEventDate={existingSetlist?.eventDate ? toDate(existingSetlist.eventDate) : undefined}
            onBack={() => {
                clearPending()
                router.back()
            }}
            onSave={(_newId) => {
                clearPending()
                router.push('/setlists')
            }}
            onPlayTrack={(fileId, _fileName) => {
                const queue = tracks
                    .filter((t: SetlistTrack) => t.fileId)
                    .map((t: SetlistTrack) => {
                        const type: FileType = (t.fileId?.startsWith('db-') || t.fileId?.endsWith('.musicxml') || t.fileId?.endsWith('.xml') || t.fileId?.endsWith('.mxl'))
                            ? 'musicxml'
                            : t.fileId?.endsWith('.chordpro')
                                ? 'chordpro'
                                : 'pdf'

                        return {
                            name: t.title,
                            fileId: t.fileId as string,
                            type,
                            audioFileId: t.audioFileId,
                            bpm: t.bpm,
                            key: t.key
                        }
                    })

                const clickedItemIndex = queue.findIndex(q => q.fileId === fileId)
                if (clickedItemIndex !== -1) {
                    setQueue(queue, clickedItemIndex, `/setlists/${id}`, id)
                    router.push(`/perform/${fileId}`)
                }
            }}
        />
    )
}
