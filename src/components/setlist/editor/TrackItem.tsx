"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash2, Play, Search, Music } from "lucide-react"
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
}

export function TrackItem({
    track,
    onUpdate,
    onDelete,
    onMatchFile,
    onPlay,
    readOnly
}: TrackItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    }

    const hasFile = !!track.fileId
    const fileName = track.fileName || (hasFile ? "Linked File" : "")

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
                        {!readOnly && (
                            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-zinc-500 hover:text-zinc-300 p-2 -ml-2 rounded hover:bg-zinc-700">
                                <GripVertical className="h-5 w-5" />
                            </div>
                        )}

                        <div className="flex-1">
                            {!readOnly ? (
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

                        {!readOnly && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => onDelete(track.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </ContextMenuTrigger>
                {!readOnly && (
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
                    className={`glass-card rounded-lg p-4 flex items-center gap-4 group transition-colors hover:bg-zinc-900/40 ${isDragging ? "opacity-50 ring-2 ring-blue-500 scale-[1.02] z-50 bg-zinc-800" : ""}`}
                    onContextMenu={(e) => {
                        // Prevent dnd-kit from interfering with right click if needed, though ContextMenu usually handles it
                    }}
                >
                    {!readOnly && (
                        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-zinc-600 p-2 -ml-2 rounded hover:bg-zinc-800">
                            <GripVertical className="h-5 w-5" />
                        </div>
                    )}

                    <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                            {hasFile && onPlay && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-400/10"
                                    onClick={handleTitleClick}
                                >
                                    <Play className="h-4 w-4" />
                                </Button>
                            )}
                            {readOnly ? (
                                <span
                                    className={`text-lg font-medium ${hasFile ? 'cursor-pointer hover:text-blue-400' : ''}`}
                                    onClick={hasFile ? handleTitleClick : undefined}
                                >
                                    {track.title}
                                </span>
                            ) : (
                                <Input
                                    value={track.title}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { title: e.target.value })}
                                    className={`bg-transparent border-0 text-lg font-medium p-0 h-auto focus-visible:ring-0 ${hasFile ? 'cursor-pointer hover:text-blue-400' : ''}`}
                                    placeholder="Song title"
                                    onClick={hasFile ? handleTitleClick : undefined}
                                />
                            )}
                        </div>
                        {!readOnly && (
                            <div className="flex items-center gap-4 text-sm">
                                <Input
                                    value={track.key || ""}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { key: e.target.value })}
                                    className="bg-zinc-800 w-20 h-8 text-center"
                                    placeholder="Key"
                                />
                                <Input
                                    value={track.notes || ""}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { notes: e.target.value })}
                                    className="bg-zinc-800 flex-1 h-8"
                                    placeholder="Notes..."
                                />
                            </div>
                        )}
                        {readOnly && (track.key || track.notes) && (
                            <div className="flex items-center gap-4 text-sm text-zinc-500">
                                {track.key && <span className="bg-zinc-800 px-2 py-1 rounded">{track.key}</span>}
                                {track.notes && <span>{track.notes}</span>}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {hasFile ? (
                            <div
                                className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded cursor-pointer hover:bg-green-400/20"
                                onClick={readOnly ? handleTitleClick : () => onMatchFile(track.id)}
                                title={fileName}
                            >
                                ✓ Linked
                            </div>
                        ) : !readOnly && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onMatchFile(track.id)}
                                className="h-8 gap-1 text-yellow-400 border-yellow-400/50"
                            >
                                <Search className="h-3 w-3" />
                                Link File
                            </Button>
                        )}
                        {!readOnly && (
                            <AudioFilePicker
                                currentFileId={track.audioFileId}
                                onSelect={(fileId) => onUpdate(track.id, { audioFileId: fileId })}
                                trigger={
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className={`h-8 w-8 p-0 ${track.audioFileId ? 'text-blue-400 border-blue-400/50' : 'text-zinc-600 border-zinc-800'}`}
                                        title={track.audioFileId ? "Audio Linked" : "Link Audio"}
                                    >
                                        <Music className="h-3 w-3" />
                                    </Button>
                                }
                            />
                        )}
                        {!readOnly && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
                                onClick={() => onDelete(track.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </ContextMenuTrigger>
            {!readOnly && (
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => onMatchFile(track.id)}>
                        <Search className="h-4 w-4 mr-2" />
                        {hasFile ? "Change File" : "Link File"}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => onDelete(track.id)} className="text-red-500 focus:text-red-500">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove from Setlist
                    </ContextMenuItem>
                </ContextMenuContent>
            )}
        </ContextMenu>
    )
}
