"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useLibraryStore } from "@/lib/library-store"
import { useMusicStore, FileType } from "@/lib/store"
import { SongChartsLibrary } from "@/components/library/SongChartsLibrary"
import { useSetlistImport } from "@/hooks/use-setlist-import"

export default function LibraryPage() {
    const router = useRouter()
    const { user, signIn, isMember } = useAuth()
    const { loading } = useLibraryStore()
    const { setFile } = useMusicStore()
    const { importSetlistFromExcel } = useSetlistImport()

    if (!loading && !user) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] text-center p-6">
                <h2 className="text-2xl font-bold mb-4">Restricted Access</h2>
                <p className="text-zinc-400 mb-6 max-w-md">The full song library is available only to signed-in users.</p>
                <button onClick={signIn} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-colors">
                    Sign In to Access
                </button>
            </div>
        )
    }

    if (!loading && user && !isMember) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] text-center p-6">
                <h2 className="text-2xl font-bold mb-4 text-yellow-500">Account Pending</h2>
                <p className="text-zinc-400 mb-6 max-w-md">
                    Your account is verifying. <br />
                    You can view Public Setlists while you wait.
                </p>
                <div className="px-4 py-2 bg-zinc-900 rounded border border-zinc-800 text-sm font-mono text-zinc-500">
                    UID: {user.uid.slice(0, 8)}...
                </div>
            </div>
        )
    }

    const handleSelectFile = (file: any) => {
        const isXml = file.mimeType.includes('xml') || file.name.endsWith('.xml') || file.name.endsWith('.musicxml')
        const isExcel = file.mimeType.includes('spreadsheet') || file.name.endsWith('.xlsx')

        if (isExcel) {
            importSetlistFromExcel(file)
            return
        }

        const type: FileType = isXml ? 'musicxml' : 'pdf'

        // Update Store
        setFile(`/api/drive/file/${file.id}`, type)

        // Navigate
        router.push(`/perform/${file.id}`)
    }

    return (
        <SongChartsLibrary
            onBack={() => router.back()}
            onSelectFile={handleSelectFile}
        />
    )
}
