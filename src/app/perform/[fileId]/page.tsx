"use client"

import { useParams, useRouter } from "next/navigation"
import { PDFOverlay } from "@/components/performance/PDFOverlay"
import { SetlistTrack } from "@/types/models"
import { useMemo } from "react"
import { useLibraryStore } from "@/lib/library-store"
import { Loader2 } from "lucide-react"
import { useLibrary } from "@/hooks/use-library"
import { Button } from "@/components/ui/button"

export default function StandalonePerformPage() {
    const params = useParams()
    const router = useRouter()
    const fileId = params?.fileId as string
    
    // We need to fetch the library if it's not loaded
    const { allFiles, initialized } = useLibraryStore()
    useLibrary() // trigger react-query fetch if needed

    const file = useMemo(() => allFiles.find(f => f.id === fileId), [allFiles, fileId])

    if (!initialized) {
         return (
             <div className="flex flex-col h-[100dvh] items-center justify-center bg-background">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                 <p className="mt-4 text-muted-foreground text-sm">Loading chart...</p>
             </div>
         )
    }

    if (!file && initialized) {
        return (
             <div className="flex flex-col h-[100dvh] items-center justify-center gap-4 bg-background">
                 <p className="text-muted-foreground font-medium">Chart not found</p>
                 <Button onClick={() => router.back()} variant="outline">Go back</Button>
             </div>
        )
    }

    if (!file) return null

    const getFileNameWithExtension = (f: typeof file) => {
        if (!f) return "";
        const name = (f as any).originalName || f.name;
        if (f.mimeType === 'text/plain' && !name.endsWith('.txt')) return `${name}.txt`;
        if (f.mimeType === 'application/xml' && !name.match(/\.(xml|mxl|musicxml)$/i)) return `${name}.musicxml`;
        if (f.mimeType === 'application/pdf' && !name.endsWith('.pdf')) return `${name}.pdf`;
        return name;
    }

    const track: SetlistTrack = {
        id: file.id,
        title: file.name.replace(/\.[^/.]+$/, ""), // remove extension for display
        fileId: file.id,
        fileName: getFileNameWithExtension(file),
        key: file.metadata?.key
    }

    return (
        <PDFOverlay
            track={track}
            tracks={[track]}
            currentIndex={0}
            onClose={() => router.back()}
            onNavigate={() => {}}
            isPublicView={false}
        />
    )
}
