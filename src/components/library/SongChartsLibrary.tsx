"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { ChevronLeft, ChevronRight, FileMusic, Folder, FolderOpen, List, LayoutGrid, Search, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LibrarySkeleton } from "./LibrarySkeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { useLibraryStore } from "@/lib/library-store"
import { DriveFile } from "@/types/models"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface SongChartsLibraryProps {
    onBack: () => void
    onSelectFile: (file: DriveFile) => void
}

export function SongChartsLibrary({ onBack, onSelectFile }: SongChartsLibraryProps) {
    const {
        driveFiles,
        loading,
        fetchFiles,
        nextPageToken,
        initialized,
        error,
        reset
    } = useLibraryStore()

    const [searchQuery, setSearchQuery] = useState("")
    const [viewMode, setViewMode] = useState<'alphabetical' | 'folders'>('folders')

    // Breadcrumbs State: [{id: null, name: 'Home'}, {id: '123', name: 'Folder'}]
    // We use null for Root
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null, name: string }[]>([
        { id: null, name: 'Home' }
    ])

    const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id

    // Debounce Search
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Initial Load & Navigation Effect
    useEffect(() => {
        // Fetch files for current folder / query
        // This runs when folder changes or query changes
        fetchFiles({
            folderId: currentFolderId,
            query: searchQuery,
            force: true // Always force a refresh on navigation
        })
    }, [currentFolderId, searchQuery, fetchFiles])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            reset()
        }
    }, [reset])

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setSearchQuery(val)
        // Note: Effect above triggers fetch. 
        // Ideally we'd debounce the set state or the effect. 
        // For now, standard React update. Infinite scroll handles "load more".
    }

    const { folders, files } = useMemo(() => {
        const folders: DriveFile[] = []
        const files: DriveFile[] = []

        driveFiles.forEach(f => {
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
    }, [driveFiles])

    const getCleanName = (name: string) => {
        return name
            .replace(/\.(pdf|musicxml|xml|mxl)$/i, '')
            .replace(/_/g, ' ')
    }

    const handleItemClick = (item: DriveFile) => {
        if (item.mimeType.includes('folder')) {
            setBreadcrumbs(prev => [...prev, { id: item.id, name: item.name }])
            setSearchQuery("") // Clear search on drill down
        } else {
            onSelectFile(item)
        }
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
    }, [handleObserver])


    const combinedItems = [...folders, ...files]

    return (
        <div className="h-screen flex flex-col bg-zinc-950 text-white">
            {/* Header */}
            <div className="h-20 border-b border-zinc-800 flex items-center px-4 gap-4">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <div className="flex items-center gap-3 flex-1">
                    <img
                        src="/logo.jpg"
                        alt="CRC"
                        className="h-8 w-8 rounded-full border border-zinc-700 object-cover"
                    />
                    <h1 className="text-2xl font-bold">Song Charts</h1>
                </div>

                {/* Sort Toggle (Visual Only for now as API sorts by folder,name default) */}
                <div className="text-sm text-zinc-500">
                    {files.length} charts
                </div>
            </div>

            {/* Sub-Header: Search OR Breadcrumbs */}
            <div className="p-4 border-b border-zinc-800 space-y-4">
                <div className="relative max-w-xl mx-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" />
                    <Input
                        value={searchQuery}
                        onChange={handleSearchChange}
                        placeholder="Search charts..."
                        className="pl-10 h-12 text-lg"
                    />
                </div>

                {/* Breadcrumbs */}
                {!searchQuery && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 text-sm no-scrollbar">
                        {breadcrumbs.map((crumb, i) => (
                            <div key={crumb.id || 'root'} className="flex items-center shrink-0">
                                {i > 0 && <ChevronRight className="h-4 w-4 text-zinc-600 mx-1" />}
                                <button
                                    onClick={() => handleBreadcrumbClick(i)}
                                    className={`flex items-center hover:text-white transition-colors ${i === breadcrumbs.length - 1 ? 'text-white font-bold' : 'text-zinc-500'}`}
                                >
                                    {crumb.id === null && <Folder className="h-4 w-4 mr-1" />}
                                    {crumb.name}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* File List */}
            <ScrollArea className="flex-1 p-4">
                {!initialized && loading ? (
                    <LibrarySkeleton />
                ) : !initialized && error ? ( // Access error from store directly or via hook
                    <div className="max-w-md mx-auto mt-20">
                        <ErrorState
                            title="Library Error"
                            description={error || "Failed to load files"}
                            onRetry={() => fetchFiles({ force: true, folderId: currentFolderId, query: searchQuery })}
                        />
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

                        {combinedItems.map(item => {
                            const isFolder = item.mimeType.includes('folder')
                            return (
                                <ContextMenu key={item.id}>
                                    <ContextMenuTrigger asChild>
                                        <button
                                            onClick={() => handleItemClick(item)}
                                            className={`w-full text-left p-4 rounded-xl transition-all flex items-center gap-4 group ${isFolder
                                                ? 'bg-zinc-900 border border-zinc-800 hover:border-yellow-500/50 hover:bg-zinc-800'
                                                : 'bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-800'
                                                }`}
                                        >
                                            {isFolder ? (
                                                <Folder className="h-8 w-8 text-yellow-400 shrink-0 group-hover:scale-110 transition-transform" />
                                            ) : (
                                                <FileMusic className="h-8 w-8 text-blue-400 shrink-0 group-hover:scale-110 transition-transform" />
                                            )}

                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-lg truncate">
                                                    {isFolder ? item.name : getCleanName(item.name)}
                                                </div>
                                            </div>
                                            <ChevronRight className="h-5 w-5 text-zinc-600 group-hover:text-white" />
                                        </button>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent>
                                        <ContextMenuItem onClick={() => handleItemClick(item)}>
                                            {isFolder ? "Open Folder" : "Select / View"}
                                        </ContextMenuItem>
                                        {!isFolder && (
                                            <ContextMenuItem disabled>
                                                Add to Setlist (Coming Soon)
                                            </ContextMenuItem>
                                        )}
                                    </ContextMenuContent>
                                </ContextMenu>
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
                )}
            </ScrollArea>
        </div>
    )
}
