"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { createSetlistService, Setlist, SetlistTrack } from "@/lib/setlist-firebase"
import { useAuth } from "@/lib/auth-context"
import { useOfflineSync } from "@/hooks/use-offline-sync"
import { Trash2, Save, ArrowLeft, GripVertical, Download, Link, Share2, Play, Search, X, Plus, Check, Globe, Lock, Printer, CloudDownload, CloudOff, ChevronLeft, Music } from "lucide-react"
import { SetlistTimeline } from "./SetlistTimeline"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { PrintModal } from "@/components/setlist/PrintModal"
import { AudioFilePicker } from "@/components/setlist/AudioFilePicker"
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
    parents?: string[]
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

    const isHeader = track.type === 'header'

    if (isHeader) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 flex items-center gap-4 group mt-4 mb-2"
            >
                {!readOnly && (
                    <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-zinc-500 hover:text-zinc-300">
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
        )
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

    // Offline Sync Hook
    const {
        checkOfflineStatus,
        syncSetlist,
        downloading,
        offlineStatus
    } = useOfflineSync()

    useEffect(() => {
        if (tracks.length > 0) {
            checkOfflineStatus(tracks)
        }
    }, [tracks, checkOfflineStatus])

    // Calculate sync progress
    const totalTracksWithFiles = tracks.filter(t => t.fileId).length
    const offlineCount = tracks.filter(t => t.fileId && offlineStatus[t.fileId]).length
    const isFullyOffline = totalTracksWithFiles > 0 && offlineCount === totalTracksWithFiles
    const isSyncing = Object.values(downloading).some(Boolean)

    // Modal states
    const [showNamePrompt, setShowNamePrompt] = useState(!initialSetlistId && !initialName)
    const [matchingTrackId, setMatchingTrackId] = useState<string | null>(null)
    const [showAddSongs, setShowAddSongs] = useState(false)
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState("")
    const [showPrintModal, setShowPrintModal] = useState(false)

    // Folder Navigation State
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

    // Helper: Get Breadcrumbs
    const breadcrumbs = useMemo(() => {
        const path = []
        let currentId = currentFolderId
        while (currentId) {
            const folder = driveFiles.find(f => f.id === currentId)
            if (folder) {
                path.unshift(folder)
                currentId = folder.parents?.[0] || null
            } else {
                break
            }
        }
        return path
    }, [currentFolderId, driveFiles])

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

    const addFolderSongs = (folderId: string) => {
        const folderFiles = driveFiles.filter(f =>
            f.parents?.includes(folderId) &&
            !f.mimeType.includes("folder") &&
            !f.mimeType.includes("spreadsheet") &&
            !f.mimeType.includes("document")
        )
        const newSelection = new Set(selectedFiles)
        folderFiles.forEach(f => newSelection.add(f.id))
        setSelectedFiles(newSelection)
    }

    const filteredFiles = driveFiles.filter(f => {
        const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase())
        const isNotDoc = !f.mimeType.includes("spreadsheet") && !f.mimeType.includes("document")

        if (searchQuery) return matchesSearch && isNotDoc

        // No search: Filter by current folder
        if (!currentFolderId) {
            // Root: Files with no parents or whose parents aren't in our file list
            return isNotDoc && (!f.parents || f.parents.length === 0 || !driveFiles.some(df => f.parents?.includes(df.id)))
        }
        return isNotDoc && f.parents?.includes(currentFolderId)
    })

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

                {/* Sync Button */}
                {canEdit && (
                    <Button
                        size="sm"
                        variant={isFullyOffline ? "default" : "secondary"}
                        onClick={() => syncSetlist(tracks)}
                        disabled={isSyncing || isFullyOffline}
                        className={`gap-2 ${isFullyOffline ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    >
                        {isSyncing ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
                        ) : isFullyOffline ? (
                            <Check className="h-4 w-4" />
                        ) : (
                            <Download className="h-4 w-4" />
                        )}
                        {isSyncing ? "Syncing..." : isFullyOffline ? "Offline Ready" : "Download All"}
                    </Button>
                )}

                {canEdit && (
                    <div className="text-sm text-zinc-500">
                        {saving ? "Saving..." : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : ""}
                    </div>
                )}
            </div>

            {/* Timeline View */}
            <SetlistTimeline tracks={tracks} onPlay={(fid) => onPlayTrack?.(fid, "song")} />

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
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 sm:p-4">
                    <div className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-2xl bg-zinc-900 sm:rounded-xl flex flex-col p-4 sm:p-6 overflow-hidden">
                        <div className="flex items-center justify-between mb-4 shrink-0">
                            <h3 className="text-xl font-bold">Link to Music File</h3>
                            <Button size="icon" variant="ghost" onClick={() => {
                                setMatchingTrackId(null)
                                setCurrentFolderId(null)
                                setSearchQuery("")
                            }}>
                                <X className="h-5 w-5" />
                            </Button>
                        </div>

                        {/* Breadcrumbs for Navigation */}
                        {!searchQuery && (
                            <div className="flex items-center gap-1 text-sm text-zinc-500 mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide">
                                <button
                                    onClick={() => setCurrentFolderId(null)}
                                    className={cn("hover:text-blue-400 truncate", !currentFolderId && "text-blue-400 font-bold")}
                                    style={{ minWidth: 'fit-content' }}
                                >
                                    Library
                                </button>
                                {breadcrumbs.map(bc => (
                                    <div key={bc.id} className="flex items-center gap-1 shrink-0">
                                        <ChevronLeft className="h-3 w-3 rotate-180 opacity-50" />
                                        <button
                                            onClick={() => setCurrentFolderId(bc.id)}
                                            className={cn("hover:text-blue-400 truncate max-w-[120px]", currentFolderId === bc.id && "text-blue-400 font-bold")}
                                        >
                                            {bc.name}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <Input
                            value={searchQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                            placeholder="Search files..."
                            className="mb-4 shrink-0"
                            autoFocus
                        />
                        <div className="flex-1 overflow-y-auto -mx-2 px-2">
                            <div className="grid grid-cols-1 gap-2 pb-20 sm:pb-0">
                                {filteredFiles.slice(0, 100).map(file => {
                                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
                                    return (
                                        <button
                                            key={file.id}
                                            onClick={() => {
                                                if (isFolder) {
                                                    setCurrentFolderId(file.id)
                                                } else {
                                                    matchFile(matchingTrackId, file.id)
                                                }
                                            }}
                                            className={cn(
                                                "w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3",
                                                isFolder ? "bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50" : "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800"
                                            )}
                                        >
                                            {isFolder ? (
                                                <div className="w-10 h-10 rounded-lg bg-zinc-700/30 flex items-center justify-center text-zinc-400 group-hover:text-blue-400">
                                                    <ChevronLeft className="h-5 w-5 rotate-180" />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                                                    <Music className="h-4 w-4" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium truncate">{file.name}</div>
                                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                                                    {isFolder ? "Folder" : file.mimeType.split('/').pop()?.replace('vnd.google-apps.', '')}
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Songs Modal (Multi-Select) */}
            {showAddSongs && canEdit && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 sm:p-4">
                    <div className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-2xl bg-zinc-900 sm:rounded-xl flex flex-col p-4 sm:p-6 overflow-hidden">
                        <div className="flex items-center justify-between mb-2 shrink-0">
                            <h3 className="text-xl font-bold">Add Songs ({selectedFiles.size} selected)</h3>
                            <Button size="icon" variant="ghost" onClick={() => {
                                setShowAddSongs(false)
                                setSelectedFiles(new Set())
                                setCurrentFolderId(null)
                                setSearchQuery("")
                            }}>
                                <X className="h-5 w-5" />
                            </Button>
                        </div>

                        {/* Breadcrumbs for Navigation */}
                        {!searchQuery && (
                            <div className="flex items-center gap-1 text-sm text-zinc-500 mb-4 overflow-x-auto whitespace-nowrap scrollbar-hide py-2 border-y border-white/5">
                                <button
                                    onClick={() => setCurrentFolderId(null)}
                                    className={cn("hover:text-blue-400 flex items-center gap-1", !currentFolderId && "text-blue-400 font-bold")}
                                    style={{ minWidth: 'fit-content' }}
                                >
                                    Library
                                </button>
                                {breadcrumbs.map(bc => (
                                    <div key={bc.id} className="flex items-center gap-1 shrink-0">
                                        <ChevronLeft className="h-3 w-3 rotate-180 opacity-50" />
                                        <button
                                            onClick={() => setCurrentFolderId(bc.id)}
                                            className={cn("hover:text-blue-400 truncate max-w-[120px]", currentFolderId === bc.id && "text-blue-400 font-bold")}
                                        >
                                            {bc.name}
                                        </button>
                                    </div>
                                ))}

                                {currentFolderId && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => addFolderSongs(currentFolderId)}
                                        className="ml-auto h-7 text-[10px] uppercase tracking-tighter bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white"
                                    >
                                        Add Folder
                                    </Button>
                                )}
                            </div>
                        )}

                        <Input
                            value={searchQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                            placeholder="Search library..."
                            className="mb-4 shrink-0"
                            autoFocus
                        />

                        <div className="flex-1 overflow-y-auto -mx-2 px-2 mb-4">
                            <div className="grid grid-cols-1 gap-2 pb-20 sm:pb-0">
                                {filteredFiles.slice(0, 100).map(file => {
                                    const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
                                    const isSelected = selectedFiles.has(file.id)

                                    return (
                                        <button
                                            key={file.id}
                                            onClick={() => {
                                                if (isFolder) {
                                                    setCurrentFolderId(file.id)
                                                } else {
                                                    toggleFileSelection(file.id)
                                                }
                                            }}
                                            className={cn(
                                                "w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3",
                                                isSelected ? "bg-blue-600 text-white" : isFolder ? "bg-zinc-800 hover:bg-zinc-700" : "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800"
                                            )}
                                        >
                                            {isFolder ? (
                                                <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-400">
                                                    <ChevronLeft className="h-5 w-5 rotate-180" />
                                                </div>
                                            ) : (
                                                <div className={cn(
                                                    "w-10 h-10 rounded-lg flex items-center justify-center",
                                                    isSelected ? "bg-white/20" : "bg-blue-500/10 text-blue-500"
                                                )}>
                                                    {isSelected ? <Check className="h-5 w-5" /> : <Music className="h-4 w-4" />}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium truncate">{file.name}</div>
                                                <div className={cn(
                                                    "text-[10px] uppercase tracking-wider",
                                                    isSelected ? "text-blue-100" : "text-zinc-500"
                                                )}>
                                                    {isFolder ? "Folder" : file.mimeType.split('/').pop()?.replace('vnd.google-apps.', '')}
                                                </div>
                                            </div>
                                            {isFolder && (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-10 w-10 hover:bg-blue-500 hover:text-white"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        addFolderSongs(file.id)
                                                    }}
                                                    title="Add all songs in folder"
                                                >
                                                    <Plus className="h-5 w-5" />
                                                </Button>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                        <Button
                            onClick={addSongsFromLibrary}
                            disabled={selectedFiles.size === 0}
                            className="w-full shrink-0 h-12 text-lg font-bold shadow-lg"
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
