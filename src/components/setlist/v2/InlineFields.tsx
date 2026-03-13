"use client"

import { useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { KeyPicker } from "@/components/ui/key-picker"
import { Trash2, Replace, Unlink } from "lucide-react"
import { SetlistTrack } from "@/types/models"

interface SongInlineFieldsProps {
    track: SetlistTrack
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onReplace: (track: SetlistTrack) => void
    onDelete: (id: string) => void
}

export function SongInlineFields({ track, onUpdate, onReplace, onDelete }: SongInlineFieldsProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        containerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" })
    }, [])

    return (
        <div
            ref={containerRef}
            className="px-3 pb-3 pt-2 space-y-3 border-t border-border/30 mt-1"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Row 0: Title */}
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Title</label>
                <Input
                    placeholder="Song title"
                    value={track.title || ""}
                    onChange={(e) => onUpdate(track.id, { title: e.target.value })}
                    className="h-9 font-medium"
                />
            </div>

            {/* Row 1: Key + Tempo */}
            <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Key</label>
                    <KeyPicker
                        value={track.key || ""}
                        onChange={(key) => onUpdate(track.id, { key })}
                    />
                </div>
                <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Tempo</label>
                    <Input
                        type="number"
                        placeholder="BPM"
                        value={track.bpm || ""}
                        onChange={(e) => onUpdate(track.id, { bpm: e.target.value ? Number(e.target.value) : undefined })}
                        className="h-9"
                    />
                </div>
            </div>

            {/* Row 2: Lead musician */}
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Lead</label>
                <Input
                    placeholder="Lead musician"
                    value={track.leadMusician || ""}
                    onChange={(e) => onUpdate(track.id, { leadMusician: e.target.value })}
                    className="h-9"
                />
            </div>

            {/* Row 3: Notes */}
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Notes</label>
                <Textarea
                    placeholder="Performance notes..."
                    value={track.notes || ""}
                    onChange={(e) => onUpdate(track.id, { notes: e.target.value })}
                    className="min-h-[60px] resize-none text-sm"
                    rows={2}
                />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => onReplace(track)}
                >
                    <Replace className="h-3.5 w-3.5" />
                    Replace
                </Button>
                {track.fileId && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => onUpdate(track.id, { fileId: "", fileName: "" })}
                    >
                        <Unlink className="h-3.5 w-3.5" />
                        Unlink Chart
                    </Button>
                )}
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs text-destructive hover:text-destructive"
                    onClick={() => onDelete(track.id)}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                </Button>
            </div>
        </div>
    )
}

interface FlowInlineFieldsProps {
    track: SetlistTrack
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDelete: (id: string) => void
}

export function FlowInlineFields({ track, onUpdate, onDelete }: FlowInlineFieldsProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        containerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" })
    }, [])

    return (
        <div
            ref={containerRef}
            className="px-3 pb-3 pt-2 space-y-3 border-t border-border/30 mt-1"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Title */}
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Title</label>
                <Input
                    placeholder="Item title"
                    value={track.title || ""}
                    onChange={(e) => onUpdate(track.id, { title: e.target.value })}
                    className="h-9"
                />
            </div>

            {/* Description */}
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Description</label>
                <Textarea
                    placeholder="Description or text..."
                    value={track.description || ""}
                    onChange={(e) => onUpdate(track.id, { description: e.target.value })}
                    className="min-h-[60px] resize-none text-sm"
                    rows={2}
                />
            </div>

            {/* Row: Performer + Duration */}
            <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Performer</label>
                    <Input
                        placeholder="Who leads this"
                        value={track.performer || ""}
                        onChange={(e) => onUpdate(track.id, { performer: e.target.value })}
                        className="h-9"
                    />
                </div>
                <div className="w-24 space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Minutes</label>
                    <Input
                        type="number"
                        placeholder="~min"
                        value={track.estimatedMinutes || ""}
                        onChange={(e) => onUpdate(track.id, { estimatedMinutes: e.target.value ? Number(e.target.value) : undefined })}
                        className="h-9"
                    />
                </div>
            </div>

            {/* Delete button */}
            <div className="pt-1">
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs text-destructive hover:text-destructive"
                    onClick={() => onDelete(track.id)}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                </Button>
            </div>
        </div>
    )
}
