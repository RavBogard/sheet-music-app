"use client"

import { useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PrintModal } from "@/components/setlist/PrintModal"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
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
import { SetlistTrack, DriveFile } from "@/types/api"
import { useSetlistLogic } from "@/hooks/use-setlist-logic"

// Components
import { TrackItem } from "./editor/TrackItem"
import { SetlistHeader } from "./editor/SetlistHeader"
import { SetlistTimeline } from "./SetlistTimeline"
import { NamePrompt } from "./modals/NamePrompt"
import { AddSongsModal } from "./modals/AddSongsModal"
import { MatchFileModal } from "./modals/MatchFileModal"
import { TrackDetailsModal } from "./modals/TrackDetailsModal"
import { Plus } from "lucide-react"

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
        togglePublic
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
        <div className="h-screen flex flex-col bg-zinc-950 text-white">
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
            />

            {/* Timeline View - Only show if we have tracks */}
            {tracks.length > 0 && (
                <SetlistTimeline tracks={tracks} onPlay={(fid) => onPlayTrack?.(fid, "song")} />
            )}

            {/* Track List */}
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
                                    onPlay={onPlayTrack}
                                    readOnly={!canEdit} // Still needed for non-editors
                                    isEditMode={canEdit && isEditMode} // Separate visual edit mode
                                    onEditDetails={canEdit ? setEditingTrack : undefined}
                                />
                            ))}

                            {/* Add Songs Button - Only in Edit Mode */}
                            {canEdit && isEditMode && (
                                <button
                                    onClick={() => setShowAddSongs(true)}
                                    className="w-full p-4 border-2 border-dashed border-zinc-700 rounded-lg text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center gap-2 animate-in fade-in zoom-in-95"
                                >
                                    <Plus className="h-5 w-5" />
                                    Add Songs from Library
                                </button>
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

