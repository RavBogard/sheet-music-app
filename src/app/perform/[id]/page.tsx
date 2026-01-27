"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useMusicStore, FileType } from "@/lib/store"
import { useSetlistStore } from "@/lib/setlist-store"
import { PerformerView } from "@/components/views/PerformerView"
import { useWakeLock } from "@/hooks/use-wake-lock"

export default function PerformPage() {
    const router = useRouter()
    const params = useParams()
    const { requestWakeLock, releaseWakeLock } = useWakeLock()
    const { fileUrl, fileType, setFile } = useMusicStore()

    const fileId = params?.id as string

    // Sync URL with Store
    useEffect(() => {
        if (fileId && fileId !== 'resume') {
            // Check if we need to update the store
            // We need to know the type... simplistic check or look up in LibraryStore?
            // For now, assume PDF unless we can verify.
            // Ideally PerformerView handles the fetch if URL is simple.
            // But existing logic uses `fileUrl` full path.

            // If store doesn't match ID, we might need to fetch metadata to determine type.
            // OR we just set it and let the viewer handle it?
            // `setFile` takes full API URL: `/api/drive/file/${id}`

            /// WAITING: We need to know if it's MusicXML or PDF to set `fileType`.
            // Quick hack: Default to PDF, let viewer error? Or use existing store if it matches.

            const expectedUrl = `/api/drive/file/${fileId}`
            if (fileUrl !== expectedUrl) {
                // If we are deep linking, we don't know the type!
                // We'll default to 'pdf' and maybe the viewer needs to be smarter
                // or we fetch metadata here.
                setFile(expectedUrl, 'pdf')
            }
        }
    }, [fileId, fileUrl, setFile])

    useEffect(() => {
        requestWakeLock()
        return () => {
            releaseWakeLock()
        }
    }, [requestWakeLock, releaseWakeLock])

    return (
        <PerformerView
            fileUrl={fileUrl}
            fileType={fileType}
            onHome={() => router.push('/')}
            onSetlist={() => router.push('/setlists')}
        />
    )
}
