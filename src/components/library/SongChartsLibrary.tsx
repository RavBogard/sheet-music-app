"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { ChevronLeft, ChevronRight, FileMusic, Folder, FolderOpen, List, LayoutGrid, Search, Loader2, Wand2 } from "lucide-react"
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
        displayedFiles,
        loading,
        loadLibrary,
        setFilter,
        initialized,
        error,
        reset
    } = useLibraryStore()

    const [searchQuery, setSearchQuery] = useState("")

    // Breadcrumbs State: [{id: null, name: 'Home'}, {id: '123', name: 'Folder'}]
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null, name: string }[]>([
        { id: null, name: 'Home' }
    ])

    const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id

    // Initial Load & Navigation Effect
    useEffect(() => {
        // 1. Ensure Library is Loaded (Once)
        loadLibrary()
    }, [loadLibrary])

    // 2. Apply Filter when UI state changes
    useEffect(() => {
        setFilter(currentFolderId, searchQuery)
    }, [currentFolderId, searchQuery, setFilter])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Optional: Don't reset if we want to keep cache? 
            // Better to reset for freshness if they leave the page.
            reset()
        }
    }, [reset])

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setSearchQuery(val)
        // Fuzzy Search is fast enough to run on every keystroke for <5000 items
    }

    // Memoize the separation for rendering
    const { folders, files } = useMemo(() => {
        const folders: DriveFile[] = []
        const files: DriveFile[] = []

        displayedFiles.forEach(f => {
            if (f.mimeType.includes('folder')) {
                folders.push(f)
            } else {
                // Ensure we only show supported files, though API should have filtered them?
                // The API currently returns whatever is in the index.
                if (
                    (f.mimeType.includes('pdf') || f.mimeType.includes('xml') || f.name.endsWith('.pdf') || f.name.endsWith('.musicxml')) &&
                    !f.mimeType.startsWith('audio/')
                ) {
                    files.push(f)
                }
            }
        })
        return { folders, files }
    }, [displayedFiles])

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

    // AI Digitize Logic
    const { isAdmin, user } = useAuth()
    const [digitizing, setDigitizing] = useState<string | null>(null)

    const handleDigitize = async (file: DriveFile) => {
        try {
            setDigitizing(file.id)
            toast.info(`Digitizing "${file.name}"... This may take ~20s`)

            const token = await user?.getIdToken()

            // 1. Generate XML
            const omrRes = await fetch('/api/ai/omr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ fileId: file.id })
            })

            // Handle non-JSON errors (Timeouts, 500s)
            if (!omrRes.ok) {
                if (omrRes.status === 504) {
                    throw new Error("The AI took too long to respond. The file might be too complex or large.")
                }
                const text = await omrRes.text()
                try {
                    const json = JSON.parse(text)
                    throw new Error(json.error || "Digitization failed")
                } catch (e) {
                    // Start of the actual error might be in the text
                    throw new Error(`Server Error (${omrRes.status}): ${text.substring(0, 50)}...`)
                }
            }

            const omrData = await omrRes.json()

            // 2. Save XML
            toast.info("Saving MusicXML...")
            const saveRes = await fetch('/api/drive/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    sourceFileId: file.id,
                    xmlContent: omrData.xml
                })
            })

            if (!saveRes.ok) {
                const saveError = await saveRes.json()
                throw new Error(saveError.error || "Failed to save XML")
            }

            toast.success("Saved! The MusicXML file is now in this folder.")

            // Refresh library
            loadLibrary(true)

        } catch (e: any) {
            console.error("Digitize Error:", e)
            toast.error(e.message)
        } finally {
            setDigitizing(null)
        }
    }


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
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-zinc-500" />
                    <Input
                        value={searchQuery}
                        onChange={handleSearchChange}
                        placeholder="Search charts..."
                        className="pl-12 h-14 text-xl rounded-full bg-zinc-900 border-zinc-700 focus:border-blue-500"
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
                            onRetry={() => loadLibrary(true)}
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
                                            className={`w-full text-left p-6 rounded-2xl transition-all flex items-center gap-5 group ${isFolder
                                                ? 'bg-zinc-900 border border-zinc-800 hover:border-yellow-500/50 hover:bg-zinc-800'
                                                : digitizing === item.id
                                                    ? 'bg-purple-900/20 border border-purple-500/50 cursor-wait'
                                                    : 'bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-800'
                                                }`}
                                        >
                                            {isFolder ? (
                                                <Folder className="h-10 w-10 text-yellow-400 shrink-0 group-hover:scale-110 transition-transform" />
                                            ) : digitizing === item.id ? (
                                                <div className="relative">
                                                    <FileMusic className="h-10 w-10 text-purple-500 shrink-0 opacity-50" />
                                                    <Loader2 className="h-5 w-5 text-purple-200 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                                                </div>
                                            ) : (
                                                <FileMusic className="h-10 w-10 text-blue-400 shrink-0 group-hover:scale-110 transition-transform" />
                                            )}

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3">
                                                    <div className="font-bold text-xl truncate">
                                                        {isFolder ? item.name : getCleanName(item.name)}
                                                    </div>

                                                    {/* AI Tags */}
                                                    {!isFolder && item.metadata?.key && (
                                                        <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md border border-zinc-700 font-mono">
                                                            {item.metadata.key}
                                                        </span>
                                                    )}
                                                    {!isFolder && item.metadata?.bpm && (
                                                        <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md border border-zinc-700 font-mono">
                                                            {item.metadata.bpm} bpm
                                                        </span>
                                                    )}

                                                    {digitizing === item.id && (
                                                        <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full animate-pulse">
                                                            Digitizing...
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <ChevronRight className="h-6 w-6 text-zinc-600 group-hover:text-white" />
                                        </button>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent>
                                        <ContextMenuItem onClick={() => handleItemClick(item)}>
                                            {isFolder ? "Open Folder" : "Select / View"}
                                        </ContextMenuItem>

                                        {!isFolder && (
                                            <>
                                                <ContextMenuItem disabled>
                                                    Add to Setlist (Coming Soon)
                                                </ContextMenuItem>

                                                {/* Admin Only: AI Digitize */}
                                                {isAdmin && item.mimeType.includes("pdf") && (
                                                    <ContextMenuItem
                                                        onClick={() => handleDigitize(item)}
                                                        disabled={digitizing === item.id}
                                                        className="text-purple-400 focus:text-purple-300 focus:bg-purple-900/50"
                                                    >
                                                        {digitizing === item.id ? (
                                                            <span className="flex items-center gap-2">
                                                                <Loader2 className="h-4 w-4 animate-spin" /> Digitizing...
                                                            </span>
                                                        ) : (
                                                            <span className="flex items-center gap-2">
                                                                <Wand2 className="h-4 w-4" /> Digitize (AI)
                                                            </span>
                                                        )}
                                                    </ContextMenuItem>
                                                )}
                                            </>
                                        )}
                                    </ContextMenuContent>
                                </ContextMenu>
                            )
                        })}

                        {/* End of results spacer */}
                        <div className="h-20" />
                    </div>
                )}
            </ScrollArea>
        </div>
    )
}
