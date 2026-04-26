"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { X, Search, Music, ListPlus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useLibraryStore } from "@/lib/library-store"
import { useLibrary } from "@/hooks/use-library"
import { DriveFile } from "@/types/models"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Fuse from "fuse.js"

/** Only show chart files (PDF, MusicXML, ChordPro) — exclude audio files */
const isChartFile = (f: DriveFile) =>
    !f.mimeType.startsWith("audio/") &&
    !/\.(mp3|wav|m4a|ogg|flac|aac|wma)$/i.test(f.name)

interface SearchOverlayProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (file: DriveFile) => void
    /** If set, overlay is in "replace" mode for this track */
    replacingTrackId?: string | null
    /** File IDs already in the setlist (to mark as "already added") */
    currentTrackFileIds?: Set<string>
    /** Whether the current user can add songs to setlists */
    canAddToSetlist?: boolean
    /** Callback to add a file to a setlist via the bottom sheet picker */
    onAddToSetlist?: (file: DriveFile) => void
}

export function SearchOverlay({
    isOpen,
    onClose,
    onSelect,
    replacingTrackId,
    currentTrackFileIds,
    canAddToSetlist,
    onAddToSetlist,
}: SearchOverlayProps) {
    const [query, setQuery] = useState("")
    const [collection, setCollection] = useState<"core" | "supplemental">("core")
    const inputRef = useRef<HTMLInputElement>(null)
    const { allFiles } = useLibraryStore()
    
    // Fetch the correct library catalog into the hydration store based on the active tab
    useLibrary(false, collection)

    // Build Fuse index for search
    const fuse = useMemo(() => {
        // Only index non-folder files
        const files = allFiles.filter((f) => !f.mimeType.includes("folder") && isChartFile(f))
        return new Fuse(files, {
            keys: ["name"],
            threshold: 0.4,
            distance: 200,
        })
    }, [allFiles])

    // Focus the search input when overlay opens
    useEffect(() => {
        if (isOpen) {
            setQuery("")
            // Small delay to let the overlay render before focusing
            const timer = setTimeout(() => inputRef.current?.focus(), 100)
            return () => clearTimeout(timer)
        }
    }, [isOpen])

    // Search results — show all matches (no artificial limits)
    const results = useMemo(() => {
        if (!query.trim()) {
            return allFiles
                .filter((f) => !f.mimeType.includes("folder") && isChartFile(f))
        }
        return fuse.search(query).map((r) => r.item)
    }, [query, fuse, allFiles])

    const handleSelect = (file: DriveFile) => {
        onSelect(file)
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
            {/* Header */}
            <div className="flex flex-col gap-3 px-4 py-3 border-b border-border">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
                        <X className="h-5 w-5" />
                    </Button>
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={replacingTrackId ? "Search for replacement song..." : "Search songs to add..."}
                            className="pl-9 h-10"
                            autoComplete="off"
                            autoCorrect="off"
                        />
                    </div>
                </div>
                
                {/* Collection Toggle */}
                <Tabs value={collection} onValueChange={(val) => setCollection(val as "core" | "supplemental")} className="w-full max-w-sm mx-auto">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="core">CRC Charts</TabsTrigger>
                        <TabsTrigger value="supplemental">Shireinu</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 py-2">
                    {results.length === 0 && query.trim() && (
                        <div className="text-center py-12 text-muted-foreground">
                            <p className="text-sm">No songs found for &quot;{query}&quot;</p>
                        </div>
                    )}

                    {results.length === 0 && !query.trim() && (
                        <div className="text-center py-12 text-muted-foreground">
                            <p className="text-sm">No songs in your library yet</p>
                        </div>
                    )}

                    {results.map((file) => {
                        const isAlreadyAdded = currentTrackFileIds?.has(file.id)
                        const cleanName = file.name
                            .replace(/\.(pdf|musicxml|xml|mxl)$/i, "")
                            .replace(/_/g, " ")
                            .replace(/-/g, " ")
                            .trim()

                        return (
                            <button
                                key={file.id}
                                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors
                                    ${isAlreadyAdded
                                        ? "opacity-50 cursor-default"
                                        : "hover:bg-accent/50 active:bg-accent cursor-pointer"
                                    }
                                `}
                                style={{ minHeight: "44px" }}
                                onClick={() => !isAlreadyAdded && handleSelect(file)}
                                disabled={isAlreadyAdded}
                            >
                                <div className="shrink-0 text-muted-foreground/40">
                                    <Music className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-foreground truncate block">
                                            {cleanName || file.name}
                                        </span>
                                        {file.collection === 'supplemental' ? (
                                            <span className="text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-md border border-amber-500/20 shrink-0 mt-0.5">
                                                Shireinu
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-md border border-blue-500/20 shrink-0 mt-0.5">
                                                CRC
                                            </span>
                                        )}
                                    </div>
                                    {file.metadata?.key && (
                                        <span className="text-xs text-muted-foreground mt-0.5 block">
                                            Key: {file.metadata.key}
                                        </span>
                                    )}
                                </div>
                                {isAlreadyAdded && (
                                    <span className="text-xs text-muted-foreground shrink-0">Added</span>
                                )}
                                {canAddToSetlist && onAddToSetlist && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="shrink-0 text-xs opacity-70 hover:opacity-100"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onAddToSetlist(file)
                                        }}
                                    >
                                        <ListPlus className="h-3.5 w-3.5 mr-1" />
                                        Add to Setlist...
                                    </Button>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
