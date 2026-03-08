"use client"

import { memo } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Music, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { SetlistTrack } from "@/types/models"
import { SongInlineFields } from "./InlineFields"

interface SongRowProps {
    track: SetlistTrack
    canEdit: boolean
    isExpanded?: boolean
    onTap?: (track: SetlistTrack) => void
    onPlayFile?: (fileId: string, fileName: string) => void
    onUpdate?: (id: string, data: Partial<SetlistTrack>) => void
    onReplace?: (track: SetlistTrack) => void
    onDelete?: (id: string) => void
}

export const SongRow = memo(function SongRow({
    track,
    canEdit,
    isExpanded = false,
    onTap,
    onPlayFile,
    onUpdate,
    onReplace,
    onDelete,
}: SongRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: track.id,
        disabled: !canEdit,
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        outline: 'none' as const,
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
            className={`rounded-lg transition-colors
                ${isExpanded ? "bg-accent/60 ring-1 ring-primary/20" : "hover:bg-accent/50 active:bg-accent"}
                ${isDragging ? "opacity-50 ring-2 ring-primary scale-[1.02] z-50 bg-accent" : ""}
            `}
        >
            {/* Collapsed row (always visible) */}
            <div
                className="flex items-center gap-3 px-3 py-3 cursor-pointer"
                onClick={() => onTap?.(track)}
            >
                {/* Drag handle */}
                {canEdit && (
                    <div
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/60 hover:text-muted-foreground p-1 -ml-1"
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
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/60 mt-0.5">
                        <span className="truncate">
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
                        </span>

                        {track.referenceLink && (
                            <Badge asChild variant="brand" className="text-[10px] px-1.5 py-0.5 cursor-pointer">
                                <a
                                    href={track.referenceLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    Ref <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded inline fields */}
            {isExpanded && canEdit && onUpdate && onReplace && onDelete && (
                <SongInlineFields
                    track={track}
                    onUpdate={onUpdate}
                    onReplace={onReplace}
                    onDelete={onDelete}
                />
            )}
        </div>
    )
})
