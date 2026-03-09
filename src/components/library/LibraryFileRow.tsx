"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronRight, FileMusic, Folder, Loader2, Wand2, Play, Pause, Headphones, CloudOff, CheckCircle2 } from "lucide-react"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DriveFile } from "@/types/models"
import { isFileCached } from "@/lib/cache-utils"

interface LibraryFileRowProps {
    item: DriveFile
    onClick: () => void
    isDigitizing: boolean
    isAdmin: boolean
    onDigitize?: () => void
    onArchive?: () => void
    getCleanName: (name: string) => string
    isPlaying?: boolean
    selectMode?: boolean
    isSelected?: boolean
    onToggleSelect?: (id: string) => void
    onLongPress?: (id: string) => void
    usageInfo?: { lastUsedDate: string; totalUses: number } | null
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

export function LibraryFileRow({ item, onClick, isDigitizing, isAdmin, onDigitize, onArchive, getCleanName, isPlaying, selectMode, isSelected, onToggleSelect, onLongPress, usageInfo }: LibraryFileRowProps) {
    const isFolder = item.mimeType?.includes('folder')
    const isAudio = isAudioMime(item)
    const [isCached, setIsCached] = useState(false)

    useEffect(() => {
        if (isFolder || !item.id) return
        isFileCached(item.id).then(setIsCached)
    }, [item.id, isFolder])

    const displayName = isFolder
        ? item.name
        : isAudio
            ? getAudioCleanName(item.name)
            : getCleanName(item.name)

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
                <button
                    onClick={handleClick}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEndOrMove}
                    onTouchMove={handleTouchEndOrMove}
                    onTouchCancel={handleTouchEndOrMove}
                    type="button"
                    aria-label={isFolder ? `Open folder ${displayName}` : isAudio ? `${isPlaying ? 'Pause' : 'Play'} ${displayName}` : `View ${displayName}`}
                    aria-pressed={selectMode ? isSelected : undefined}
                    className={`w-full text-left transition-all group relative ${isSelected
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
                    <div className="flex items-center gap-3 sm:gap-4 py-3 sm:py-4 px-2 sm:px-4 list-cell">
                        {/* Select mode checkbox */}
                        {selectMode && !isFolder && (
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-brand border-brand' : 'border-muted-foreground/40'
                                }`}>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                            </div>
                        )}

                        {isFolder ? (
                            <Folder className="h-7 w-7 sm:h-10 sm:w-10 text-yellow-400 shrink-0 group-hover:scale-110 transition-transform" />
                        ) : isAudio ? (
                            <div className="h-7 w-7 sm:h-10 sm:w-10 shrink-0 rounded-full bg-brand/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                {isPlaying ? (
                                    <Pause className="h-5 w-5 text-brand" />
                                ) : (
                                    <Play className="h-5 w-5 text-brand ml-0.5" />
                                )}
                            </div>
                        ) : isDigitizing ? (
                            <div className="relative">
                                <FileMusic className="h-7 w-7 sm:h-10 sm:w-10 text-brand shrink-0 opacity-50" />
                                <Loader2 className="h-5 w-5 text-brand/50 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                            </div>
                        ) : (
                            <FileMusic className="h-7 w-7 sm:h-10 sm:w-10 text-brand shrink-0 group-hover:scale-110 transition-transform" />
                        )}

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                                <div className="font-bold text-base sm:text-xl truncate">
                                    {displayName}
                                </div>

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

                                {/* Song Usage Badge */}
                                {!isFolder && !isAudio && usageInfo && (
                                    <span className="hidden sm:inline text-xs text-muted-foreground" title={`Last used in: ${usageInfo.lastUsedDate}`}>
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
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
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
