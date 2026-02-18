"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core"
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { SetlistTrack, TrackType } from "@/types/models"
import { useSetlistLogic } from "@/hooks/use-setlist-logic"
import { useSetlistPresence, useLiveState } from "@/hooks/use-setlist-presence"
import { enableLiveMode, updateLiveTrack } from "@/lib/setlist-live"
import { useAuth } from "@/lib/auth-context"
import { useChatStore } from "@/lib/chat-store"
import { SERVICE_FLOW_TYPES } from "@/lib/validations"

// V2 Components
import { SetlistTopBar } from "./SetlistTopBar"
import { OverflowMenu } from "./OverflowMenu"
import { SongRow } from "./SongRow"
import { DividerRow } from "./DividerRow"
import { FlowRow } from "./FlowRow"
import { TrackSheet } from "./TrackSheet"
import { AddBar } from "./AddBar"

// Shared components (kept from v1)
import { PrintModal } from "../PrintModal"
import { PublishDialog } from "../PublishDialog"
import { SetlistHistoryPanel } from "../SetlistHistoryPanel"
import { NamePrompt } from "../modals/NamePrompt"
import { AddSongsModal } from "../modals/AddSongsModal"
import { MatchFileModal } from "../modals/MatchFileModal"

interface SetlistEditorV2Props {
    setlistId?: string
    initialTracks?: SetlistTrack[]
    initialName?: string
    suggestedName?: string
    initialIsPublic?: boolean
    initialOwnerId?: string
    initialEventDate?: string | Date | null
    initialRabbi?: string
    onBack: () => void
    onSave?: (id: string) => void
    onPlayTrack?: (fileId: string, fileName: string) => void
}

