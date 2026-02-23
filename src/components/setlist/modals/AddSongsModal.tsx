"use client"

import { MIME_TYPES } from "@/lib/constants"
import { useState, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, ChevronLeft, Music, Folder, Lightbulb, Flame, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { DriveFile } from "@/types/models"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetFooter
} from "@/components/ui/sheet"
import { useLibraryStore } from "@/lib/library-store"
import { useLibrary } from "@/hooks/use-library"
import { fetchUsageData, getSuggestions, SongSuggestion, UsageInfo } from "@/lib/song-suggestions"

interface AddSongsModalProps {
    isOpen: boolean
    onClose: () => void
    onAdd: (files: DriveFile[]) => void
    currentTrackFileIds?: Set<string>
}

export function AddSongsModal({
    isOpen,
    onClose,
    onAdd,
    currentTrackFileIds = new Set(),
}: AddSongsModalProps) {
    const {
        displayedFiles,
        setFilter,
    } = useLibraryStore()

    useLibrary()

    const [selectedFiles, setSelectedFiles] = useState<Map<string, DriveFile>>(new Map())
    const [searchQuery, setSearchQuery] = useState("")

    // Breadcrumbs State
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null, name: string }[]>([
        { id: null, name: 'Library' }
    ])
    const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id

    // Smart suggestions
    const [usageMap, setUsageMap] = useState<Map<string, UsageInfo>>(new Map())
    const [suggestionsLoading, setSuggestionsLoading] = useState(false)
    const usageFetchedRef = useRef(false)

    // Fetch on mount/change
    useEffect(() => {
        if (!isOpen) {
            // Reset on close
            usageFetchedRef.current = false
        }
    }, [isOpen])

    useEffect(() => {
        if (isOpen) {
            setFilter(currentFolderId, searchQuery)
        }
    }, [isOpen, currentFolderId, searchQuery, setFilter])

    // Fetch usage data once per modal open (after library loads)
    useEffect(() => {
        if (!isOpen || usageFetchedRef.current || displayedFiles.length === 0) return

        const allFiles = displayedFiles.filter(f => !f.mimeType.includes('folder'))
        if (allFiles.length === 0) return

        usageFetchedRef.current = true
        setSuggestionsLoading(true)

        fetchUsageData(allFiles.map(f => f.id))
            .then(setUsageMap)
            .finally(() => setSuggestionsLoading(false))
    }, [isOpen, displayedFiles])

    // Compute suggestions
    const suggestions = useMemo(() => {
        if (usageMap.size === 0) return []
        const allLibFiles = displayedFiles.filter(f => !f.mimeType.includes('folder'))
        return getSuggestions(allLibFiles, usageMap, currentTrackFileIds, 6)
    }, [displayedFiles, usageMap, currentTrackFileIds])

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

    const showSuggestions = !searchQuery && suggestions.length > 0 && !currentFolderId

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" className="bg-card border-l border-border text-foreground w-full sm:max-w-md xl:max-w-lg h-full flex flex-col p-6">
                <SheetHeader className="shrink-0 flex-row items-center justify-between space-y-0">
                    <SheetTitle className="text-xl font-bold">Add Songs ({selectedFiles.size} selected)</SheetTitle>
                </SheetHeader>

                <div className="flex flex-col flex-1 min-h-0 mt-4">
                    {/* Breadcrumbs for Navigation */}
                    {!searchQuery && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide shrink-0 py-2 border-y border-border">
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
                                    className="ml-auto h-7 text-[10px] uppercase tracking-tighter bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-foreground"
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
                        className="mb-4 shrink-0 bg-muted border-border"
                        autoFocus
                    />

                    <div className="flex-1 overflow-y-auto -mx-2 px-2">
                        {/* Smart Suggestions */}
                        {showSuggestions && (
                            <div className="mb-4">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suggested</p>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {suggestions.map((s: SongSuggestion) => {
                                        const isSelected = selectedFiles.has(s.file.id)
                                        return (
                                            <button
                                                key={s.file.id}
                                                onClick={() => toggleFileSelection(s.file)}
                                                className={cn(
                                                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-all border",
                                                    isSelected
                                                        ? "bg-blue-600 border-blue-500 text-white"
                                                        : "bg-muted/50 border-border/50 text-foreground hover:border-border"
                                                )}
                                            >
                                                {s.category === 'staple' ? (
                                                    <Flame className="h-3 w-3 text-orange-400" />
                                                ) : (
                                                    <Sparkles className="h-3 w-3 text-emerald-400" />
                                                )}
                                                <span className="truncate max-w-[150px]">{s.file.name}</span>
                                                <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">{s.reason}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                                {suggestionsLoading && (
                                    <p className="text-xs text-muted-foreground/50 mt-1">Loading suggestions…</p>
                                )}
                            </div>
                        )}

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
                                            isSelected ? "bg-blue-600 text-foreground" : isFolder ? "bg-muted hover:bg-accent" : "bg-muted border border-border hover:bg-muted"
                                        )}
                                    >
                                        {isFolder ? (
                                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
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
                                                isSelected ? "text-blue-100" : "text-muted-foreground"
                                            )}>
                                                {isFolder ? "Folder" : file.mimeType.split('/').pop()?.replace('vnd.google-apps.', '')}
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}

                        </div>
                    </div>
                </div>

                <SheetFooter className="mt-4 shrink-0">
                    <Button
                        onClick={handleConfirm}
                        disabled={selectedFiles.size === 0}
                        className="w-full h-12 text-lg font-bold shadow-lg"
                    >
                        Add {selectedFiles.size} Song{selectedFiles.size !== 1 ? 's' : ''}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
