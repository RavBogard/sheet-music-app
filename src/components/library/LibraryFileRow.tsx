"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronRight, FileMusic, Folder, Loader2, Wand2, Play, Pause, Headphones, CloudOff, CheckCircle2, Pencil, ListPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DriveFile } from "@/types/models"
import { isFileCached } from "@/lib/cache-utils"
import { splitChartComposer } from "@/lib/library/chart-composer"

interface LibraryFileRowProps {
    item: DriveFile
    onClick: () => void
    isDigitizing: boolean
    isAdmin: boolean
    onDigitize?: () => void
    onArchive?: () => void
    onRename?: (item: DriveFile) => void
    getCleanName: (name: string) => string
    isPlaying?: boolean
    selectMode?: boolean
    isSelected?: boolean
    onToggleSelect?: (id: string) => void
    onLongPress?: (id: string) => void
    usageInfo?: { lastUsedDate: string; totalUses: number } | null
    canAddToSetlist?: boolean
    onAddToSetlist?: (item: DriveFile) => void
}

function isAudioMime(item: DriveFile) {
    return item.mimeType?.startsWith('audio/') ||
        /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(item.name)
}

function getAudioCleanName(name: string) {
    return name
        .replace(/\.(mp3|m4a|wav|aac|ogg|flac|pdf|musicxml|xml|mxl)$/i, '')
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
}

