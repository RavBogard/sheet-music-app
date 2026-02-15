"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useLibraryStore } from "@/lib/library-store"
import { useMusicStore, FileType } from "@/lib/store"
import { SongChartsLibrary } from "@/components/library/SongChartsLibrary"

export default function LibraryPage() {
    const router = useRouter()
    const { user, signIn, isMember } = useAuth()
    const { loading } = useLibraryStore()
    const { setFile } = useMusicStore()

    if (!loading && !user) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] text-center p-6">
                <h2 className="text-xl font-semibold mb-3 text-foreground">Restricted Access</h2>
                <p className="text-muted-foreground mb-6 max-w-md text-sm">The full song library is available only to signed-in users.</p>
                <button onClick={signIn} className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-3 rounded-xl font-semibold transition-colors">
                    Sign In to Access
                </button>
            </div>
        )
    }

    if (!loading && user && !isMember) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] text-center p-6">
                <h2 className="text-xl font-semibold mb-3 text-yellow-600 dark:text-yellow-500">Account Pending</h2>
                <p className="text-muted-foreground mb-6 max-w-md text-sm">
                    Your account is being verified. You can view public setlists while you wait.
                </p>
                <div className="px-4 py-2 bg-muted rounded-lg border border-border text-sm font-mono text-muted-foreground">
                    UID: {user.uid.slice(0, 8)}...
                </div>
            </div>
        )
    }

    const handleSelectFile = (file: any) => {
        const isXml = file.mimeType.includes('xml') || file.name.endsWith('.xml') || file.name.endsWith('.musicxml')
        const type: FileType = isXml ? 'musicxml' : 'pdf'
        setFile(`/api/drive/file/${file.id}`, type)
        router.push(`/perform/${file.id}`)
    }

    return (
        <SongChartsLibrary
            onBack={() => router.back()}
            onSelectFile={handleSelectFile}
        />
    )
}
