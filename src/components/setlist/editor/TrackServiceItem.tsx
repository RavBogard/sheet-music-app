"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Trash2, BookOpen, Heart, ArrowLeftRight, StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { SetlistTrack, TrackType } from "@/types/models"

interface TrackServiceItemProps {
    track: SetlistTrack
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDelete: (id: string) => void
    isEditMode?: boolean
}

const TYPE_CONFIG: Record<string, {
    icon: typeof BookOpen
    label: string
    color: string       // tailwind text color
    bgColor: string     // tailwind bg color for badge
    borderColor: string // tailwind border accent
}> = {
    header: {
        icon: ArrowLeftRight, // not displayed, but needed for type
        label: 'Section',
        color: 'text-foreground',
        bgColor: 'bg-muted',
        borderColor: 'border-border/50',
    },
    reading: {
        icon: BookOpen,
        label: 'Reading',
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/20',
    },
    prayer: {
        icon: Heart,
        label: 'Prayer',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/20',
    },
    transition: {
        icon: ArrowLeftRight,
        label: 'Transition',
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/50',
        borderColor: 'border-border/30',
    },
    note: {
        icon: StickyNote,
        label: 'Note',
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/50',
        borderColor: 'border-border/30',
    },
}

export function TrackServiceItem({ track, onUpdate, onDelete, isEditMode }: TrackServiceItemProps) {
    const trackType = (track.type || 'note') as TrackType
    const config = TYPE_CONFIG[trackType] || TYPE_CONFIG.note

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: track.id,
        disabled: !isEditMode
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    }

    // Headers render differently — bold centered label
    if (trackType === 'header') {
        return <HeaderVariant track={track} onUpdate={onUpdate} onDelete={onDelete} isEditMode={isEditMode} sortableProps={{ attributes, listeners, setNodeRef, style, isDragging }} />
    }

    const Icon = config.icon

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    ref={setNodeRef}
                    style={style}
                    className={`${config.bgColor} border ${config.borderColor} rounded-lg p-3 flex items-center gap-3 group my-1`}
                >
                    {/* Drag Handle */}
                    {isEditMode && (
                        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground p-2 -ml-2 rounded hover:bg-accent">
                            <GripVertical className="h-5 w-5" />
                        </div>
                    )}

                    {/* Icon */}
                    <div className={`shrink-0 ${config.color}`}>
                        <Icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        {isEditMode ? (
                            <EditableServiceContent track={track} trackType={trackType} onUpdate={onUpdate} />
                        ) : (
                            <ReadOnlyServiceContent track={track} trackType={trackType} config={config} />
                        )}
                    </div>

                    {/* Duration Badge */}
                    {!isEditMode && track.estimatedMinutes && (
                        <span className="text-xs text-muted-foreground shrink-0">
                            ~{track.estimatedMinutes} min
                        </span>
                    )}

                    {/* Delete */}
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
                        Remove {config.label}
                    </ContextMenuItem>
                </ContextMenuContent>
            )}
        </ContextMenu>
    )
}

// ── Read-only view for service flow items ──

function ReadOnlyServiceContent({ track, trackType, config }: {
    track: SetlistTrack
    trackType: TrackType
    config: typeof TYPE_CONFIG[string]
}) {
    return (
        <div className="space-y-0.5">
            <div className="flex items-center gap-2">
                <span className={`font-medium ${config.color}`}>
                    {track.title}
                </span>
                {track.performer && (
                    <span className="text-xs text-muted-foreground">
                        — {track.performer}
                    </span>
                )}
            </div>
            {track.description && (
                <p className={`text-xs text-muted-foreground/80 truncate max-w-md ${trackType === 'note' ? 'italic' : ''}`}>
                    {track.description}
                </p>
            )}
        </div>
    )
}

// ── Edit mode for service flow items ──

function EditableServiceContent({ track, trackType, onUpdate }: {
    track: SetlistTrack
    trackType: TrackType
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
}) {
    return (
        <div className="space-y-2">
            {/* Row 1: Title */}
            <Input
                value={track.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { title: e.target.value })}
                className="bg-transparent border-0 text-base font-medium p-0 h-auto focus-visible:ring-0"
                placeholder={trackType === 'note' ? 'Note text...' : `${trackType.charAt(0).toUpperCase() + trackType.slice(1)} title...`}
                onClick={(e) => e.stopPropagation()}
            />
            {/* Row 2: Performer + Duration + Description */}
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {trackType !== 'note' && (
                    <Input
                        value={track.performer || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { performer: e.target.value })}
                        className="bg-muted h-7 text-xs w-28 px-2"
                        placeholder="Performer..."
                    />
                )}
                <Input
                    value={track.estimatedMinutes ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { estimatedMinutes: parseInt(e.target.value) || undefined })}
                    className="bg-muted h-7 text-xs w-16 text-center px-1"
                    placeholder="Min"
                    type="number"
                />
                {(trackType === 'reading' || trackType === 'prayer' || trackType === 'note') && (
                    <Input
                        value={track.description || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { description: e.target.value })}
                        className="bg-muted h-7 text-xs flex-1 px-2"
                        placeholder="Description..."
                    />
                )}
            </div>
        </div>
    )
}

// ── Header variant (bold centered label) ──

function HeaderVariant({ track, onUpdate, onDelete, isEditMode, sortableProps }: {
    track: SetlistTrack
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDelete: (id: string) => void
    isEditMode?: boolean
    sortableProps: {
        attributes: ReturnType<typeof useSortable>['attributes']
        listeners: ReturnType<typeof useSortable>['listeners']
        setNodeRef: (node: HTMLElement | null) => void
        style: React.CSSProperties
        isDragging: boolean
    }
}) {
    const { attributes, listeners, setNodeRef, style } = sortableProps

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