export function LibraryFileRow({ item, onClick, isDigitizing, isAdmin, onDigitize, onArchive, onRename, getCleanName, isPlaying, selectMode, isSelected, onToggleSelect, onLongPress, usageInfo, canAddToSetlist, onAddToSetlist }: LibraryFileRowProps) {
    const isFolder = item.mimeType?.includes('folder')
    const isAudio = isAudioMime(item)
    const [isCached, setIsCached] = useState(false)

    useEffect(() => {
        if (isFolder || !item.id) return
        isFileCached(item.id).then(setIsCached).catch(() => {})
    }, [item.id, isFolder])

    const displayName = isFolder
        ? item.name
        : item.displayName
            ? item.displayName
            : isAudio
                ? getAudioCleanName(item.name)
                : getCleanName(item.name)

    // v11.7-05: for chart rows, split the trailing composer/arrangement
    // parenthetical out of the title so it can render as a dimmed sub-label
    // (text-only; never a thumbnail). Folders/audio keep their full name.
    const isChart = !isFolder && !isAudio
    const { title: chartTitle, composer } = isChart
        ? splitChartComposer(displayName)
        : { title: displayName, composer: undefined as string | undefined }

    const handleClick = () => {
        if (selectMode && !isFolder && onToggleSelect) {
            onToggleSelect(item.id)
        } else {
            onClick()
        }
    }

    const touchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleTouchStart = () => {
        if (!isFolder && onLongPress && !selectMode) {
            touchTimeout.current = setTimeout(() => {
                onLongPress(item.id)
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50)
            }, 500)
        }
    }

    const handleTouchEndOrMove = () => {
        if (touchTimeout.current) {
            clearTimeout(touchTimeout.current)
            touchTimeout.current = null
        }
    }

    useEffect(() => {
        return () => {
            if (touchTimeout.current) clearTimeout(touchTimeout.current)
        }
    }, [])

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <Button
                    variant="ghost"
                    onClick={handleClick}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEndOrMove}
                    onTouchMove={handleTouchEndOrMove}
                    onTouchCancel={handleTouchEndOrMove}
                    type="button"
                    aria-label={isFolder ? `Open folder ${displayName}` : isAudio ? `${isPlaying ? 'Pause' : 'Play'} ${displayName}` : `View ${displayName}`}
                    aria-pressed={selectMode ? isSelected : undefined}
                    // C7I2-003: `justify-start` overrides the Button base
                    // `justify-center`. Without it, when a long row name
                    // exceeds the row width the flex content overflows
                    // EQUALLY on both sides, clipping the leading character
                    // ("Adonai Oz …" → "donai Oz …") at iPad-Mini viewport.
                    className={`w-full h-auto text-left justify-start rounded-none whitespace-normal group relative active:scale-100 ${isSelected
                        ? 'bg-brand/10'
                        : isFolder
                            ? ''
                            : isAudio
                                ? isPlaying
                                    ? 'bg-brand/10'
                                    : ''
                                : isDigitizing
                                    ? 'bg-brand/10 cursor-wait'
                                    : ''
                        }`}
                >
                    <div className="flex items-center gap-2 sm:gap-3 py-1.5 px-2 sm:px-4 min-h-11 list-cell">
                        {/* Select mode checkbox */}
                        {selectMode && !isFolder && (
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-brand border-brand' : 'border-muted-foreground/40'
                                }`}>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                            </div>
                        )}

                        {isFolder ? (
                            <Folder className="h-6 w-6 sm:h-7 sm:w-7 text-yellow-400 shrink-0 group-hover:scale-110 transition-transform" />
                        ) : isAudio ? (
                            <div className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 rounded-full bg-brand/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                {isPlaying ? (
                                    <Pause className="h-5 w-5 text-brand" />
                                ) : (
                                    <Play className="h-5 w-5 text-brand ml-0.5" />
                                )}
                            </div>
                        ) : isDigitizing ? (
                            <div className="relative">
                                <FileMusic className="h-6 w-6 sm:h-7 sm:w-7 text-brand shrink-0 opacity-50" />
                                <Loader2 className="h-5 w-5 text-brand/50 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                            </div>
                        ) : (
                            <FileMusic className="h-6 w-6 sm:h-7 sm:w-7 text-brand shrink-0 group-hover:scale-110 transition-transform" />
                        )}

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <div className="font-medium text-base truncate">
                                    {isChart ? chartTitle : displayName}
                                </div>

                                {/* v11.7-05: composer/arrangement as a dimmed
                                    sub-label — subordinate to the title, never
                                    competing; omitted when absent (text-only). */}
                                {composer && (
                                    <span className="text-xs sm:text-sm text-muted-foreground truncate shrink min-w-0">
                                        {composer}
                                    </span>
                                )}

                                {isAudio && (
                                    <span className="text-xs bg-brand/10 text-foreground px-2 py-0.5 rounded-md flex items-center gap-1">
                                        <Headphones className="w-3 h-3" />
                                        Audio
                                    </span>
                                )}

                                {!isFolder && !isAudio && item.metadata?.key && (
                                    <span className="text-xs bg-brand/10 text-foreground px-2 py-0.5 rounded-md border border-brand/20 font-mono">
                                        {item.metadata.key}
                                    </span>
                                )}
                                {!isFolder && !isAudio && item.metadata?.bpm && (
                                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md border border-border font-mono">
                                        {item.metadata.bpm} bpm
                                    </span>
                                )}

                                {!isFolder && !isAudio && item.collection === 'supplemental' && (
                                    <span className="text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/20">
                                        Shireinu
                                    </span>
                                )}

                                {!isFolder && !isAudio && item.collection !== 'supplemental' && (
                                    <span className="text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20">
                                        CRC
                                    </span>
                                )}

                                {isCached && !isFolder && (
                                    <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-500/20" title="This file is downloaded and available offline">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Cached
                                    </span>
                                )}

                                {!isFolder && !isAudio && item.metadata?.topics && item.metadata.topics.length > 0 && (
                                    <div className="hidden sm:flex gap-1">
                                        {item.metadata.topics.slice(0, 2).map(topic => (
                                            <span key={topic} className="text-xs bg-brand/10 text-foreground px-2 py-0.5 rounded-md">
                                                {topic}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Song Usage Badge — v11.7-05: visible at all
                                    widths (was hidden sm:inline) so recency
                                    reads on iPad portrait too. */}
                                {!isFolder && !isAudio && usageInfo && (
                                    <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums" title={`Last used in: ${usageInfo.lastUsedDate}`}>
                                        {formatUsageBadge(usageInfo.lastUsedDate, usageInfo.totalUses)}
                                    </span>
                                )}

                                {isDigitizing && (
                                    <span className="text-xs bg-brand/20 text-brand px-2 py-1 rounded-full animate-pulse">
                                        Digitizing...
                                    </span>
                                )}
                            </div>
                        </div>
                        {!isAudio && <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/60 group-hover:text-foreground" />}
                    </div>
                </Button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                {canAddToSetlist && !isFolder && !isAudio && onAddToSetlist && (
                    <ContextMenuItem onClick={() => onAddToSetlist(item)}>
                        <span className="flex items-center gap-2">
                            <ListPlus className="h-4 w-4" /> Add to Setlist...
                        </span>
                    </ContextMenuItem>
                )}
                <ContextMenuItem onClick={onClick}>
                    {isFolder ? "Open Folder" : isAudio ? "Play" : "Select / View"}
                </ContextMenuItem>

                {!isFolder && !isAudio && (
                    <>
                        {isAdmin && item.mimeType.includes("pdf") && onDigitize && (
                            <ContextMenuItem
                                onClick={onDigitize}
                                disabled={isDigitizing}
                                className="text-brand focus:text-brand/80 focus:bg-brand/10"
                            >
                                {isDigitizing ? (
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

                        {isAdmin && onRename && (
                            <ContextMenuItem
                                onClick={() => onRename(item)}
                            >
                                <span className="flex items-center gap-2">
                                    <Pencil className="h-4 w-4" /> Rename
                                </span>
                            </ContextMenuItem>
                        )}

                        {isAdmin && onArchive && (
                            <ContextMenuItem
                                onClick={onArchive}
                                className="text-red-400 focus:text-red-300 focus:bg-red-900/50"
                            >
                                <span className="flex items-center gap-2">
                                    <CloudOff className="h-4 w-4" /> Archive Chart
                                </span>
                            </ContextMenuItem>
                        )}
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>
    )
}

/** Format a compact usage badge like "Last: Jan 31 · 4×" */
function formatUsageBadge(lastUsedDate: string, totalUses: number): string {
    try {
        const date = new Date(lastUsedDate)
        const month = date.toLocaleDateString('en-US', { month: 'short' })
        const day = date.getDate()
        return `Last: ${month} ${day} · ${totalUses}×`
    } catch {
        return `${totalUses}×`
    }
}
