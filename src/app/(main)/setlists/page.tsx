"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useLibraryStore } from "@/lib/library-store"
import { SetlistDashboard } from "@/components/setlist/SetlistDashboard"


export default function SetlistsPage() {
    const router = useRouter()
    const { allFiles, loadLibrary } = useLibraryStore()

    useEffect(() => {
        loadLibrary()
    }, [loadLibrary])

    return (
        <>
            <SetlistDashboard
                onBack={() => router.back()}
                onSelect={(setlist) => router.push(`/setlists/${setlist.id}${setlist.isPublic ? '?public=true' : ''}`)}
                onCreateNew={() => router.push('/setlists/new')}
            />
        </>
    )
}
