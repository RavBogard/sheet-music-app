"use client"

import { useState, useMemo, useEffect, useRef, useLayoutEffect } from "react"
import { ChevronLeft, FolderOpen, Search, Music, CheckSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LibrarySkeleton } from "./LibrarySkeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { useRouter } from "next/navigation"
import { useMusicStore, FileType } from "@/lib/store"
import { NoResultsIllustration, EmptyFolderIllustration, EmptyAudioIllustration } from "@/components/ui/illustrations"
import { ErrorState } from "@/components/ui/error-state"
import { useLibraryStore } from "@/lib/library-store"
import { useLibrary } from "@/hooks/use-library"
import { useContentSearch } from "@/hooks/use-content-search"
import { ContentSearchResults } from "@/components/library/ContentSearchResults"
import { DriveFile } from "@/types/models"
import { LibraryFilters, applyLibraryFilters, createEmptyFilters, LibraryFilterState } from "@/components/library/LibraryFilters"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { useCongregation } from "@/lib/congregation-store"
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
    onBack?: () => void
    onSelectFile?: (file: DriveFile) => void
    initialLibrary?: DriveFile[]
}

export function SongChartsLibrary({ onBack, onSelectFile, initialLibrary = [] }: SongChartsLibraryProps) {
    const router = useRouter()
    const { setFile } = useMusicStore()

    const {
        displayedFiles,
        loading: filtering,
        setFilter,
        initialized,
        reset,
        hydrate
    } = useLibraryStore()

    const handleBack = () => {
        if (onBack) return onBack()
        router.back()
    }

    const handleSelectFile = (file: DriveFile) => {
        if (onSelectFile) {
            onSelectFile(file)
            return
        }

        const isXml = file.mimeType.includes('xml') || file.name.endsWith('.xml') || file.name.endsWith('.musicxml')
        const type: FileType = isXml ? 'musicxml' : 'pdf'
        setFile(`/api/drive/file/${file.id}`, type, '/library')
        router.push(`/perform/${file.id}`)
    }

    const storeHydrated = useRef(false)
    useLayoutEffect(() => {
        if (!storeHydrated.current && initialLibrary.length > 0) {
            hydrate(initialLibrary)
            storeHydrated.current = true
        }
    }, [initialLibrary, hydrate])

    // Automatically load the library on mount if needed
    const { refetch: loadLibrary, isLoading: queryLoading, error: queryError } = useLibrary()
    const loading = filtering || queryLoading
    const error = queryError ? queryError.message : null

    const [searchQuery, setSearchQuery] = useState("")
    const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([
        { id: null, name: 'Home' }
    ])
    const [tab, setTab] = useState<LibraryTab>("charts")
    const [playingFile, setPlayingFile] = useState<DriveFile | null>(null)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)

    // Multi-select mode
    const [selectMode, setSelectMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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

    useEffect(() => { setFilter(currentFolderId, searchQuery) }, [currentFolderId, searchQuery, setFilter])
    useEffect(() => { return () => { reset() } }, [reset])

    // Separate folders, charts, and audio
    const { folders, files: rawFiles, audioFiles } = useMemo(() => {
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

    // Library filters (key, topic, recency) — state declared after usageMap below
    const [libraryFilters, setLibraryFilters] = useState<LibraryFilterState>(createEmptyFilters)

    const getCleanName = (name: string) =>
        name.replace(/\.(pdf|musicxml|xml|mxl)$/i, '').replace(/_/g, ' ')

    const handleBreadcrumbClick = (index: number) => {
        setBreadcrumbs(prev => prev.slice(0, index + 1))
        setSearchQuery(""); contentSearch.clear()
    }

    // AI Digitize
    const { isAdmin, isBandLeader } = useAuth()
    const congregation = useCongregation()
    const [digitizing, setDigitizing] = useState<string | null>(null)

    const handleDigitize = async (file: DriveFile) => {
        try {
            setDigitizing(file.id)
            toast.info(`Digitizing "${file.name}"... This may take ~20s`)

            const omrRes = await apiFetch('/api/ai/omr', {
                method: 'POST',
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

            const saveRes = await apiFetch('/api/drive/save', {
                method: 'POST',
                body: JSON.stringify({ sourceFileId: file.id, xmlContent: omrData.xml })
            })

            if (!saveRes.ok) {
                const saveError = await saveRes.json()
                throw new Error(saveError.error || "Failed to save XML")
            }

            toast.success("Saved! The MusicXML file is now in this folder.")
            loadLibrary()
        } catch (e: unknown) {
            logger.error("Digitize Error:", e)
            toast.error(e instanceof Error ? e.message : "Digitize failed")
        } finally {
            setDigitizing(null)
        }
    }

    // Song usage data
    const [usageMap, setUsageMap] = useState<Record<string, { lastUsedDate: string; totalUses: number } | null>>({})

    // Apply library filters (key, topic, recency) to chart files
    const files = useMemo(
        () => applyLibraryFilters(rawFiles, libraryFilters, usageMap),
        [rawFiles, libraryFilters, usageMap]
    )

    const combinedItems = tab === "audio"
        ? [...folders, ...audioFiles]
        : [...folders, ...files]

    useEffect(() => {
        const fileIds = combinedItems
            .filter(f => !f.mimeType.includes('folder') && !isAudioFile(f))
            .map(f => f.id)
        if (fileIds.length === 0) return

        // Fetch in batches of 100 (uses apiFetch for auth header)
        const batchIds = fileIds.slice(0, 100)
        apiFetch(`/api/library/usage?fileIds=${batchIds.join(',')}`)
            .then(r => r.ok ? r.json() : {})
            .then(data => setUsageMap(data))
            .catch(() => { }) // Silent — usage badges are non-critical
    }, [combinedItems.map(i => i.id).join(',')])

    const itemCount = tab === "audio" ? audioFiles.length : files.length
    const hasAudio = audioFiles.length > 0

    return (
        <div className="h-screen flex flex-col bg-background text-foreground">
            {/* Header */}
            <div className="h-20 border-b border-border flex items-center px-4 gap-4">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={handleBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <div className="flex items-center gap-3 flex-1">
                    <img src="/logo.jpg" alt={congregation.shortName} className="h-8 w-8 rounded-full border border-border object-cover" />
                    <h1 className="text-2xl font-bold font-display">Song Charts</h1>
                </div>
                <div className="text-sm text-muted-foreground">{itemCount} {tab === "audio" ? "tracks" : "charts"}</div>
                {(isBandLeader || isAdmin) && (
                    <UploadDialog onUploadComplete={() => {
                        // Trigger a re-fetch of the library
                        loadLibrary()
                        toast.success("Library updated with your upload")
                    }} />
                )}
                <Button
                    variant={selectMode ? "default" : "ghost"}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => {
                        setSelectMode(!selectMode)
                        if (selectMode) setSelectedIds(new Set())
                    }}
                    title={selectMode ? "Exit select mode" : "Select files"}
                >
                    <CheckSquare className="h-4 w-4" />
                </Button>
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

                {/* Library filters (key, topic, recency) */}
                {tab === "charts" && (
                    <LibraryFilters
                        allFiles={rawFiles}
                        filters={libraryFilters}
                        onFiltersChange={setLibraryFilters}
                        usageMap={usageMap}
                    />
                )}

                {/* Tabs — only show if audio files exist */}
                {hasAudio && (
                    <div className="flex gap-2 max-w-xl mx-auto">
                        <button
                            onClick={() => setTab("charts")}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${tab === "charts"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30"
                                : "bg-muted/50 text-muted-foreground hover:text-foreground border border-border"
                                }`}
                        >
                            Charts ({files.length})
                        </button>
                        <button
                            onClick={() => setTab("audio")}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${tab === "audio"
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
                    onSelectFile={handleSelectFile}
                />
            )}

            {/* File List */}
            <ScrollArea className="flex-1 p-4">
                {!initialized && loading ? (
                    <LibrarySkeleton />
                ) : !initialized && error ? (
                    <div className="max-w-md mx-auto mt-20">
                        <ErrorState title="Library Error" description={error || "Failed to load files"} onRetry={() => loadLibrary()} />
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

                        {combinedItems.map(item => {
                            const isAudio = isAudioFile(item)
                            return (
                                <LibraryFileRow
                                    key={item.id}
                                    item={item}
                                    onClick={() => isAudio ? setPlayingFile(item) : handleSelectFile(item)}
                                    isDigitizing={digitizing === item.id}
                                    isAdmin={!!isAdmin}
                                    onDigitize={() => handleDigitize(item)}
                                    onArchive={() => {
                                        if (confirm(`Are you sure you want to archive "${getCleanName(item.name)}"? It will be hidden from the main library.`)) {
                                            toast.promise(
                                                apiFetch(`/api/library/archive`, {
                                                    method: 'PATCH',
                                                    body: JSON.stringify({ fileId: item.id, archive: true })
                                                }).then(res => {
                                                    if (!res.ok) throw new Error("Failed to archive chart")
                                                    loadLibrary()
                                                }),
                                                {
                                                    loading: 'Archiving chart...',
                                                    success: 'Chart archived successfully',
                                                    error: 'Failed to archive chart'
                                                }
                                            )
                                        }
                                    }}
                                    getCleanName={getCleanName}
                                    isPlaying={playingFile?.id === item.id}
                                    selectMode={selectMode}
                                    isSelected={selectedIds.has(item.id)}
                                    onToggleSelect={(id) => {
                                        setSelectedIds(prev => {
                                            const next = new Set(prev)
                                            if (next.has(id)) next.delete(id)
                                            else next.add(id)
                                            return next
                                        })
                                    }}
                                    onLongPress={(id) => {
                                        setSelectMode(true)
                                        setSelectedIds(new Set([id]))
                                    }}
                                    usageInfo={usageMap[item.id] ?? undefined}
                                />
                            )
                        })}

                        <div className="h-20" />
                    </div>
                )}
            </ScrollArea>

            {/* Selection Action Bar */}
            {selectMode && selectedIds.size > 0 && (
                <div className="border-t border-border bg-blue-500/10 backdrop-blur-sm px-4 py-3">
                    <div className="max-w-2xl mx-auto flex items-center justify-between">
                        <span className="text-sm font-medium">
                            {selectedIds.size} file{selectedIds.size !== 1 ? 's' : ''} selected
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    // Select all visible non-folder files
                                    const allIds = new Set(
                                        combinedItems
                                            .filter(i => !i.mimeType.includes('folder'))
                                            .map(i => i.id)
                                    )
                                    setSelectedIds(allIds)
                                }}
                            >
                                Select All
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedIds(new Set())}
                            >
                                Clear
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => {
                                    // Copy selected file names to clipboard for use elsewhere
                                    const names = combinedItems
                                        .filter(i => selectedIds.has(i.id))
                                        .map(i => getCleanName(i.name))
                                    navigator.clipboard.writeText(names.join('\n')).then(() => {
                                        toast.success(`Copied ${names.length} file names`)
                                    })
                                }}
                            >
                                Copy Names
                            </Button>
                            <Button
                                size="sm"
                                variant="default"
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={() => {
                                    const selectedItems = combinedItems.filter(i => selectedIds.has(i.id))
                                    toast.info(`${selectedItems.length} songs selected. Use the setlist editor to add songs directly.`)
                                    setSelectedIds(new Set())
                                    setSelectMode(false)
                                }}
                            >
                                Add {selectedIds.size} to Setlist
                            </Button>
                        </div>
                    </div>
                </div>
            )}

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
