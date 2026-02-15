"use client"

import { ChevronRight, FileMusic, Folder, Loader2, Wand2 } from "lucide-react"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"

interface DriveFile {
    id: string
    name: string
    mimeType: string
    metadata?: {
        key?: string
        bpm?: number
    }
}

interface LibraryFileRowProps {
    item: DriveFile
    onClick: () => void
    isDigitizing: boolean
    isAdmin: boolean
    onDigitize?: () => void
    getCleanName: (name: string) => string
}

export function LibraryFileRow({ item, onClick, isDigitizing, isAdmin, onDigitize, getCleanName }: LibraryFileRowProps) {
    const isFolder = item.mimeType.includes('folder')

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <button
                    onClick={onClick}
                    className={`w-full text-left p-6 rounded-2xl transition-all flex items-center gap-5 group ${isFolder
                        ? 'bg-card border border-border hover:border-yellow-500/50 hover:bg-muted'
                        : isDigitizing
                            ? 'bg-purple-900/20 border border-purple-500/50 cursor-wait'
                            : 'bg-card border border-border hover:border-blue-500/50 hover:bg-muted'
                        }`}
                >
                    {isFolder ? (
                        <Folder className="h-10 w-10 text-yellow-400 shrink-0 group-hover:scale-110 transition-transform" />
                    ) : isDigitizing ? (
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

                            {!isFolder && item.metadata?.key && (
                                <span className="text-xs bg-muted text-foreground px-2 py-0.5 rounded-md border border-border font-mono">
                                    {item.metadata.key}
                                </span>
                            )}
                            {!isFolder && item.metadata?.bpm && (
                                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md border border-border font-mono">
                                    {item.metadata.bpm} bpm
                                </span>
                            )}

                            {isDigitizing && (
                                <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full animate-pulse">
                                    Digitizing...
                                </span>
                            )}
                        </div>
                    </div>
                    <ChevronRight className="h-6 w-6 text-muted-foreground/60 group-hover:text-foreground" />
                </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={onClick}>
                    {isFolder ? "Open Folder" : "Select / View"}
                </ContextMenuItem>

                {!isFolder && (
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
