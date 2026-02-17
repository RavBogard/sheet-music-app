"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { ChevronLeft, FolderOpen, Search, Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LibrarySkeleton } from "./LibrarySkeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { NoResultsIllustration, EmptyFolderIllustration, EmptyAudioIllustration } from "@/components/ui/illustrations"
import { ErrorState } from "@/components/ui/error-state"
import { useLibraryStore } from "@/lib/library-store"
import { useContentSearch } from "@/hooks/use-content-search"
import { ContentSearchResults } from "@/components/library/ContentSearchResults"
import { DriveFile } from "@/types/models"
import { useAuth } from "@/lib/auth-context"
import { useCongregation } from "@/lib/congregation-context"
import { toast } from "sonner"
import { AudioPlayer } from "@/components/audio/AudioPlayer"

import { UploadDialog } from "./UploadDialog"
import { LibraryBreadcrumbs, Breadcrumb } from "./LibraryBreadcrumbs"
import { LibraryFileRow } from "./LibraryFileRow"
import { logger } from "@/lib/logger"

type LibraryTab = "charts" | "audio"

function isAudioFile(f: DriveFile) {
    return f.mimeType.startsWith('audio/') ||
        /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(f.name)
}

function isChartFile(f: DriveFile) {
    return (f.mimeType.includes('pdf') || f.mimeType.includes('xml') ||
        f.name.endsWith('.pdf') || f.name.endsWith('.musicxml')) &&
        !f.mimeType.startsWith('audio/')
}

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
    const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([
        { id: null, name: 'Home' }
    ])
    const [tab, setTab] = useState<LibraryTab>("charts")
    const [playingFile, setPlayingFile] = useState<DriveFile | null>(null)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)

    // Content search (searches within chord data / lyrics)
    const contentSearch = useContentSearch()
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleSearchChange = (value: string) => {
        setSearchQuery(value)
        // Debounce content search (only triggers for 3+ chars after 500ms)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        if (value.length >= 3) {
            debounceRef.current = setTimeout(() => contentSearch.search(value), 500)
        } else {
            contentSearch.clear()
        }
    }

    const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id

    useEffect(() => { loadLibrary() }, [loadLibrary])
    useEffect(() => { setFilter(currentFolderId, searchQuery) }, [currentFolderId, searchQuery, setFilter])
    useEffect(() => { return () => { reset() } }, [reset])

    // Separate folders, charts, and audio
    const { folders, files, audioFiles } = useMemo(() => {
        const folders: DriveFile[] = []
        const files: DriveFile[] = []
        const audioFiles: DriveFile[] = []
        displayedFiles.forEach(f => {
            if (f.mimeType.includes('folder')) {
                folders.push(f)
            } else if (isAudioFile(f)) {
                audioFiles.push(f)
            } else if (isChartFile(f)) {
                files.push(f)
            }
        })
        return { folders, files, audioFiles }
    }, [displayedFiles])

    const getCleanName = (name: string) =>
        name.replace(/\.(pdf|musicxml|xml|mxl)$/i, '').replace(/_/g, ' ')

    const handleItemClick = (item: DriveFile) => {
        if (item.mimeType.includes('folder')) {
            setBreadcrumbs(prev => [...prev, { id: item.id, name: item.name }])
            setSearchQuery(""); contentSearch.clear()
        } else if (isAudioFile(item)) {
            setPlayingFile(item)
            setAudioUrl(`/api/drive/file/${item.id}`)
        } else {
            onSelectFile(item)
        }
    }

    const handleBreadcrumbClick = (index: number) => {
        setBreadcrumbs(prev => prev.slice(0, index + 1))
        setSearchQuery(""); contentSearch.clear()
    }

    // AI Digitize
    const { isAdmin, isLeader, user } = useAuth()
    const congregation = useCongregation()
    const [digitizing, setDigitizing] = useState<string | null>(null)

    const handleDigitize = async (file: DriveFile) => {
        try {
            setDigitizing(file.id)
            toast.info(`Digitizing "${file.name}"... This may take ~20s`)
            const token = await user?.getIdToken()

            const omrRes = await fetch('/api/ai/omr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ fileId: file.id })
            })

            if (!omrRes.ok) {
                if (omrRes.status === 504) throw new Error("The AI took too long. The file might be too complex or large.")
                const text = await omrRes.text()
                let errorMsg = "Digitization failed"
                try { const json = JSON.parse(text); if (json.error) errorMsg = json.error }
                catch { errorMsg = `Server Error (${omrRes.status}): ${text.substring(0, 50)}...` }
                throw new Error(errorMsg)
            }

            const omrData = await omrRes.json()
            toast.info("Saving MusicXML...")

            const saveRes = await fetch('/api/drive/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ sourceFileId: file.id, xmlContent: omrData.xml })
            })

            if (!saveRes.ok) {
                const saveError = await saveRes.json()
                throw new Error(saveError.error || "Failed to save XML")
            }

            toast.success("Saved! The MusicXML file is now in this folder.")
            loadLibrary(true)
        } catch (e: unknown) {
            logger.error("Digitize Error:", e)
            toast.error(e instanceof Error ? e.message : "Digitize failed")
        } finally {
            setDigitizing(null)
        }
    }

    const combinedItems = tab === "audio"
        ? [...folders, ...audioFiles]
        : [...folders, ...files]

    const itemCount = tab === "audio" ? audioFiles.length : files.length
    const hasAudio = audioFiles.length > 0

    return (
        <div className="h-screen flex flex-col bg-background text-foreground">
            {/* Header */}
            <div className="h-20 border-b border-border flex items-center px-4 gap-4">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <div className="flex items-center gap-3 flex-1">
                    <img src="/logo.jpg" alt={congregation.shortName} className="h-8 w-8 rounded-full border border-border object-cover" />
                    <h1 className="text-2xl font-bold">Song Charts</h1>
                </div>
                <div className="text-sm text-muted-foreground">{itemCount} {tab === "audio" ? "tracks" : "charts"}</div>
                {(isLeader || isAdmin) && (
                    <UploadDialog onUploadComplete={() => {
                        // Trigger a re-fetch of the library
                        toast.success("Reload the library to see your upload")
                    }} />
                )}
            </div>

            {/* Search & Tabs & Breadcrumbs */}
            <div className="p-4 border-b border-border space-y-4">
                <div className="relative max-w-xl mx-auto">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder={tab === "audio" ? "Search audio files..." : "Search by name, key, topic..."}
                        className="pl-12 h-14 text-xl rounded-full bg-card border-border focus:border-blue-500"
                    />
                </div>

                {/* Tabs — only show if audio files exist */}
                {hasAudio && (
                    <div className="flex gap-2 max-w-xl mx-auto">
                        <button
                            onClick={() => setTab("charts")}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                                tab === "charts"
                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30"
                                    : "bg-muted/50 text-muted-foreground hover:text-foreground border border-border"
                            }`}
                        >
                            Charts ({files.length})
                        </button>
                        <button
                            onClick={() => setTab("audio")}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                                tab === "audio"
                                    ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/30"
                                    : "bg-muted/50 text-muted-foreground hover:text-foreground border border-border"
                            }`}
                        >
                            <Music className="w-3.5 h-3.5" />
                            Audio ({audioFiles.length})
                        </button>
                    </div>
                )}

                {!searchQuery && (
                    <LibraryBreadcrumbs breadcrumbs={breadcrumbs} onNavigate={handleBreadcrumbClick} />
                )}
            </div>

            {/* Content Search Results (searches within chord data) */}
            {searchQuery.length >= 3 && (
                <ContentSearchResults
                    results={contentSearch.results}
                    searching={contentSearch.searching}
                    query={contentSearch.query}
                />
            )}

            {/* File List */}
            <ScrollArea className="flex-1 p-4">
                {!initialized && loading ? (
                    <LibrarySkeleton />
                ) : !initialized && error ? (
                    <div className="max-w-md mx-auto mt-20">
                        <ErrorState title="Library Error" description={error || "Failed to load files"} onRetry={() => loadLibrary(true)} />
                    </div>
                ) : (
                    <div className="max-w-3xl mx-auto grid grid-cols-1 gap-2 pb-10">
                        {combinedItems.length === 0 && !loading && (
                            <EmptyState
                                icon={searchQuery ? Search : FolderOpen}
                                illustration={
                                    searchQuery
                                        ? <NoResultsIllustration className="w-20 h-20 text-muted-foreground" />
                                        : tab === "audio"
                                            ? <EmptyAudioIllustration className="w-20 h-20 text-muted-foreground" />
                                            : <EmptyFolderIllustration className="w-20 h-20 text-muted-foreground" />
                                }
                                title={searchQuery ? "No matches found" : tab === "audio" ? "No audio files here" : "This folder is empty"}
                                description={searchQuery ? `We couldn't find anything matching "${searchQuery}"` : tab === "audio" ? "Audio files (.mp3, .m4a, etc.) will appear here when added to Drive." : "Try checking another folder."}
                                className="py-12"
                            />
                        )}

                        {combinedItems.map(item => (
                            <LibraryFileRow
                                key={item.id}
                                item={item}
                                onClick={() => handleItemClick(item)}
                                isDigitizing={digitizing === item.id}
                                isAdmin={!!isAdmin}
                                onDigitize={() => handleDigitize(item)}
                                getCleanName={getCleanName}
                                isPlaying={playingFile?.id === item.id}
                            />
                        ))}

                        <div className="h-20" />
                    </div>
                )}
            </ScrollArea>

            {/* Sticky Audio Player */}
            {playingFile && audioUrl && (
                <div className="border-t border-border bg-card/95 backdrop-blur-sm px-4 py-3 pb-safe">
                    <div className="max-w-2xl mx-auto">
                        <AudioPlayer
                            src={audioUrl}
                            title={getCleanName(playingFile.name)}
                            onEnded={() => { setPlayingFile(null); setAudioUrl(null) }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

