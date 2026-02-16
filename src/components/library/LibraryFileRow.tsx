"use client"

import { ChevronRight, FileMusic, Folder, Loader2, Wand2, Play, Pause, Headphones } from "lucide-react"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DriveFile } from "@/types/models"

interface LibraryFileRowProps {
    item: DriveFile
    onClick: () => void
    isDigitizing: boolean
    isAdmin: boolean
    onDigitize?: () => void
    getCleanName: (name: string) => string
    isPlaying?: boolean
}

function isAudioMime(item: DriveFile) {
    return item.mimeType.startsWith('audio/') ||
        /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(item.name)
}

function getAudioCleanName(name: string) {
    return name
        .replace(/\.(mp3|m4a|wav|aac|ogg|flac|pdf|musicxml|xml|mxl)$/i, '')
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
}

export function LibraryFileRow({ item, onClick, isDigitizing, isAdmin, onDigitize, getCleanName, isPlaying }: LibraryFileRowProps) {
    const isFolder = item.mimeType.includes('folder')
    const isAudio = isAudioMime(item)

    const displayName = isFolder
        ? item.name
        : isAudio
            ? getAudioCleanName(item.name)
            : getCleanName(item.name)

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <button
                    onClick={onClick}
                    className={`w-full text-left p-3 sm:p-5 rounded-xl sm:rounded-2xl transition-all flex items-center gap-3 sm:gap-5 group ${
                        isFolder
                            ? 'bg-card border border-border hover:border-yellow-500/50 hover:bg-muted'
                            : isAudio
                                ? isPlaying
                                    ? 'bg-violet-500/10 border border-violet-500/50'
                                    : 'bg-card border border-border hover:border-violet-500/50 hover:bg-muted'
                                : isDigitizing
                                    ? 'bg-purple-900/20 border border-purple-500/50 cursor-wait'
                                    : 'bg-card border border-border hover:border-blue-500/50 hover:bg-muted'
                    }`}
                >
                    {isFolder ? (
                        <Folder className="h-7 w-7 sm:h-10 sm:w-10 text-yellow-400 shrink-0 group-hover:scale-110 transition-transform" />
                    ) : isAudio ? (
                        <div className="h-7 w-7 sm:h-10 sm:w-10 shrink-0 rounded-full bg-violet-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                            {isPlaying ? (
                                <Pause className="h-5 w-5 text-violet-500" />
                            ) : (
                                <Play className="h-5 w-5 text-violet-500 ml-0.5" />
                            )}
                        </div>
                    ) : isDigitizing ? (
                        <div className="relative">
                            <FileMusic className="h-7 w-7 sm:h-10 sm:w-10 text-purple-500 shrink-0 opacity-50" />
                            <Loader2 className="h-5 w-5 text-purple-200 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                        </div>
                    ) : (
                        <FileMusic className="h-7 w-7 sm:h-10 sm:w-10 text-blue-400 shrink-0 group-hover:scale-110 transition-transform" />
                    )}

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                            <div className="font-bold text-base sm:text-xl truncate">
                                {displayName}
                            </div>

                            {isAudio && (
                                <span className="text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-md flex items-center gap-1">
                                    <Headphones className="w-3 h-3" />
                                    Audio
                                </span>
                            )}

                            {!isFolder && !isAudio && item.metadata?.key && (
                                <span className="text-xs bg-muted text-foreground px-2 py-0.5 rounded-md border border-border font-mono">
                                    {item.metadata.key}
                                </span>
                            )}
                            {!isFolder && !isAudio && item.metadata?.bpm && (
                                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md border border-border font-mono">
                                    {item.metadata.bpm} bpm
                                </span>
                            )}

                            {!isFolder && !isAudio && item.metadata?.topics && item.metadata.topics.length > 0 && (
                                <div className="hidden sm:flex gap-1">
                                    {item.metadata.topics.slice(0, 2).map(topic => (
                                        <span key={topic} className="text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-md">
                                            {topic}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {isDigitizing && (
                                <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full animate-pulse">
                                    Digitizing...
                                </span>
                            )}
                        </div>
                    </div>
                    {!isAudio && <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/60 group-hover:text-foreground" />}
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={onClick}>
                    {isFolder ? "Open Folder" : isAudio ? "Play" : "Select / View"}
                </ContextMenuItem>

                {!isFolder && !isAudio && (
                    <>
                        <ContextMenuItem disabled>
                            Add to Setlist (Coming Soon)
                        </ContextMenuItem>

                        {isAdmin && item.mimeType.includes("pdf") && onDigitize && (
                            <ContextMenuItem
                                onClick={onDigitize}
                                disabled={isDigitizing}
                                className="text-purple-400 focus:text-purple-300 focus:bg-purple-900/50"
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
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>
    )
}
