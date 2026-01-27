"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useLibraryStore } from "@/lib/library-store"
import { useMusicStore, FileType } from "@/lib/store"
import { SongChartsLibrary } from "@/components/library/SongChartsLibrary"
import { useSetlistImport } from "@/hooks/use-setlist-import"

export default function LibraryPage() {
    const router = useRouter()
    const { driveFiles, loading, fetchFiles } = useLibraryStore()
    const { setFile } = useMusicStore()
    const { importSetlistFromExcel } = useSetlistImport()

    useEffect(() => {
        fetchFiles()
    }, [fetchFiles])

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
