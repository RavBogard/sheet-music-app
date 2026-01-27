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
    const { user, signIn } = useAuth()
    const { driveFiles, loading, fetchFiles } = useLibraryStore()
    const { setFile } = useMusicStore()
    const { importSetlistFromExcel } = useSetlistImport()

    useEffect(() => {
        if (user) fetchFiles()
    }, [fetchFiles, user])

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
            driveFiles={driveFiles}
            loading={loading}
            onBack={() => router.back()}
            onSelectFile={handleSelectFile}
        />
    )
}