export function SetlistEditorV2({
    setlistId: initialSetlistId,
    initialTracks = [],
    initialName = "",
    suggestedName = "",
    initialIsPublic = false,
    initialOwnerId,
    initialEventDate,
    initialRabbi,
    onBack,
    onSave,
    onPlayTrack,
}: SetlistEditorV2Props) {
    const { user } = useAuth()
    const router = useRouter()

    // Core logic hook (unchanged from v1)
    const {
        canEdit,
        isLeader,
        setlistId,
        name,
        setName,
        tracks,
        isPublic,
        setIsPublic,
        eventDate,
        setEventDate,
        rabbi,
        setRabbi,
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
        restoreTracks,
    } = useSetlistLogic({
        initialSetlistId,
        initialTracks,
        initialName,
        suggestedName,
        initialIsPublic,
        initialOwnerId,
        initialEventDate,
        initialRabbi,
        onSave,
    })

    // Presence & Live
    const presence = useSetlistPresence(setlistId || null, "editing")
    const liveState = useLiveState(setlistId || null)

    const handleToggleLive = useCallback(() => {
        if (!setlistId) return
        enableLiveMode(setlistId, !liveState?.enabled)
    }, [setlistId, liveState])

    // Chat - auto-open only on new empty setlists
    useEffect(() => {
        if (!initialSetlistId && tracks.length === 0) {
            if (window.matchMedia("(min-width: 768px)").matches) {
                useChatStore.getState().open()
            }
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

    // Play a track (with live broadcast)
    const handlePlayTrack = useCallback(
        (fileId: string, fileName: string) => {
            if (liveState?.enabled && setlistId && user) {
                const trackIdx = tracks.findIndex((t) => t.fileId === fileId)
                if (trackIdx >= 0) {
                    updateLiveTrack(setlistId, trackIdx, user.uid, user.displayName || "Leader")
                }
            }
            onPlayTrack?.(fileId, fileName)
        },
        [liveState, setlistId, user, tracks, onPlayTrack]
    )

    // ── UI State ──

    const [showNamePrompt, setShowNamePrompt] = useState(!initialSetlistId && !initialName)
    const [showAddSongs, setShowAddSongs] = useState(false)
    const [matchingTrackId, setMatchingTrackId] = useState<string | null>(null)
    const [editingTrack, setEditingTrack] = useState<SetlistTrack | null>(null)
    const [showPrintModal, setShowPrintModal] = useState(false)
    const [showPublishDialog, setShowPublishDialog] = useState(false)
    const [showHistory, setShowHistory] = useState(false)

    // ── Computed ──

    const estimatedMinutes = useMemo(() => {
        return tracks.reduce((sum, t) => {
            if (t.estimatedMinutes) return sum + t.estimatedMinutes
            if (t.type === "header" || t.type === "note") return sum
            if (t.type === "reading") return sum + 5
            if (t.type === "prayer") return sum + 3
            if (t.type === "transition") return sum + 1
            return sum + 3 // default song duration
        }, 0)
    }, [tracks])

    const songCount = useMemo(() => tracks.filter((t) => !t.type || t.type === "song").length, [tracks])

    // ── DnD ──

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (over && active.id !== over.id) {
            moveTrack(active.id as string, over.id as string)
        }
    }

    // ── Track rendering ──

    const renderTrack = (track: SetlistTrack) => {
        if (track.type === "header") {
            return <DividerRow key={track.id} track={track} canEdit={canEdit} onTap={setEditingTrack} />
        }
        if (track.type && (SERVICE_FLOW_TYPES as readonly string[]).includes(track.type)) {
            return <FlowRow key={track.id} track={track} canEdit={canEdit} onTap={setEditingTrack} />
        }
        return (
            <SongRow
                key={track.id}
                track={track}
                canEdit={canEdit}
                onTap={setEditingTrack}
                onPlayFile={handlePlayTrack}
            />
        )
    }

    return (
        <div className="h-[100dvh] flex flex-col bg-background text-foreground">
            {/* Name prompt for new setlists */}
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
                }}
            />

            {/* Top bar */}
            <SetlistTopBar
                name={name}
                onNameChange={setName}
                onBack={onBack}
                canEdit={canEdit}
                saving={saving}
                lastSaved={lastSaved}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                overflowTrigger={
                    <OverflowMenu
                        onPerform={setlistId ? () => router.push(`/perform/setlist/${setlistId}`) : undefined}
                        onPrint={() => setShowPrintModal(true)}
                        onPublish={setlistId ? () => setShowPublishDialog(true) : undefined}
                        onTogglePublic={togglePublic}
                        onSetRabbi={canEdit ? setRabbi : undefined}
                        onHistory={setlistId ? () => setShowHistory(!showHistory) : undefined}
                        onSync={() => syncSetlist(tracks)}
                        onOpenAI={() => useChatStore.getState().toggle()}
                        onToggleLive={isLeader ? handleToggleLive : undefined}
                        isPublic={isPublic}
                        isLeader={isLeader}
                        canEdit={canEdit}
                        setlistId={setlistId}
                        rabbi={rabbi}
                        liveEnabled={liveState?.enabled}
                        isSyncing={isSyncing}
                        isFullyOffline={isFullyOffline}
                        estimatedMinutes={estimatedMinutes}
                        songCount={songCount}
                    />
                }
            />

            {/* Presence line */}
            {presence.length > 0 && (
                <div className="px-4 py-1 text-xs text-muted-foreground/60 border-b border-border/50">
                    {presence.map((p) => p.displayName).join(", ")} {presence.length === 1 ? "is" : "are"} viewing
                </div>
            )}

            {/* History panel */}
            {showHistory && setlistId && (
                <div className="px-4 pt-2">
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

            {/* Track list */}
            <div className="flex-1 overflow-y-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={tracks} strategy={verticalListSortingStrategy}>
                        <div className="max-w-3xl mx-auto px-2 sm:px-4 py-4 space-y-1">
                            {tracks.length === 0 && (
                                <div className="text-center py-16 text-muted-foreground">
                                    <p className="text-lg font-medium mb-1">Empty setlist</p>
                                    <p className="text-sm">Add songs from the library or use the AI assistant to build a service.</p>
                                </div>
                            )}
                            {tracks.map(renderTrack)}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>

            {/* Add bar (sticky bottom) - only for editors */}
            {canEdit && (
                <AddBar
                    onAddSongs={() => setShowAddSongs(true)}
                    onAddItem={(type: TrackType) => addServiceItem(type)}
                />
            )}

            {/* Track detail sheet/modal */}
            <TrackSheet
                isOpen={!!editingTrack}
                onClose={() => setEditingTrack(null)}
                track={editingTrack}
                onUpdate={updateTrack}
                onDelete={deleteTrack}
                onMatchFile={(tid) => {
                    setEditingTrack(null)
                    setMatchingTrackId(tid)
                }}
                onPlayFile={handlePlayTrack}
            />

            {/* Shared modals */}
            <AddSongsModal
                isOpen={showAddSongs && canEdit}
                onClose={() => setShowAddSongs(false)}
                onAdd={(files) => {
                    addSongsFromLibrary(files)
                    setShowAddSongs(false)
                }}
            />

            <MatchFileModal
                isOpen={!!matchingTrackId && canEdit}
                onClose={() => setMatchingTrackId(null)}
                onMatch={(fileId) => matchingTrackId && matchFile(matchingTrackId, fileId)}
            />

            {showPrintModal && (
                <PrintModal
                    setlistName={name}
                    tracks={tracks}
                    setlistId={setlistId || undefined}
                    onClose={() => setShowPrintModal(false)}
                />
            )}

            {setlistId && (
                <PublishDialog
                    isOpen={showPublishDialog}
                    onClose={() => setShowPublishDialog(false)}
                    setlistId={setlistId}
                    setlistName={name}
                    songCount={songCount}
                    onPublished={() => setIsPublic(true)}
                />
            )}
        </div>
    )
}
