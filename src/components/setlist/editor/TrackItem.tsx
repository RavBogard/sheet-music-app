"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash2, Play, Search, Music } from "lucide-react"
import { useState, useRef, useEffect } from "react"
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

interface TrackItemProps {
    track: SetlistTrack
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDelete: (id: string) => void
    onMatchFile: (trackId: string) => void
    onPlay?: (fileId: string, fileName: string) => void
    readOnly?: boolean
    isEditMode?: boolean
    onEditDetails?: (track: SetlistTrack) => void
}

export function TrackItem({
    track,
    onUpdate,
    onDelete,
    onMatchFile,
    onPlay,
    readOnly,
    isEditMode,
    onEditDetails
}: TrackItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: track.id,
        disabled: !isEditMode // Disable DnD when not in edit mode
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    }

    const hasFile = !!track.fileId
    const fileName = track.fileName || (hasFile ? "Linked File" : "")

    // --- Metronome Logic ---
    const [isBlinking, setIsBlinking] = useState(false)
    const [blinkState, setBlinkState] = useState(false) // Toggle for animation
    const blinkIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const blinkTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const toggleMetronome = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!track.bpm) return

        if (isBlinking) {
            // Stop
            setIsBlinking(false)
            setBlinkState(false)
            if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current)
            if (blinkTimeoutRef.current) clearTimeout(blinkTimeoutRef.current)
        } else {
            // Start
            setIsBlinking(true)
            const intervalMs = 60000 / track.bpm

            setBlinkState(true) // Immediate flash
            setTimeout(() => setBlinkState(false), 100)

            blinkIntervalRef.current = setInterval(() => {
                setBlinkState(true)
                setTimeout(() => setBlinkState(false), 100) // Flash duration
            }, intervalMs)

            // Auto-stop after 10s
            blinkTimeoutRef.current = setTimeout(() => {
                setIsBlinking(false)
                setBlinkState(false)
                if (blinkIntervalRef.current) clearInterval(blinkIntervalRef.current)
            }, 10000)
        }
    }

    // --- Long Press Logic ---
    const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null)

    const handleTouchStart = () => {
        if (!onEditDetails) return
        const timer = setTimeout(() => {
            onEditDetails(track)
        }, 600) // 800ms long press
        setPressTimer(timer)
    }

    const handleTouchEnd = () => {
        if (pressTimer) {
            clearTimeout(pressTimer)
            setPressTimer(null)
        }
    }

    const handleTitleClick = () => {
        if (hasFile && track.fileId && onPlay) {
            onPlay(track.fileId, fileName)
        }
    }

    const isHeader = track.type === 'header'

    if (isHeader) {
        return (
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div
                        ref={setNodeRef}
                        style={style}
                        className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 flex items-center gap-4 group mt-4 mb-2"
                    >
                        {isEditMode && (
                            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-zinc-500 hover:text-zinc-300 p-2 -ml-2 rounded hover:bg-zinc-700">
                                <GripVertical className="h-5 w-5" />
                            </div>
                        )}

                        <div className="flex-1">
                            {isEditMode ? (
                                <Input
                                    value={track.title}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { title: e.target.value })}
                                    className="bg-transparent border-0 text-lg font-bold text-center text-zinc-300 placeholder:text-zinc-600 focus-visible:ring-0"
                                    placeholder="SECTION HEADER"
                                />
                            ) : (
                                <div className="text-lg font-bold text-center text-zinc-300 uppercase tracking-wider">
                                    {track.title}
                                </div>
                            )}
                        </div>

                        {isEditMode && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-zinc-600 hover:text-red-400"
                                onClick={() => onDelete(track.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </ContextMenuTrigger>
                {isEditMode && (
                    <ContextMenuContent>
                        <ContextMenuItem onClick={() => onDelete(track.id)} className="text-red-500 focus:text-red-500">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Header
                        </ContextMenuItem>
                    </ContextMenuContent>
                )}
            </ContextMenu>
        )
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    ref={setNodeRef}
                    style={style}
                    className={`glass-card rounded-lg p-3 sm:p-4 flex items-center gap-3 sm:gap-4 group transition-colors hover:bg-zinc-900/40 ${isDragging ? "opacity-50 ring-2 ring-blue-500 scale-[1.02] z-50 bg-zinc-800" : ""}`}
                    onContextMenu={(e) => {
                        // Native context menu is fine, relying on dnd-kit context logic
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onMouseDown={handleTouchStart} // Also support mouse long press for desktop if desired
                    onMouseUp={handleTouchEnd}
                    onMouseLeave={handleTouchEnd}
                >
                    {isEditMode && (
                        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-zinc-600 p-2 -ml-2 rounded hover:bg-zinc-800">
                            <GripVertical className="h-5 w-5" />
                        </div>
                    )}

                    {/* Metronome Indicator (View Mode) */}
                    {!isEditMode && track.bpm && (
                        <div
                            className={`h-8 w-8 flex items-center justify-center rounded-full cursor-pointer transition-colors ${isBlinking ? 'bg-zinc-800' : 'hover:bg-zinc-800'}`}
                            onClick={toggleMetronome}
                            title={`BPM: ${track.bpm}`}
                        >
                            <div className={`h-3 w-3 rounded-full transition-all duration-75 ${blinkState ? 'bg-red-500 scale-125 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-zinc-600'}`} />
                        </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                            {/* Play Button - Only if file attached */}
                            {hasFile && onPlay && (
                                <button
                                    className="h-8 w-8 flex items-center justify-center rounded-full text-green-400 hover:text-green-300 hover:bg-green-400/10 shrink-0"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleTitleClick()
                                    }}
                                >
                                    <Play className="h-4 w-4" />
                                </button>
                            )}

                            {/* Title - Input in Edit Mode, Text in View Mode */}
                            {isEditMode ? (
                                <Input
                                    value={track.title}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { title: e.target.value })}
                                    className={`bg-transparent border-0 text-lg font-medium p-0 h-auto focus-visible:ring-0 ${hasFile ? 'text-blue-400' : ''}`}
                                    placeholder="Song title"
                                />
                            ) : (
                                <span
                                    className={`text-lg font-medium truncate cursor-pointer ${hasFile ? 'text-blue-100 hover:text-blue-300' : ''}`}
                                    onClick={track.bpm ? undefined : handleTitleClick} // If metronome exists, let that handle clicks? No, metronome is separate.
                                >
                                    {track.title}
                                </span>
                            )}
                        </div>

                        {/* Metadata Row */}
                        <div className="flex items-center gap-3 text-sm text-zinc-400 min-h-[1.25rem]">
                            {isEditMode ? (
                                // Edit Mode: Quick Inputs
                                <div className="flex gap-2 w-full max-w-sm">
                                    <Input
                                        value={track.key || ""}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { key: e.target.value })}
                                        className="bg-zinc-800/50 h-7 text-xs w-14 text-center px-1"
                                        placeholder="Key"
                                    />
                                    <Input
                                        value={track.bpm || ""}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { bpm: parseInt(e.target.value) || undefined })}
                                        className="bg-zinc-800/50 h-7 text-xs w-14 text-center px-1"
                                        placeholder="BPM"
                                        type="number"
                                    />
                                    <Input
                                        value={track.leadMusician || ""}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { leadMusician: e.target.value })}
                                        className="bg-zinc-800/50 h-7 text-xs flex-1 px-2"
                                        placeholder="Lead..."
                                    />
                                </div>
                            ) : (
                                // View Mode: Badges
                                <>
                                    {track.key && (
                                        <span className="bg-zinc-800 px-2 py-0.5 rounded text-xs text-zinc-300 font-mono">
                                            {track.key}
                                        </span>
                                    )}
                                    {track.bpm && (
                                        <span className="text-zinc-500 text-xs hidden sm:inline">
                                            {track.bpm} BPM
                                        </span>
                                    )}
                                    {track.leadMusician && (
                                        <div className="flex items-center gap-1 text-zinc-500">
                                            <span className="w-1 h-1 rounded-full bg-zinc-600" />
                                            <span className="text-xs italic text-blue-400/80">
                                                {track.leadMusician}
                                            </span>
                                        </div>
                                    )}
                                    {track.notes && (
                                        <span className="truncate max-w-[200px] text-zinc-600 italic">
                                            {track.notes}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Actions (Edit Mode Only) */}
                    {isEditMode && (
                        <div className="flex items-center gap-1">
                            {!track.audioFileId && (
                                <AudioFilePicker
                                    currentFileId={track.audioFileId}
                                    onSelect={(fileId) => onUpdate(track.id, { audioFileId: fileId })}
                                    trigger={
                                        <Button size="sm" variant="ghost" className="h-8 w-8 text-zinc-600 hover:text-blue-400">
                                            <Music className="h-4 w-4" />
                                        </Button>
                                    }
                                />
                            )}
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-zinc-600 hover:text-red-400"
                                onClick={() => onDelete(track.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </ContextMenuTrigger>

            {/* Context Menu (Always available for authorized, but primarily for View Mode quick edit) */}
            <ContextMenuContent>
                {onEditDetails && (
                    <ContextMenuItem onClick={() => onEditDetails(track)}>
                        Edit Details (BPM, Lead, etc.)
                    </ContextMenuItem>
                )}
                {track.bpm && (
                    <ContextMenuItem onClick={(e) => {
                        // Trigger metronome via context menu if desired? 
                        // Hard to bridge. Skip for now.
                    }}>
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
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => onDelete(track.id)} className="text-red-500 focus:text-red-500">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove from Setlist
                        </ContextMenuItem>
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>
    )
}
