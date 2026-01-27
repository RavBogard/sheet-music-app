"use client"

import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight, FileMusic, Folder, FolderOpen, List, LayoutGrid, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LibrarySkeleton } from "./LibrarySkeleton"
import { EmptyState } from "@/components/ui/empty-state"

interface DriveFile {
    id: string
    name: string
    mimeType: string
    parents?: string[]
}

interface SongChartsLibraryProps {
    driveFiles: DriveFile[]
    loading?: boolean
    onBack: () => void
    onSelectFile: (file: DriveFile) => void
}

export function SongChartsLibrary({ driveFiles, loading, onBack, onSelectFile }: SongChartsLibraryProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [viewMode, setViewMode] = useState<'alphabetical' | 'folders'>('folders')
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

    // 1. Separate Folders and Files
    const { folders, files, fileMap, folderMap } = useMemo(() => {
        const folders: DriveFile[] = []
        const files: DriveFile[] = []
        const fileMap = new Map<string, DriveFile>()
        const folderMap = new Map<string, DriveFile>()

        driveFiles.forEach(f => {
            if (f.mimeType.includes('folder')) {
                folders.push(f)
                folderMap.set(f.id, f)
            } else if (
                (f.mimeType.includes('pdf') || f.mimeType.includes('xml') || f.name.endsWith('.pdf') || f.name.endsWith('.musicxml')) &&
                !f.mimeType.startsWith('audio/')
            ) {
                files.push(f)
                fileMap.set(f.id, f)
            }
        })
        return { folders, files, fileMap, folderMap }
    }, [driveFiles])

    // 2. Build Tree / Current View Logic
    const currentViewItems = useMemo(() => {
        if (viewMode === 'alphabetical') {
            return files
                .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort((a, b) => a.name.localeCompare(b.name))
        }

        // Folders View
        // If searchQuery exists, show FLAT list of matches (files + folders)
        if (searchQuery) {
            return [
                ...folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())),
                ...files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
            ].sort((a, b) => a.name.localeCompare(b.name))
        }

        // Navigation View (Hierarchy)
        // Find items whose parent is currentFolderId (or root if null)
        // Note: Drive files can have multiple parents using `parents` array.
        // If we don't have parent info, we assume root (this might be a limitation of our simple list)

        return [
            ...folders.filter(f => {
                if (currentFolderId) return f.parents?.includes(currentFolderId)
                return !f.parents || f.parents.length === 0
            }),
            ...files.filter(f => {
                if (currentFolderId) return f.parents?.includes(currentFolderId)
                // For root files, we only show them if they have NO parents or if we can't find their parent in our list
                // (which implies they are in root or a shared folder we didn't fetch)
                if (!f.parents || f.parents.length === 0) return true

                // Tricky: If a file has a parent ID that IS NOT in our folder list, it's effectively an "Orphan" or Root file for our purposes
                // But generally, shared files appear in root.
                const hasKnownParent = f.parents.some(pid => folderMap.has(pid))
                return !hasKnownParent
            })
        ].sort((a, b) => {
            // Folders first
            if (a.mimeType.includes('folder') && !b.mimeType.includes('folder')) return -1
            if (!a.mimeType.includes('folder') && b.mimeType.includes('folder')) return 1
            return a.name.localeCompare(b.name)
        })

    }, [viewMode, searchQuery, currentFolderId, files, folders, folderMap])

    // Breadcrumbs Logic
    const breadcrumbs = useMemo(() => {
        if (!currentFolderId) return []
        const crumbs = []
        let curr = folderMap.get(currentFolderId)
        while (curr) {
            crumbs.unshift(curr)
            if (curr.parents && curr.parents.length > 0) {
                // Determine next parent (simple tree assumption: take first known parent)
                // This prevents infinite loops if there are circular refs (unlikely in Drive but possible)
                const parentId = curr.parents[0]
                const next = folderMap.get(parentId)
                if (next && next.id !== curr.id && !crumbs.includes(next)) {
                    curr = next
                } else {
                    curr = undefined
                }
            } else {
                curr = undefined
            }
        }
        return crumbs
    }, [currentFolderId, folderMap])

    const getCleanName = (name: string) => {
        return name
            .replace(/\.(pdf|musicxml|xml|mxl)$/i, '')
            .replace(/_/g, ' ')
    }

    const handleItemClick = (item: DriveFile) => {
        if (item.mimeType.includes('folder')) {
            setCurrentFolderId(item.id)
            setSearchQuery("") // Clear search on navigation
        } else {
            onSelectFile(item)
        }
    }

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

                {/* View Toggle */}
                <div className="flex bg-zinc-800 rounded-lg p-1">
                    <Button
                        size="sm"
                        variant={viewMode === 'alphabetical' ? 'default' : 'ghost'}
                        onClick={() => { setViewMode('alphabetical'); setCurrentFolderId(null); }}
                        className="gap-1"
                    >
                        <List className="h-4 w-4" />
                        A-Z
                    </Button>
                    <Button
                        size="sm"
                        variant={viewMode === 'folders' ? 'default' : 'ghost'}
                        onClick={() => setViewMode('folders')}
                        className="gap-1"
                    >
                        <LayoutGrid className="h-4 w-4" />
                        Folders
                    </Button>
                </div>

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
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search charts..."
                        className="pl-10 h-12 text-lg"
                    />
                </div>

                {/* Breadcrumbs (only in Folder view and not searching) */}
                {viewMode === 'folders' && !searchQuery && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 text-sm">
                        <button
                            onClick={() => setCurrentFolderId(null)}
                            className={`flex items-center hover:text-white transition-colors ${!currentFolderId ? 'text-white font-bold' : 'text-zinc-500'}`}
                        >
                            <Folder className="h-4 w-4 mr-1" />
                            Home
                        </button>
                        {breadcrumbs.map((folder, i) => (
                            <div key={folder.id} className="flex items-center shrink-0">
                                <ChevronRight className="h-4 w-4 text-zinc-600 mx-1" />
                                <button
                                    onClick={() => setCurrentFolderId(folder.id)}
                                    className={`hover:text-white transition-colors ${i === breadcrumbs.length - 1 ? 'text-white font-bold' : 'text-zinc-500'}`}
                                >
                                    {folder.name}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* File List */}
            <ScrollArea className="flex-1 p-4">
                {loading ? (
                    <LibrarySkeleton />
                ) : (
                    <div className="max-w-3xl mx-auto grid grid-cols-1 gap-2">
                        {currentViewItems.length === 0 && (
                            <EmptyState
                                icon={searchQuery ? Search : FolderOpen}
                                title={searchQuery ? "No matches found" : "This folder is empty"}
                                description={searchQuery ? `We couldn't find anything matching "${searchQuery}"` : "Try checking another folder or search for a specific song."}
                                className="py-12"
                            />
                        )}

                        {currentViewItems.map(item => {
                            const isFolder = item.mimeType.includes('folder')
                            return (
                                <button
                                    key={item.id}
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
                                        {!isFolder && (
                                            <div className="text-xs text-zinc-500 truncate mt-1">
                                                {/* Show parent folder hint if searching */}
                                                {searchQuery && item.parents && item.parents[0] && folderMap.get(item.parents[0])?.name}
                                            </div>
                                        )}
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-zinc-600 group-hover:text-white" />
                                </button>
                            )
                        })}
                    </div>
                )}
            </ScrollArea>
        </div>
    )
}
