import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, Music } from "lucide-react"
import { cn } from "@/lib/utils"
import { MIME_TYPES } from "@/lib/constants"
import { DriveFile } from "@/types/api"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"

interface MatchFileModalProps {
    isOpen: boolean
    onClose: () => void
    driveFiles: DriveFile[]
    onMatch: (fileId: string) => void
}

export function MatchFileModal({
    isOpen,
    onClose,
    driveFiles,
    onMatch
}: MatchFileModalProps) {
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

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl h-[80vh] flex flex-col p-6">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="text-xl font-bold">Link to Music File</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col flex-1 min-h-0 mt-4">
                    {/* Breadcrumbs for Navigation */}
                    {!searchQuery && (
                        <div className="flex items-center gap-1 text-sm text-zinc-500 mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide shrink-0">
                            <button
                                onClick={() => setCurrentFolderId(null)}
                                className={cn("hover:text-blue-400 truncate", !currentFolderId && "text-blue-400 font-bold")}
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
                        </div>
                    )}

                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search files..."
                        className="mb-4 shrink-0 bg-zinc-800 border-zinc-700"
                        autoFocus
                    />

                    <div className="flex-1 overflow-y-auto -mx-2 px-2">
                        <div className="grid grid-cols-1 gap-2 pb-2">
                            {filteredFiles.slice(0, 100).map(file => {
                                const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
                                return (
                                    <button
                                        key={file.id}
                                        onClick={() => {
                                            if (isFolder) {
                                                setCurrentFolderId(file.id)
                                            } else {
                                                onMatch(file.id)
                                            }
                                        }}
                                        className={cn(
                                            "w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3",
                                            isFolder ? "bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50" : "bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800"
                                        )}
                                    >
                                        {isFolder ? (
                                            <div className="w-10 h-10 rounded-lg bg-zinc-700/30 flex items-center justify-center text-zinc-400 group-hover:text-blue-400">
                                                <ChevronLeft className="h-5 w-5 rotate-180" />
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
