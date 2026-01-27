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
        // If 'resume', we just let the persisted store take over.
        // The PerformerView will render whatever fileUrl is in the store.
        if (fileId && fileId !== 'resume') {
            const expectedUrl = `/api/drive/file/${fileId}`
            if (fileUrl !== expectedUrl) {
                // If it's a new direct link, we default to PDF
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
