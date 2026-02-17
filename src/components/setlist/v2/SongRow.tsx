"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Music } from "lucide-react"
import { SetlistTrack } from "@/types/models"

interface SongRowProps {
    track: SetlistTrack
    canEdit: boolean
    onTap: (track: SetlistTrack) => void
    onPlayFile?: (fileId: string, fileName: string) => void
}

export function SongRow({ track, canEdit, onTap, onPlayFile }: SongRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: track.id,
        disabled: !canEdit,
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    const hasFile = !!track.fileId

    const handleFileClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (hasFile && track.fileId && onPlayFile) {
            onPlayFile(track.fileId, track.fileName || track.title)
        }
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors cursor-pointer
                hover:bg-accent/50 active:bg-accent
                ${isDragging ? "opacity-50 ring-2 ring-primary scale-[1.02] z-50 bg-accent" : ""}
            `}
            onClick={() => onTap(track)}
        >
            {/* Drag handle */}
            {canEdit && (
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground p-1 -ml-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical className="h-5 w-5" />
                </div>
            )}

            {/* Song icon */}
            {!canEdit && (
                <div className="text-muted-foreground/30 shrink-0">
                    <Music className="h-4 w-4" />
                </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
                {/* Line 1: Title + key + lead */}
                <div className="flex items-center gap-2">
                    <span className={`font-medium truncate ${hasFile ? "text-foreground" : "text-muted-foreground"}`}>
                        {track.title || "Untitled"}
                    </span>
                    {track.key && (
                        <span className="shrink-0 text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground/80">
                            {track.key}
                        </span>
                    )}
                    {track.leadMusician && (
                        <span className="shrink-0 text-xs text-muted-foreground italic hidden sm:inline">
                            {track.leadMusician}
                        </span>
                    )}
                </div>

                {/* Line 2: Linked file or hint */}
                <div className="text-xs text-muted-foreground/60 truncate mt-0.5">
                    {hasFile ? (
                        <button
                            className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors hover:underline"
                            onClick={handleFileClick}
                        >
                            {track.fileName || "Linked chart"}
                        </button>
                    ) : canEdit ? (
                        "Tap to link a chart"
                    ) : (
                        "No chart linked"
                    )}
                </div>
            </div>
        </div>
    )
}
