"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, ChevronLeft, Music, Folder, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { MIME_TYPES } from "@/lib/constants"
import { DriveFile } from "@/types/models"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { useLibraryStore } from "@/lib/library-store"

interface MatchFileModalProps {
    isOpen: boolean
    onClose: () => void
    onMatch: (fileId: string) => void
}

export function MatchFileModal({
    isOpen,
    onClose,
    onMatch
}: MatchFileModalProps) {
    const {
        displayedFiles,
        loading,
        loadLibrary,
        setFilter
    } = useLibraryStore()

    const [searchQuery, setSearchQuery] = useState("")

    // Breadcrumbs State
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null, name: string }[]>([
        { id: null, name: 'Library' }
    ])
    const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id

    // Fetch on mount/change
    useEffect(() => {
        if (isOpen) {
            loadLibrary()
        }
    }, [isOpen, loadLibrary])

    useEffect(() => {
        if (isOpen) {
            setFilter(currentFolderId, searchQuery)
        }
    }, [isOpen, currentFolderId, searchQuery, setFilter])

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value)
    }

    const { folders, files } = useMemo(() => {
        const folders: DriveFile[] = []
        const files: DriveFile[] = []

        displayedFiles.forEach(f => {
            if (f.mimeType.includes('folder')) {
                folders.push(f)
            } else if (
                !f.mimeType.includes(MIME_TYPES.SPREADSHEET) &&
                !f.mimeType.includes(MIME_TYPES.DOCUMENT)
            ) {
                files.push(f)
            }
        })
        return { folders, files }
    }, [displayedFiles])

    const combinedItems = [...folders, ...files]

    const navigateFolder = (folder: DriveFile | null) => {
        if (folder) {
            setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }])
        } else {
            setBreadcrumbs([{ id: null, name: 'Library' }])
        }
        setSearchQuery("")
    }

    const handleBreadcrumbClick = (index: number) => {
        setBreadcrumbs(prev => prev.slice(0, index + 1))
        setSearchQuery("")
    }



    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl h-[80vh] flex flex-col p-6">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="text-xl font-bold">Link to Music File</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col flex-1 min-h-0 mt-4">
                    {/* Breadcrumbs for Navigation */}
                    {!searchQuery && (
                        <div className="flex items-center gap-1 text-sm text-zinc-500 mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide shrink-0 py-2 border-y border-white/5">
                            {breadcrumbs.map((crumb, i) => (
                                <div key={crumb.id || 'root'} className="flex items-center gap-1 shrink-0">
                                    {i > 0 && <ChevronLeft className="h-3 w-3 rotate-180 opacity-50" />}
                                    <button
                                        onClick={() => handleBreadcrumbClick(i)}
                                        className={cn("hover:text-blue-400 truncate max-w-[120px]", i === breadcrumbs.length - 1 && "text-blue-400 font-bold")}
                                    >
                                        {crumb.name}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <Input
                        value={searchQuery}
                        onChange={handleSearchChange}
                        placeholder="Search files..."
                        className="mb-4 shrink-0 bg-zinc-800 border-zinc-700"
                        autoFocus
                    />

                    <div className="flex-1 overflow-y-auto -mx-2 px-2">
                        <div className="grid grid-cols-1 gap-2 pb-2">
                            {combinedItems.map(file => {
                                const isFolder = file.mimeType.includes('folder')

                                return (
                                    <button
                                        key={file.id}
                                        onClick={() => {
                                            if (isFolder) {
                                                navigateFolder(file)
                                            } else {
                                                onMatch(file.id)
                                                onClose()
                                            }
                                        }}
                                        className={cn(
                                            "w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3",
                                            isFolder ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300" : "bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800 text-white"
                                        )}
                                    >
                                        {isFolder ? (
                                            <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-400">
                                                <Folder className="h-5 w-5 text-yellow-500" />
                                            </div>
                                        ) : (
                                            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                                                <Music className="h-4 w-4" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{file.name}</div>
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                                                {isFolder ? "Folder" : file.mimeType.split('/').pop()?.replace('vnd.google-apps.', '')}
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}

                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
