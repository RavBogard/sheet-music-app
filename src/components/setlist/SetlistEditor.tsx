"use client"

import { useState, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PrintModal } from "@/components/setlist/PrintModal"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from "@dnd-kit/core"
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy
} from "@dnd-kit/sortable"
import { SetlistTrack } from "@/types/api"
import { useSetlistLogic } from "@/hooks/use-setlist-logic"
import { useSetlistPresence, useLiveState } from "@/hooks/use-setlist-presence"
import { enableLiveMode, updateLiveTrack } from "@/lib/setlist-live"
import { useAuth } from "@/lib/auth-context"

// Components
import { TrackItem } from "./editor/TrackItem"
import { SetlistHeader } from "./editor/SetlistHeader"
import { SetlistTimeline } from "./SetlistTimeline"
import { RunSheetTimeline } from "./RunSheetTimeline"
import { SetlistHistoryPanel } from "./SetlistHistoryPanel"
import { NamePrompt } from "./modals/NamePrompt"
import { AddSongsModal } from "./modals/AddSongsModal"
import { MatchFileModal } from "./modals/MatchFileModal"
import { TrackDetailsModal } from "./modals/TrackDetailsModal"
import { Plus, Music, BookOpen, ArrowLeftRight, StickyNote, Minus } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

interface SetlistEditorProps {
    setlistId?: string
    initialTracks?: SetlistTrack[]
    initialName?: string
    suggestedName?: string
    initialIsPublic?: boolean
    initialOwnerId?: string
    initialEventDate?: string | Date | null
    onBack: () => void
    onSave?: (id: string) => void
    onPlayTrack?: (fileId: string, fileName: string) => void
}

