"use client"

import { memo } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { SetlistTrack } from "@/types/models"

interface DividerRowProps {
    track: SetlistTrack
    canEdit: boolean
    onTap?: (track: SetlistTrack) => void
}

export const DividerRow = memo(function DividerRow({ track, canEdit, onTap }: DividerRowProps) {
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

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-3 py-2 mt-3 mb-1 group cursor-pointer
                ${isDragging ? "opacity-50 z-50" : ""}
            `}
            onClick={() => canEdit && onTap?.(track)}
        >
            {canEdit && (
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/60 hover:text-muted-foreground p-1 -ml-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical className="h-4 w-4" />
                </div>
            )}
            <div className="h-px bg-border flex-1" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 shrink-0">
                {track.title || "Section"}
            </span>
            <div className="h-px bg-border flex-1" />
        </div>
    )
})
