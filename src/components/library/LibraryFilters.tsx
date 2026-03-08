"use client"

import { useState, useMemo } from "react"
import { X, Music, Tag, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { DriveFile } from "@/types/models"

// Circle of fifths order (musically intuitive)
const KEY_ORDER = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'F', 'B♭', 'E♭', 'A♭', 'D♭']
// Normalize key display variations
const normalizeKey = (key: string) =>
    key.replace(/b$/, '♭').replace(/#$/, '♯').replace(/^([A-G])♭/, '$1♭').replace(/^([A-G])♯/, '$1♯')

export interface LibraryFilterState {
    keys: Set<string>
    topics: Set<string>
    recency: 'all' | 'recent' | 'stale' | 'never'
}

const EMPTY_FILTERS: LibraryFilterState = {
    keys: new Set(),
    topics: new Set(),
    recency: 'all',
}

interface LibraryFiltersProps {
    /** All files (unfiltered) for extracting available filter values */
    allFiles: DriveFile[]
    /** Current filter state */
    filters: LibraryFilterState
    /** Update filters */
    onFiltersChange: (filters: LibraryFilterState) => void
    /** Usage map for recency filtering */
    usageMap?: Record<string, { lastUsedDate: string; totalUses: number } | null>
}

export function LibraryFilters({ allFiles, filters, onFiltersChange, usageMap }: LibraryFiltersProps) {
    const [expandedFilter, setExpandedFilter] = useState<'key' | 'topic' | 'recency' | null>(null)

    // Extract available keys from all files
    const availableKeys = useMemo(() => {
        const keys = new Set<string>()
        allFiles.forEach(f => {
            if (f.metadata?.key) keys.add(normalizeKey(f.metadata.key))
        })
        return KEY_ORDER.filter(k => keys.has(k))
    }, [allFiles])

    // Extract available topics from all files
    const availableTopics = useMemo(() => {
        const topicCounts = new Map<string, number>()
        allFiles.forEach(f => {
            f.metadata?.topics?.forEach(t => {
                topicCounts.set(t, (topicCounts.get(t) || 0) + 1)
            })
        })
        return Array.from(topicCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([topic]) => topic)
    }, [allFiles])

    const hasActiveFilters = filters.keys.size > 0 || filters.topics.size > 0 || filters.recency !== 'all'

    const toggleKey = (key: string) => {
        const next = new Set(filters.keys)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        onFiltersChange({ ...filters, keys: next })
    }

    const toggleTopic = (topic: string) => {
        const next = new Set(filters.topics)
        if (next.has(topic)) next.delete(topic)
        else next.add(topic)
        onFiltersChange({ ...filters, topics: next })
    }

    const clearAll = () => {
        onFiltersChange(EMPTY_FILTERS)
        setExpandedFilter(null)
    }

    // Don't render if no metadata is available
    if (availableKeys.length === 0 && availableTopics.length === 0) return null

    return (
        <div className="space-y-2">
            {/* Filter chip bar */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1">
                {/* Key filter chip */}
                {availableKeys.length > 0 && (
                    <button
                        onClick={() => setExpandedFilter(expandedFilter === 'key' ? null : 'key')}
                        className={cn(
                            "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
                            filters.keys.size > 0
                                ? "bg-brand/15 text-brand border-brand/30"
                                : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"
                        )}
                    >
                        <Music className="w-3 h-3" />
                        Key{filters.keys.size > 0 ? ` (${filters.keys.size})` : ''}
                    </button>
                )}

                {/* Topic filter chip */}
                {availableTopics.length > 0 && (
                    <button
                        onClick={() => setExpandedFilter(expandedFilter === 'topic' ? null : 'topic')}
                        className={cn(
                            "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
                            filters.topics.size > 0
                                ? "bg-brand/15 text-brand border-brand/30"
                                : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"
                        )}
                    >
                        <Tag className="w-3 h-3" />
                        Topic{filters.topics.size > 0 ? ` (${filters.topics.size})` : ''}
                    </button>
                )}

                {/* Recency filter chip */}
                {usageMap && (
                    <button
                        onClick={() => setExpandedFilter(expandedFilter === 'recency' ? null : 'recency')}
                        className={cn(
                            "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
                            filters.recency !== 'all'
                                ? "bg-brand/15 text-brand border-brand/30"
                                : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"
                        )}
                    >
                        <Clock className="w-3 h-3" />
                        {filters.recency === 'all' ? 'Recency' :
                         filters.recency === 'recent' ? 'Recent' :
                         filters.recency === 'stale' ? '60+ days' : 'Never played'}
                    </button>
                )}

                {/* Clear all */}
                {hasActiveFilters && (
                    <button
                        onClick={clearAll}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium
                            text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                        <X className="w-3 h-3" />
                        Clear
                    </button>
                )}
            </div>

            {/* Expanded filter picker */}
            {expandedFilter === 'key' && (
                <div className="flex flex-wrap gap-1.5 px-1 py-2 bg-muted/30 rounded-lg border border-border/50">
                    {availableKeys.map(key => (
                        <button
                            key={key}
                            onClick={() => toggleKey(key)}
                            className={cn(
                                "w-10 h-10 rounded-lg text-xs font-bold transition-colors",
                                filters.keys.has(key)
                                    ? "bg-brand text-white shadow-md"
                                    : "bg-muted hover:bg-accent text-foreground border border-border"
                            )}
                        >
                            {key}
                        </button>
                    ))}
                </div>
            )}

            {expandedFilter === 'topic' && (
                <div className="flex flex-wrap gap-1.5 px-1 py-2 bg-muted/30 rounded-lg border border-border/50">
                    {availableTopics.map(topic => (
                        <button
                            key={topic}
                            onClick={() => toggleTopic(topic)}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                                filters.topics.has(topic)
                                    ? "bg-brand text-white shadow-md"
                                    : "bg-muted hover:bg-accent text-foreground border border-border"
                            )}
                        >
                            {topic}
                        </button>
                    ))}
                </div>
            )}

            {expandedFilter === 'recency' && usageMap && (
                <div className="flex gap-2 px-1 py-2 bg-muted/30 rounded-lg border border-border/50">
                    {([
                        { value: 'all', label: 'All' },
                        { value: 'recent', label: 'Last 30 days' },
                        { value: 'stale', label: '60+ days ago' },
                        { value: 'never', label: 'Never played' },
                    ] as const).map(option => (
                        <button
                            key={option.value}
                            onClick={() => onFiltersChange({ ...filters, recency: option.value })}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                                filters.recency === option.value
                                    ? "bg-brand text-white shadow-md"
                                    : "bg-muted hover:bg-accent text-foreground border border-border"
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/** Apply filters to a file list */
export function applyLibraryFilters(
    files: DriveFile[],
    filters: LibraryFilterState,
    usageMap?: Record<string, { lastUsedDate: string; totalUses: number } | null>,
): DriveFile[] {
    return files.filter(file => {
        // Key filter
        if (filters.keys.size > 0) {
            const fileKey = file.metadata?.key ? normalizeKey(file.metadata.key) : null
            if (!fileKey || !filters.keys.has(fileKey)) return false
        }

        // Topic filter
        if (filters.topics.size > 0) {
            const fileTopics = file.metadata?.topics || []
            if (!fileTopics.some(t => filters.topics.has(t))) return false
        }

        // Recency filter
        if (filters.recency !== 'all' && usageMap) {
            const usage = usageMap[file.id]
            const now = Date.now()
            const thirtyDays = 30 * 24 * 60 * 60 * 1000
            const sixtyDays = 60 * 24 * 60 * 60 * 1000

            switch (filters.recency) {
                case 'recent':
                    if (!usage?.lastUsedDate) return false
                    if (now - new Date(usage.lastUsedDate).getTime() > thirtyDays) return false
                    break
                case 'stale':
                    if (!usage?.lastUsedDate) return false
                    if (now - new Date(usage.lastUsedDate).getTime() < sixtyDays) return false
                    break
                case 'never':
                    if (usage?.totalUses && usage.totalUses > 0) return false
                    break
            }
        }

        return true
    })
}

export function createEmptyFilters(): LibraryFilterState {
    return { ...EMPTY_FILTERS, keys: new Set(), topics: new Set() }
}
