"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash2, Play, Search, Music } from "lucide-react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AudioFilePicker } from "../AudioFilePicker"
import { SetlistTrack } from "@/types/models"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { toast } from "sonner"
import { Loader2, Wand2 } from "lucide-react"
import { isFileOffline } from "@/lib/offline-store"
import { TrackHeaderItem } from "./TrackHeaderItem"
import { useMetronome } from "./useMetronome"
import { useDigitize } from "./useDigitize"

interface TrackItemProps {
    track: SetlistTrack
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDelete: (id: string) => void
    onMatchFile: (trackId: string) => void
    onPlay?: (fileId: string, fileName: string) => void
    readOnly?: boolean
    isEditMode?: boolean
    onEditDetails?: (track: SetlistTrack) => void
    onDuplicate?: (trackId: string, overrides?: Partial<SetlistTrack>) => void
}

export function TrackItem({
    track,
    onUpdate,
    onDelete,
    onMatchFile,
    onPlay,
    readOnly,
    isEditMode,
    onEditDetails,
    onDuplicate
}: TrackItemProps) {
    // --- Header tracks delegate to separate component ---
    if (track.type === 'header') {
        return (
            <TrackHeaderItem
                track={track}
                onUpdate={onUpdate}
                onDelete={onDelete}
                isEditMode={isEditMode}
            />
        )
    }

    return (
        <SongTrackItem
            track={track}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onMatchFile={onMatchFile}
            onPlay={onPlay}
            readOnly={readOnly}
            isEditMode={isEditMode}
            onEditDetails={onEditDetails}
            onDuplicate={onDuplicate}
        />
    )
}

// ─── Song Track (main component) ─────────────────────────────────────

