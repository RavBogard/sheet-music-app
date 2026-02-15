"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { SetlistTrack } from "@/types/models"

interface TrackHeaderItemProps {
    track: SetlistTrack
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDelete: (id: string) => void
    isEditMode?: boolean
}

export function TrackHeaderItem({ track, onUpdate, onDelete, isEditMode }: TrackHeaderItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: track.id,
        disabled: !isEditMode
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    ref={setNodeRef}
                    style={style}
                    className="bg-muted border border-border/50 rounded-lg p-3 flex items-center gap-4 group mt-4 mb-2"
                >
                    {isEditMode && (
                        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground p-2 -ml-2 rounded hover:bg-accent">
                            <GripVertical className="h-5 w-5" />
                        </div>
                    )}

                    <div className="flex-1">
                        {isEditMode ? (
                            <Input
                                value={track.title}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { title: e.target.value })}
                                className="bg-transparent border-0 text-lg font-bold text-center text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-0"
                                placeholder="SECTION HEADER"
                            />
                        ) : (
                            <div className="text-lg font-bold text-center text-foreground uppercase tracking-wider">
                                {track.title}
                            </div>
                        )}
                    </div>

                    {isEditMode && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground/60 hover:text-red-400"
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
