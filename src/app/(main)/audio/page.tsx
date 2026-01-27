"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useLibraryStore } from "@/lib/library-store"
import { AudioLibrary } from "@/components/audio/AudioLibrary"

export default function AudioPage() {
    const router = useRouter()
    const { driveFiles, fetchFiles } = useLibraryStore()

    useEffect(() => {
        fetchFiles()
    }, [fetchFiles])

    return (
        <AudioLibrary
            driveFiles={driveFiles}
            onBack={() => router.back()}
        />
    )
}
