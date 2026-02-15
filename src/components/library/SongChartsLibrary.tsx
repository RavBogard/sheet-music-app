"use client"

import { useState, useMemo, useEffect } from "react"
import { ChevronLeft, FolderOpen, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LibrarySkeleton } from "./LibrarySkeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { useLibraryStore } from "@/lib/library-store"
import { DriveFile } from "@/types/models"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"

import { LibraryBreadcrumbs, Breadcrumb } from "./LibraryBreadcrumbs"
import { LibraryFileRow } from "./LibraryFileRow"

interface SongChartsLibraryProps {
    onBack: () => void
    onSelectFile: (file: DriveFile) => void
}

export function SongChartsLibrary({ onBack, onSelectFile }: SongChartsLibraryProps) {
    const {
        displayedFiles,
        loading,
        loadLibrary,
        setFilter,
        initialized,
        error,
        reset
    } = useLibraryStore()

    const [searchQuery, setSearchQuery] = useState("")
    const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([
        { id: null, name: 'Home' }
    ])

    const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id

    useEffect(() => { loadLibrary() }, [loadLibrary])
    useEffect(() => { setFilter(currentFolderId, searchQuery) }, [currentFolderId, searchQuery, setFilter])
    useEffect(() => { return () => { reset() } }, [reset])

    // Separate folders from files
    const { folders, files } = useMemo(() => {
        const folders: DriveFile[] = []
        const files: DriveFile[] = []
        displayedFiles.forEach(f => {
            if (f.mimeType.includes('folder')) {
                folders.push(f)
            } else if (
                (f.mimeType.includes('pdf') || f.mimeType.includes('xml') || f.name.endsWith('.pdf') || f.name.endsWith('.musicxml')) &&
                !f.mimeType.startsWith('audio/')
            ) {
                files.push(f)
            }
        })
        return { folders, files }
    }, [displayedFiles])

    const getCleanName = (name: string) =>
        name.replace(/\.(pdf|musicxml|xml|mxl)$/i, '').replace(/_/g, ' ')

    const handleItemClick = (item: DriveFile) => {
        if (item.mimeType.includes('folder')) {
            setBreadcrumbs(prev => [...prev, { id: item.id, name: item.name }])
            setSearchQuery("")
        } else {
            onSelectFile(item)
        }
    }

    const handleBreadcrumbClick = (index: number) => {
        setBreadcrumbs(prev => prev.slice(0, index + 1))
        setSearchQuery("")
    }

    // AI Digitize
    const { isAdmin, user } = useAuth()
    const [digitizing, setDigitizing] = useState<string | null>(null)

    const handleDigitize = async (file: DriveFile) => {
        try {
            setDigitizing(file.id)
            toast.info(`Digitizing "${file.name}"... This may take ~20s`)
            const token = await user?.getIdToken()

            const omrRes = await fetch('/api/ai/omr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ fileId: file.id })
            })

            if (!omrRes.ok) {
                if (omrRes.status === 504) throw new Error("The AI took too long. The file might be too complex or large.")
                const text = await omrRes.text()
                let errorMsg = "Digitization failed"
                try { const json = JSON.parse(text); if (json.error) errorMsg = json.error }
                catch { errorMsg = `Server Error (${omrRes.status}): ${text.substring(0, 50)}...` }
                throw new Error(errorMsg)
            }

            const omrData = await omrRes.json()
            toast.info("Saving MusicXML...")

            const saveRes = await fetch('/api/drive/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ sourceFileId: file.id, xmlContent: omrData.xml })
            })

            if (!saveRes.ok) {
                const saveError = await saveRes.json()
                throw new Error(saveError.error || "Failed to save XML")
            }

            toast.success("Saved! The MusicXML file is now in this folder.")
            loadLibrary(true)
        } catch (e: unknown) {
            console.error("Digitize Error:", e)
            toast.error(e instanceof Error ? e.message : "Digitize failed")
        } finally {
            setDigitizing(null)
        }
    }

    const combinedItems = [...folders, ...files]

    return (
        <div className="h-screen flex flex-col bg-background text-foreground">
            {/* Header */}
            <div className="h-20 border-b border-border flex items-center px-4 gap-4">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <div className="flex items-center gap-3 flex-1">
                    <img src="/logo.jpg" alt="CRC" className="h-8 w-8 rounded-full border border-border object-cover" />
                    <h1 className="text-2xl font-bold">Song Charts</h1>
                </div>
                <div className="text-sm text-muted-foreground">{files.length} charts</div>
            </div>

            {/* Search & Breadcrumbs */}
            <div className="p-4 border-b border-border space-y-4">
                <div className="relative max-w-xl mx-auto">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search charts..."
                        className="pl-12 h-14 text-xl rounded-full bg-card border-border focus:border-blue-500"
                    />
                </div>
                {!searchQuery && (
                    <LibraryBreadcrumbs breadcrumbs={breadcrumbs} onNavigate={handleBreadcrumbClick} />
                )}
            </div>

            {/* File List */}
            <ScrollArea className="flex-1 p-4">
                {!initialized && loading ? (
                    <LibrarySkeleton />
                ) : !initialized && error ? (
                    <div className="max-w-md mx-auto mt-20">
                        <ErrorState title="Library Error" description={error || "Failed to load files"} onRetry={() => loadLibrary(true)} />
                    </div>
                ) : (
                    <div className="max-w-3xl mx-auto grid grid-cols-1 gap-2 pb-10">
                        {combinedItems.length === 0 && !loading && (
                            <EmptyState
                                icon={searchQuery ? Search : FolderOpen}
                                title={searchQuery ? "No matches found" : "This folder is empty"}
                                description={searchQuery ? `We couldn't find anything matching "${searchQuery}"` : "Try checking another folder."}
                                className="py-12"
                            />
                        )}

                        {combinedItems.map(item => (
                            <LibraryFileRow
                                key={item.id}
                                item={item}
                                onClick={() => handleItemClick(item)}
                                isDigitizing={digitizing === item.id}
                                isAdmin={!!isAdmin}
                                onDigitize={() => handleDigitize(item)}
                                getCleanName={getCleanName}
                            />
                        ))}

                        <div className="h-20" />
                    </div>
                )}
            </ScrollArea>
        </div>
    )
}