function SongTrackItem({
    track,
    onUpdate,
    onDelete,
    onMatchFile,
    onPlay,
    readOnly,
    isEditMode,
    onEditDetails,
    onDuplicate
}: TrackItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: track.id,
        disabled: !isEditMode
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    }

    const hasFile = !!track.fileId
    const fileName = track.fileName || (hasFile ? "Linked File" : "")

    // Hooks
    const [isCached, setIsCached] = useState(false)
    const { isBlinking, blinkState, toggle: toggleMetronome } = useMetronome(track.bpm)
    const { isAdmin, digitizing, handleDigitize } = useDigitize({ track, onUpdate, onDuplicate })

    useEffect(() => {
        if (track.fileId) {
            isFileOffline(track.fileId).then(setIsCached)
        }
    }, [track.fileId])

    const handleTitleClick = () => {
        if (hasFile && track.fileId && onPlay) {
            onPlay(track.fileId, fileName)
        } else if (!readOnly) {
            toast.dismiss()
            toast("Missing Chart", {
                description: "Select a file to link to this track.",
                action: {
                    label: "Link File",
                    onClick: () => onMatchFile(track.id)
                }
            })
            onMatchFile(track.id)
        } else {
            toast("No chart assigned", {
                description: "This track doesn't have a file linked yet."
            })
        }
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    ref={setNodeRef}
                    style={style}
                    className={`glass-card rounded-lg p-3 sm:p-4 flex items-center gap-3 sm:gap-4 group transition-colors relative 
                        ${digitizing
                            ? "bg-purple-900/20 border-purple-500/50 cursor-wait"
                            : "hover:bg-card/40"
                        } 
                        ${isDragging ? "opacity-50 ring-2 ring-blue-500 scale-[1.02] z-50 bg-muted" : ""}
                    `}
                    onClick={() => !isEditMode && handleTitleClick()}
                >
                    {/* Drag Handle */}
                    {isEditMode && (
                        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/60 p-2 -ml-2 rounded hover:bg-muted" onClick={(e) => e.stopPropagation()}>
                            <GripVertical className="h-5 w-5" />
                        </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                        <TrackTitleRow
                            track={track}
                            hasFile={hasFile}
                            digitizing={digitizing}
                            isEditMode={isEditMode}
                            onUpdate={onUpdate}
                            onTitleClick={handleTitleClick}
                            onPlay={onPlay}
                        />
                        <TrackMetadataRow
                            track={track}
                            isEditMode={isEditMode}
                            onUpdate={onUpdate}
                        />
                    </div>

                    {/* Edit Actions */}
                    {isEditMode && (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {!track.audioFileId && (
                                <AudioFilePicker
                                    currentFileId={track.audioFileId}
                                    onSelect={(fileId) => onUpdate(track.id, { audioFileId: fileId })}
                                    trigger={
                                        <Button size="sm" variant="ghost" className="h-8 w-8 text-muted-foreground/60 hover:text-blue-400">
                                            <Music className="h-4 w-4" />
                                        </Button>
                                    }
                                />
                            )}
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground/60 hover:text-red-400"
                                onClick={() => onDelete(track.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    )}

                    {/* Metronome */}
                    {!isEditMode && track.bpm && (
                        <div
                            className={`h-8 w-8 flex items-center justify-center rounded-full cursor-pointer transition-colors shrink-0 ml-2 ${isBlinking ? 'bg-muted' : 'hover:bg-muted'}`}
                            onClick={toggleMetronome}
                            title={`BPM: ${track.bpm}`}
                        >
                            <div className={`h-3 w-3 rounded-full transition-all duration-75 ${blinkState ? 'bg-red-500 scale-125 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-muted-foreground/30'}`} />
                        </div>
                    )}
                </div>
            </ContextMenuTrigger>

            {/* Context Menu */}
            <ContextMenuContent>
                {onEditDetails && (
                    <ContextMenuItem onClick={() => onEditDetails(track)}>
                        Edit Details (BPM, Lead, etc.)
                    </ContextMenuItem>
                )}
                {track.bpm && (
                    <ContextMenuItem>
                        Play Metronome ({track.bpm})
                    </ContextMenuItem>
                )}
                {!readOnly && (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => onMatchFile(track.id)}>
                            <Search className="h-4 w-4 mr-2" />
                            {hasFile ? "Change File" : "Link File"}
                        </ContextMenuItem>

                        {isAdmin && hasFile && (
                            <ContextMenuItem
                                onClick={handleDigitize}
                                disabled={digitizing}
                                className="text-purple-400 focus:text-purple-300 focus:bg-purple-900/50"
                            >
                                {digitizing ? (
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

// ─── Sub-components ──────────────────────────────────────────────────

function TrackTitleRow({ track, hasFile, digitizing, isEditMode, onUpdate, onTitleClick, onPlay }: {
    track: SetlistTrack
    hasFile: boolean
    digitizing: boolean
    isEditMode?: boolean
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onTitleClick: () => void
    onPlay?: (fileId: string, fileName: string) => void
}) {
    return (
        <div className="flex items-center gap-2">
            {/* Play / Loading indicator */}
            {digitizing ? (
                <div className="h-8 w-8 flex items-center justify-center shrink-0">
                    <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
                </div>
            ) : (
                hasFile && onPlay && (
                    <button
                        className="h-8 w-8 flex items-center justify-center rounded-full text-green-500 hover:text-green-400 hover:bg-green-500/10 shrink-0"
                        onClick={(e) => { e.stopPropagation(); onTitleClick() }}
                    >
                        <Play className="h-4 w-4" />
                    </button>
                )
            )}

            {/* Title */}
            {isEditMode ? (
                <Input
                    value={track.title}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { title: e.target.value })}
                    className={`bg-transparent border-0 text-lg font-medium p-0 h-auto focus-visible:ring-0 ${hasFile ? 'text-blue-500 dark:text-blue-400' : ''}`}
                    placeholder="Song title"
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span
                    className={`text-lg font-medium truncate cursor-pointer flex items-center gap-2 ${hasFile ? 'text-blue-600 hover:text-blue-500 dark:text-blue-100 dark:hover:text-blue-300' : ''}`}
                >
                    {track.title}
                    {digitizing && (
                        <span className="text-xs bg-purple-500/20 text-purple-500 dark:text-purple-300 px-2 py-0.5 rounded-full animate-pulse font-normal">
                            Digitizing...
                        </span>
                    )}
                </span>
            )}
        </div>
    )
}

function TrackMetadataRow({ track, isEditMode, onUpdate }: {
    track: SetlistTrack
    isEditMode?: boolean
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
}) {
    if (isEditMode) {
        return (
            <div className="flex items-center gap-3 text-sm text-muted-foreground min-h-[1.25rem]">
                <div className="flex gap-2 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                    <Input
                        value={track.key || ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { key: e.target.value })}
                        className="bg-muted h-7 text-xs w-14 text-center px-1"
                        placeholder="Key"
                    />
                    <Input
                        value={track.bpm || ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { bpm: parseInt(e.target.value) || undefined })}
                        className="bg-muted h-7 text-xs w-14 text-center px-1"
                        placeholder="BPM"
                        type="number"
                    />
                    <Input
                        value={track.leadMusician || ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { leadMusician: e.target.value })}
                        className="bg-muted h-7 text-xs flex-1 px-2"
                        placeholder="Lead..."
                    />
                </div>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-3 text-sm text-muted-foreground min-h-[1.25rem]">
            {track.key && (
                <span className="bg-muted px-2 py-0.5 rounded text-xs text-foreground font-mono">
                    {track.key}
                </span>
            )}
            {track.bpm && (
                <span className="text-muted-foreground text-xs hidden sm:inline">
                    {track.bpm} BPM
                </span>
            )}
            {track.leadMusician && (
                <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                    <span className="text-xs italic text-blue-500 dark:text-blue-400/80">
                        {track.leadMusician}
                    </span>
                </div>
            )}
            {track.notes && (
                <span className="truncate max-w-[200px] text-muted-foreground/60 italic">
                    {track.notes}
                </span>
            )}
        </div>
    )
}
