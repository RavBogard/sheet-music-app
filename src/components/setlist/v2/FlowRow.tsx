"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, BookOpen, Heart, ArrowLeftRight, StickyNote } from "lucide-react"
import { SetlistTrack, TrackType } from "@/types/models"

interface FlowRowProps {
    track: SetlistTrack
    canEdit: boolean
    onTap: (track: SetlistTrack) => void
}

const FLOW_CONFIG: Record<string, {
    icon: typeof BookOpen
    tint: string // subtle background tint
    iconColor: string
}> = {
    reading: {
        icon: BookOpen,
        tint: "bg-amber-500/5",
        iconColor: "text-amber-500/70",
    },
    prayer: {
        icon: Heart,
        tint: "bg-blue-500/5",
        iconColor: "text-blue-500/70",
    },
    transition: {
        icon: ArrowLeftRight,
        tint: "bg-muted/30",
        iconColor: "text-muted-foreground/50",
    },
    note: {
        icon: StickyNote,
        tint: "bg-muted/30",
        iconColor: "text-muted-foreground/50",
    },
}

export function FlowRow({ track, canEdit, onTap }: FlowRowProps) {
    const trackType = (track.type || "note") as TrackType
    const config = FLOW_CONFIG[trackType] || FLOW_CONFIG.note

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

    const Icon = config.icon

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer
                ${config.tint} hover:bg-accent/40 active:bg-accent
                ${isDragging ? "opacity-50 ring-2 ring-primary scale-[1.02] z-50" : ""}
            `}
            onClick={() => onTap(track)}
        >
            {/* Drag handle */}
            {canEdit && (
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/30 hover:text-muted-foreground p-1 -ml-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical className="h-4 w-4" />
                </div>
            )}

            {/* Type icon */}
            <div className={`shrink-0 ${config.iconColor}`}>
                <Icon className="h-3.5 w-3.5" />
            </div>

            {/* Content - single line */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-sm text-foreground/80 truncate">
                    {track.title || trackType.charAt(0).toUpperCase() + trackType.slice(1)}
                </span>
                {track.performer && (
                    <span className="text-xs text-muted-foreground/60 shrink-0 hidden sm:inline">
                        · {track.performer}
                    </span>
                )}
            </div>

            {/* Duration */}
            {track.estimatedMinutes && track.estimatedMinutes > 0 && (
                <span className="text-xs text-muted-foreground/50 shrink-0">
                    ~{track.estimatedMinutes}m
                </span>
            )}
        </div>
    )
}
