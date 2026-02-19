"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useLibraryStore } from "@/lib/library-store"
import { SetlistDashboard } from "@/components/setlist/SetlistDashboard"

export default function SetlistsPage() {
    const router = useRouter()
    const { loadLibrary } = useLibraryStore()

    useEffect(() => {
        loadLibrary()
    }, [loadLibrary])

    return (
        <>
            <SetlistDashboard
                onBack={() => router.back()}
                onSelect={(setlist) => router.push(`/perform/setlist/${setlist.id}`)}
                onCreateNew={() => router.push('/setlists/new')}
            />
        </>
    )
}
