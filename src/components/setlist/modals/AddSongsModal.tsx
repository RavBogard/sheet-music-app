import { MIME_TYPES } from "@/lib/constants"
import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, ChevronLeft, Music, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { DriveFile } from "@/types/api"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog"

interface AddSongsModalProps {
    isOpen: boolean
    onClose: () => void
    driveFiles: DriveFile[]
    onAdd: (files: DriveFile[]) => void
}

export function AddSongsModal({
    isOpen,
    onClose,
    driveFiles,
    onAdd
}: AddSongsModalProps) {
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState("")
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

    // Logic for Breadcrumbs & Filtering (Internalized)
    const breadcrumbs = useMemo(() => {
        const path = []
        let currentId = currentFolderId
        while (currentId) {
            const folder = driveFiles.find(f => f.id === currentId)
            if (folder) {
                path.unshift(folder)
                currentId = folder.parents?.[0] || null
            } else {
                break
            }
        }
        return path
    }, [currentFolderId, driveFiles])

    const filteredFiles = driveFiles.filter(f => {
        const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase())
        const isNotDoc = !f.mimeType.includes(MIME_TYPES.SPREADSHEET) && !f.mimeType.includes(MIME_TYPES.DOCUMENT)

        if (searchQuery) return matchesSearch && isNotDoc

        if (!currentFolderId) {
            return isNotDoc && (!f.parents || f.parents.length === 0 || !driveFiles.some(df => f.parents?.includes(df.id)))
        }
        return isNotDoc && f.parents?.includes(currentFolderId)
    })

    const toggleFileSelection = (fileId: string) => {
        const newSelection = new Set(selectedFiles)
        if (newSelection.has(fileId)) {
            newSelection.delete(fileId)
        } else {
            newSelection.add(fileId)
        }
        setSelectedFiles(newSelection)
    }

    const addFolderSongs = (folderId: string) => {
        const folderFiles = driveFiles.filter(f =>
            f.parents?.includes(folderId) &&
            f.mimeType !== MIME_TYPES.FOLDER &&
            !f.mimeType.includes(MIME_TYPES.SPREADSHEET) &&
            !f.mimeType.includes(MIME_TYPES.DOCUMENT)
        )
        const newSelection = new Set(selectedFiles)
        folderFiles.forEach(f => newSelection.add(f.id))
        setSelectedFiles(newSelection)
    }

    const handleConfirm = () => {
        const filesToAdd = driveFiles.filter(f => selectedFiles.has(f.id))
        onAdd(filesToAdd)
        // Reset state
        setSelectedFiles(new Set())
        setSearchQuery("")
        onClose() // Calling onClose to signal close, but parent re-renders and closes it
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl h-[80vh] flex flex-col p-6">
                <DialogHeader className="shrink-0 flex-row items-center justify-between space-y-0">
                    <DialogTitle className="text-xl font-bold">Add Songs ({selectedFiles.size} selected)</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col flex-1 min-h-0 mt-4">
                    {/* Breadcrumbs for Navigation */}
                    {!searchQuery && (
                        <div className="flex items-center gap-1 text-sm text-zinc-500 mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide shrink-0 py-2 border-y border-white/5">
                            <button
                                onClick={() => setCurrentFolderId(null)}
                                className={cn("hover:text-blue-400 flex items-center gap-1", !currentFolderId && "text-blue-400 font-bold")}
                                style={{ minWidth: 'fit-content' }}
                            >
                                Library
                            </button>
                            {breadcrumbs.map(bc => (
                                <div key={bc.id} className="flex items-center gap-1 shrink-0">
                                    <ChevronLeft className="h-3 w-3 rotate-180 opacity-50" />
                                    <button
                                        onClick={() => setCurrentFolderId(bc.id)}
                                        className={cn("hover:text-blue-400 truncate max-w-[120px]", currentFolderId === bc.id && "text-blue-400 font-bold")}
                                    >
                                        {bc.name}
                                    </button>
                                </div>
                            ))}

                            {currentFolderId && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => addFolderSongs(currentFolderId)}
                                    className="ml-auto h-7 text-[10px] uppercase tracking-tighter bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white"
                                >
                                    Add Folder
                                </Button>
                            )}
                        </div>
                    )}

                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search library..."
                        className="mb-4 shrink-0 bg-zinc-800 border-zinc-700"
                        autoFocus
                    />

                    <div className="flex-1 overflow-y-auto -mx-2 px-2">
                        <div className="grid grid-cols-1 gap-2 pb-2">
                            {filteredFiles.slice(0, 100).map(file => {
                                const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
                                const isSelected = selectedFiles.has(file.id)

                                return (
                                    <button
                                        key={file.id}
                                        onClick={() => {
                                            if (isFolder) {
                                                setCurrentFolderId(file.id)
                                            } else {
                                                toggleFileSelection(file.id)
                                            }
                                        }}
                                        className={cn(
                                            "w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3",
                                            isSelected ? "bg-blue-600 text-white" : isFolder ? "bg-zinc-800 hover:bg-zinc-700" : "bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800"
                                        )}
                                    >
                                        {isFolder ? (
                                            <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-400">
                                                <ChevronLeft className="h-5 w-5 rotate-180" />
                                            </div>
                                        ) : (
                                            <div className={cn(
                                                "w-10 h-10 rounded-lg flex items-center justify-center",
                                                isSelected ? "bg-white/20" : "bg-blue-500/10 text-blue-500"
                                            )}>
                                                {isSelected ? <Check className="h-5 w-5" /> : <Music className="h-4 w-4" />}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{file.name}</div>
                                            <div className={cn(
                                                "text-[10px] uppercase tracking-wider",
                                                isSelected ? "text-blue-100" : "text-zinc-500"
                                            )}>
                                                {isFolder ? "Folder" : file.mimeType.split('/').pop()?.replace('vnd.google-apps.', '')}
                                            </div>
                                        </div>
                                        {isFolder && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-10 w-10 hover:bg-blue-500 hover:text-white"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    addFolderSongs(file.id)
                                                }}
                                                title="Add all songs in folder"
                                            >
                                                <Plus className="h-5 w-5" />
                                            </Button>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>

                <DialogFooter className="mt-4 shrink-0">
                    <Button
                        onClick={handleConfirm}
                        disabled={selectedFiles.size === 0}
                        className="w-full h-12 text-lg font-bold shadow-lg"
                    >
                        Add {selectedFiles.size} Song{selectedFiles.size !== 1 ? 's' : ''}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
