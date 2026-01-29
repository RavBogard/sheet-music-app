"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { useLibraryStore } from "@/lib/library-store"
import { useSetlistStore } from "@/lib/setlist-store"
import { useMusicStore, FileType } from "@/lib/store"
import { SetlistEditor } from "@/components/setlist/SetlistEditor"
import { createSetlistService } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"

export default function SetlistEditorPage() {
    const router = useRouter()
    const params = useParams()
    const searchParams = useSearchParams()
    const id = params?.id as string
    const isPublic = searchParams?.get('public') === 'true'

    const { driveFiles, fetchFiles } = useLibraryStore()
    const { items: pendingItems, clear: clearPending } = useSetlistStore()
    const { setQueue } = useMusicStore()
    const { user } = useAuth()

    // State to hold the fetched setlist if editing existing
    const [existingSetlist, setExistingSetlist] = useState<any>(null)
    const [loading, setLoading] = useState(id !== 'new')
    const [guestFiles, setGuestFiles] = useState<any[]>([])

    useEffect(() => {
        if (user) {
            fetchFiles()
        }
    }, [fetchFiles, user])

    // Fetch existing setlist if ID is present
    useEffect(() => {
        if (id && id !== 'new') {
            const service = createSetlistService(user?.uid || null, user?.displayName || null)
            const unsubscribe = service.subscribeToSetlist(id, isPublic, (data: any) => {
                if (data) {
                    setExistingSetlist(data)
                }
                setLoading(false)
            })
            return () => unsubscribe()
        } else {
            setLoading(false)
        }
    }, [id, user, isPublic])

    // Guest Mode: Fetch file metadata for tracks
    useEffect(() => {
        if (!user && existingSetlist?.tracks) {
            const fileIds = existingSetlist.tracks
                .map((t: any) => t.fileId)
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
                .catch(err => console.error("Failed to load guest files", err))
        }
    }, [user, existingSetlist])

    if (loading) return <div className="h-screen flex items-center justify-center text-white">Loading...</div>

    const isNew = id === 'new'

    // Logic: If new, use pendingItems from store (populated by Import or empty).
    // If existing, use existingSetlist.
    const tracks = isNew ? pendingItems : (existingSetlist?.tracks || [])
    const name = isNew ? "" : existingSetlist?.name

    const activeFiles = user ? driveFiles : guestFiles

    return (
        <SetlistEditor
            setlistId={isNew ? undefined : id}
            initialTracks={tracks}
            initialName={name}
            initialIsPublic={existingSetlist?.isPublic || false}
            initialOwnerId={existingSetlist?.ownerId}
            initialEventDate={existingSetlist?.eventDate}
            onBack={() => {
                clearPending()
                router.back()
            }}
            onSave={(newId) => {
                clearPending()
                router.push('/setlists')
            }}
            onPlayTrack={(fileId, fileName) => {
                // Play Logic
                const trackList = tracks

                const queue = trackList
                    .filter((t: any) => t.fileId)
                    .map((t: any) => {
                        // Determine type from fileId
                        const type: FileType = (t.fileId?.endsWith('.musicxml') || t.fileId?.endsWith('.xml') || t.fileId?.endsWith('.mxl')) ? 'musicxml' : 'pdf'

                        return {
                            name: t.title,
                            fileId: t.fileId as string,
                            type: type,
                            audioFileId: t.audioFileId,
                            bpm: t.bpm,
                            key: t.key
                        }
                    })

                const clickedItemIndex = queue.findIndex((q: any) => q.fileId === fileId)
                if (clickedItemIndex !== -1) {
                    setQueue(queue, clickedItemIndex)
                    router.push(`/perform/${fileId}`)
                }
            }}
        />
    )
}
