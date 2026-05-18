"use client"

import { useState, useMemo, useEffect, useRef, useLayoutEffect } from "react"
import { ChevronLeft, Search, Music, CheckSquare } from "lucide-react"
import { bareStem } from "@/lib/mcp/title-specificity"
import { Button } from "@/components/ui/button"
// C4-004: Radix Tabs removed from /library — the prior `<Tabs><TabsList>
// <TabsTrigger/>` markup auto-emitted `aria-controls="radix-_r_N_-content-{val}"`
// pointing at TabsContent panels that don't exist (the chart list renders
// outside the Tabs subtree, conditioned on `tab` state directly). Axe-core
// flagged it as `aria-valid-attr-value` CRITICAL on /library. Replaced with
// a plain segmented-control: `role="group"` container + `aria-pressed`
// toggle buttons. No ARIA tab semantics claimed → no panel obligation.
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LibrarySkeleton } from "./LibrarySkeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { useRouter } from "next/navigation"
import { useMusicStore, FileType } from "@/lib/store"
import { NoResultsIllustration, EmptyAudioIllustration } from "@/components/ui/illustrations"
import { ErrorState } from "@/components/ui/error-state"
import { useLibraryStore } from "@/lib/library-store"
import { logger } from "@/lib/logger"
import { useLibrary } from "@/hooks/use-library"
import { useContentSearch } from "@/hooks/use-content-search"
import { ContentSearchResults } from "@/components/library/ContentSearchResults"
import { DriveFile } from "@/types/models"
import { LibraryFilters, applyLibraryFilters, createEmptyFilters, LibraryFilterState } from "@/components/library/LibraryFilters"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api-client"
import { useCongregation } from "@/lib/congregation-store"
import { toast } from "sonner"
import { getDb } from "@/lib/local/schema"
import { AudioPlayer } from "@/components/audio/AudioPlayer"
import { UploadDialog } from "./UploadDialog"
import { ScraperModal } from "./ScraperModal"
import { LibraryFileRow } from "./LibraryFileRow"
import { SelectionActionBar } from "./SelectionActionBar"
import { useLibraryActions } from "./useLibraryActions"
import { useAddToSetlist } from "@/hooks/use-add-to-setlist"
import { AddToSetlistSheet } from "./AddToSetlistSheet"

type LibraryTab = "core" | "supplemental" | "uploads" | "audio"

function isAudioFile(f: DriveFile) {
    return f.mimeType.startsWith('audio/') ||
        /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(f.name)
}

function isChartFile(f: DriveFile) {
    return (f.mimeType.includes('pdf') || f.mimeType.includes('xml') || f.mimeType.includes('text/plain') ||
        /\.(pdf|musicxml|xml|mxl|chordpro|txt)$/i.test(f.name)) &&
        !f.mimeType.startsWith('audio/')
}

const CHART_EXTENSION_PATTERN = /\.(pdf|musicxml|xml|mxl|chordpro|txt)$/i

function chartStemKey(name: string): string {
    return bareStem(name.replace(CHART_EXTENSION_PATTERN, '').replace(/_/g, ' '))
}

/**
 * Cycle-2 UI-003: collapse duplicate library rows that map to the same
 * musical work (same `bareStem`) down to one display row. Pre-fix, the
 * /library tabs showed the chart-file row AND a separately-cataloged
 * "song" entry for the same piece (a Klepper "Hashkivenu" .pdf next to
 * a "Hashkivenu (Klepper)" stem-cataloged song row), plus PDF/MusicXML
 * pairs for the same chart. First-encountered row wins (input order is
 * already alphabetical via list_library's sort, so this collapses
 * sibling-pairs deterministically). Empty stems (rare — emoji-only or
 * pure-punctuation names) bypass dedup so they don't all collapse into
 * a single bucket.
 */
