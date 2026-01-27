"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useLibraryStore } from "@/lib/library-store"
import { AudioLibrary } from "@/components/audio/AudioLibrary"

export default function AudioPage() {
    const router = useRouter()
    const { user, signIn } = useAuth()
    const { driveFiles, fetchFiles } = useLibraryStore()

    useEffect(() => {
        if (user) fetchFiles()
    }, [fetchFiles, user])

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] text-center p-6">
                <h2 className="text-2xl font-bold mb-4">Restricted Access</h2>
                <p className="text-zinc-400 mb-6 max-w-md">Audio practice files are available only to signed-in users.</p>
                <button onClick={signIn} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-colors">
                    Sign In to Access
                </button>
            </div>
        )
    }

    return (
        <AudioLibrary
            driveFiles={driveFiles}
            onBack={() => router.back()}
        />
    )
}