export function SetlistEditor({
    setlistId: initialSetlistId,
    initialTracks = [],
    initialName = "",
    suggestedName = "",
    initialIsPublic = false,
    initialOwnerId,
    initialEventDate,
    onBack,
    onSave,
    onPlayTrack
}: SetlistEditorProps) {
    // Custom Hook handles all complex logic
    const {
        canEdit,
        isEditMode,
        toggleEditMode,
        isLeader,
        setlistId,
        name,
        setName,
        tracks,
        isPublic,
        setIsPublic,
        eventDate,
        setEventDate,
        saving,
        lastSaved,
        isSyncing,
        isFullyOffline,
        syncSetlist,
        moveTrack,
        updateTrack,
        deleteTrack,
        matchFile,
        addSongsFromLibrary,
        addServiceItem,
        togglePublic,
        undo,
        redo,
        canUndo,
        canRedo,
        duplicateTrack,
        restoreTracks,
    } = useSetlistLogic({
        initialSetlistId,
        initialTracks,
        initialName,
        suggestedName,
        initialIsPublic,
        initialOwnerId,
        initialEventDate,
        onSave
    })

    // UI-only State
    const [showNamePrompt, setShowNamePrompt] = useState(!initialSetlistId && !initialName)
    const [matchingTrackId, setMatchingTrackId] = useState<string | null>(null)
    const [showAddSongs, setShowAddSongs] = useState(false)
    const [showPrintModal, setShowPrintModal] = useState(false)
    const [showHistory, setShowHistory] = useState(false)

    // D1: Live Collaboration
    const { user } = useAuth()
    const presence = useSetlistPresence(setlistId || null, isEditMode ? "editing" : "viewing")
    const liveState = useLiveState(setlistId || null)
    const handleToggleLive = useCallback(() => {
        if (!setlistId) return
        enableLiveMode(setlistId, !liveState?.enabled)
    }, [setlistId, liveState])

    // D1: Broadcast live track when leader plays a song in live mode
    const handlePlayTrack = useCallback((fileId: string, fileName: string) => {
        if (liveState?.enabled && setlistId && user) {
            const trackIdx = tracks.findIndex(t => t.fileId === fileId)
            if (trackIdx >= 0) {
                updateLiveTrack(setlistId, trackIdx, user.uid, user.displayName || "Leader")
            }
        }
        onPlayTrack?.(fileId, fileName)
    }, [liveState, setlistId, user, tracks, onPlayTrack])

    // Explicit Track Details Edit Modal state
    const [editingTrack, setEditingTrack] = useState<SetlistTrack | null>(null)

    // Dnd Sensors
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 10,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250,
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            moveTrack(active.id as string, over.id as string)
        }
    }

    return (
        <div className="h-screen flex flex-col bg-background text-foreground">
            <NamePrompt
                isOpen={showNamePrompt && canEdit}
                onClose={() => setShowNamePrompt(false)}
                initialName={name}
                initialIsPublic={isPublic}
                initialDate={eventDate ? new Date(eventDate) : null}
                isLeader={isLeader}
                onConfirm={(newName, newIsPublic, newDate) => {
                    setName(newName)
                    setIsPublic(newIsPublic)
                    setEventDate(newDate)
                    setShowNamePrompt(false)
                    // Auto-enter edit mode if creating new? Maybe not forcing it is better.
                }}
            />

            <SetlistHeader
                name={name}
                onNameChange={setName}
                onBack={onBack}
                onPrint={() => setShowPrintModal(true)}
                onHistory={() => setShowHistory(!showHistory)}
                canEdit={canEdit}
                isEditMode={isEditMode}
                onToggleEditMode={toggleEditMode}
                isPublic={isPublic}
                onTogglePublic={togglePublic}
                isLeader={isLeader}
                setlistId={setlistId}
                saving={saving}
                lastSaved={lastSaved}
                isSyncing={isSyncing}
                isFullyOffline={isFullyOffline}
                onSync={() => syncSetlist(tracks)}
                undo={undo}
                redo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                presence={presence}
                liveEnabled={liveState?.enabled}
                onToggleLive={isLeader ? handleToggleLive : undefined}
            />

            {/* Timeline View - Only show if we have tracks */}
            {tracks.length > 0 && (
                <SetlistTimeline tracks={tracks} onPlay={(fid) => handlePlayTrack(fid, "song")} />
            )}

            {/* Run Sheet Time Estimate */}
            {tracks.length > 0 && (
                <div className="px-4 sm:px-6">
                    <RunSheetTimeline tracks={tracks} />
                </div>
            )}

            {/* Track List */}
            {/* History Panel */}
            {showHistory && setlistId && (
                <div className="px-4 sm:px-6 pt-2">
                    <SetlistHistoryPanel
                        setlistId={setlistId}
                        onRestore={(newTracks) => {
                            restoreTracks(newTracks)
                            setShowHistory(false)
                        }}
                        onClose={() => setShowHistory(false)}
                    />
                </div>
            )}

            <ScrollArea className="flex-1 p-4 sm:p-6">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={tracks} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3 max-w-4xl mx-auto pb-20">
                            {tracks.map((track) => (
                                <TrackItem
                                    key={track.id}
                                    track={track}
                                    onUpdate={updateTrack}
                                    onDelete={deleteTrack}
                                    onMatchFile={setMatchingTrackId}
                                    onPlay={handlePlayTrack}
                                    readOnly={!canEdit} // Still needed for non-editors
                                    isEditMode={canEdit && isEditMode} // Separate visual edit mode
                                    onEditDetails={canEdit ? setEditingTrack : undefined}
                                    onDuplicate={duplicateTrack}
                                />
                            ))}

                            {/* Add Item Menu - Only in Edit Mode */}
                            {canEdit && isEditMode && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            className="w-full p-4 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors flex items-center justify-center gap-2 animate-in fade-in zoom-in-95"
                                        >
                                            <Plus className="h-5 w-5" />
                                            Add Item
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="center" className="w-56">
                                        <DropdownMenuItem onClick={() => setShowAddSongs(true)}>
                                            <Music className="h-4 w-4 mr-2 text-blue-500" />
                                            Song from Library
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => addServiceItem('header')}>
                                            <Minus className="h-4 w-4 mr-2" />
                                            Section Header
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => addServiceItem('reading')}>
                                            <BookOpen className="h-4 w-4 mr-2 text-amber-500" />
                                            Reading / Prayer
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => addServiceItem('transition')}>
                                            <ArrowLeftRight className="h-4 w-4 mr-2" />
                                            Transition
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => addServiceItem('note')}>
                                            <StickyNote className="h-4 w-4 mr-2" />
                                            Note
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </SortableContext>
                </DndContext>
            </ScrollArea>

            <MatchFileModal
                isOpen={!!matchingTrackId && canEdit}
                onClose={() => setMatchingTrackId(null)}
                onMatch={(fileId) => matchingTrackId && matchFile(matchingTrackId, fileId)}
            />

            <AddSongsModal
                isOpen={showAddSongs && canEdit}
                onClose={() => setShowAddSongs(false)}
                onAdd={(files) => {
                    addSongsFromLibrary(files)
                    setShowAddSongs(false)
                }}
            />

            <TrackDetailsModal
                isOpen={!!editingTrack && canEdit}
                onClose={() => setEditingTrack(null)}
                track={editingTrack}
                onUpdate={updateTrack}
                onDelete={deleteTrack}
                onMatchFile={(tid) => {
                    // Changing file from detail modal triggers match modal
                    setEditingTrack(null)
                    setMatchingTrackId(tid)
                }}
            />

            {/* Print Modal */}
            {showPrintModal && (
                <PrintModal
                    setlistName={name}
                    tracks={tracks}
                    onClose={() => setShowPrintModal(false)}
                />
            )}
        </div>
    )
}

