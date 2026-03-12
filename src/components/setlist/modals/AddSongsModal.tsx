"use client"

import { MIME_TYPES } from "@/lib/constants"
import { useState, useMemo, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Music, Lightbulb, Flame, Sparkles } from "lucide-react"
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
            setFilter(searchQuery)
        }
    }, [isOpen, searchQuery, setFilter])

    // Fetch usage data once per modal open (after library loads)
    useEffect(() => {
        if (!isOpen || usageFetchedRef.current || displayedFiles.length === 0) return

        const allFiles = displayedFiles
        if (allFiles.length === 0) return

        usageFetchedRef.current = true
        setSuggestionsLoading(true)

        fetchUsageData(allFiles.map(f => f.id))
            .then(setUsageMap)
            .catch(() => {})
            .finally(() => setSuggestionsLoading(false))
    }, [isOpen, displayedFiles])

    // Compute suggestions
    const suggestions = useMemo(() => {
        if (usageMap.size === 0) return []
        return getSuggestions(displayedFiles, usageMap, currentTrackFileIds, 6)
    }, [displayedFiles, usageMap, currentTrackFileIds])

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value)
    }

    const files = useMemo(() => {
        return displayedFiles.filter(f =>
            !f.mimeType.includes(MIME_TYPES.SPREADSHEET) &&
            !f.mimeType.includes(MIME_TYPES.DOCUMENT)
        )
    }, [displayedFiles])

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

    const showSuggestions = !searchQuery && suggestions.length > 0

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" className="bg-card border-l border-border text-foreground w-full sm:max-w-md xl:max-w-lg h-full flex flex-col p-6">
                <SheetHeader className="shrink-0 flex-row items-center justify-between space-y-0">
                    <SheetTitle className="text-xl font-bold">Add Songs ({selectedFiles.size} selected)</SheetTitle>
                </SheetHeader>

                <div className="flex flex-col flex-1 min-h-0 mt-4">
                    <div className="flex items-center gap-2 mb-4 shrink-0">
                        <Input
                            value={searchQuery}
                            onChange={handleSearchChange}
                            placeholder="Search library..."
                            className="flex-1 bg-muted border-border"
                            autoFocus
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={addVisibleSongs}
                            className="h-9 text-xs bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-foreground"
                        >
                            Add All Visible
                        </Button>
                    </div>

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
                                    <p className="text-xs text-muted-foreground/50 mt-1">Loading suggestions...</p>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-2 pb-2">
                            {files.map(file => {
                                const isSelected = selectedFiles.has(file.id)

                                return (
                                    <button
                                        key={file.id}
                                        onClick={() => toggleFileSelection(file)}
                                        className={cn(
                                            "w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3",
                                            isSelected ? "bg-blue-600 text-foreground" : "bg-muted border border-border hover:bg-muted"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-10 h-10 rounded-lg flex items-center justify-center",
                                            isSelected ? "bg-white/20" : "bg-blue-500/10 text-blue-500"
                                        )}>
                                            {isSelected ? <Check className="h-5 w-5" /> : <Music className="h-4 w-4" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{file.name}</div>
                                            <div className={cn(
                                                "text-[10px] uppercase tracking-wider",
                                                isSelected ? "text-blue-100" : "text-muted-foreground"
                                            )}>
                                                {file.mimeType.split('/').pop()?.replace('vnd.google-apps.', '')}
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
