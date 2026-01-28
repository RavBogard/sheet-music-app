"use client"

import { MIME_TYPES } from "@/lib/constants"
import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, ChevronLeft, Music, Plus, Folder, Search, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { DriveFile } from "@/types/models"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog"
import { useLibraryStore } from "@/lib/library-store"

interface AddSongsModalProps {
    isOpen: boolean
    onClose: () => void
    onAdd: (files: DriveFile[]) => void
}

export function AddSongsModal({
    isOpen,
    onClose,
    onAdd
}: AddSongsModalProps) {
    const {
        driveFiles,
        loading,
        fetchFiles,
        nextPageToken,
        reset
    } = useLibraryStore()

    const [selectedFiles, setSelectedFiles] = useState<Map<string, DriveFile>>(new Map())
    const [searchQuery, setSearchQuery] = useState("")

    // Breadcrumbs State
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null, name: string }[]>([
        { id: null, name: 'Library' }
    ])
    const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id

    // Fetch on mount/change
    useEffect(() => {
        if (isOpen) {
            fetchFiles({
                folderId: currentFolderId,
                query: searchQuery,
                force: true
            })
        }
    }, [isOpen, currentFolderId, searchQuery, fetchFiles])

    // Cleanup when modal closes (reset library store so main view isn't affected? 
    // Actually, we probably want to leave it alone or reset it. 
    // Resetting is safer to ensure consistent state next open.
    // BUT if we reset on unmount, verify we don't break main library if it's mounted behind.
    // Given the modal is used in Editor (separate page usually), it's fine.

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value)
    }

    const { folders, files } = useMemo(() => {
        const folders: DriveFile[] = []
        const files: DriveFile[] = []

        driveFiles.forEach(f => {
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
    }, [driveFiles])

    const combinedItems = [...folders, ...files]

    const toggleFileSelection = (file: DriveFile) => {
        const newMap = new Map(selectedFiles)
        if (newMap.has(file.id)) {
            newMap.delete(file.id)
        } else {
            newMap.set(file.id, file)
        }
        setSelectedFiles(newMap)
    }

    const addVisibleSongs = () => {
        const newMap = new Map(selectedFiles)
        files.forEach(f => newMap.set(f.id, f))
        setSelectedFiles(newMap)
    }

    const handleConfirm = () => {
        onAdd(Array.from(selectedFiles.values()))
        setSelectedFiles(new Map())
        setSearchQuery("")
        onClose()
    }

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

    // Infinite Scroll Observer
    const observerTarget = useRef<HTMLDivElement>(null)
    const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
        const [target] = entries
        if (target.isIntersecting && nextPageToken && !loading) {
            fetchFiles({ loadMore: true })
        }
    }, [nextPageToken, loading, fetchFiles])

    useEffect(() => {
        const element = observerTarget.current
        const observer = new IntersectionObserver(handleObserver, { threshold: 1.0 })
        if (element) observer.observe(element)
        return () => {
            if (element) observer.unobserve(element)
        }
    }, [handleObserver, driveFiles]) // Re-attach when list changes

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

                            {currentFolderId && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={addVisibleSongs}
                                    className="ml-auto h-7 text-[10px] uppercase tracking-tighter bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white"
                                >
                                    Add Visible
                                </Button>
                            )}
                        </div>
                    )}

                    <Input
                        value={searchQuery}
                        onChange={handleSearchChange}
                        placeholder="Search library..."
                        className="mb-4 shrink-0 bg-zinc-800 border-zinc-700"
                        autoFocus
                    />

                    <div className="flex-1 overflow-y-auto -mx-2 px-2">
                        <div className="grid grid-cols-1 gap-2 pb-2">
                            {combinedItems.map(file => {
                                const isFolder = file.mimeType.includes('folder')
                                const isSelected = selectedFiles.has(file.id)

                                return (
                                    <button
                                        key={file.id}
                                        onClick={() => {
                                            if (isFolder) {
                                                navigateFolder(file)
                                            } else {
                                                toggleFileSelection(file)
                                            }
                                        }}
                                        className={cn(
                                            "w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3",
                                            isSelected ? "bg-blue-600 text-white" : isFolder ? "bg-zinc-800 hover:bg-zinc-700" : "bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800"
                                        )}
                                    >
                                        {isFolder ? (
                                            <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-400">
                                                <Folder className="h-5 w-5 text-yellow-500" />
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
                                    </button>
                                )
                            })}
                            {/* Infinite Scroll Loader */}
                            <div ref={observerTarget} className="h-10 flex items-center justify-center w-full">
                                {loading && nextPageToken && (
                                    <div className="flex items-center gap-2 text-zinc-500 text-sm">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading more...
                                    </div>
                                )}
                            </div>
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
