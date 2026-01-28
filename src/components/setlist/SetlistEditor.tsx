"use client"

import { useState } from "react"
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
import { Plus } from "lucide-react"

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
    // Custom Hook handles all complex logic
    const {
        canEdit,
        isLeader,
        setlistId,
        name,
        setName,
        tracks,
        isPublic,
        setIsPublic,
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
        driveFiles,
        onSave
    })

    // UI-only State
    const [showNamePrompt, setShowNamePrompt] = useState(!initialSetlistId && !initialName)
    const [matchingTrackId, setMatchingTrackId] = useState<string | null>(null)
    const [showAddSongs, setShowAddSongs] = useState(false)
    const [showPrintModal, setShowPrintModal] = useState(false)

    // Dnd Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
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
                isLeader={isLeader}
                onConfirm={(newName, newIsPublic) => {
                    setName(newName)
                    setIsPublic(newIsPublic)
                    setShowNamePrompt(false)
                }}
            />

            <SetlistHeader
                name={name}
                onNameChange={setName}
                onBack={onBack}
                onPrint={() => setShowPrintModal(true)}
                canEdit={canEdit}
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
                                <TrackItem
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

            <MatchFileModal
                isOpen={!!matchingTrackId && canEdit}
                onClose={() => setMatchingTrackId(null)}
                driveFiles={driveFiles}
                onMatch={(fileId) => matchingTrackId && matchFile(matchingTrackId, fileId)}
            />

            <AddSongsModal
                isOpen={showAddSongs && canEdit}
                onClose={() => setShowAddSongs(false)}
                driveFiles={driveFiles}
                onAdd={(files) => {
                    addSongsFromLibrary(files)
                    setShowAddSongs(false)
                }}
            />

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
