"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { createSetlistService, Setlist, SetlistTrack } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { ChevronLeft, GripVertical, Trash2, Search, X, Plus, Check, Play, Globe, Lock, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PrintModal } from "@/components/setlist/PrintModal"
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
    suggestedName?: string
    initialIsPublic?: boolean
    initialOwnerId?: string
    driveFiles: DriveFile[]
    onBack: () => void
    onSave?: (id: string) => void
    onPlayTrack?: (fileId: string, fileName: string) => void
}

function SortableTrack({
    track,
    onUpdate,
    onDelete,
    onMatchFile,
    onPlay,
    driveFiles,
    readOnly
}: {
    track: SetlistTrack
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onDelete: (id: string) => void
    onMatchFile: (trackId: string) => void
    onPlay?: (fileId: string, fileName: string) => void
    driveFiles: DriveFile[]
    readOnly?: boolean
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1
    }

    const matchedFile = driveFiles.find(f => f.id === track.fileId)

    const handleTitleClick = () => {
        if (matchedFile && onPlay) {
            onPlay(matchedFile.id, matchedFile.name)
        }
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center gap-4 group"
        >
            {!readOnly && (
                <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
                    <GripVertical className="h-5 w-5 text-zinc-600" />
                </div>
            )}

            <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                    {matchedFile && onPlay && (
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
                            className={`text-lg font-medium ${matchedFile ? 'cursor-pointer hover:text-blue-400' : ''}`}
                            onClick={matchedFile ? handleTitleClick : undefined}
                        >
                            {track.title}
                        </span>
                    ) : (
                        <Input
                            value={track.title}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(track.id, { title: e.target.value })}
                            className={`bg-transparent border-0 text-lg font-medium p-0 h-auto focus-visible:ring-0 ${matchedFile ? 'cursor-pointer hover:text-blue-400' : ''}`}
                            placeholder="Song title"
                            onClick={matchedFile ? handleTitleClick : undefined}
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
                {matchedFile ? (
                    <div
                        className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded cursor-pointer hover:bg-green-400/20"
                        onClick={readOnly ? handleTitleClick : () => onMatchFile(track.id)}
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
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100"
                        onClick={() => onDelete(track.id)}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}

export function SetlistEditor({
    setlistId: initialSetlistId,
    initialTracks = [],
    initialName = "",
    suggestedName = "",
    initialIsPublic = false,
    initialOwnerId,
    driveFiles,
    onBack,
    onSave,
    onPlayTrack
}: SetlistEditorProps) {
    const { user } = useAuth()

    // Create user-specific service
    const setlistService = useMemo(() => {
        if (user) {
            return createSetlistService(user.uid, user.displayName)
        }
        return null
    }, [user])

    // Determine if user can edit (owner or new setlist)
    const canEdit = !initialOwnerId || initialOwnerId === user?.uid

    // Core state
    const [setlistId, setSetlistId] = useState<string | undefined>(initialSetlistId)
    const [name, setName] = useState(initialName || suggestedName || "")
    const [tracks, setTracks] = useState<SetlistTrack[]>(initialTracks)
    const [isPublic, setIsPublic] = useState(initialIsPublic)
    const [saving, setSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)

    // Modal states
    const [showNamePrompt, setShowNamePrompt] = useState(!initialSetlistId && !initialName)
    const [matchingTrackId, setMatchingTrackId] = useState<string | null>(null)
    const [showAddSongs, setShowAddSongs] = useState(false)
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState("")
    const [showPrintModal, setShowPrintModal] = useState(false)

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    // Auto-save with debounce
    const triggerAutoSave = useCallback(() => {
        if (!canEdit || !setlistService) return

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }
        saveTimeoutRef.current = setTimeout(async () => {
            if (!name || name.length === 0) return

            setSaving(true)
            try {
                if (setlistId) {
                    await setlistService.updateSetlist(setlistId, isPublic, { name, tracks, trackCount: tracks.length })
                } else {
                    const newId = await setlistService.createSetlist(name, tracks, isPublic)
                    setSetlistId(newId)
                    onSave?.(newId)
                }
                setLastSaved(new Date())
            } catch (e) {
                console.error("Auto-save failed:", e)
            }
            setSaving(false)
        }, 1000)
    }, [setlistId, name, tracks, isPublic, onSave, setlistService, canEdit])

    // Trigger auto-save on changes
    useEffect(() => {
        if (name && canEdit) {
            triggerAutoSave()
        }
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [name, tracks, isPublic, triggerAutoSave, canEdit])

    const handleDragEnd = (event: DragEndEvent) => {
        if (!canEdit) return
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
        if (!canEdit) return
        setTracks(tracks.map(t => t.id === id ? { ...t, ...data } : t))
    }

    const deleteTrack = (id: string) => {
        if (!canEdit) return
        setTracks(tracks.filter(t => t.id !== id))
    }

    const matchFile = (trackId: string, fileId: string) => {
        updateTrack(trackId, { fileId })
        setMatchingTrackId(null)
        setSearchQuery("")
    }

    const addSongsFromLibrary = () => {
        if (!canEdit) return
        const newTracks: SetlistTrack[] = Array.from(selectedFiles).map((fileId, index) => {
            const file = driveFiles.find(f => f.id === fileId)
            const cleanName = file?.name
                .replace(/\.(pdf|musicxml|xml|mxl)$/i, '')
                .replace(/_/g, ' ')
                .replace(/-/g, ' ')
                .trim() || "Untitled"

            return {
                id: `track-${Date.now()}-${index}`,
                title: cleanName,
                fileId: fileId,
                key: "",
                notes: ""
            }
        })

        setTracks([...tracks, ...newTracks])
        setSelectedFiles(new Set())
        setShowAddSongs(false)
        setSearchQuery("")
    }

    const toggleFileSelection = (fileId: string) => {
        const newSelection = new Set(selectedFiles)
        if (newSelection.has(fileId)) {
            newSelection.delete(fileId)
        } else {
            newSelection.add(fileId)
        }
        setSelectedFiles(newSelection)
    }

    const filteredFiles = driveFiles.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !f.mimeType.includes("folder") &&
        !f.mimeType.includes("spreadsheet") &&
        !f.mimeType.includes("document")
    )

    const confirmName = () => {
        if (name.trim().length > 0) {
            setShowNamePrompt(false)
        }
    }

    return (
        <div className="h-screen flex flex-col bg-zinc-950 text-white">
            {/* Name Prompt Modal */}
            {showNamePrompt && canEdit && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
                    <div className="bg-zinc-900 rounded-xl p-8 w-full max-w-md">
                        <h2 className="text-2xl font-bold mb-4">Name Your Setlist</h2>
                        <Input
                            value={name}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                            placeholder="e.g., Shabbat Morning, Friday Night..."
                            className="text-xl mb-4"
                            autoFocus
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && confirmName()}
                        />

                        {/* Public/Private Toggle */}
                        <div className="flex items-center gap-4 mb-6 p-4 bg-zinc-800 rounded-lg">
                            <button
                                onClick={() => setIsPublic(false)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${!isPublic ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                                    }`}
                            >
                                <Lock className="h-4 w-4" />
                                Personal
                            </button>
                            <button
                                onClick={() => setIsPublic(true)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-colors ${isPublic ? 'bg-green-600 text-white' : 'text-zinc-400 hover:text-white'
                                    }`}
                            >
                                <Globe className="h-4 w-4" />
                                Public
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <Button onClick={onBack} variant="ghost" className="flex-1">Cancel</Button>
                            <Button onClick={confirmName} className="flex-1" disabled={!name.trim()}>
                                Continue
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="h-20 border-b border-zinc-800 flex items-center px-4 gap-4">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={onBack}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>

                {canEdit ? (
                    <Input
                        value={name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                        className="text-2xl font-bold bg-transparent border-0 flex-1 h-auto focus-visible:ring-0"
                        placeholder="Setlist name"
                    />
                ) : (
                    <h1 className="text-2xl font-bold flex-1">{name}</h1>
                )}

                {/* Print Button */}
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowPrintModal(true)}
                    className="h-10 w-10"
                    title="Print setlist"
                >
                    <Printer className="h-5 w-5" />
                </Button>

                {/* Public/Private toggle (clickable for owner of existing setlists) */}
                {canEdit && setlistId ? (
                    <button
                        onClick={async () => {
                            if (!setlistService || !setlistId) return

                            const action = isPublic ? "make private" : "make public"
                            const message = isPublic
                                ? "Make this setlist private? Only you will be able to see it."
                                : "Make this setlist public? Anyone with the app can view (but not edit) it."

                            if (!confirm(message)) return

                            setSaving(true)
                            try {
                                const newId = isPublic
                                    ? await setlistService.makePrivate(setlistId, { id: setlistId, name, tracks, trackCount: tracks.length, isPublic, date: null as any })
                                    : await setlistService.makePublic(setlistId, { id: setlistId, name, tracks, trackCount: tracks.length, isPublic, date: null as any })

                                setSetlistId(newId)
                                setIsPublic(!isPublic)
                                alert(`Setlist is now ${!isPublic ? 'public' : 'private'}!`)
                            } catch (e) {
                                console.error("Toggle visibility failed:", e)
                                alert("Failed to change visibility")
                            }
                            setSaving(false)
                        }}
                        className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm cursor-pointer hover:opacity-80 transition-opacity ${isPublic ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                            }`}
                        title="Click to toggle visibility"
                    >
                        {isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                        {isPublic ? 'Public' : 'Personal'}
                    </button>
                ) : (
                    <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${isPublic ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>
                        {isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                        {isPublic ? 'Public' : 'Personal'}
                    </div>
                )}

                {!canEdit && (
                    <div className="text-sm text-zinc-500">View Only</div>
                )}

                {canEdit && (
                    <div className="text-sm text-zinc-500">
                        {saving ? "Saving..." : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : ""}
                    </div>
                )}
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
                                    onPlay={onPlayTrack}
                                    driveFiles={driveFiles}
                                    readOnly={!canEdit}
                                />
                            ))}

                            {/* Add Songs Button */}
                            {canEdit && (
                                <button
                                    onClick={() => setShowAddSongs(true)}
                                    className="w-full p-4 border-2 border-dashed border-zinc-700 rounded-lg text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus className="h-5 w-5" />
                                    Add Songs from Library
                                </button>
                            )}
                        </div>
                    </SortableContext>
                </DndContext>
            </ScrollArea>

            {/* Match File Modal */}
            {matchingTrackId && canEdit && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold">Link to Music File</h3>
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

            {/* Add Songs Modal (Multi-Select) */}
            {showAddSongs && canEdit && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold">Add Songs ({selectedFiles.size} selected)</h3>
                            <Button size="icon" variant="ghost" onClick={() => {
                                setShowAddSongs(false)
                                setSelectedFiles(new Set())
                                setSearchQuery("")
                            }}>
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                        <Input
                            value={searchQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                            placeholder="Search library..."
                            className="mb-4"
                            autoFocus
                        />
                        <ScrollArea className="flex-1 mb-4">
                            <div className="space-y-2">
                                {filteredFiles.slice(0, 100).map(file => (
                                    <button
                                        key={file.id}
                                        onClick={() => toggleFileSelection(file.id)}
                                        className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${selectedFiles.has(file.id)
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-zinc-800 hover:bg-zinc-700'
                                            }`}
                                    >
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedFiles.has(file.id) ? 'bg-white border-white' : 'border-zinc-600'
                                            }`}>
                                            {selectedFiles.has(file.id) && <Check className="h-3 w-3 text-blue-600" />}
                                        </div>
                                        {file.name.replace(/\.(pdf|musicxml|xml|mxl)$/i, '')}
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                        <Button
                            onClick={addSongsFromLibrary}
                            disabled={selectedFiles.size === 0}
                            className="w-full"
                        >
                            Add {selectedFiles.size} Song{selectedFiles.size !== 1 ? 's' : ''}
                        </Button>
                    </div>
                </div>
            )}

            {/* Print Modal */}
            {showPrintModal && (
                <PrintModal
                    setlistName={name}
                    tracks={tracks}
                    driveFiles={driveFiles}
                    onClose={() => setShowPrintModal(false)}
                />
            )}
        </div>
    )
}
