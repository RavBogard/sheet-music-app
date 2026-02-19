"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useLibraryStore } from "@/lib/library-store"
import dynamic from "next/dynamic"

const SetlistDashboard = dynamic(
    () => import("@/components/setlist/SetlistDashboard").then(m => m.SetlistDashboard),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-[calc(100vh-80px)]">
                <div className="animate-pulse text-muted-foreground">Loading setlists...</div>
            </div>
        ),
    }
)

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
                onCreateNew={() => router.push('/setlists/new')}
            />
        </>
    )
}