function dedupeChartsByStem(items: DriveFile[]): DriveFile[] {
    const seen = new Set<string>()
    const out: DriveFile[] = []
    for (const item of items) {
        const stem = chartStemKey(item.name)
        if (stem.length === 0) {
            out.push(item)
            continue
        }
        if (seen.has(stem)) continue
        seen.add(stem)
        out.push(item)
    }
    return out
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
        allFiles,
        displayedFiles,
        loading: filtering,
        setFilter,
        initialized,
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
        const isText = file.mimeType.includes('text/plain') || file.name.endsWith('.txt')
        const type: FileType = isXml ? 'musicxml' : isText ? 'text' : 'pdf'
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
    const [tab, setTab] = useState<LibraryTab>("core")
    
    // We fetch ALL files now instead of just the active collection,
    // so that the tab counts in the UI are always accurate.
    const { refetch: loadLibrary, isLoading: queryLoading, error: queryError } = useLibrary(false, "all")
    const loading = filtering || queryLoading
    const error = queryError ? queryError.message : null

    const [searchQuery, setSearchQuery] = useState("")
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

    useEffect(() => { setFilter(searchQuery) }, [searchQuery, setFilter])

    // Separate charts and audio (no folders)
    const { files: rawFiles, audioFiles } = useMemo(() => {
        const files: DriveFile[] = []
        const audioFiles: DriveFile[] = []
        displayedFiles.forEach(f => {
            if (isAudioFile(f)) {
                audioFiles.push(f)
            } else if (isChartFile(f)) {
                files.push(f)
            }
        })
        return { files, audioFiles }
    }, [displayedFiles])

    // Library filters (key, topic, recency) -- state declared after usageMap below
    const [libraryFilters, setLibraryFilters] = useState<LibraryFilterState>(createEmptyFilters)

    const getCleanName = (name: string) =>
        name.replace(/\.(pdf|musicxml|xml|mxl)$/i, '').replace(/_/g, ' ')

    const { isAdmin, isBandLeader, profile, canUpload, user } = useAuth()
    const congregation = useCongregation()
    const { digitizing, handleDigitize, handleArchive, handleRename } = useLibraryActions({ loadLibrary, getCleanName })
    const addToSetlist = useAddToSetlist()

    // Song usage data
    const [usageMap, setUsageMap] = useState<Record<string, { lastUsedDate: string; totalUses: number } | null>>({})

    // Apply library filters (key, topic, recency) to chart files
    const allFilteredCore = useMemo(
        () => dedupeChartsByStem(applyLibraryFilters(rawFiles.filter(f => f.collection !== 'supplemental' && f.collection !== 'uploads'), libraryFilters, usageMap)),
        [rawFiles, libraryFilters, usageMap]
    )

    const allFilteredSupplemental = useMemo(
        () => dedupeChartsByStem(applyLibraryFilters(rawFiles.filter(f => f.collection === 'supplemental'), libraryFilters, usageMap)),
        [rawFiles, libraryFilters, usageMap]
    )

    const allFilteredUploads = useMemo(
        () => dedupeChartsByStem(applyLibraryFilters(rawFiles.filter(f => f.collection === 'uploads'), libraryFilters, usageMap)),
        [rawFiles, libraryFilters, usageMap]
    )

    const files = tab === "supplemental" ? allFilteredSupplemental : tab === "uploads" ? allFilteredUploads : allFilteredCore
    const combinedItems = tab === "audio" ? audioFiles : files

    // v4.3 P01: memoize the id-key so the effect below has a stable dep.
    // Previously deps used `combinedItems.map(i=>i.id).join(',')` inline,
    // which is a fresh string every render → effect re-ran and re-fetched
    // usage on every render.
    const combinedItemIdsKey = useMemo(
        () => combinedItems.map(i => i.id).join(','),
        [combinedItems],
    )

    useEffect(() => {
        if (!user) return // Wait for Firebase client auth token to initialize

        const fileIds = combinedItems
            .filter(f => !isAudioFile(f))
            .map(f => f.id)
        if (fileIds.length === 0) return

        // Fetch in batches of 100 (uses apiFetch for auth header)
        const batchIds = fileIds.slice(0, 100)
        apiFetch(`/api/library/usage?fileIds=${batchIds.join(',')}`)
            .then(r => r.ok ? r.json() : {})
            .then(data => setUsageMap(data))
            .catch(() => { }) // Silent -- usage badges are non-critical
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [combinedItemIdsKey, user])

    const hasAudio = audioFiles.length > 0

    return (
        <div className="h-screen flex flex-col bg-background text-foreground">
            {/* Header */}
            <div className="h-20 border-b border-border flex items-center px-4 gap-4">
                <Button size="icon" variant="ghost" aria-label="Back to library" className="h-12 w-12" onClick={handleBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <div className="flex items-center gap-3 flex-1">
                    <img src="/logo.jpg" alt={congregation.shortName} className="h-8 w-8 rounded-full border border-brand/20 object-cover" />
                    <h1 className="text-2xl font-bold font-display">Song Charts</h1>
                </div>
                {canUpload && (
                    <div className="flex gap-2">
                        <UploadDialog 
                            setlists={addToSetlist.editableSetlists}
                            onAddToSetlist={addToSetlist.addDirectlyToSetlist}
                            onUploadComplete={async (fileId, title) => {
                                toast.success("Library updated with your upload")
                                try {
                                    // Add to local Dexie immediately so the Setlist picker sees it
                                    if (fileId && title) {
                                        await getDb().songs.put({
                                            id: fileId,
                                            title,
                                            normalizedTitle: title.toLowerCase(),
                                            updatedAt: Date.now()
                                        })
                                    }
                                    // Bust both browser and CDN caches to instantly show the new file
                                    const res = await apiFetch(`/api/library/list?all=true&t=${Date.now()}`)
                                    if (res.ok) {
                                        const data = await res.json()
                                        hydrate(data.files)
                                    }
                                } catch (err) {
                                    logger.error("Failed to refresh library after upload", err)
                                }
                            }} 
                        />
                        <ScraperModal 
                            setlists={addToSetlist.editableSetlists}
                            onAddToSetlist={addToSetlist.addDirectlyToSetlist}
                            onUploadComplete={async (fileId, title) => {
                                try {
                                    // Add to local Dexie immediately so the Setlist picker sees it
                                    if (fileId && title) {
                                        await getDb().songs.put({
                                            id: fileId,
                                            title,
                                            normalizedTitle: title.toLowerCase(),
                                            updatedAt: Date.now()
                                        })
                                    }
                                    const res = await apiFetch(`/api/library/list?all=true&t=${Date.now()}`)
                                    if (res.ok) {
                                        const data = await res.json()
                                        hydrate(data.files)
                                    }
                                } catch (err) {
                                    logger.error("Failed to refresh library after upload", err)
                                }
                            }} 
                        />
                    </div>
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

            {/* Search & section toggles */}
            <div className="p-4 border-b border-border space-y-4">
                <div className="relative max-w-xl mx-auto">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder={tab === "audio" ? "Search audio files..." : "Search by name, key, topic..."}
                        aria-label={tab === "audio" ? "Search audio files" : "Search song charts by name, key, or topic"}
                        className="pl-12 h-14 text-xl rounded-full bg-brand/5 border-brand/10 focus:border-brand focus:ring-brand/20"
                    />
                </div>

                {/* Library filters (key, topic, recency) */}
                {tab !== "audio" && (
                    <LibraryFilters
                        allFiles={rawFiles}
                        filters={libraryFilters}
                        onFiltersChange={setLibraryFilters}
                        usageMap={usageMap}
                    />
                )}

                {/* Section toggles — plain segmented control; see C4-004 note on imports above. */}
                <div
                    role="group"
                    aria-label="Library section"
                    className="max-w-xl mx-auto inline-flex w-fit items-center justify-center gap-2 flex-wrap"
                >
                    {(
                        [
                            { value: 'core' as const, label: `CRC Charts (${allFilteredCore.length})`, icon: null },
                            { value: 'supplemental' as const, label: `Shireinu (${allFilteredSupplemental.length})`, icon: null },
                            { value: 'uploads' as const, label: `Uploads (${allFilteredUploads.length})`, icon: null },
                            ...(hasAudio
                                ? [{ value: 'audio' as const, label: `Audio (${audioFiles.length})`, icon: <Music className="w-3.5 h-3.5" /> }]
                                : []),
                        ]
                    ).map(({ value, label, icon }) => {
                        const active = tab === value
                        return (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={active}
                                data-state={active ? 'active' : 'inactive'}
                                onClick={() => setTab(value)}
                                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium border cursor-pointer transition-colors data-[state=active]:bg-brand/15 data-[state=active]:text-foreground data-[state=active]:border-brand/30 data-[state=active]:ring-1 data-[state=active]:ring-brand/30 data-[state=inactive]:bg-muted/50 data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-border data-[state=inactive]:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            >
                                {icon}
                                {label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Content Search Results (searches within chord data) */}
            {searchQuery.length >= 3 && (
                <ContentSearchResults
                    results={contentSearch.results}
                    searching={contentSearch.searching}
                    query={contentSearch.query}
                    onSelectFile={handleSelectFile}
                    canAddToSetlist={addToSetlist.canAddToSetlist}
                    onAddToSetlist={(fileId, fileName) => {
                        const file = allFiles.find(f => f.id === fileId)
                        if (file) addToSetlist.openForSongs([file])
                    }}
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
                                icon={Search}
                                illustration={
                                    searchQuery
                                        ? <NoResultsIllustration className="w-20 h-20 text-muted-foreground" />
                                        : tab === "audio"
                                            ? <EmptyAudioIllustration className="w-20 h-20 text-muted-foreground" />
                                            : undefined
                                }
                                title={searchQuery ? "No matches found" : tab === "audio" ? "No audio files yet" : "No charts in the library yet"}
                                description={searchQuery ? `We couldn't find anything matching "${searchQuery}"` : tab === "audio" ? "Audio files (.mp3, .m4a, etc.) will appear here when added to Drive." : "Charts will appear here once added to the library."}
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
                                    onArchive={() => handleArchive(item)}
                                    onRename={(file) => handleRename(file)}
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
                                    canAddToSetlist={addToSetlist.canAddToSetlist}
                                    onAddToSetlist={(item) => addToSetlist.openForSongs([item])}
                                />
                            )
                        })}

                        <div className="h-20" />
                    </div>
                )}
            </ScrollArea>

            {/* Selection Action Bar */}
            <SelectionActionBar
                selectMode={selectMode}
                selectedIds={selectedIds}
                combinedItems={combinedItems}
                getCleanName={getCleanName}
                onSelectAll={() => setSelectedIds(new Set(combinedItems.map(i => i.id)))}
                onClear={() => setSelectedIds(new Set())}
                onDismiss={() => { setSelectedIds(new Set()); setSelectMode(false) }}
                onAddToSetlist={addToSetlist.canAddToSetlist ? (items) => addToSetlist.openForSongs(items) : undefined}
            />

            {/* Add to Setlist Sheet */}
            <AddToSetlistSheet
                isOpen={addToSetlist.isOpen}
                onOpenChange={addToSetlist.setIsOpen}
                setlists={addToSetlist.editableSetlists}
                loading={addToSetlist.loading}
                searchQuery={addToSetlist.searchQuery}
                onSearchChange={addToSetlist.setSearchQuery}
                onSelectSetlist={addToSetlist.addToSetlist}
                createNewSetlist={addToSetlist.createNewSetlist}
                pendingCount={addToSetlist.pendingSongs.length}
            />

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
