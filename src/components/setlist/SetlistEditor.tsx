"use client"

import { useState, useEffect, useCallback } from "react"
import { SetlistService, Setlist, SetlistTrack } from "@/lib/setlist-firebase"
import { ChevronLeft, GripVertical, Save, Trash2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from "@dnd-kit/core"
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface DriveFile {
    id: string
    name: string
    mimeType: string
}

interface SetlistEditorProps {
    setlistId?: string
    initialTracks?: SetlistTrack[]
    initialName?: string
    driveFiles: DriveFile[]
    onBack: () => void
    onSave?: (id: string) => void
}

function SortableTrack({
    track,
    onUpdate,
    onDelete,
    onMatchFile,
    driveFiles
}: {
    track: SetlistTrack
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDelete: (id: string) => void
    onMatchFile: (trackId: string) => void
    driveFiles: DriveFile[]
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    }

    const matchedFile = driveFiles.find(f => f.id === track.fileId)

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center gap-4 group"
        >
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
                <GripVertical className="h-5 w-5 text-zinc-600" />
            </div>

            <div className="flex-1 space-y-2">
                <Input
                    value={track.title}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { title: e.target.value })}
                    className="bg-transparent border-0 text-lg font-medium p-0 h-auto focus-visible:ring-0"
                    placeholder="Song title"
                />
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
            </div>

            <div className="flex items-center gap-2">
                {matchedFile ? (
                    <div className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">
                        ✓ Matched
                    </div>
                ) : (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onMatchFile(track.id)}
                        className="h-8 gap-1"
                    >
                        <Search className="h-3 w-3" />
                        Match
                    </Button>
                )}
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100"
                    onClick={() => onDelete(track.id)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}

export function SetlistEditor({
    setlistId,
    initialTracks = [],
    initialName = "New Setlist",
    driveFiles,
    onBack,
    onSave
}: SetlistEditorProps) {
    const [name, setName] = useState(initialName)
    const [tracks, setTracks] = useState<SetlistTrack[]>(initialTracks)
    const [saving, setSaving] = useState(false)
    const [matchingTrackId, setMatchingTrackId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    // Auto-save debounce
    const saveToFirebase = useCallback(async () => {
        setSaving(true)
        try {
            if (setlistId) {
                await SetlistService.updateSetlist(setlistId, { name, tracks, trackCount: tracks.length })
            } else {
                const newId = await SetlistService.createSetlist(name, tracks)
                onSave?.(newId)
            }
        } catch (e) {
            console.error("Save failed:", e)
        }
        setSaving(false)
    }, [setlistId, name, tracks, onSave])

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            setTracks((items) => {
                const oldIndex = items.findIndex(i => i.id === active.id)
                const newIndex = items.findIndex(i => i.id === over.id)
                return arrayMove(items, oldIndex, newIndex)
            })
        }
    }

    const updateTrack = (id: string, data: Partial<SetlistTrack>) => {
        setTracks(tracks.map(t => t.id === id ? { ...t, ...data } : t))
    }

    const deleteTrack = (id: string) => {
        setTracks(tracks.filter(t => t.id !== id))
    }

    const matchFile = (trackId: string, fileId: string) => {
        updateTrack(trackId, { fileId })
        setMatchingTrackId(null)
        setSearchQuery("")
    }

    const filteredFiles = driveFiles.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !f.mimeType.includes("folder")
    )

    return (
        <div className="h-screen flex flex-col bg-zinc-950 text-white">
            {/* Header */}
            <div className="h-20 border-b border-zinc-800 flex items-center px-4 gap-4">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <Input
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    className="text-2xl font-bold bg-transparent border-0 flex-1 h-auto focus-visible:ring-0"
                    placeholder="Setlist name"
                />
                <Button onClick={saveToFirebase} disabled={saving} className="h-12 px-6 gap-2">
                    <Save className="h-5 w-5" />
                    {saving ? "Saving..." : "Save"}
                </Button>
            </div>

            {/* Track List */}
            <ScrollArea className="flex-1 p-6">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={tracks} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3 max-w-4xl mx-auto">
                            {tracks.map((track) => (
                                <SortableTrack
                                    key={track.id}
                                    track={track}
                                    onUpdate={updateTrack}
                                    onDelete={deleteTrack}
                                    onMatchFile={setMatchingTrackId}
                                    driveFiles={driveFiles}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                {tracks.length === 0 && (
                    <div className="text-center text-zinc-500 py-12">
                        No tracks yet. Import from a document or add manually.
                    </div>
                )}
            </ScrollArea>

            {/* Match File Modal */}
            {matchingTrackId && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold">Match to File</h3>
                            <Button size="icon" variant="ghost" onClick={() => setMatchingTrackId(null)}>
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                        <Input
                            value={searchQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                            placeholder="Search files..."
                            className="mb-4"
                            autoFocus
                        />
                        <ScrollArea className="flex-1">
                            <div className="space-y-2">
                                {filteredFiles.slice(0, 50).map(file => (
                                    <button
                                        key={file.id}
                                        onClick={() => matchFile(matchingTrackId, file.id)}
                                        className="w-full text-left p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                                    >
                                        {file.name}
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            )}
        </div>
    )
}
