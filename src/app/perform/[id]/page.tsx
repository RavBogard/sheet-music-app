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
        if (fileId) {
            // Determine API Endpoint based on ID type
            const isDbFile = fileId.startsWith('db-')
            const expectedUrl = isDbFile
                ? `/api/library/file/${fileId}`
                : `/api/drive/file/${fileId}`

            // CRITICAL: Only update the store if the URL actually represents a different file
            // than what is currently loaded.
            if (!fileUrl?.includes(fileId)) {
                console.log("URL change detected, syncing store to:", fileId)
                // Use 'musicxml' type for DB files since they are always XML, otherwise default to PDF (SmartScoreViewer will detect content anyway)
                setFile(expectedUrl, isDbFile ? 'musicxml' : 'pdf')
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
